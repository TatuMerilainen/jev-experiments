"""Unit tests with a fake Jev client. Run: python3 -m unittest discover tests"""

import io
import json
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

import hook  # noqa: E402
import jev  # noqa: E402
import trim  # noqa: E402

NOISE = "\n".join(f"tests/test_queue.py::test_case_{i} PASSED" for i in range(400))
FAILURE = "E       AssertionError: assert 'VAT: FI12345678' == 'VAT FI12345678'"
OUTPUT = f"collected 401 items\n{NOISE}\n\n{FAILURE}\n\n1 failed, 400 passed"


class FakeJev:
    """Puts most of the probability on passages with an assertion error."""

    def __init__(self, error=None, whole=0.1):
        self.states = []
        self.error = error
        self.whole = whole

    def ask(self, state, questions, usage):
        if self.error:
            raise self.error
        self.states.append(state)
        usage.add(100)
        options = questions["passage"]["criteria"]
        weights = {k: 0.9 if "AssertionError" in text else 0.01 for k, text in options.items()}
        total = sum(weights.values())
        answers = {"passage": {"type": "choice", "probabilities": {k: w / total for k, w in weights.items()}}}
        if "whole" in questions:
            answers["whole"] = {"type": "noul", "noul": self.whole}
        return answers


def bash_event(stdout=OUTPUT, command="pytest -q", stderr=""):
    return {
        "session_id": "s-1",
        "hook_event_name": "PostToolUse",
        "tool_name": "Bash",
        "tool_input": {"command": command, "description": "Run the tests"},
        "tool_response": {"stdout": stdout, "stderr": stderr, "interrupted": False, "isImage": False},
    }


class SplitTest(unittest.TestCase):
    def test_ranges_cover_every_line_once(self):
        ranges = trim.split(OUTPUT)
        covered = [i for r in ranges for i in r]
        self.assertEqual(covered, list(range(OUTPUT.count("\n") + 1)))
        self.assertTrue(all(len(r) <= trim.WINDOW_LINES for r in ranges))

    def test_rebuild_marks_gaps(self):
        text = "a\nb\nc\nd"
        out = trim.rebuild(text, [range(0, 1), range(1, 3), range(3, 4)], [True, False, True])
        self.assertEqual(out, "a\n[… 2 lines skipped by Jev trim …]\nd")

    def test_batches_respect_the_size_limit(self):
        passages = [trim.Passage("stdout", range(i, i + 1), "x" * 25000) for i in range(5)]
        self.assertEqual(trim.batches(passages), [[0, 1], [2, 3], [4]])


class TrimTest(unittest.TestCase):
    def test_keeps_failure_first_and_last(self):
        result = trim.trim(FakeJev(), {"stdout": OUTPUT}, {"user_requests": ["Why did it fail?"]}, 0.1)
        text = result.texts["stdout"]
        self.assertIn(FAILURE, text)
        self.assertTrue(text.startswith("collected 401 items"))
        self.assertTrue(text.endswith("1 failed, 400 passed"))
        self.assertIn("lines skipped by Jev trim", text)
        self.assertLess(result.kept_chars, result.total_chars / 5)

    def test_one_request_for_a_short_output(self):
        client = FakeJev()
        trim.trim(client, {"stdout": OUTPUT}, {}, 0.1)
        self.assertEqual(len(client.states), 1)


class HookTest(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.settings = hook.Settings(api_key="key", keep_at=0.1, min_chars=6000, data_dir=Path(self.dir.name))

    def tearDown(self):
        self.dir.cleanup()

    def run_hook(self, event, client=None):
        return hook.trim_bash(event, self.settings, client or FakeJev())

    def test_long_output_is_trimmed_with_the_same_shape(self):
        out = self.run_hook(bash_event())
        updated = out["hookSpecificOutput"]["updatedToolOutput"]
        self.assertEqual(set(updated), {"stdout", "stderr", "interrupted", "isImage"})
        self.assertIn(FAILURE, updated["stdout"])
        self.assertIn("JEV_TRIM=0", out["hookSpecificOutput"]["additionalContext"])
        self.assertIn("kept", out["systemMessage"])

    def test_short_output_passes(self):
        self.assertIsNone(self.run_hook(bash_event(stdout="ok\n" * 10)))

    def test_view_commands_and_bypass_pass(self):
        for command in ["cat big.log", "git diff HEAD~1", "grep -rn TODO .", "JEV_TRIM=0 pytest -q", "FOO=1 cat x | head"]:
            self.assertIsNone(self.run_hook(bash_event(command=command)), command)

    def test_mixed_commands_are_trimmed(self):
        for command in ['cat ./run.sh; echo "-----"; ./run.sh', "cd app && pytest -q", "pytest -q | tail -400"]:
            self.assertIsNotNone(self.run_hook(bash_event(command=command)), command)

    def test_mostly_needed_output_passes(self):
        stdout = "\n".join(f"{FAILURE} {i}" for i in range(300))
        self.assertIsNone(self.run_hook(bash_event(stdout=stdout)))

    def test_task_that_needs_the_whole_output_passes(self):
        self.assertIsNone(self.run_hook(bash_event(), FakeJev(whole=0.9)))

    def test_api_error_fails_open(self):
        out = self.run_hook(bash_event(), FakeJev(error=jev.JevError("HTTP 401: bad key")))
        self.assertEqual(set(out), {"systemMessage"})
        self.assertIn("in full", out["systemMessage"])

    def test_prompts_reach_the_task(self):
        for prompt in ["one", "two", "three", "four"]:
            hook.remember_prompt(self.settings, {"session_id": "s-1", "prompt": prompt})
        client = FakeJev()
        self.run_hook(bash_event(), client)
        self.assertEqual(client.states[0]["task"]["user_requests"], ["two", "three", "four"])
        self.assertEqual(client.states[0]["task"]["purpose"], "Run the tests")

    def test_log_holds_no_output_text(self):
        self.run_hook(bash_event())
        line = (Path(self.dir.name) / "checks.jsonl").read_text()
        self.assertNotIn("AssertionError", line)
        self.assertEqual(json.loads(line)["action"], "trim")


class EntryPointTest(unittest.TestCase):
    def test_main_fails_open_on_bad_input(self):
        out = io.StringIO()
        with mock.patch.object(sys, "stdin", io.StringIO("not json")), redirect_stdout(out):
            self.assertEqual(hook.main(), 0)
        self.assertIn("failed", json.loads(out.getvalue())["systemMessage"])


if __name__ == "__main__":
    unittest.main()
