import { TERMS, type SetupDetail } from "../format";

// Longest first, so "Depth-limited minimax" wins over a shorter term inside it.
const TERM_PATTERN = new RegExp(
  `(${Object.keys(TERMS)
    .sort((a, b) => b.length - a.length)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|")})`,
);

export function SetupDetails({ details }: { details: SetupDetail[] }) {
  if (details.length === 0) return null;
  return (
    <dl className="setup-details">
      {details.map(({ label, value }) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>
            {value.split(TERM_PATTERN).map((part, i) =>
              i % 2 === 1 ? (
                <span key={i} className="term" tabIndex={0}>
                  {part}
                  <span className="term-tip" role="tooltip">
                    {TERMS[part]}
                  </span>
                </span>
              ) : (
                part
              ),
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
