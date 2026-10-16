# jev-trim

A Claude Code plugin that trims long command output with Jev before Claude reads it. Jev keeps the lines that matter for your request: errors, failures, causes and the values you asked about. Claude reads fewer tokens, so each long output costs less.

## Status

Works for commands that succeed. In a live test with 5 long outputs, Claude answered all 5 right with and without the plugin. With the plugin, each session used about half the tokens. In Claude Code sessions with Claude Opus 5.5 on a failing test log, the session cost fell from $0.169 to $0.093. A failed command is not trimmed. See [Known issues](#known-issues).

## How it works

1. **Your prompt.** The plugin saves your last 3 prompts. Jev uses them to judge which lines matter.
2. **A Bash command finishes.** If its output is 6,000 characters or longer, the plugin splits it into passages. A passage ends at a blank line or after 10 lines.
3. **One Jev request** holds two questions:
   - A Choice with one option per passage: which passage holds the lines the agent most needs for the task? Its probabilities rank the passages.
   - A yes/no question: does the task need the whole output, for example a full list or a count? At 0.5 or more, nothing is trimmed.
4. **Trim.** The plugin keeps the first and the last passage, and every passage whose probability is at least 0.1 of the top passage's. Each gap becomes a line like `[… 322 lines skipped by Jev trim …]`.
5. **Claude reads the trimmed output** with a short note: lines were removed, and running the command again with `JEV_TRIM=0` in front gives the full output.

A command made only of these is left alone, because Claude needs its exact text: `cat`, `head`, `tail`, `sed`, `awk`, `less`, `more`, `nl`, `bat`, `jq`, `diff`, `grep`, `rg`, `find`, `ls`, `tree`, `xxd`, `od`, `git diff`, `git show` and `git blame`. A mixed command, such as `cat run.sh; ./run.sh`, is trimmed. The first passage is always kept, so the start of the output stays.

Trimming that would keep more than 80% of the output is skipped. If Jev cannot be reached, Claude gets the full output.

## Test results

The test outputs are made up: a failing test run, a failed build, a server log, a failed `npm install` and a startup log. Each is 18,000 to 27,000 characters, and the answer sits in a few lines. Run `python3 tests/make_tasks.py` to rebuild them.

Offline (`scripts/evaluate.py`), with Jev 1.14:

| Design | Needed passages | Routine passages | Result |
| --- | --- | --- | --- |
| Yes/no question per passage, all passages in one request | 0.32 to 0.80 | up to 0.83 | No threshold separates them |
| Choice over passages | top passage 1.0, others 0.22 to 0.28 | 0.075 at most | 9 of 9 needed lines kept, 94% of the output removed |

Live (`demo/live.py`), one Claude Code session per task and side, Claude Haiku 5.5, 16 October 2026:

| Task | Lines kept | Session tokens without → with | Right without / with |
| --- | --- | --- | --- |
| Failing test run | 21 of 343 | 21,801 → 11,133 | yes / yes |
| Failed build | 12 of 293 | 24,624 → 16,708 | yes / yes |
| Worker restart in a server log | 20 of 310 | 26,178 → 11,842 | yes / yes |
| Failed npm install | 29 of 339 | 22,383 → 11,416 | yes / yes |
| Port in a startup log | 15 of 165 | 23,712 → 11,735 | yes / yes |
| **All** | | **118,698 → 62,834 (−47%)** | **5 / 5** |

## Cost and speed

- **Jev:** one request per output, 6,000 to 15,000 tokens, $0.0003 to $0.0006, about 0.35 s.
- **Haiku sessions in the test:** $0.0165 without the plugin, $0.0058 with it, plus $0.0021 for Jev.
- **Claude Code sessions with Opus 5.5:** on the failing test log, a session with the full output cost $0.169 at list prices. With the trimmed output it cost $0.093, including $0.0003 for Jev. In a third session, Claude also searched the full output with `grep` to check the skipped lines, and the session cost $0.130. All three answers were right.
- **Cache writes:** the headless test sessions wrote to the 1-hour cache, and the interactive sessions to the 5-minute cache. At the 5-minute price, the 11,000 cache-write tokens that the 5-output test removed per output cost about $0.028 on Sonnet 5.5 and $0.056 on Opus 5.5. Jev costs about $0.0004 per output.
- **Time:** the sessions with the plugin took about 1.5 s longer. Jev took about 0.35 s of that.

## Known issues

- **Failed commands are not trimmed.** When a command exits with an error, Claude Code sends its output to `PostToolUseFailure`. That hook can add context, but it cannot replace the output. Claude Code also cuts long failure output in the middle, where the error often is. The live test used a script that exits 0, like reading a saved or CI log.
- **Context can go.** In the server log, the trim removed an earlier memory warning. Claude still found the cause, and it said that the trimmed log did not show what drove memory up.
- **Small test.** 5 made-up outputs and one run per side.

## Demo

The `demo` folder has five scripts that print the saved logs from `tests/tasks/`. They exit 0, because the plugin trims only commands that succeed.

```sh
cd jev-trim/demo
export TYPESAFE_API_KEY=...
claude --plugin-dir ..
```

Ask one of these and approve the command:

| Script | Prompt |
| --- | --- |
| `ci-test-log.sh` | `./ci-test-log.sh prints the saved log of last night's CI test run. Run it and tell me why the tests failed.` |
| `ci-build-log.sh` | `./ci-build-log.sh prints the saved log of the CI build. Run it and tell me why the build failed.` |
| `worker-log.sh` | `./worker-log.sh prints the worker service log. Run it and tell me why the worker restarted around 14:03.` |
| `ci-install-log.sh` | `./ci-install-log.sh prints the saved log of the CI npm install. Run it and tell me why it failed.` |
| `startup-log.sh` | `./startup-log.sh prints the billing service startup log. Run it and tell me which port the service started on.` |

The terminal shows a line like `Jev trim: kept 21 of 343 lines, about 6,392 tokens less for Claude to read.` Type `/context` to see the session's context use, then start a session without `--plugin-dir` and compare. Say in the prompt that the script prints a saved log. Otherwise Claude may look inside the script and read the file with `cat`, which the plugin leaves alone.

`demo/live.py` runs all five tasks with and without the plugin and prints the comparison table.

## Setup

1. Set the TypeSafe API key in `/plugin` or in `TYPESAFE_API_KEY`.
2. Load the plugin: `claude --plugin-dir /path/to/jev-trim`.
3. Optional settings in `/plugin`: `keep_at` (default 0.1) and `min_chars` (default 6000).

## Data and privacy

- **Sent to TypeSafe:** the command output, the command, Claude's description of the command, and your last 3 prompts, each cut to 1,000 characters.
- **Saved locally:** your last 3 prompts per session, deleted when the session ends, and `checks.jsonl` in the plugin data folder with sizes and timings. The log holds no output text.

## Layout

```
.claude-plugin/plugin.json   plugin name and settings
hooks/hooks.json             UserPromptSubmit, PostToolUse (Bash), SessionEnd
scripts/hook.py              hook entry point: skip rules, prompt memory, hook output
scripts/trim.py              passages, the Jev request, the trim
scripts/jev.py               TypeSafe API client
scripts/evaluate.py          offline test with real Jev
demo/*.sh                    demo scripts that print the saved logs
demo/live.py                 live test with Claude Code sessions
tests/make_tasks.py          builds the test outputs in tests/tasks/
tests/test_trim.py           unit tests with a fake Jev: python3 -m unittest discover tests
```
