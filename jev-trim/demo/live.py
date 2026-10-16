"""Live test: real Claude Code sessions answer each test task with and without the plugin.

Usage: TYPESAFE_API_KEY=... python3 demo/live.py results.json [--model haiku]
Each session may run only ./run.sh, which prints the task's output and exits 0, like a log viewer.
A failed command cannot be tested: Claude Code sends its output to PostToolUseFailure, which a hook cannot change.
The script checks the answer for the expected words, reads the token use from Claude Code's JSON output,
and deletes the session folders that Claude Code creates for the temporary working folders.
"""

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any, Dict

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import evaluate  # noqa: E402

# With --plugin-dir, Claude Code names the plugin's data folder "<name>-inline".
LOG = Path.home() / ".claude" / "plugins" / "data" / "jev-trim-inline" / "checks.jsonl"


def session(task: Dict[str, Any], with_plugin: bool, model: str) -> Dict[str, Any]:
    with tempfile.TemporaryDirectory() as work:
        shutil.copy(evaluate.TASKS / f"{task['id']}.txt", Path(work) / "output.log")
        script = Path(work) / "run.sh"
        script.write_text('#!/bin/sh\ncat "$(dirname "$0")/output.log"\n')
        script.chmod(0o755)
        command = ["claude", "-p", "--model", model, "--setting-sources", "project", "--strict-mcp-config",
                   "--disable-slash-commands", "--tools", "Bash", "--allowedTools", "Bash(./run.sh)",
                   "--no-session-persistence", "--output-format", "json"]
        if with_plugin:
            command += ["--plugin-dir", str(ROOT)]
        env = {k: v for k, v in os.environ.items() if k != "CLAUDECODE"}
        started = time.monotonic()
        done = subprocess.run(command + ["--", evaluate.prompt(task)], capture_output=True, text=True, cwd=work, env=env, timeout=300)
        shutil.rmtree(Path.home() / ".claude" / "projects" / re.sub(r"[^A-Za-z0-9]", "-", os.path.realpath(work)), ignore_errors=True)
    out = json.loads(done.stdout)
    usage = out.get("usage", {})
    answer = out.get("result", "")
    return {
        "task": task["id"],
        "plugin": with_plugin,
        "session": out.get("session_id"),
        "answer": answer,
        "correct": all(word in answer.lower() for word in task["answer"]),
        "input_tokens": sum(usage.get(k) or 0 for k in ("input_tokens", "cache_creation_input_tokens", "cache_read_input_tokens")),
        "cache_write_tokens": usage.get("cache_creation_input_tokens") or 0,
        "output_tokens": usage.get("output_tokens") or 0,
        "usd": out.get("total_cost_usd") or 0.0,
        "turns": out.get("num_turns"),
        "wall_ms": round((time.monotonic() - started) * 1000),
        "api_ms": out.get("duration_api_ms"),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("save")
    parser.add_argument("--model", default="haiku")
    parser.add_argument("--sides", choices=["both", "with", "without"], default="both")
    # Parallel sessions with the same --plugin-dir missed hooks in one test, so the default is one at a time.
    parser.add_argument("--workers", type=int, default=1)
    args = parser.parse_args()
    if not os.environ.get("TYPESAFE_API_KEY"):
        sys.exit("Set TYPESAFE_API_KEY. The sessions with the plugin need it.")
    tasks = json.loads((evaluate.TASKS / "tasks.json").read_text())
    sides = {"both": (False, True), "with": (True,), "without": (False,)}[args.sides]
    jobs = [(t, p) for t in tasks for p in sides]
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        rows = list(pool.map(lambda job: session(job[0], job[1], args.model), jobs))

    checks = [json.loads(line) for line in LOG.read_text().splitlines()] if LOG.exists() else []
    for row in rows:
        row["trim"] = next((c for c in checks if c.get("session") == row["session"]), None)
    print(f"{'task':<16} {'plugin':<7} {'right':<6} {'tokens':>8} {'cost':>9} {'kept lines':>11} {'jev tokens':>10}")
    for r in rows:
        t = r["trim"] or {}
        kept = f"{t.get('kept_lines', '-')} of {t.get('lines', '-')}" if t else ""
        print(f"{r['task']:<16} {'with' if r['plugin'] else 'without':<7} {'yes' if r['correct'] else 'NO':<6} "
              f"{r['input_tokens']:>8} {r['usd']:>9.5f} {kept:>11} {t.get('input_tokens', ''):>10}")
    jev_tokens = sum((r["trim"] or {}).get("input_tokens", 0) for r in rows)
    print(f"Jev tokens {jev_tokens}, ${jev_tokens * evaluate.JEV_USD_PER_M / 1e6:.5f}")
    Path(args.save).write_text(json.dumps(rows, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
