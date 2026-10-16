"""Trims each test output with real Jev and checks that the needed lines stay.

Usage: TYPESAFE_API_KEY=... python3 scripts/evaluate.py [--keep-at 0.1] [--save scores.json]
       python3 scripts/evaluate.py --from scores.json    tries several thresholds on saved scores, with no Jev requests
"""

import argparse
import json
import os
import sys
import time
from pathlib import Path
from typing import Any, Dict, List

import hook
import jev
import trim

TASKS = Path(__file__).resolve().parent.parent / "tests" / "tasks"
JEV_USD_PER_M = 0.042
SWEEP = [0.02, 0.05, 0.1, 0.2, 0.3, 0.5]


def prompt(task: Dict[str, Any]) -> str:
    """The user prompt, the same as in the live test."""
    return f"{task['question']} Run ./run.sh to see the output. Answer in at most two sentences."


def load(task: Dict[str, Any]) -> str:
    return (TASKS / f"{task['id']}.txt").read_text().rstrip("\n")


def measure(task: Dict[str, Any], run: Dict[str, Any], keep_at: float) -> Dict[str, Any]:
    text = load(task)
    ranges = trim.split(text)
    keep = [True] * len(ranges) if run["whole"] >= trim.WHOLE_AT else trim.keep_mask(run["relevance"], keep_at)
    trimmed = trim.rebuild(text, ranges, keep)
    return {
        "needles_kept": sum(n in trimmed for n in task["needles"]),
        "needles": len(task["needles"]),
        "lines": len(text.split("\n")),
        "kept_lines": sum(len(r) for r, k in zip(ranges, keep) if k),
        "chars": len(text),
        "kept_chars": len(trimmed),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--keep-at", type=float, default=hook.DEFAULT_KEEP_AT)
    parser.add_argument("--save", help="write the Jev answers to this JSON file")
    parser.add_argument("--from", dest="source", help="read Jev answers from a saved file and try several thresholds")
    args = parser.parse_args()
    tasks = json.loads((TASKS / "tasks.json").read_text())

    if args.source:
        runs = json.loads(Path(args.source).read_text())
        print(f"{'keep_at':>7}  {'needles kept':>12}  {'tokens kept':>11}")
        for keep_at in SWEEP:
            rows = [measure(t, runs[t["id"]], keep_at) for t in tasks]
            kept = sum(r["needles_kept"] for r in rows)
            share = sum(r["kept_chars"] for r in rows) / sum(r["chars"] for r in rows)
            print(f"{keep_at:>7}  {kept:>5} of {sum(r['needles'] for r in rows):<4}  {share:>10.0%}")
        return 0

    client = jev.Jev(os.environ.get("TYPESAFE_API_KEY") or sys.exit("Set TYPESAFE_API_KEY."))
    runs = {}
    print(f"{'task':<16} {'lines':>11} {'tokens':>13} {'needles':>7} {'whole':>5} {'jev tokens':>10} {'ms':>6}")
    for task in tasks:
        text = load(task)
        lines = text.split("\n")
        passages = [trim.Passage("stdout", r, "\n".join(lines[r.start : r.stop])) for r in trim.split(text)]
        state = {"user_requests": [prompt(task)], "command": task["command"], "purpose": task["purpose"]}
        usage = jev.Usage()
        started = time.monotonic()
        relevance, whole = trim.score(client, passages, state, usage)
        run = {"relevance": relevance, "whole": whole, "input_tokens": usage.input_tokens, "requests": usage.requests,
               "ms": round((time.monotonic() - started) * 1000)}
        r = measure(task, run, args.keep_at)
        needle = [round(v, 3) for p, v in zip(passages, relevance) if any(n in p.text for n in task["needles"])]
        other = sorted(round(v, 3) for p, v in zip(passages, relevance) if not any(n in p.text for n in task["needles"]))
        runs[task["id"]] = {**run, **r, "needle_relevance": needle, "top_other": other[-3:]}
        print(f"{task['id']:<16} {r['kept_lines']:>4} of {r['lines']:<4} {r['kept_chars'] // 4:>5} of {r['chars'] // 4:<5} "
              f"{r['needles_kept']:>3} of {r['needles']} {whole:>5.2f} {run['input_tokens']:>10} {run['ms']:>6}")
        print(f"{'':<16} needed passages {needle}, highest others {other[-3:]}")
    tokens = sum(r["input_tokens"] for r in runs.values())
    print(f"\nkeep_at {args.keep_at}: Jev tokens {tokens}, ${tokens * JEV_USD_PER_M / 1e6:.5f}")
    if args.save:
        Path(args.save).write_text(json.dumps(runs, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
