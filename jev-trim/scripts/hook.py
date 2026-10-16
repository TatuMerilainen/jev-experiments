"""Hook entry point. Claude Code runs it for UserPromptSubmit, PostToolUse (Bash) and SessionEnd.

The trim fails open: if anything goes wrong, Claude gets the full output and the user sees a short notice.
"""

import json
import os
import re
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional

import jev
import trim

NAME = "Jev trim"
# Share of the top passage's probability at which a passage is kept.
DEFAULT_KEEP_AT = 0.1
# Shorter output saves too little to be worth a check.
DEFAULT_MIN_CHARS = 6000
# Trimming that keeps more than this share of the output saves too little.
WORTH_IT = 0.8
MAX_USER_REQUESTS = 3
USER_REQUEST_CHARS = 1000
BYPASS = re.compile(r"^\s*JEV_TRIM=0\b")
# Commands that show files or search results. Claude needs their exact text, for example to edit a file.
# A command made only of these is left alone. A mixed one, such as "cat run.sh; ./run.sh", is trimmed.
VIEW_COMMANDS = {"cat", "head", "tail", "sed", "awk", "less", "more", "nl", "bat", "jq", "diff", "grep", "rg", "find", "ls", "tree", "xxd", "od"}
VIEW_GIT = {"diff", "show", "blame"}


@dataclass
class Settings:
    api_key: str
    keep_at: float
    min_chars: int
    data_dir: Optional[Path]

    @staticmethod
    def from_env() -> "Settings":
        env = os.environ

        def number(name: str, default: float) -> float:
            try:
                return float(env.get(name) or default)
            except ValueError:
                return default

        data = env.get("CLAUDE_PLUGIN_DATA")
        return Settings(
            api_key=env.get("CLAUDE_PLUGIN_OPTION_TYPESAFE_API_KEY") or env.get("TYPESAFE_API_KEY") or "",
            keep_at=number("CLAUDE_PLUGIN_OPTION_KEEP_AT", DEFAULT_KEEP_AT),
            min_chars=int(number("CLAUDE_PLUGIN_OPTION_MIN_CHARS", DEFAULT_MIN_CHARS)),
            data_dir=Path(data) if data else None,
        )


def main() -> int:
    try:
        event = json.load(sys.stdin)
        settings = Settings.from_env()
        name = event.get("hook_event_name")
        if name == "UserPromptSubmit":
            remember_prompt(settings, event)
        elif name == "SessionEnd":
            forget_session(settings, event)
        elif name == "PostToolUse":
            output = trim_bash(event, settings)
            if output:
                print(json.dumps(output))
    except Exception as e:  # Fail open on any bug.
        print(json.dumps({"systemMessage": f"{NAME} failed, Claude got the full output: {type(e).__name__}: {e}"}))
    return 0


def is_view_command(command: str) -> bool:
    """True when every part of the command shows files or search results."""
    parts = 0
    for part in re.split(r"\|\|?|&&|;", command):
        words = [w for w in part.split() if not re.match(r"^\w+=", w)]
        if not words:
            continue
        parts += 1
        first = os.path.basename(words[0])
        if not (first in VIEW_COMMANDS or (first == "git" and len(words) > 1 and words[1] in VIEW_GIT)):
            return False
    return parts > 0


def trim_bash(event: Dict[str, Any], settings: Settings, client: Optional[jev.Jev] = None) -> Optional[Dict[str, Any]]:
    if event.get("tool_name") != "Bash":
        return None
    tool_input = event.get("tool_input") or {}
    command = str(tool_input.get("command", ""))
    response = event.get("tool_response")
    if not isinstance(response, dict) or response.get("isImage") or BYPASS.match(command) or is_view_command(command):
        return None
    streams = {k: response[k] for k in ("stdout", "stderr") if isinstance(response.get(k), str) and response[k].strip()}
    chars = sum(len(t) for t in streams.values())
    if chars < settings.min_chars:
        return None
    entry: Dict[str, Any] = {"command": command.split()[0][:40] if command.split() else "", "chars": chars}
    if not settings.api_key:
        log(settings, event, {**entry, "action": "skipped", "error": "no API key"})
        return {"systemMessage": f"{NAME} is off: set the TypeSafe API key in /plugin or in TYPESAFE_API_KEY."}

    task = {
        "user_requests": load_prompts(settings, event),
        "command": command[:500],
        "purpose": str(tool_input.get("description", ""))[:300],
    }
    try:
        result = trim.trim(client or jev.Jev(settings.api_key), streams, task, settings.keep_at)
    except jev.JevError as e:
        log(settings, event, {**entry, "action": "skipped", "error": str(e)})
        return {"systemMessage": f"{NAME} skipped this output, Claude got it in full: {e}"}

    worth_it = result.kept_chars <= WORTH_IT * result.total_chars
    log(
        settings,
        event,
        {
            **entry,
            "action": "trim" if worth_it else "pass",
            "keep_at": settings.keep_at,
            "whole": round(result.whole, 3),
            "lines": result.total_lines,
            "kept_lines": result.kept_lines,
            "kept_chars": result.kept_chars,
            "requests": result.usage.requests,
            "input_tokens": result.usage.input_tokens,
            "ms": result.ms,
        },
    )
    if not worth_it:
        return None
    removed = result.total_lines - result.kept_lines
    saved = (result.total_chars - result.kept_chars) // 4
    return {
        "systemMessage": f"{NAME}: kept {result.kept_lines} of {result.total_lines} lines, about {saved:,} tokens less for Claude to read.",
        "hookSpecificOutput": {
            "hookEventName": "PostToolUse",
            "updatedToolOutput": {**response, **result.texts},
            "additionalContext": (
                f"{NAME} removed {removed} lines of routine output from this result. Each gap is marked with a line like "
                f"{trim.MARKER.format(n='N')!r}. To see the full output, run the command again with JEV_TRIM=0 in front of it."
            ),
        },
    }


# Prompt memory. Jev reads the user's recent prompts to tell which lines matter.


def prompts_file(settings: Settings, event: Dict[str, Any]) -> Optional[Path]:
    session = re.sub(r"[^A-Za-z0-9_-]", "", str(event.get("session_id", "")))
    if not settings.data_dir or not session:
        return None
    return settings.data_dir / "prompts" / f"{session}.json"


def load_prompts(settings: Settings, event: Dict[str, Any]) -> List[str]:
    path = prompts_file(settings, event)
    try:
        return json.loads(path.read_text()) if path else []
    except (OSError, ValueError):
        return []


def remember_prompt(settings: Settings, event: Dict[str, Any]) -> None:
    path = prompts_file(settings, event)
    prompt = str(event.get("prompt") or "").strip()
    if not path or not prompt:
        return
    prompts = (load_prompts(settings, event) + [prompt[:USER_REQUEST_CHARS]])[-MAX_USER_REQUESTS:]
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(prompts))


def forget_session(settings: Settings, event: Dict[str, Any]) -> None:
    path = prompts_file(settings, event)
    if path:
        path.unlink(missing_ok=True)


def log(settings: Settings, event: Dict[str, Any], entry: Dict[str, Any]) -> None:
    """One JSON line per check. Holds sizes and scores, no output text."""
    if not settings.data_dir:
        return
    line = {"time": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "session": event.get("session_id"), **entry}
    try:
        settings.data_dir.mkdir(parents=True, exist_ok=True)
        with open(settings.data_dir / "checks.jsonl", "a", encoding="utf-8") as f:
            f.write(json.dumps(line) + "\n")
    except OSError:
        pass


if __name__ == "__main__":
    sys.exit(main())
