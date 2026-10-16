"""Code side of the check: where a tool result came from, the text in it, and how to split and edit that text.

Everything here is exact work, so it stays in code. Jev only judges the text.
"""

import copy
import re
from typing import Any, Dict, Iterator, List, Optional, Tuple

# About 3,000 characters per Jev request. Jev is less accurate on a large state.
CHUNK_CHARS = 3000
# An instruction that crosses a chunk border still appears whole in one chunk if it is shorter than this.
CHUNK_OVERLAP = 300
# The longest WebFetch result is 100,000 characters. Text after this limit is not checked.
MAX_CHARS = 120_000
# Passages for the search inside a flagged chunk: about one or two sentences each.
PASSAGE_MIN_CHARS = 40
PASSAGE_MAX_CHARS = 200
MAX_PASSAGES = 40

# MCP servers that run on this machine and return the user's own data.
LOCAL_MCP_SERVERS = {"ide"}

# Keys whose values the tool or the agent wrote, not the outside source.
METADATA_KEYS = {"tool_use_id", "url", "uri", "query", "code", "codeText", "type", "mimeType", "description", "blob"}

# Unicode tag characters can carry hidden ASCII text that the user cannot see.
TAG_RUN = re.compile("[\U000E0000-\U000E007F]+")
# Zero-width and text-direction characters.
INVISIBLE = re.compile("[​-‏‪-‮⁠-⁤⁦-⁩﻿]")


def source_of(tool_name: str, tool_input: Dict[str, Any]) -> Optional[str]:
    """A short label for where the result came from, or None when the result is not outside input."""
    if tool_name == "WebSearch":
        return "web search: " + str(tool_input.get("query", ""))
    if tool_name == "WebFetch":
        return str(tool_input.get("url", ""))
    if tool_name == "Bash":
        # hooks.json only runs the check for commands that download content.
        return "command: " + str(tool_input.get("command", ""))[:200]
    if tool_name.startswith("mcp__"):
        server = tool_name.split("__")[1] if tool_name.count("__") >= 2 else ""
        return None if server in LOCAL_MCP_SERVERS else tool_name
    return None


def strings_in(value: Any) -> Iterator[str]:
    """Every string in a tool result that came from the outside source."""
    if isinstance(value, str):
        yield value
    elif isinstance(value, list):
        for item in value:
            yield from strings_in(item)
    elif isinstance(value, dict):
        for key, item in value.items():
            # An MCP image or audio block holds base64 in `data`.
            if key not in METADATA_KEYS and not (key == "data" and "mimeType" in value):
                yield from strings_in(item)


def text_of(tool_response: Any) -> str:
    if isinstance(tool_response, dict) and tool_response.get("isImage"):
        return ""
    return "\n\n".join(s for s in strings_in(tool_response) if s.strip())


def reveal_hidden(text: str) -> Tuple[str, bool]:
    """Shows hidden text so Jev can read it. Returns the new text and whether anything was hidden."""
    found = bool(TAG_RUN.search(text) or INVISIBLE.search(text))

    def decode(match: "re.Match[str]") -> str:
        ascii_text = "".join(chr(ord(c) - 0xE0000) for c in match.group() if 0x20 <= ord(c) - 0xE0000 < 0x7F)
        return f"[hidden text: {ascii_text}]" if ascii_text else ""

    return INVISIBLE.sub("", TAG_RUN.sub(decode, text)), found


def chunks(text: str) -> List[str]:
    """Splits text into overlapping chunks. Cuts at a line break when one is near the end."""
    text = text[:MAX_CHARS]
    out: List[str] = []
    start = 0
    while start < len(text):
        end = min(start + CHUNK_CHARS, len(text))
        if end < len(text):
            cut = text.rfind("\n", start + CHUNK_CHARS // 2, end)
            if cut > start:
                end = cut
        out.append(text[start:end])
        if end >= len(text):
            break
        start = max(end - CHUNK_OVERLAP, start + 1)
    return out


def passages(chunk: str) -> List[str]:
    """Splits a chunk into short passages. Each passage is an exact substring of the chunk, so it can be removed later."""
    spans: List[Tuple[int, int]] = []
    start = 0
    for m in re.finditer(r"\n\s*\n", chunk):
        spans.extend(_split_long(chunk, *_trim(chunk, start, m.start())))
        start = m.end()
    spans.extend(_split_long(chunk, *_trim(chunk, start, len(chunk))))
    # Join short neighbours so the second request asks fewer questions.
    joined: List[Tuple[int, int]] = []
    for start, end in spans:
        if joined and (end - start < PASSAGE_MIN_CHARS or joined[-1][1] - joined[-1][0] < PASSAGE_MIN_CHARS) and end - joined[-1][0] <= PASSAGE_MAX_CHARS:
            joined[-1] = (joined[-1][0], end)
        else:
            joined.append((start, end))
    while len(joined) > MAX_PASSAGES:
        joined = [(joined[i][0], joined[min(i + 1, len(joined) - 1)][1]) for i in range(0, len(joined), 2)]
    return [chunk[s:e] for s, e in joined]


def _split_long(text: str, start: int, end: int) -> List[Tuple[int, int]]:
    """Splits a long paragraph at line breaks and sentence ends, or else at a space."""
    if end <= start:
        return []
    cuts = [start + m.end() for m in re.finditer(r"\n|(?<=[.!?])\s", text[start:end])]
    spaces = [start + m.end() for m in re.finditer(r"\s", text[start:end])]
    out: List[Tuple[int, int]] = []
    piece = start
    while end - piece > PASSAGE_MAX_CHARS:
        within = [c for c in cuts if piece < c <= piece + PASSAGE_MAX_CHARS] or [c for c in spaces if piece < c <= piece + PASSAGE_MAX_CHARS]
        cut = within[-1] if within else piece + PASSAGE_MAX_CHARS
        out.append(_trim(text, piece, cut))
        piece = cut
    out.append(_trim(text, piece, end))
    return [s for s in out if s[1] > s[0]]


def _trim(text: str, start: int, end: int) -> Tuple[int, int]:
    while start < end and text[start].isspace():
        start += 1
    while end > start and text[end - 1].isspace():
        end -= 1
    return start, end


def redact(tool_response: Any, flagged: List[str], marker: str) -> Tuple[Any, bool]:
    """A copy of the tool result with the flagged passages replaced by `marker`. The shape stays the same."""
    changed = False

    def walk(value: Any, key: Optional[str] = None) -> Any:
        nonlocal changed
        if isinstance(value, str) and key not in METADATA_KEYS:
            shown, _ = reveal_hidden(value)
            edited = shown
            for passage in flagged:
                edited = edited.replace(passage, marker)
            if edited == shown:
                return value
            changed = True
            return edited
        if isinstance(value, list):
            return [walk(item) for item in value]
        if isinstance(value, dict):
            return {k: walk(v, k) for k, v in value.items()}
        return value

    return walk(copy.deepcopy(tool_response)), changed
