# Jev projects

Tools and demos built on Jev. Jev is the first System One model from [TypeSafe](https://typesafe.ai). It returns typed answers with probabilities (Choice, Score, Noul). Code owns the workflow and combines the answers.

Claude Code wrote all code and text in this repo. No person has reviewed the code.

| Project | Status | Summary |
| --- | --- | --- |
| [agent-websearch-eval](agent-websearch-eval/README.md) | Works, small value for Claude Code users | Jev classifier for tool output, packaged as a Claude Code plugin. Flags outside input (web search, web fetch, MCP results, `curl` output) that tries to change the agent's behaviour without the user's consent. Claude already resists most injections by itself. |
| [jev-trim](jev-trim/README.md) | Works for commands that succeed | Claude Code plugin that trims long command output with Jev before Claude reads it. In a live test, sessions used about half the tokens and every answer stayed right. |
| [tabletop-game-runner](tabletop-game-runner/README.md) | Tic-tac-toe and chess work | Web UI where Jev plays tic-tac-toe and chess against Jev, other bots or a human. Code looks ahead. Jev judges positions or picks a move. Stockfish rates every chess move. |
| [yes-no-pizza](yes-no-pizza/README.md) | Works | Ask a question, and Jev answers yes, no or pizza. The sidebar shows the Jev request, as in the tabletop game runner. |

## Setup

Each project needs a TypeSafe API key in `TYPESAFE_API_KEY`.

Web apps (`tabletop-game-runner`, `yes-no-pizza`):

```sh
cd tabletop-game-runner
npm install
cp .env.example .env    # then set TYPESAFE_API_KEY
npm run dev             # http://localhost:5173, yes-no-pizza on 5174
```

Claude Code plugins (`jev-trim`, `agent-websearch-eval`). Set the key in the environment or in `/plugin`.

```sh
claude --plugin-dir ./jev-trim
```
