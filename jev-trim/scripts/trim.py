"""Splits long command output into passages and keeps the ones the agent needs, as judged by Jev."""

import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

import jev

# A passage ends at a blank line or after this many lines.
WINDOW_LINES = 10
# Output per Jev request, about 15k tokens. Jev reads at most 32k tokens per question.
MAX_REQUEST_CHARS = 60000
MAX_PARALLEL = 8
# At or above this, the task needs the whole output and nothing is trimmed.
WHOLE_AT = 0.5
MARKER = "[… {n} lines skipped by Jev trim …]"

# Asked once per output. The passage question can only rank passages, so it cannot tell when the task needs them all.
WHOLE_OUTPUT = {
    "type": "noul",
    "instructions": "Does `task` need the whole command output, for example a full list, every warning, or a count of lines?",
    "criteria": {
        "true": "`task` asks for all of the output, a full list of items, every message of a kind, or a count.",
        "false": "`task` needs only some lines: an error, a failure, a cause, a summary, or one value.",
    },
}


@dataclass
class Passage:
    stream: str
    lines: range
    text: str


@dataclass
class Result:
    texts: Dict[str, str]
    total_lines: int
    kept_lines: int
    total_chars: int
    kept_chars: int
    # Each passage's probability divided by the highest one in its request.
    relevance: List[float]
    whole: float
    usage: jev.Usage = field(default_factory=jev.Usage)
    ms: int = 0


def split(text: str) -> List[range]:
    """Line ranges that cover the text in order."""
    lines = text.split("\n")
    ranges, start = [], 0
    for i, line in enumerate(lines):
        if not line.strip() or i - start + 1 >= WINDOW_LINES or i == len(lines) - 1:
            ranges.append(range(start, i + 1))
            start = i + 1
    return ranges


def passage_question(texts: List[str]) -> Dict[str, Any]:
    """A Choice with one option per passage. Its probabilities rank the passages against each other."""
    return {
        "type": "choice",
        "instructions": "Which passage of the command output holds the lines the agent most needs for `task`: the error, the failure, the cause, or the value that `task` asks about?",
        "criteria": {f"passage {j + 1}": text for j, text in enumerate(texts)},
    }


def batches(passages: List[Passage]) -> List[List[int]]:
    out: List[List[int]] = [[]]
    size = 0
    for i, p in enumerate(passages):
        if out[-1] and size + len(p.text) > MAX_REQUEST_CHARS:
            out.append([])
            size = 0
        out[-1].append(i)
        size += len(p.text)
    return out


def score(client: jev.Jev, passages: List[Passage], task: Dict[str, Any], usage: jev.Usage) -> Tuple[List[float], float]:
    """Returns each passage's relevance and the probability that the task needs the whole output."""

    def ask(job: Tuple[int, List[int]]) -> Tuple[List[int], List[float], Optional[float]]:
        n, ids = job
        questions: Dict[str, Any] = {"passage": passage_question([passages[i].text for i in ids])}
        if n == 0:
            questions["whole"] = WHOLE_OUTPUT
        answers = client.ask({"task": task}, questions, usage)
        probs = answers["passage"]["probabilities"]
        values = [float(probs.get(f"passage {j + 1}", 0.0)) for j in range(len(ids))]
        top = max(values) or 1.0
        whole = answers["whole"]["noul"] if "whole" in answers else None
        return ids, [v / top for v in values], whole

    relevance: Dict[int, float] = {}
    whole = 0.0
    with ThreadPoolExecutor(max_workers=MAX_PARALLEL) as pool:
        for ids, values, w in pool.map(ask, enumerate(batches(passages))):
            relevance.update(zip(ids, values))
            if w is not None:
                whole = float(w)
    return [relevance[i] for i in range(len(passages))], whole


def rebuild(text: str, ranges: List[range], keep: List[bool]) -> str:
    lines = text.split("\n")
    out: List[str] = []
    skipped = 0
    for r, kept in zip(ranges, keep):
        if kept:
            if skipped:
                out.append(MARKER.format(n=skipped))
                skipped = 0
            out.extend(lines[r.start : r.stop])
        else:
            skipped += len(r)
    if skipped:
        out.append(MARKER.format(n=skipped))
    return "\n".join(out)


def keep_mask(relevance: List[float], keep_at: float) -> List[bool]:
    """The first and the last passage, and every passage at or above keep_at."""
    return [r >= keep_at or i in (0, len(relevance) - 1) for i, r in enumerate(relevance)]


def trim(client: jev.Jev, streams: Dict[str, str], task: Dict[str, Any], keep_at: float) -> Result:
    started = time.monotonic()
    usage = jev.Usage()
    passages = []
    for name, text in streams.items():
        lines = text.split("\n")
        for r in split(text):
            passages.append(Passage(name, r, "\n".join(lines[r.start : r.stop])))
    relevance, whole = score(client, passages, task, usage)

    texts: Dict[str, str] = {}
    kept_lines = 0
    for name, text in streams.items():
        ids = [i for i, p in enumerate(passages) if p.stream == name]
        keep = [True] * len(ids) if whole >= WHOLE_AT else keep_mask([relevance[i] for i in ids], keep_at)
        texts[name] = rebuild(text, [passages[i].lines for i in ids], keep)
        kept_lines += sum(len(passages[i].lines) for i, k in zip(ids, keep) if k)
    return Result(
        texts=texts,
        total_lines=sum(len(p.lines) for p in passages),
        kept_lines=kept_lines,
        total_chars=sum(len(t) for t in streams.values()),
        kept_chars=sum(len(t) for t in texts.values()),
        relevance=relevance,
        whole=whole,
        usage=usage,
        ms=round((time.monotonic() - started) * 1000),
    )
