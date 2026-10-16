"""Runs the labelled test cases through the same check the hook uses, and prints a table.

Usage: TYPESAFE_API_KEY=... python3 scripts/evaluate.py [--flag-at 0.5] [--model jev-1.13.0] [--save results.json]
"""

import argparse
import json
import os
import statistics
import sys
from pathlib import Path
from typing import Any, Dict, List

import hook
import jev
import outside_input

TESTS = Path(__file__).resolve().parent.parent / "tests"


def case_text(case: Dict[str, Any]) -> str:
    text = case["text"]
    if "filler_insert" in case:
        filler = (TESTS / "filler.md").read_text()
        at = filler.find("\n\n", int(len(filler) * case["filler_insert"]))
        at = len(filler) if at < 0 else at
        text = filler[:at] + ("\n\n" + text if text else "") + filler[at:]
    if "hidden" in case:
        text += "".join(chr(0xE0000 + ord(c)) for c in case["hidden"])
    return text


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--flag-at", type=float, default=hook.DEFAULT_FLAG_AT)
    parser.add_argument("--model", default=jev.MODEL)
    parser.add_argument("--only", help="run only cases whose id or group contains this text")
    parser.add_argument("--save", help="write all scores to this JSON file")
    args = parser.parse_args()
    api_key = os.environ.get("TYPESAFE_API_KEY")
    if not api_key:
        print("Set TYPESAFE_API_KEY.", file=sys.stderr)
        return 1
    client = jev.Jev(api_key, args.model)
    cases = json.loads((TESTS / "cases.json").read_text())
    if args.only:
        cases = [c for c in cases if args.only in c["id"] or args.only in c["group"]]

    rows: List[Dict[str, Any]] = []
    print(f"{'case':<24} {'group':<14} {'expect':<6} {'main':>5} {'fake':>5}  {'chunks':>6}  {'outcome':<11} flagged passage")
    for case in cases:
        text, _ = outside_input.reveal_hidden(case_text(case))
        source = outside_input.source_of(case["tool"], case["input"]) or case["tool"]
        result = jev.check(client, text, source, case["user"], hook.flag_rule(args.flag_at))
        outcome = "ok" if result.flagged == (case["expect"] == "flag") else ("MISSED" if case["expect"] == "flag" else "FALSE ALARM")
        passage = hook.excerpt(result.passages[0].text, 60) if result.passages else ""
        top = result.top
        print(f"{case['id']:<24} {case['group']:<14} {case['expect']:<6} {top['injection']:5.2f} {top['impersonation']:5.2f}  {len(result.chunks):>6}  {outcome:<11} {passage}")
        rows.append(
            {
                "id": case["id"],
                "group": case["group"],
                "expect": case["expect"],
                "top": top,
                "chunks": result.chunks,
                "passages": [{"answers": p.answers, "text": p.text} for p in result.passages],
                "outcome": outcome,
                "requests": result.usage.requests,
                "input_tokens": result.usage.input_tokens,
                "ms": result.ms,
                "model": result.usage.model,
            }
        )

    attacks = [r for r in rows if r["expect"] == "flag"]
    clean = [r for r in rows if r["expect"] == "pass"]
    ms = sorted(r["ms"] for r in rows)
    print()
    if attacks:
        print(f"Caught: {sum(r['outcome'] == 'ok' for r in attacks)} of {len(attacks)} injections")
    if clean:
        print(f"False alarms: {sum(r['outcome'] != 'ok' for r in clean)} of {len(clean)} clean results")
    print(f"Thresholds: main {args.flag_at}, fake message {hook.IMPERSONATION_AT}. Model {rows[0]['model'] if rows else args.model}")
    if ms:
        print(f"Time per check: median {statistics.median(ms):.0f} ms, slowest {ms[-1]} ms")
        tokens = [r["input_tokens"] for r in rows]
        print(f"Tokens per check: median {statistics.median(tokens):.0f}, total {sum(tokens)} (${sum(tokens) * 0.042 / 1e6:.5f})")
    if args.save:
        Path(args.save).write_text(json.dumps(rows, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
