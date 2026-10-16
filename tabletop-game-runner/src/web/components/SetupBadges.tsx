import type { SetupBadge } from "../format";
import { Icon } from "./Icon";

export function SetupBadges({ badges }: { badges: SetupBadge[] }) {
  if (badges.length === 0) return null;
  return (
    <ul className="badges">
      {badges.map(({ kind, text }) => (
        <li key={text} className={`badge badge-${kind}`} title={kind === "ai" ? `AI model: ${text}` : `Code: ${text}`}>
          <Icon name={kind === "ai" ? "sparkle" : "code"} />
          {text}
        </li>
      ))}
    </ul>
  );
}
