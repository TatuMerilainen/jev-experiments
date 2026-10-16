import { JEV_MODELS } from "../../shared/types";

/** The Jev version for one player. Two players can use different versions, so the versions can play each other. */
export function ModelSelect({ value, onChange }: { value: string; onChange: (model: string) => void }) {
  return (
    <label className="row" title="The Jev version this player asks. Changing it starts a new experiment.">
      <span>Model</span>
      <select className="select select-small" value={value} onChange={(e) => onChange(e.target.value)}>
        {JEV_MODELS.map((model) => (
          <option key={model} value={model}>
            {model}
          </option>
        ))}
      </select>
    </label>
  );
}
