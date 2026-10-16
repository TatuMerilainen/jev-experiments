import { useEffect, useRef, useState, type FormEvent } from "react";
import { MAX_QUESTION_LENGTH, type Answer, type AskResponse, type StatusResponse } from "../shared/types";
import { Icon } from "./Icon";
import { JevSidebar } from "./JevSidebar";

const ANSWER_TEXT: Record<Answer, string> = { yes: "Yes", no: "No", pizza: "Pizza 🍕" };

// Remembers whether the Jev sidebar is open. Storage can be blocked, so every access may fail.
const SIDEBAR_KEY = "jev-sidebar-open";
const readSidebarOpen = (): boolean => {
  try {
    return localStorage.getItem(SIDEBAR_KEY) !== "0";
  } catch {
    return true;
  }
};

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok) throw new Error(body?.error ?? `HTTP ${response.status}`);
  return body as T;
}

export function App() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(readSidebarOpen);
  const [question, setQuestion] = useState("");
  const [asked, setAsked] = useState("");
  const [result, setResult] = useState<AskResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const pending = useRef<AbortController | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_KEY, sidebarOpen ? "1" : "0");
    } catch {
      // The sidebar still works; it just opens with the default next time.
    }
  }, [sidebarOpen]);

  useEffect(() => {
    request<StatusResponse>("/api/status")
      .then(setStatus)
      .catch((e: unknown) => setStatusError(e instanceof Error ? e.message : String(e)));
  }, []);

  const text = question.trim();
  const canAsk = Boolean(text) && !asking && status?.jevConfigured === true;

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!canAsk) return;
    pending.current?.abort();
    const abort = (pending.current = new AbortController());
    setAsking(true);
    setAsked(text);
    setError(null);
    try {
      const body = JSON.stringify({ question: text });
      setResult(await request<AskResponse>("/api/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body, signal: abort.signal }));
    } catch (e) {
      if (!abort.signal.aborted) {
        setResult(null);
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      if (pending.current === abort) setAsking(false);
    }
  };

  return (
    <div className={`app ${sidebarOpen ? "with-sidebar" : ""}`}>
      <header className="header">
        <h1>Yes, no or pizza</h1>
        <button
          type="button"
          className={`btn btn-small btn-sidebar ${sidebarOpen ? "selected" : ""}`}
          aria-pressed={sidebarOpen}
          onClick={() => setSidebarOpen((open) => !open)}
          title="Show the state, question and answer of the Jev request"
        >
          <Icon name="sparkle" />
          Jev request
        </button>
      </header>

      {statusError && <p className="banner banner-bad">Server not reachable: {statusError}</p>}
      {status && !status.jevConfigured && (
        <p className="banner">
          TYPESAFE_API_KEY is not set, so Jev cannot answer. Add the key to <code>.env</code> and restart the server.
        </p>
      )}

      <main className="main">
        <form className="card ask" onSubmit={submit}>
          <label className="label" htmlFor="question">
            Your question
          </label>
          <textarea
            id="question"
            className="textarea"
            rows={3}
            maxLength={MAX_QUESTION_LENGTH}
            placeholder="Is it lunch time yet?"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void submit();
              }
            }}
          />
          <div className="ask-row">
            <span className="hint">Enter asks. Shift+Enter adds a new line.</span>
            <button type="submit" className="btn btn-primary" disabled={!canAsk}>
              Ask Jev
            </button>
          </div>
        </form>

        <section className="card result" aria-live="polite">
          {asking ? (
            <p className="result-word result-waiting dots">Thinking</p>
          ) : error ? (
            <p className="status-bad">{error}</p>
          ) : result ? (
            <>
              <p className={`result-word result-${result.answer}`}>{ANSWER_TEXT[result.answer]}</p>
              <p className="hint">Jev is {Math.round(result.confidence * 100)}% sure.</p>
            </>
          ) : (
            <p className="hint">Ask a question. Jev answers yes, no or pizza.</p>
          )}
          {asked && (asking || result || error) && <p className="result-question">“{asked}”</p>}
        </section>
      </main>

      {sidebarOpen && <JevSidebar example={result?.jev} onClose={() => setSidebarOpen(false)} />}
    </div>
  );
}
