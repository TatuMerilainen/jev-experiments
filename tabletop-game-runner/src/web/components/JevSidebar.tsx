import { useState, type ReactNode } from "react";
import type { JevExample } from "../../shared/types";
import { formatMs, formatTokens, formatUsd, PRICE_PER_TOKEN_USD } from "../format";
import { Icon } from "./Icon";

interface Props {
  /** The first Jev call of a move. */
  example: JevExample | undefined;
  /** What Jev is asked, in one sentence, for example "Jev picks X's move from the 7 legal moves." */
  about: string;
  /** The move the call belongs to, for example "Move 5: X played b2 · Jev look-ahead". */
  source: string;
  /** All Jev requests of that move. */
  requests: number;
  onClose: () => void;
}

const pct = (p: number) => `${Math.round(p * 100)}%`;

/** One Jev call laid out like the TypeSafe Playground: state, questions, answers. */
export function JevSidebar({ example, about, source, requests, onClose }: Props) {
  return (
    <aside className="sidebar" aria-label="Jev request">
      <div className="sidebar-head">
        <h2 className="card-title">Jev request</h2>
        <button type="button" className="btn btn-icon btn-small btn-ghost" onClick={onClose} aria-label="Close the Jev sidebar" title="Close">
          <Icon name="close" />
        </button>
      </div>

      {example ? (
        <>
          <div className="sidebar-meta">
            <p className="sidebar-about">{about}</p>
            <p className="hint">
              {source}
              {requests > 1 ? ` · first of ${requests} requests` : ""}
            </p>
            <ul className="badges">
              <li className="badge badge-ai">
                <Icon name="sparkle" />
                {example.response.model}
              </li>
              <li className="badge badge-code">{formatTokens(example.response.usage.input_tokens)} input tokens</li>
              <li className="badge badge-code" title="Input tokens × $0.042 per million. Output tokens are free.">
                {formatUsd(example.response.usage.input_tokens * PRICE_PER_TOKEN_USD)}
              </li>
              <li className="badge badge-code">{formatMs(example.response.ms)}</li>
            </ul>
          </div>

          <Section title="State" copy={toText(example.request.state)}>
            <JsonView value={example.request.state} />
          </Section>
          <Section title="Questions" copy={toText(example.request.questions)}>
            <JsonView value={example.request.questions} />
          </Section>
          <Section title="Answers" copy={toText(example.response.answers)}>
            {Object.entries(example.response.answers).map(([name, answer]) => (
              <Answer key={name} name={name} answer={answer} question={example.request.questions[name]} />
            ))}
          </Section>
        </>
      ) : (
        <p className="hint">No Jev request yet. When a Jev player moves, its first request and the answer show here.</p>
      )}
    </aside>
  );
}

const toText = (value: unknown) => (typeof value === "string" ? value : JSON.stringify(value, null, 2));

function Section({ title, copy, children }: { title: string; copy: string; children: ReactNode }) {
  return (
    <section className="sidebar-section">
      <div className="label-row">
        <span className="label">{title}</span>
        <CopyButton text={copy} />
      </div>
      {children}
    </section>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () =>
    navigator.clipboard.writeText(text).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => {},
    );
  return (
    <button type="button" className="link" onClick={copy}>
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

// Strings (keys when a colon follows), literals and numbers in pretty-printed JSON.
const JSON_TOKEN = /("(?:\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*")(\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;

function JsonView({ value }: { value: unknown }) {
  if (typeof value === "string") return <pre className="code sidebar-code">{value}</pre>;
  const text = JSON.stringify(value, null, 2);
  const parts: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(JSON_TOKEN)) {
    parts.push(text.slice(last, m.index));
    const kind = m[1] ? (m[2] ? "key" : "string") : /^[tfn]/.test(m[0]) ? "literal" : "number";
    parts.push(
      <span key={m.index} className={`json-${kind}`}>
        {m[1] ?? m[0]}
      </span>,
    );
    if (m[2]) parts.push(m[2]);
    last = m.index + m[0].length;
  }
  parts.push(text.slice(last));
  return <pre className="code sidebar-code">{parts}</pre>;
}

interface Row {
  label: string;
  /** Full text for the tooltip, when the label is cut short. */
  detail?: string;
  p: number;
  selected: boolean;
}

/** One answer: what Jev picked, then the probability of every option. */
function Answer({ name, answer, question }: { name: string; answer: unknown; question: unknown }) {
  const a = answer as { type?: string; choice?: string; score?: number; noul?: number; confidence?: number; probabilities?: Record<string, number>; legend?: Record<string, unknown> };
  const criteria = (question as { criteria?: Record<string, unknown> } | undefined)?.criteria;
  let summary: string;
  let rows: Row[];
  if (a.type === "choice" && a.probabilities) {
    // Options in the order the question listed them.
    const labels = criteria ? Object.keys(criteria) : Object.keys(a.probabilities);
    summary = `Chose ${a.choice} · confidence ${pct(a.confidence ?? 0)}`;
    rows = labels.map((label) => ({ label, detail: describe(criteria?.[label]), p: a.probabilities![label] ?? 0, selected: label === a.choice }));
  } else if (a.type === "score" && a.probabilities && a.score !== undefined) {
    const levels = Object.keys(a.probabilities).sort((x, y) => Number(x) - Number(y));
    const nearest = Math.round(a.score);
    summary = `Expected level ${a.score.toFixed(2)} · confidence ${pct(a.confidence ?? 0)}`;
    rows = levels.map((level) => {
      const text = describe(a.legend?.[level]);
      return { label: text ? `${level} · ${text}` : level, detail: text, p: a.probabilities![level] ?? 0, selected: Number(level) === nearest };
    });
  } else if (a.type === "noul" && a.noul !== undefined) {
    summary = `Yes ${pct(a.noul)}`;
    rows = [
      { label: "yes", p: a.noul, selected: a.noul >= 0.5 },
      { label: "no", p: 1 - a.noul, selected: a.noul < 0.5 },
    ];
  } else {
    return <JsonView value={answer} />;
  }
  return (
    <div className="answer">
      <div className="label-row">
        <strong className="answer-name">{name}</strong>
        <span className="tag">{a.type}</span>
      </div>
      <p className="hint">{summary}</p>
      <div className="answer-rows">
        {rows.map((r) => (
          <div key={r.label} className={`answer-row ${r.selected ? "answer-selected" : ""}`} title={r.detail}>
            <span className="answer-label">{r.label}</span>
            <span className="answer-bar">
              <span style={{ width: pct(r.p) }} />
            </span>
            <span className="answer-pct">{pct(r.p)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const describe = (value: unknown): string | undefined =>
  value === null || value === undefined ? undefined : typeof value === "string" ? value : JSON.stringify(value);
