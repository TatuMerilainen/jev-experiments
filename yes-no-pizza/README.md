# Yes, no or pizza

Ask a question. Jev answers yes, no or pizza.

**Status:** works.

## Run

```sh
npm install
cp .env.example .env    # then set TYPESAFE_API_KEY
npm run dev             # http://localhost:5174
```

- The port is 5174, so the tabletop game runner (5173) can run at the same time.
- The server listens on `127.0.0.1`. The request checks are the same as in the tabletop game runner.
- `npm run typecheck` checks the types.

## Jev request

One request per question, with one Choice question:

| Option | Criteria |
| --- | --- |
| yes | The answer to the question is yes. |
| no | The answer to the question is no. |
| pizza | The question has no yes-or-no answer, or the best answer is pizza. |

The state is `{ "question": "<your text>" }`. The text can be at most 500 characters. The prompt is in `src/server/jev.ts`.

## Web UI

- The question box: Enter asks, Shift+Enter adds a new line.
- The answer card: the answer in large text, and Jev's confidence. The API computes the confidence from the probabilities of the three options. It is high when one option gets most of the probability.
- The Jev sidebar: the same panel as in the tabletop game runner. It shows the model, input tokens, cost, response time, the state, the question and the probability of each option. Each part has a Copy button. The "Jev request" button in the header opens and closes it. It is open by default, and the browser remembers the choice.
