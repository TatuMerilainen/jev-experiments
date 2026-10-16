# Jev projects

Tools and demos built on Jev. Jev is the first System One model from [TypeSafe](https://typesafe.ai). It returns typed answers with probabilities (Choice, Score, Noul). Code owns the workflow and combines the answers.

| Project | Status | Summary |
| --- | --- | --- |
| [agent-websearch-eval](agent-websearch-eval/README.md) | Works, small value for Claude Code users | Jev classifier for tool output, packaged as a Claude Code plugin. Flags outside input (web search, web fetch, MCP results, `curl` output) that tries to change the agent's behaviour without the user's consent. Claude already resists most injections by itself. |
| [jev-trim](jev-trim/README.md) | Works for commands that succeed | Claude Code plugin that trims long command output with Jev before Claude reads it. In a live test, sessions used about half the tokens and every answer stayed right. |
| [tabletop-game-runner](tabletop-game-runner/README.md) | Tic-tac-toe and chess work | Web UI where Jev plays tic-tac-toe and chess against Jev, other bots or a human. Code looks ahead. Jev judges positions or picks a move. Stockfish rates every chess move. |
| [yes-no-pizza](yes-no-pizza/README.md) | Works against a fake API | Ask a question, and Jev answers yes, no or pizza. The sidebar shows the Jev request, as in the tabletop game runner. |

## Setup

- API key: create one at [console.typesafe.ai](https://console.typesafe.ai/) and set `TYPESAFE_API_KEY`.
- Agent skill: a local copy of the TypeSafe skill lives in `.claude/skills/typesafe-ai/`. Source: `typesafe-ai/skills`, commit `65a39f3`.
- Docs: [docs.typesafe.ai](https://docs.typesafe.ai/llms.txt).
