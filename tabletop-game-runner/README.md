# Tabletop game runner

A demo bot that plays board games with Jev, with a web UI that shows each decision. It plays tic-tac-toe and chess.

The sections from "Goal" to "Evaluation" describe tic-tac-toe. [Chess](#chess), [Jev statistics](#jev-statistics) and [Chess puzzles](#chess-puzzles) follow.

## Run

```sh
npm install
cp .env.example .env    # then set TYPESAFE_API_KEY
npm run dev             # http://localhost:5173
```

- The switch at the top of the page picks the game. `http://localhost:5173/#chess` opens chess directly.
- Without an API key the Jev players are off. The other players still work. A Search only player takes each Jev player's place. The browser keeps the saved Jev setups, so they come back once the key is set.
- **Network.** The server listens on `127.0.0.1`, so only this machine can reach it. `HOST` in `.env` sets another address, for example `HOST=0.0.0.0` for the local network. Anyone who can reach the server can start paid Jev requests.
- **Other web pages.** The API accepts a POST only with `Content-Type: application/json`, and only from this server's own page. A request without an `Origin` header, such as one from `curl`, is accepted. A host name other than `localhost`, an IP address or `HOST` is refused.
- `npm run dev` restarts the server when server code changes. UI changes reload in the browser.
- `npm install` also installs Stockfish for chess. The package is about 240 MB.
- **Jev models.** Each Jev player picks its model under "More settings": `jev-1.14.0` (the default) or `jev-1.13.0`. Two Jev players with different models can play each other. The list is `JEV_MODELS` in `src/shared/types.ts`; it holds fixed versions only, because an alias such as `jev-latest` can move to a new version. `TYPESAFE_DEFAULT_MODEL` in `.env` only sets the model for a request that names none.

Other commands:

```sh
npm test            # unit tests
npm run typecheck
```

- **No network in tests.** `tests/setup.ts` blocks `fetch` and `https` in every test, so a test can never send a real Jev request. The tests use fake Jev clients.

## Goal

- **Input:** the game rules as text, and the current board.
- **Output:** the move with the best chance to win without losing.
- The bot looks at future moves before it picks one.
- This is a demo. It shows how code and Jev share the work.

## Players

| Player | Behaviour | Purpose |
| --- | --- | --- |
| Human | Click a cell | Play against Jev |
| Jev look-ahead | Depth-D search with Jev judging the leaves | The main demo |
| Jev direct | One Choice over the legal moves, asked twice | Shows Jev alone |
| Search only | Same depth-D search; unfinished leaves count as 0 (a draw) | Shows the search without Jev |
| Perfect | Full minimax | The strongest opponent |
| Random | Random legal move | Lowest baseline |

The gap between "Search only" and "Jev look-ahead" at the same depth is what Jev adds. That number is the main result of the demo.

## Web UI

The top of the page has three columns: X's player panel, the game, and O's player panel. The data panels are below.

| Area | Content |
| --- | --- |
| Player panels (left: X, right: O) | Player type, settings and results of each side. See below the table. |
| Status line | The game number and its state, above the board. "Swap sides" on the right swaps the X and O configurations and starts a new experiment. The button is disabled when both sides have the same configuration. |
| Board | The current game only. A small dot marks the last move. When a game is won, the winning line is tinted and the other cells fade. |
| Toolbar | Reset, Step (one move), Play (Pause while playing, Restart after a game), and a slider for the delay between moves with four stops: No delay (full speed), 0.25 s, 1 s (the default) and 2 s. Below: the "Random first move" and "Continuous play" switches. |
| Configuration vs configuration | Same as tic-tac-toe. "Split by opening" also shows a bar for the opening set. The games list names the opening of an opening set game. |
| Move | The selected move: the position before it, plus the time, Jev requests and tokens. On the board, each free cell shows the player's own value for that move as a number, with two decimals. Its colour shows the true result from the solver: green keeps the best result the player could still reach, red gives part of it away. A sentence under the board says what the move did, and for a mistake it lists the moves that keep the best result. "Details" holds every candidate with its value and true result, the opponent's worst reply, the number of positions decided by code, and the positions Jev rated. A rated position shows the value the search uses: 0.9 × Jev's value. |
| Experiment | Games, wins, draws and distinct games. "Per player" holds Jev requests and tokens per move. The model, the Jev cost so far, and the save location. |
| Moves | The current game's moves. Click one to show it in the Move panel. The Move panel then stays on that move while new moves arrive. "Latest move" in the Move panel shows the newest move again and follows each new move. |
| Jev sidebar | The Jev request of the selected move. See below the table. |

**Player panels**

- A purple badge with the model name shows when the player asks Jev. A grey badge with the code technique shows when code decides (Minimax, Math.random).
- A one-line description, then the technical details: search, position values, Jev requests and inputs, and move choice. They follow the current settings.
- Jev players also show their instructions, with an Edit link.
- "More settings" holds the Jev model, the search depth, the "Send line contents" switch and the answer levels.
- At the bottom: wins, optimal moves and time per move. The panel of the player to move has a coloured outline.

**Configuration vs configuration**

- The bar shows the wins of the left configuration, the draws and the wins of the right one. It counts every saved game between the two configurations, from all experiments and with either side.
- The bar changes as soon as a player setting changes. It updates after each saved game.
- "All configurations" lists every pair with saved games, most games first.
- "Split by who went first" (off by default) shows two bars per pair, stacked as one block: the games where the left configuration went first, then those where it went second. The figures of the first bar sit above the block, and those of the second bar below it. An order with no games shows a dashed outline. The first move is an advantage, so the two bars can differ a lot. A pair with the same configuration on both sides keeps one bar.
- "Split by model" (off by default) counts each Jev model as its own configuration. The bar then counts only games with the current models, and the list shows each model apart. With the switch off, games of all models count together.
- "Split by opening" (off by default) shows one bar for each way the games started: from the start position or with a random first move. Only the kinds with saved games show. Each bar has its own games list, and "All configurations" shows one group per kind. With the switch off, the note under the bar says how many of the games had a random first move, and the games list marks them.
- Under each pair, "Games" lists its last 20 games, newest first: the time, who went first, the result and the length. Clicking a game opens it as a replay.

**Jev sidebar**

- The "Jev request" button in the header opens it. The sidebar remembers whether it was open.
- Under the title, one sentence says what the request asks, for example "Jev rates a position 2 moves ahead: how does the game end for X?". A muted line below names the move.
- Then it shows the Jev call in the order of the TypeSafe Playground: badges for the model, input tokens, cost and response time, then the State and the Questions as JSON, then the Answers with the probability of each option.
- Each part has a Copy button, so it can be pasted into the Playground.
- The call is the first Jev request of the selected move. When that move made no Jev request, the sidebar shows the latest move that did.
- On a wide screen the sidebar fills the space to the right of the page. Below 1100 px it lies over the page.

Behaviour:

- The page starts paused. Press Play or Step.
- After a human move, the bot answers by itself, also while play is paused.
- Each game's settings are saved in the browser: both player setups (with the model and custom instructions), "Random first move" (in chess the "Openings" choice), the delay and "Continuous play". They come back after a page reload. A saved value that is no longer valid falls back to its default.
- Play runs one game and stops at its end. The board and the Move panel keep showing the last move.
- After a game, the Play button reads Restart. Restart starts the next game and plays it. The tally keeps counting.
- **Continuous play** (off by default): when a game ends, the next game starts after the move delay. Play goes on until you press Pause. Turning the switch off during a game makes that game the last one.
- Step plays one move. After a game, Step clears the board for the next game.
- **Replay.** Clicking a game in a "Games" list pauses play and opens that saved game. The board, the Move panel, the Moves list and the Jev sidebar then show the saved game, and the page scrolls to the board. The previous and next buttons, or a click in the Moves list, step through the moves. "Back to live game" returns to the experiment; it stays paused until you press Play.
- Reset stops play and starts over: an empty board, game 1 and an empty tally. The next move starts a new experiment folder.
- Changing a player, applying new instructions, or changing the "Random first move" switch restarts the experiment. A tally then always covers one setup.
- **Random first move with a human.** A human who moves first (X, or White in chess) makes that move. The experiment is then saved without a random first move, so the matchup panel counts its games as games without one.
- **Instructions.** These are the question `instructions` sent to Jev. Edit opens a textarea with Apply and Cancel. "Reset to default" goes back to the default text. The answer levels and the rules text are fixed in code.
- A human plays by clicking a cell. Set one side to Human to play against Jev.
- **Distinct games.** With the same setup and no random first move, Jev gets the same positions every game. If Jev answers the same way each time, every game is identical, and this count stays at 1. Turn on "Random first move" to get different games.
- **Grading.** The perfect solver grades every move: ✓ keeps the best result the player could still reach, ✗ gives part of it away.
- **No cache between moves.** Jev results are cached only inside one move, where the same position can appear several times in the tree. A game that repeats an earlier game makes new Jev calls, so the time shown is real.

## Saved data

Every move and every finished game is saved to disk. There is one folder per experiment:

```
data/experiments/2026-10-14_10-11-28_X-jev-lookahead-d2-v1-14-0-custom_O-perfect_aiq8/
├── experiment.json   # settings, including custom instructions, and the default prompt texts
├── moves.jsonl       # one line per move
└── games.jsonl       # one line per finished game
```

- The folder name holds the local start time, both player setups and a random suffix. `-v1-14-0` names a Jev player's model (`jev-1.14.0`). `-custom` marks custom instructions. `-grid` marks a Jev player without line contents.
- The folder is created at the first move, so an experiment with no moves leaves nothing.
- `experiment.json` saves the prompt texts. Results stay tied to the wording that produced them, even after the prompts change.
- **A line in `moves.jsonl`:** the game and move number, the player, the cell, the player setup, the board before the move, the grade, and the round-trip time. For a bot it also holds the full decision: every candidate, every position Jev judged with its level probabilities, the request count, tokens and time. The line also holds the first Jev request of the move and its answer (`jevExample`), so the Jev sidebar works in a replay.
- **Look-ahead decision.** It has `exactLeaves`: the number of distinct leaves that code decided.
- **A line in `games.jsonl`:** the result and the move sequence, for example `["a1", "b2", "b1", ...]`.
- **Size:** a Jev look-ahead move at depth 2 is about 4 KB.
- **Location:** `data/` is in `.gitignore`.
- **Matchup bar.** `GET /api/matchups?game=chess` (or `tictactoe`) reads `experiment.json` and `games.jsonl` from every folder. A configuration is the player type plus the settings that type uses. For example, the depth of a Random player is ignored. The Jev model is part of a configuration. With the "Split by model" switch off, games of all models count together. Delete a folder to remove its games from the bar.

Examples with `jq`:

```sh
# Results of every game in one experiment
jq -r '.result' data/experiments/<folder>/games.jsonl | sort | uniq -c

# Moves that were mistakes
jq -c 'select(.move.grade.optimal == false) | {gameNo, moveNo, player: .move.player, cell: .move.cell}' data/experiments/<folder>/moves.jsonl
```

## Approach

Jev makes fast, one-step judgments. The TypeSafe docs name multi-step reasoning as a weak spot: "It may struggle with tasks that require additional levels of indirection." They also say to keep exact logic in code. Looking several moves ahead is multi-step reasoning, so the work is split:

| Part | Owner | Reason |
| --- | --- | --- |
| Legal moves, making a move, detecting a win or a draw | Code | Exact. The TypeSafe docs: "Avoid asking the model something code can compute exactly." |
| Looking ahead (the game tree) | Code | Multi-step work |
| Judging an unfinished position: "how good is this for me?" | Jev (Score) | A judgment |
| Picking the move from the judged tree | Code (minimax) | Exact |
| Rules text | Sent to Jev in the state | Context for the judgment |

Chess engines use the same structure: a search in code plus a position evaluator. Here Jev is the evaluator.

The rules exist twice: as code, and as text for Jev. Both must describe the same game.

### Tic-tac-toe as the test bench

A full search solves tic-tac-toe without any model. The game has only 5,478 reachable positions. So the bot limits its search depth on purpose, and Jev judges the positions where the search stops.

Tic-tac-toe is still the right first game, because a perfect solver can grade every move.

## Turn flow (Jev look-ahead)

1. Code lists the legal moves.
2. Code builds the game tree to depth D. The default is 2 plies: the bot's move, then the opponent's reply.
3. Finished games in the tree get exact values: win +1, draw 0, loss −1.
4. Some unfinished leaves also have a known result, and code decides them the same way, with no Jev request:
   - The player to move can complete a line: a win for that player.
   - The player to move cannot complete a line, and the opponent has two or more different cells that each complete a line: a loss for that player.
5. The other unfinished leaves are merged across rotations and reflections. Each distinct leaf goes to Jev, one request per leaf, up to 16 in parallel.
6. Each Score answer becomes a value: P(win) − P(loss), from the probabilities of the three levels. A sure loss is −1, a draw 0 and a sure win +1. The search multiplies these estimates by 0.9, so a proven result outranks an estimate of the same sign.
7. Minimax: for each bot move, code takes the worst case over the opponent's replies. The bot plays the move with the best worst case. On a tie, the higher average wins, then the lowest cell.

Notes:

- **Depth 2.** At depth 2, code alone already sees every immediate win and every immediate loss. Jev handles the next level: forks and threats that pay off later. That is the "future moves" part of the demo.
- **Request count.** From the empty board, depth 2 has 72 leaves but only 12 distinct positions, so the first move costs 12 requests. Code decides more leaves later in a game. At depth 3 after X b2, code decides 18 of the 24 distinct leaves, so Jev gets 6 requests. In the 8,003 leaf requests of the saved games, the first rule covers 35% and both rules together 46%.

## Jev requests

The default prompts are in `src/shared/prompts.ts`. The request is built in `src/server/jev.ts`.

**State** (one per leaf):

```json
{
  "game": "tic-tac-toe",
  "rules": "Two players, X and O, take turns placing their mark ...",
  "you_play": "X",
  "opponent": "O",
  "to_move": "X",
  "board": ["X . O", ". X .", ". . O"],
  "lines": {
    "row 1 (a1 b1 c1)": "X, empty, O",
    "diagonal a1-c3 (a1 b2 c3)": "X, X, O"
  }
}
```

- `lines` holds all 8 lines (two are shown here). Code builds it from the board. The TypeSafe docs say Jev reads spatial and numeric layouts poorly and advise doing such conversions in code. The "Send line contents" switch per player turns it off, so both formats can be compared in one experiment.
- **Look-ahead question:** one Score. "It is `to_move`'s turn. If both players play their best from here, how does this game end for `you_play`?" Three levels, worst first: will lose, draw, will win. Each level has a short explanation with examples, built in `positionLevels()`. The three levels are the three results with best play, so a drawn position has one level.
- **Direct question:** one request with two Choice questions over the legal moves, with no look-ahead. Jev can favour the first option, so the second question lists the moves in reverse order. The bot averages the two answers.

## Evaluation

- **Game test (in the UI).** Set the players, move the delay slider to "No delay", turn on "Continuous play", and press Play. The tally counts results, optimal moves, time and tokens. Useful setups:
  - Jev look-ahead against Perfect: Jev should never lose.
  - Jev look-ahead against Random: Jev should win most games.
  - Jev look-ahead against Search only, with the same depth.

## Chess

### Goals

- One game costs less than one cent.
- Code does the calculation. Jev makes the decision.
- Stockfish rates every move, so each player gets a measured score.

### Research results

Measured on 2026-10-14 against `jev-1.13.0`. These results shaped the design.

- **Fixed cost.** Every request costs about 260 input tokens before any content. One cent buys at most about 900 requests. So the bot makes one Jev request per move at most.
- **Board format.** Jev read 12 positions in several formats and answered 108 questions of the form "what is on this square?":

  | Format | Tokens | Correct |
  | --- | --- | --- |
  | FEN | 59 | 69% |
  | 8 rows of 8 characters | 180 | 98% |
  | Piece lists ("knight f3, pawn e4") | 147 | 100% |
  | Map from square to piece | 318 | 100% |

- **Move choice.** 40 positions. Stockfish 18 at depth 12 rated each pick. Loss is in centipawns (1 pawn = 100). Lower is better.

  | Player | Average loss | Tokens per call |
  | --- | --- | --- |
  | Random legal move | 315 | – |
  | Jev, from all legal moves | 206 | 2,452 |
  | Random pick from the code's candidates | 108 | – |
  | Jev, from the code's candidates | 91–98 | 650–750 |
  | The code's top move | 76 | – |

- **Flat answers.** Jev's probabilities over chess moves are close to each other. They change by about 0.03 between two identical requests, so a close pick can flip.

### Chess players

| Player | Behaviour | Jev requests per move |
| --- | --- | --- |
| Jev | Code searches 1 to 5 plies (default 2) and keeps the best few moves. Jev picks one. | 1, or 0 when only one candidate is left |
| Jev alone | Jev picks from all legal moves, with no search | 1 |
| Search only | Plays the top move of the same code search | 0 |
| Stockfish | Stockfish at depth 1, 3, 5, 8 or 12 | 0 |
| Random | A random legal move | 0 |
| Human | Click a piece, then the square to move it to. Pawns always promote to a queen. | 0 |

- The default setup is Jev against Jev, at depth 2, with piece lists and threat descriptions on.
- "Search only" at the same depth is the baseline. The gap between it and "Jev" is what Jev adds. In the research the code's top move did better than Jev's pick.

### Turn flow (Jev player)

1. The browser sends the moves so far, in UCI notation such as `e2e4`, and the player setup to `POST /api/chess/decide`.
2. Code replays the game with chess.js.
3. Code searches every legal move to the set depth. At the end of the search it follows captures until the position is quiet, so a score never stops in the middle of an exchange. The score is material plus piece-square tables, in centipawns.
   - **Speed.** From depth 3 up, the search goes one ply deeper each round and tries the best moves of the round before first. A table keeps every position searched for this move, with its score and best move. A stored score counts only at the same depth, so the result equals a search without the table. Quiet moves that caused a cut-off elsewhere are tried early. The table is new for each move, so the same position always gives the same moves.
   - **Repetition.** The search knows every position of the game so far. A position that came up before in the game, or earlier on the search path, scores 0: a draw. This is the usual engine rule. The better side then avoids repeats, and the worse side may look for them.
4. Code keeps the candidates: moves within 75 centipawns of the best move, at most 6.
5. If only one candidate is left, the bot plays it with no Jev call.
6. Otherwise the bot sends one Jev request with two Choice questions. Both ask the same thing. The second question lists the options in reverse order, because Jev can favour the first option. The bot averages the two probabilities for each move.
7. The move with the highest average wins. On a tie, the code's order decides.

"Jev alone" skips steps 3 to 5 and offers every legal move.

### Chess Jev request

The request is built in `src/server/chess/jev.ts`. Code computes all the text in `src/shared/chess/text.ts`.

**State**, from a real position after 1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 (3 of the 6 candidates shown):

```json
{
  "you_play": "White",
  "white_pieces": "bishop c4, pawn e4, knight f3, pawn a2, pawn b2, pawn c2, pawn d2, pawn f2, pawn g2, pawn h2, rook a1, knight b1, bishop c1, queen d1, king e1, rook h1",
  "black_pieces": "rook a8, bishop c8, queen d8, king e8, bishop f8, rook h8, pawn a7, pawn b7, pawn c7, pawn d7, pawn f7, pawn g7, pawn h7, knight c6, knight f6, pawn e5",
  "material": "Material is equal.",
  "last_move": "Black played knight from g8 to f6.",
  "candidates": {
    "Nc3": "knight from b1 to c3; afterwards the knight on c3 is safe.",
    "Bd5": "bishop from c4 to d5; afterwards the bishop on d5 can be captured by black knight f6 and is defended by white pawn e4; it then attacks black pawn f7, black knight c6.",
    "Bb5": "bishop from c4 to b5; afterwards the bishop on b5 is safe; it then attacks black knight c6; it leaves these pieces in danger: white pawn e4."
  }
}
```

- `check` is added when the side to move is in check.
- "Send piece lists" off: the request has no `white_pieces` and `black_pieces`.
- "Describe threats" off: each candidate gets only the first part, for example "knight from b1 to c3".
- **Repetition.** A candidate that brings back an earlier position says "this move repeats an earlier position". When it would be the third time, it says "this move repeats an earlier position for the third time, so the game then ends in a draw by repetition". This note is also there with "Describe threats" off.
- **Threat text.** "Can be captured by" and "in danger" list only the opponent's legal captures, en passant included. A pinned piece, or a king next to a defended piece, captures nothing. "Defended by" lists every piece that covers the square, also a pinned one. A checkmating move gets no capture part, because the game is over.
- **Instructions** (default): "You play White in this chess game. Which move from \`candidates\` is the strongest move for White?" Each Jev player can edit them, as in tic-tac-toe.
- The options of both Choice questions are the candidates' SAN names, such as `Nc3`.

### Move rating

Stockfish rates every move at depth 12, for every player. The loss of a move is Stockfish's score for its best move minus its score for the played move. The loss is capped at 1000, so a missed mate counts as 1000.

Each Stockfish search, a rating or a Stockfish move, starts with `ucinewgame`, so the hash table is empty. The same position then always gets the same result.

**Win chance.** Each rating also turns Stockfish's scores into the mover's win chance.

- The formula is Lichess's: win% = 50 + 50 × (2 / (1 + exp(−0.00368208 × cp)) − 1).
- As on Lichess, a score is capped at ±1000 centipawns, and a mate counts as 1000. So a mate gives 97.5% or 2.5%.
- The win chance loss is the win% with the best move minus the win% with the played move.
- In a won or lost position, a large centipawn loss changes the win chance only a little. The win chance loss is a fairer measure there.
- The formulas are in `src/shared/chess/winPercent.ts`.

**Labels.** A rating with win chance data uses Lichess's labels:

| Label | Win chance loss |
| --- | --- |
| Best move | the best move, 0 centipawns |
| Good | under 5 points |
| Inaccuracy | 5 points or more |
| Mistake | 10 points or more |
| Blunder | 15 points or more |

When a move lets the opponent force mate, or loses a forced mate, Lichess uses its mate rules instead. A move that allows mate is a blunder, a mistake when the position was already below −7 pawns, and an inaccuracy below −10 pawns. A move that loses a forced mate is a blunder, a mistake when more than +7 pawns are left, and an inaccuracy above +10 pawns.

**Accuracy.** Lichess's accuracy of one move: 103.1668 × exp(−0.04354 × win chance loss) − 3.1669, plus 1, between 0 and 100. A move that gives nothing away has 100%. The tally shows the average over a player's rated moves. Lichess's game accuracy also weights the moves by how much the position changes; the tally takes the plain average.

- The rating runs in the background, so play continues while Stockfish works.
- **A failed rating.** The status line says how many moves of the game have no rating, and why. Play and saving go on: the move is saved without a rating. The browser gives up on a rating after 90 s.
- The next game starts only after every move of the current game is rated, also with continuous play. The saved data is then complete.
- A random first move and the opening moves of the opening set are rated, but they do not count in the player's averages, accuracy or blunders.

### Opening set

Players that always pick the same move replay the same game. The opening set gives each game a different start.

- The set is in `src/shared/chess/openings.ts`: 24 balanced main lines of 6 to 8 plies, for example the Italian Game, the Sicilian Defense, the French Defense, the Caro-Kann Defense, the Queen's Gambit, the Indian defences and the English Opening. Names and moves come from the [lichess-org/chess-openings](https://github.com/lichess-org/chess-openings) list (CC0). Stockfish at depth 12 rates each final position between +0.14 and +0.84 for White.
- Game k plays opening k. The app plays the opening moves for both sides, also for a human. They show in the Moves list with the opening name, and the Move panel says "Opening: <name>".
- After the 24th game, the app swaps the sides, the same as "Swap sides", and that starts a new experiment. It then plays the set again with the colours exchanged. After this second pass, play stops, also with continuous play. Restart begins a new run with the first colours.
- A saved opening move has the source `"opening"` and the opening name. The game line in `games.jsonl` has `opening: { number, name }`.

### Game end

- Checkmate, stalemate, insufficient material, threefold repetition and the fifty-move rule end a game.
- A game that reaches 300 plies (150 moves for each side) ends as a draw. This limit keeps the cost of one game bounded.

### Chess web UI

The layout is the same as tic-tac-toe: White's panel on the left, the board in the middle, Black's panel on the right.

| Area | Content |
| --- | --- |
| Player panels | Player type with a one-line description. Jev players also show their instructions, with an Edit link. "More settings" holds the Jev model, the search depth (or Stockfish's depth) and the "Send piece lists" and "Describe threats" switches. At the bottom: wins, average loss and time per move. |
| Board | The last move is highlighted. When Black is the only human player, the board turns so that Black is at the bottom. |
| Status line and Toolbar | Same as tic-tac-toe. "Swap sides" swaps the White and Black configurations. The "Openings" choice takes the place of the "Random first move" switch: "Start position", "Random first move" or "Opening set". Changing it starts a new experiment. With the opening set, the status line names the opening and the pass, for example "Game 7 · Italian Game: Giuoco Piano · 7 of 24, pass 1 of 2 · Playing". |
| Configuration vs configuration | A bar for the two configurations playing now: wins of the left one, draws, wins of the right one. It counts every saved game between these two configurations, from all experiments and with either side. It changes as soon as a player setting changes, and it updates after each saved game. "All configurations" lists every pair with saved games, most games first. The "Split by who went first" switch (off by default) shows two bars per pair, stacked as one block: the games where the left configuration went first, then those where it went second. The figures of the first bar sit above the block, and those of the second bar below it. An order with no games shows a dashed outline. The first move is an advantage, so the two bars can differ a lot. A pair with the same configuration on both sides already compares the two sides, so it keeps one bar. The "Split by model" switch (off by default) counts each Jev model as its own configuration: the bar then counts only games played with the current models, and the list shows each model apart. With the switch off, games of all models count together. The "Split by opening" switch (off by default) shows one bar for each way the games started: from the start position, with a random first move, or from the opening set. Only the kinds with saved games show. Each bar has its own games list, and "All configurations" shows one group per kind. With the switch off, the note under the bar says how many of the games had a random first move or came from the opening set. The games list marks a random first move and names the opening of an opening set game. Under each pair, "Games" lists its last 20 games, newest first: the time, who went first, the result and the length. Clicking a game opens it as a replay. |
| Move | The selected move with its rating label, its loss in centipawns and its win chance loss, and Stockfish's preferred move when it differs. The position before the move, the time, the number of legal moves, and Jev's tokens and cost. The candidates with Jev's probability and the code's score in pawns. "Details" holds the text Jev read for each move. |
| Experiment | Games, wins for each colour, draws and cost per game. "Per player" holds average loss, accuracy, average win chance loss, blunders, time and tokens per move. The footer shows the model, the cost of this game, the total cost and the save location. |
| Moves | The current game's moves with the time and the loss: ✓ for the best move, −N for a loss, … while Stockfish is still rating. |
| Jev sidebar | Same as tic-tac-toe. A chess Jev request asks its two Choice questions in one call, so the sidebar shows both answers. |

### Chess saved data

Chess uses the same three files as tic-tac-toe ([Saved data](#saved-data)). The folder name starts with `chess_`:

```
data/experiments/chess_2026-10-14_10-05-12_W-jev-d2-v1-14-0_B-stockfish-d5_k3f9/
```

- **Folder name.** `-d2` is the search depth. `-v1-14-0` names a Jev player's model (`jev-1.14.0`). `-noboard` marks piece lists off, `-basic` marks threat descriptions off, and `-custom` marks custom instructions. `_random-first` marks a random first move, and `_openings` the opening set.
- **A line in `moves.jsonl`:** the colour, the move in SAN and UCI, the source, the player setup, the position before the move (FEN), the round-trip time and the rating. The rating also has `winBefore`, `winAfter`, `winLoss` (in points of win%) and `judgement` (`"inaccuracy"`, `"mistake"`, `"blunder"` or `null`). For a bot it also holds the decision: every candidate with its text, code score and Jev probability, plus tokens and times. The line also holds the first Jev request and its answer.
- A move is saved once Stockfish has rated it. When you switch to the other game, the moves that still wait for a rating are saved without one, and a finished game is saved after them.
- **A line in `games.jsonl`:** the result (`1-0`, `0-1` or `1/2-1/2`), the reason, the number of plies, the Jev tokens and the moves in SAN.
- `experiment.json` saves the default instructions, the state fields and the candidate limits. Its settings hold the "Openings" choice as `openings` (`"start"`, `"random-first"` or `"opening-set"`).

Examples with `jq`:

```sh
# Average loss per colour, without random first moves and unrated moves
jq -s 'map(select(.move.source != "random-opening" and .move.grade != null)) | group_by(.move.color) | map({color: .[0].move.color, moves: length, avgLoss: (map(.move.grade.loss) | add / length | round)})' data/experiments/<folder>/moves.jsonl

# Blunders, with Stockfish's preferred move
jq -c 'select(.move.grade.judgement == "blunder") | {gameNo, moveNo, san: .move.san, best: .move.grade.bestSan, loss: .move.grade.loss, winLoss: .move.grade.winLoss}' data/experiments/<folder>/moves.jsonl
```

### Chess cost and speed

- **Cost per move.** In the saved games, a Jev move uses 678 input tokens (median of 8,825 moves with a request).
- **Cost per game.** At about 680 tokens per move, a 100-ply game with Jev on both sides uses about 68,000 tokens: about $0.003. The 300-ply limit keeps the worst case near one cent (300 × 800 tokens = $0.010).
- **Jev alone** sends every legal move. In the saved games that is 1,171 tokens per move (median), about 1.7 times the cost.
- **Jev speed.** In the saved games, Jev takes 230 ms per move (median).
- **Stockfish speed.** Stockfish rates a move in 2–22 ms.
- **Code search speed.** Time per move on positions from saved games and puzzles, without Jev:

  | Depth | Positions | Average | Worst |
  | --- | --- | --- | --- |
  | 2 | 199 | 23 ms | 97 ms |
  | 3 | 199 | 113 ms | 547 ms |
  | 4 | 25 | 0.6 s | 2.7 s |
  | 5 | 10 | 1.9 s | 4.0 s |
- **Repetition check.** On 32 positions from saved games, the search with the game history takes 20 ms on average at depth 2 and 92 ms at depth 3. This includes the replay of the game's moves.

### Chess implementation notes

- **chess.js internals.** The code search calls internal chess.js functions (`_moves`, `_makeMove`, `_undoMove` and others). The public `moves({ verbose: true })` builds a SAN name and two FEN strings for every move, and a 2-ply search took seconds with it. chess.js is pinned to 1.4.0. The engine tests fail if the internals change.
- **Stockfish process.** The `stockfish` npm package (pinned to 18.0.8) runs as a separate Node process and reads UCI commands on stdin. Rating and the Stockfish player share one process and run one command at a time. When the process stops, or gives no answer for 30 s, the waiting command fails. The next command starts a new process. Each search sends the game as `position startpos moves …`, so Stockfish sees repetitions. A puzzle starts from its own FEN, so it uses `position fen <start> moves …`.
- **License.** Stockfish is licensed under GPL-3.0. Check what this means before you distribute this project together with Stockfish.

## Jev statistics

The "Jev statistics" tab in the header shows what Jev cost in all saved games of both games and in all saved puzzle runs. The page reads the saved moves each time it opens. A game that is playing keeps playing while the page is open.

| Area | Content |
| --- | --- |
| Estimate for one request per move | Moves per $1, and tic-tac-toe and chess games per $1 for one Jev player. It uses the average input tokens of all saved Jev requests and the average length of the saved finished games. |
| Price comparison | The cost of one move, an average tic-tac-toe game and an average chess game with Jev, Claude Haiku 5.5 and Claude Opus 5.5, with one request per move. |
| By game | Tic-tac-toe, chess and chess puzzles: games per $1, cost per game, finished games, moves per $1, tokens per request and total cost. For puzzles, one game is one puzzle attempt. |
| By Jev player | One row per Jev player configuration, with the model. The same columns as "By game", plus requests per move. The rows are sorted by games per $1. Click "Games per $1", "Moves per $1" or "Total cost" to sort by that column. |
| Most expensive games | The 10 saved games with the most Jev tokens, with both players. A game that was stopped before its end is marked "unfinished". |
| Total | Total cost, input tokens, Jev requests and tokens per request. |
| By day | Cost, tokens and requests per day, newest first. |
| Notes | How each number is counted. |

- **Price.** The cost is input tokens × $0.042 per million for every model. jev-1.13 and jev-1.14 have the same price. Output tokens are free.
- **Games per $1 and cost per game** count finished games only. For a Jev player, it is the cost of its own moves in one game. A configuration on both sides of a game counts once per side.
- **Moves per $1** counts the moves of Jev players. A move without a request, such as a chess move with one candidate, counts with no cost.
- **Estimate and price comparison** assume one request per move. A game has the average length of the saved finished games, in moves of one player: all moves of the finished games, divided by the games and by 2. The players in this app send more or fewer requests: Jev direct sends 1, and Jev look-ahead sends one per judged position. "By Jev player" shows the real cost of each player.
- **Price comparison** uses the base input prices from the [Claude pricing page](https://platform.claude.com/docs/en/about-claude/pricing) on 2026-10-16: $0.10 per million for Haiku 5.5 and $4 per million for Opus 5.5. It assumes a Claude model reads the same input tokens as Jev. Claude output tokens are left out.
- **Saved games only.** Test scripts do not save their requests, so they are not counted. Events that the server rejects are missing too.

## Chess puzzles

The "Chess puzzles" tab runs one player through a fixed set of Lichess puzzles. It measures how often each player finds the solution. Any chess player type can solve puzzles, including Human.

| Area | Content |
| --- | --- |
| Puzzle player | The same player panel as in chess: type, model, depth, piece lists, threat text and instructions. Changing the player starts a new run. |
| Board | The puzzle position after the opponent's first move, from the solver's side. The last move is highlighted. |
| Toolbar | Reset (a new run from the first puzzle), Step (one move), Play (Pause while playing, Run again after the last puzzle), the move delay, the puzzle set, and Continuous play. Continuous play starts a new run of the set when a run ends. |
| Puzzle | Rating, idea, solver colour, the number of moves to find, the Lichess themes and a link to the puzzle on Lichess. |
| This run | Puzzles done, solved, first move right and the Jev cost of the run. |
| Puzzle move | The selected solver move: what the player played, right or wrong, the solution, and the candidates with Jev's probabilities. A ✓ marks the solution among the candidates. With more than one move, buttons below select the move. |
| Puzzle scoreboard | Results of every player on the puzzle set. See below. |

- **Puzzle set.** `src/shared/chess/puzzles/lichess-10.json` holds 10 puzzles from the [Lichess puzzle database](https://database.lichess.org/) (CC0), rated 667 to 2525, with 1 to 3 solver moves.
  - `npx tsx scripts/build-puzzle-set.ts 10` builds it, and another number builds a bigger set. It needs the `zstd` command.
  - The script reads the first 200,000 puzzles of the 307 MB file and stops the download. The file is sorted by random puzzle ids, so these rows are a random sample.
  - It keeps puzzles with popularity 80 or more, 500 or more plays, a rating deviation of 90 or less and at most 4 solver moves. It replays each one with chess.js.
  - It picks one puzzle per step of rating, with a fixed seed, and prefers a new idea each time.
- **Solving rules.** The Lichess rules apply. The first move in the puzzle is the opponent's. The player must then find each solution move, and the opponent's replies come from the solution. Any move that gives checkmate is also right. The first wrong move ends the attempt.
- **Same request as in games.** A Jev player gets the same request as in a game. Nothing tells it that the position is a puzzle. The request's last move is the opponent's first move.
- **Every run counts.** "Solved" counts a puzzle that was solved in at least one run. "Attempts solved" counts every run, so a puzzle solved in 1 of 2 runs shows there. Code search and Stockfish play the same moves every run; Jev's answers vary a little.
- **Solution among candidates** counts the solver moves where the solution was among the moves the player chose between. For the Jev player, a miss there is the code search's fault. **Picked when there** is the share of those moves where the player picked a right move. For the Jev player, that is Jev's part.
- **Saved data.** Each run is a folder in `data/puzzles/<run id>/`: `run.json` holds the player and the set, and `results.jsonl` holds one attempt per line, with every decision. The run id has the time, the player, the set and a random tag, for example `puzzles_2026-10-16_10-05-12_jev-d2-v1-14-0_lichess-10_k3f9`.
- **Pages.** A run keeps going while another tab is open.

**Puzzle scoreboard**

- First a grid of players by puzzles, easiest first. Each cell shows ✓, ✗ or the solved runs, for example "1/2". A click opens the newest attempt on the board.
- Below it, "By player" has one row per player configuration, with the model: puzzles solved, attempts solved, first move right, solution among candidates, picked when there, runs, cost per puzzle and time per move.
- Both tables are sorted by the share of attempts solved.
- Each player name has a colour: purple shades for Jev players (one shade per model), amber for Stockfish, teal for Search only, grey for Random and blue for Human. A legend above the grid names the colours.

## Layout

```
tabletop-game-runner/
├── index.html, vite.config.ts, tsconfig.json
├── src/shared/         # used by the server and the browser
│   ├── tictactoe.ts    # rules, cell names, symmetry, text for Jev
│   ├── prompts.ts      # default instructions and Score levels
│   ├── solver.ts       # perfect player and move grading
│   ├── matchups.ts     # configuration keys and win counts for the matchup bar
│   ├── jevStats.ts     # types of the Jev statistics page
│   ├── types.ts
│   └── chess/
│       ├── types.ts    # chess player types, limits, request and log types
│       ├── line.ts     # a game as a start position plus moves
│       ├── openings.ts # the opening set
│       ├── puzzles.ts  # puzzle sets, solving rules, puzzle log types
│       ├── puzzles/    # puzzle sets as JSON
│       ├── winPercent.ts # Lichess's win chance, accuracy and labels
│       └── text.ts     # plain-language board and move text for Jev
├── src/server/
│   ├── index.ts        # HTTP server: /api/status, /api/decide, /api/chess/decide,
│   │                   # /api/chess/grade, /api/log, /api/matchups, /api/games,
│   │                   # /api/replay, /api/jev-stats, /api/puzzles/runs,
│   │                   # /api/puzzles/attempt, /api/puzzles/log, Vite for the UI
│   ├── api.ts          # request checks: origin, content type, body size, request fields
│   ├── bots.ts         # one function per player type
│   ├── search.ts       # depth-limited minimax
│   ├── jev.ts          # TypeSafe requests
│   ├── store.ts        # writes experiment data to data/experiments/ and puzzle runs to data/puzzles/
│   ├── matchups.ts     # reads finished games from all experiments
│   ├── jevStats.ts     # adds up Jev tokens and requests from all saved moves
│   ├── puzzles.ts      # reads saved puzzle runs, and checks puzzle log events
│   ├── files.ts        # reads folders, text files and JSON lines; appends lines
│   └── chess/
│       ├── engine.ts   # code search: material, piece-square tables, alpha-beta, captures
│       ├── stockfish.ts # Stockfish process (UCI)
│       ├── jev.ts      # the chess Jev request
│       ├── bots.ts     # one function per chess player type, and move rating
│       └── api.ts      # request checks
├── src/web/            # React UI; the browser runs the game loop. saveQueue.ts saves events in order and retries.
│   ├── chess/          # chess views and game loop
│   └── puzzles/        # puzzle page, run loop and scoreboard
├── scripts/
│   └── build-puzzle-set.ts # builds a puzzle set from the Lichess puzzle database
└── tests/              # setup.ts blocks the network in every test
```

- **Server.** The server holds the API key. The browser sends the board and the player setup to `POST /api/decide` and gets back the move and the full decision. For chess, the browser sends the moves so far to `POST /api/chess/decide`, with a puzzle's FEN as `start` on the puzzle page, and each played move to `POST /api/chess/grade` for the Stockfish rating.
- **Browser.** The browser owns the game loop: delay, step, pause, reset and tally. It sends each move and each finished game to `POST /api/log`, one request at a time, in order.
- **Stopping.** Reset, player changes and a switch to the other game cancel the request in flight, and the server then stops its pending Jev calls. Pause lets the current move finish. Saves that wait in the queue still finish after a switch.
- **A failed Jev request.** In a look-ahead move, the first failed request stops the move. The bot starts no more requests and aborts the ones in flight.
- **Failed saves.** A save that fails is tried again after a short wait: 0.5 s, then 1 s, 2 s and 5 s. The events after it wait, so the order stays the same. The footer of the Experiment panel shows the error until every waiting event is saved. A server restart then loses nothing. The server rejects a bad event with a 4xx answer. That event would fail again on every try, so it is dropped.
- **A cut-off line.** A server stop during a write can leave a line without its end. That line is skipped when the data is read. The next saved line starts on a new line, so it stays whole.
- **Replay with a missing move.** When a move line is missing, the replay stops before it, so every shown move keeps its number. The replay bar then says how many moves were saved.

## Sources

- TypeSafe: [Jev 1.13 jaggedness](https://docs.typesafe.ai/model-jaggedness/jev-1.13.md), [Score](https://docs.typesafe.ai/primitives/score.md), [Choice](https://docs.typesafe.ai/primitives/choice.md), [Models](https://docs.typesafe.ai/models.md), [JavaScript SDK](https://docs.typesafe.ai/sdk/javascript.md)
- Chess: [chess.js](https://github.com/jhlywa/chess.js), [stockfish npm package](https://www.npmjs.com/package/stockfish)
- Lichess formulas: `core/src/main/scala/eval.scala` in scalachess, and `modules/analyse/src/main/AccuracyPercent.scala` and `modules/tree/src/main/Advice.scala` in lila
- Position counts are checked in `tests/solver.test.ts`.
