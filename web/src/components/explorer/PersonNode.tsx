import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { Gender } from "../../../../models/types.js";

export interface PersonNodeData {
  label: string;
  gender: Gender;
  birthYear?: number;
  deathYear?: number;
  selected: boolean;
  expandable: boolean;
  hasWarning: boolean;
  onSelect: () => void;
  onExpand: () => void;
  [key: string]: unknown;
}

const GENDER_STYLES: Record<Gender, string> = {
  male: "border-blue-400 bg-blue-50",
  female: "border-pink-400 bg-pink-50",
  unknown: "border-slate-300 bg-slate-50",
};

// Gender is never conveyed by color alone (WCAG 1.4.1) — this glyph is the colorblind-safe,
// screen-reader-independent signal; the aria-label spells it out in words too.
const GENDER_GLYPH: Record<Gender, string> = { male: "♂", female: "♀", unknown: "" };
const GENDER_WORD: Record<Gender, string> = {
  male: "male",
  female: "female",
  unknown: "gender unknown",
};

function PersonNodeComponent({ data }: NodeProps & { data: PersonNodeData }) {
  const years =
    data.birthYear || data.deathYear
      ? `${data.birthYear ?? "?"}–${data.deathYear ?? ""}`
      : undefined;

  return (
    <div className="relative">
      <Handle type="target" position={Position.Top} id="t" className="!bg-slate-400" />
      <Handle type="source" position={Position.Bottom} id="b" className="!bg-slate-400" />
      <Handle type="target" position={Position.Left} id="l" className="!bg-slate-400" />
      <Handle type="source" position={Position.Right} id="r" className="!bg-slate-400" />

      <button
        type="button"
        onClick={data.onSelect}
        aria-pressed={data.selected}
        aria-label={`Select ${data.label}, ${GENDER_WORD[data.gender]}${data.hasWarning ? ", has validation warnings" : ""}`}
        className={`w-[200px] rounded-lg border-2 px-3 py-2 text-left text-sm shadow-sm transition-shadow hover:shadow-md ${
          GENDER_STYLES[data.gender]
        } ${data.selected ? "ring-2 ring-blue-600 ring-offset-1" : ""}`}
      >
        <div className="flex items-center gap-1">
          {GENDER_GLYPH[data.gender] && (
            <span aria-hidden="true" className="text-slate-500">
              {GENDER_GLYPH[data.gender]}
            </span>
          )}
          <span className="truncate font-medium text-slate-900">{data.label}</span>
          {data.hasWarning && (
            <span aria-hidden="true" title="Has validation warnings" className="text-amber-600">
              ⚠
            </span>
          )}
        </div>
        {years && <div className="text-xs text-slate-600">{years}</div>}
      </button>

      {data.expandable && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            data.onExpand();
          }}
          aria-label={`Show more relatives of ${data.label}`}
          title="Show more relatives"
          className="absolute -right-2 -bottom-2 flex h-6 w-6 items-center justify-center rounded-full border border-slate-300 bg-white text-xs font-bold text-slate-600 shadow hover:bg-slate-100"
        >
          +
        </button>
      )}
    </div>
  );
}

export const PersonNode = memo(PersonNodeComponent);
