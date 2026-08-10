import { useEffect, useRef, useState } from "react";
import type {
  DatePart,
  FamilyTree,
  Gender,
  UUID,
  ValidationIssue,
} from "../../../../models/types.js";
import {
  addChildToPerson,
  addSpouse,
  createPerson,
  removeChildFromFamily,
  removeSpouse,
  setFather,
  setMother,
  updatePersonFields,
} from "../../../../editor/operations.js";
import { getRelationships } from "../../../../parser/relationships.js";
import type { SearchIndex } from "../../lib/search.js";
import { PersonPicker } from "./PersonPicker.js";

interface PersonInspectorProps {
  tree: FamilyTree;
  personId: UUID;
  searchIndex: SearchIndex;
  onNavigate: (id: UUID) => void;
  onEdit: (mutate: (tree: FamilyTree) => FamilyTree) => void;
  onClose: () => void;
  /** True while a GEDCOM export is in flight — see EditorPage for why editing pauses then. */
  disabled?: boolean;
}

interface Draft {
  name: string;
  nickname: string;
  gender: Gender;
  birthYear: string;
  birthMonth: string;
  birthDay: string;
  deathYear: string;
  deathMonth: string;
  deathDay: string;
  notes: string;
}

const EMPTY_DRAFT: Draft = {
  name: "",
  nickname: "",
  gender: "unknown",
  birthYear: "",
  birthMonth: "",
  birthDay: "",
  deathYear: "",
  deathMonth: "",
  deathDay: "",
  notes: "",
};

/**
 * Returns a safe empty draft if `personId` isn't (or is no longer) in the tree, rather than
 * throwing on a raw lookup -- the render body below already has its own `if (!person) return
 * null` guard that's the real handling for this case; this just has to not crash in the
 * narrow window before that guard takes effect (e.g. the initial useState/useEffect calls
 * below run before any render-body check can short-circuit). No edit operation can currently
 * remove a person from the tree, so this path isn't reachable today, but it's cheap
 * insurance against becoming a real crash the moment one is added (see docs/roadmap.md's
 * planned duplicate-merge feature).
 */
function draftFromPerson(tree: FamilyTree, personId: UUID): Draft {
  const p = tree.persons[personId];
  if (!p) return EMPTY_DRAFT;
  return {
    name: p.name,
    nickname: p.nickname ?? "",
    gender: p.gender,
    birthYear: p.birth?.date?.year?.toString() ?? "",
    birthMonth: p.birth?.date?.month?.toString() ?? "",
    birthDay: p.birth?.date?.day?.toString() ?? "",
    deathYear: p.death?.date?.year?.toString() ?? "",
    deathMonth: p.death?.date?.month?.toString() ?? "",
    deathDay: p.death?.date?.day?.toString() ?? "",
    notes: p.notes
      .filter((n) => n.category !== "event")
      .map((n) => n.text)
      .join("\n"),
  };
}

function parseDatePart(year: string, month: string, day: string): DatePart | null {
  if (!year.trim() && !month.trim() && !day.trim()) return null;
  const part: DatePart = {};
  if (year.trim()) part.year = Number(year);
  if (month.trim()) part.month = Number(month);
  if (day.trim()) part.day = Number(day);
  return part;
}

type PickerTarget =
  | { kind: "father" | "mother" | "spouse" }
  | { kind: "child"; familyId?: UUID }
  | { kind: "choose-family-for-child" };

export function PersonInspector({
  tree,
  personId,
  searchIndex,
  onNavigate,
  onEdit,
  onClose,
  disabled,
}: PersonInspectorProps) {
  const person = tree.persons[personId];
  const [draft, setDraft] = useState<Draft>(() => draftFromPerson(tree, personId));
  const [picker, setPicker] = useState<PickerTarget | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  // Tracks unsaved typing so external tree changes (undo/redo, a relationship edit made
  // while this person stays selected) don't get silently overwritten by a resync, but the
  // form also doesn't go stale and show pre-undo data. A ref (not state) so the update is
  // visible synchronously to the effect below within the same commit.
  const dirtyRef = useRef(false);

  useEffect(() => {
    setDraft(draftFromPerson(tree, personId));
    dirtyRef.current = false;
    setPicker(null);
    // Move focus to the newly-selected person's heading — the inspector component stays
    // mounted across navigations (only `personId` changes), so a mount-only focus hook
    // wouldn't refire here; this effect does what useAutoFocus does, but on every id change.
    headingRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personId]);

  useEffect(() => {
    // Resyncs the form whenever this person's underlying data changes from outside this
    // form (undo/redo, or a relationship edit made while they stayed selected) — but only
    // when there's no unsaved typing in progress, so we never clobber an in-progress edit.
    if (!dirtyRef.current) setDraft(draftFromPerson(tree, personId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [person]);

  function updateDraft(patch: Partial<Draft>) {
    dirtyRef.current = true;
    setDraft((d) => ({ ...d, ...patch }));
  }

  if (!person) return null;

  const rel = getRelationships(tree, personId);
  const warnings: ValidationIssue[] = tree.validation.issues.filter((i) =>
    i.relatedIds.includes(personId)
  );

  function saveDraft() {
    onEdit((t) =>
      updatePersonFields(t, personId, {
        name: draft.name,
        nickname: draft.nickname,
        gender: draft.gender,
        birth: parseDatePart(draft.birthYear, draft.birthMonth, draft.birthDay),
        death: parseDatePart(draft.deathYear, draft.deathMonth, draft.deathDay),
        notes: draft.notes.split("\n").filter((line) => line.trim().length > 0),
      })
    );
    dirtyRef.current = false;
  }

  function pickPerson(pickedId: UUID) {
    if (!picker) return;
    if (picker.kind === "father") onEdit((t) => setFather(t, personId, pickedId));
    else if (picker.kind === "mother") onEdit((t) => setMother(t, personId, pickedId));
    else if (picker.kind === "spouse") onEdit((t) => addSpouse(t, personId, pickedId));
    else if (picker.kind === "child")
      onEdit((t) => addChildToPerson(t, personId, pickedId, picker.familyId));
    setPicker(null);
  }

  function createAndAssign(name: string) {
    if (!picker) return;
    if (picker.kind === "father") {
      onEdit((t) => {
        const { tree: t2, personId: newId } = createPerson(t, { name, gender: "male" });
        return setFather(t2, personId, newId);
      });
    } else if (picker.kind === "mother") {
      onEdit((t) => {
        const { tree: t2, personId: newId } = createPerson(t, { name, gender: "female" });
        return setMother(t2, personId, newId);
      });
    } else if (picker.kind === "spouse") {
      onEdit((t) => {
        const { tree: t2, personId: newId } = createPerson(t, { name });
        return addSpouse(t2, personId, newId);
      });
    } else if (picker.kind === "child") {
      onEdit((t) => {
        const { tree: t2, personId: newId } = createPerson(t, { name });
        return addChildToPerson(t2, personId, newId, picker.familyId);
      });
    }
    setPicker(null);
  }

  function startAddChild() {
    // `person` is guaranteed defined here (see the early `if (!person) return null` above) —
    // TS doesn't carry that narrowing into a nested function declaration.
    if (person!.famsIds.length > 1) {
      setPicker({ kind: "choose-family-for-child" });
    } else {
      setPicker({ kind: "child" });
    }
  }

  return (
    <aside
      aria-label={`Details for ${person.name || "selected person"}`}
      className="flex h-full flex-col gap-4 overflow-y-auto p-4"
    >
      <div className="flex items-start justify-between">
        <h2 ref={headingRef} tabIndex={-1} className="text-lg font-semibold text-slate-900">
          {person.name.trim() || "(no name)"}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close inspector"
          className="text-slate-400 hover:text-slate-700"
        >
          ✕
        </button>
      </div>

      {disabled && (
        <p
          role="status"
          className="rounded-md border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600"
        >
          This panel is paused while your export is being generated — it'll only take a moment.
        </p>
      )}

      {/* A single fieldset (rather than a disabled prop threaded through every button below)
          disables every editable control in this panel at once, including the picker
          components it renders — HTML cascades a fieldset's disabled state to all
          descendant form controls regardless of nesting depth. */}
      <fieldset disabled={disabled} className="contents">
        {warnings.length > 0 && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">
            <p className="font-medium">Validation warnings for this person</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              {warnings.map((w, i) => (
                <li key={i}>{w.message}</li>
              ))}
            </ul>
          </div>
        )}

        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-500">
          <dt>Internal ID</dt>
          <dd className="truncate font-mono" title={person.id}>
            {person.id}
          </dd>
          <dt>Original FTZ ID</dt>
          <dd className="font-mono">{person.ftzId ?? "—"}</dd>
        </dl>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            saveDraft();
          }}
          className="flex flex-col gap-3 border-t border-slate-200 pt-3"
        >
          <h3 className="text-sm font-semibold text-slate-800">Edit</h3>

          <label className="flex flex-col gap-1 text-xs font-medium text-slate-700">
            Name
            <input
              type="text"
              value={draft.name}
              onChange={(e) => updateDraft({ name: e.target.value })}
              className="rounded border border-slate-300 px-2 py-1 text-sm font-normal"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs font-medium text-slate-700">
            Nickname
            <input
              type="text"
              value={draft.nickname}
              onChange={(e) => updateDraft({ nickname: e.target.value })}
              className="rounded border border-slate-300 px-2 py-1 text-sm font-normal"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs font-medium text-slate-700">
            Gender
            <select
              value={draft.gender}
              onChange={(e) => updateDraft({ gender: e.target.value as Gender })}
              className="rounded border border-slate-300 px-2 py-1 text-sm font-normal"
            >
              <option value="unknown">Unknown</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </label>

          <fieldset className="flex flex-col gap-1">
            <legend className="text-xs font-medium text-slate-700">Birth date</legend>
            <div className="flex gap-1">
              <input
                type="number"
                placeholder="Year"
                value={draft.birthYear}
                onChange={(e) => updateDraft({ birthYear: e.target.value })}
                aria-label="Birth year"
                className="w-1/3 rounded border border-slate-300 px-2 py-1 text-sm"
              />
              <input
                type="number"
                placeholder="Mo"
                value={draft.birthMonth}
                onChange={(e) => updateDraft({ birthMonth: e.target.value })}
                aria-label="Birth month"
                className="w-1/3 rounded border border-slate-300 px-2 py-1 text-sm"
              />
              <input
                type="number"
                placeholder="Day"
                value={draft.birthDay}
                onChange={(e) => updateDraft({ birthDay: e.target.value })}
                aria-label="Birth day"
                className="w-1/3 rounded border border-slate-300 px-2 py-1 text-sm"
              />
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-1">
            <legend className="text-xs font-medium text-slate-700">Death date</legend>
            <div className="flex gap-1">
              <input
                type="number"
                placeholder="Year"
                value={draft.deathYear}
                onChange={(e) => updateDraft({ deathYear: e.target.value })}
                aria-label="Death year"
                className="w-1/3 rounded border border-slate-300 px-2 py-1 text-sm"
              />
              <input
                type="number"
                placeholder="Mo"
                value={draft.deathMonth}
                onChange={(e) => updateDraft({ deathMonth: e.target.value })}
                aria-label="Death month"
                className="w-1/3 rounded border border-slate-300 px-2 py-1 text-sm"
              />
              <input
                type="number"
                placeholder="Day"
                value={draft.deathDay}
                onChange={(e) => updateDraft({ deathDay: e.target.value })}
                aria-label="Death day"
                className="w-1/3 rounded border border-slate-300 px-2 py-1 text-sm"
              />
            </div>
          </fieldset>

          <label className="flex flex-col gap-1 text-xs font-medium text-slate-700">
            Notes (one per line)
            <textarea
              value={draft.notes}
              onChange={(e) => updateDraft({ notes: e.target.value })}
              rows={3}
              className="rounded border border-slate-300 px-2 py-1 text-sm font-normal"
            />
          </label>

          <button
            type="submit"
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Save changes
          </button>
        </form>

        <section className="flex flex-col gap-2 border-t border-slate-200 pt-3">
          <h3 className="text-sm font-semibold text-slate-800">Parents</h3>
          {(["father", "mother"] as const).map((role) => {
            const relId = role === "father" ? rel.father : rel.mother;
            return (
              <div key={role} className="flex items-center justify-between text-sm">
                <span className="capitalize text-slate-500">{role}:</span>
                {relId ? (
                  <span className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onNavigate(relId)}
                      className="text-blue-700 underline"
                    >
                      {tree.persons[relId]?.name.trim() || "(no name)"}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onEdit((t) =>
                          role === "father"
                            ? setFather(t, personId, undefined)
                            : setMother(t, personId, undefined)
                        )
                      }
                      className="text-xs text-red-600 hover:underline"
                    >
                      Remove
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setPicker({ kind: role })}
                    className="text-xs text-blue-700 hover:underline"
                  >
                    Assign {role}
                  </button>
                )}
              </div>
            );
          })}
          {picker?.kind === "father" || picker?.kind === "mother" ? (
            <PersonPicker
              tree={tree}
              index={searchIndex}
              label={`Assign ${picker.kind}`}
              excludeId={personId}
              onPick={pickPerson}
              onCreateNew={createAndAssign}
              onCancel={() => setPicker(null)}
            />
          ) : null}
        </section>

        <section className="flex flex-col gap-2 border-t border-slate-200 pt-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-800">Spouses</h3>
            <button
              type="button"
              onClick={() => setPicker({ kind: "spouse" })}
              className="text-xs text-blue-700 hover:underline"
            >
              + Add spouse
            </button>
          </div>
          {rel.spouses.length === 0 && <p className="text-xs text-slate-500">None recorded.</p>}
          <ul className="flex flex-col gap-1">
            {/* dedupe: a self-marriage in the source data produces the same id twice in rel.spouses */}
            {[...new Set(rel.spouses)].map((spouseId) => (
              <li key={spouseId} className="flex items-center justify-between text-sm">
                <button
                  type="button"
                  onClick={() => onNavigate(spouseId)}
                  className="text-blue-700 underline"
                >
                  {tree.persons[spouseId]?.name.trim() || "(no name)"}
                </button>
                <button
                  type="button"
                  onClick={() => onEdit((t) => removeSpouse(t, personId, spouseId))}
                  className="text-xs text-red-600 hover:underline"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
          {picker?.kind === "spouse" && (
            <PersonPicker
              tree={tree}
              index={searchIndex}
              label="Add spouse"
              excludeId={personId}
              onPick={pickPerson}
              onCreateNew={createAndAssign}
              onCancel={() => setPicker(null)}
            />
          )}
        </section>

        <section className="flex flex-col gap-2 border-t border-slate-200 pt-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-800">Children</h3>
            <button
              type="button"
              onClick={startAddChild}
              className="text-xs text-blue-700 hover:underline"
            >
              + Add child
            </button>
          </div>
          {rel.children.length === 0 && <p className="text-xs text-slate-500">None recorded.</p>}
          <ul className="flex flex-col gap-1">
            {rel.children.map((childId) => {
              const child = tree.persons[childId];
              return (
                <li key={childId} className="flex items-center justify-between text-sm">
                  <button
                    type="button"
                    onClick={() => onNavigate(childId)}
                    className="text-blue-700 underline"
                  >
                    {child?.name.trim() || "(no name)"}
                  </button>
                  {child?.famcId && (
                    <button
                      type="button"
                      onClick={() =>
                        onEdit((t) => removeChildFromFamily(t, child.famcId!, childId))
                      }
                      className="text-xs text-red-600 hover:underline"
                    >
                      Remove
                    </button>
                  )}
                </li>
              );
            })}
          </ul>

          {picker?.kind === "choose-family-for-child" && (
            <div className="rounded-md border border-slate-300 bg-white p-3 text-sm">
              <p className="mb-2 text-xs font-medium text-slate-700">
                Add child with which spouse?
              </p>
              <ul className="flex flex-col gap-1">
                {person.famsIds.map((famId) => {
                  const fam = tree.families[famId];
                  if (!fam) return null;
                  const spouseId = fam.husbandId === personId ? fam.wifeId : fam.husbandId;
                  const spouseName = spouseId ? tree.persons[spouseId]?.name : undefined;
                  return (
                    <li key={famId}>
                      <button
                        type="button"
                        onClick={() => setPicker({ kind: "child", familyId: famId })}
                        className="w-full rounded px-2 py-1 text-left hover:bg-slate-100"
                      >
                        {spouseName?.trim() || "(no spouse recorded)"}
                      </button>
                    </li>
                  );
                })}
              </ul>
              <button
                type="button"
                onClick={() => setPicker(null)}
                className="mt-2 text-xs text-slate-500 hover:underline"
              >
                Cancel
              </button>
            </div>
          )}
          {picker?.kind === "child" && (
            <PersonPicker
              tree={tree}
              index={searchIndex}
              label="Add child"
              excludeId={personId}
              onPick={pickPerson}
              onCreateNew={createAndAssign}
              onCancel={() => setPicker(null)}
            />
          )}
        </section>

        {rel.siblings.length > 0 && (
          <section className="flex flex-col gap-2 border-t border-slate-200 pt-3">
            <h3 className="text-sm font-semibold text-slate-800">Siblings</h3>
            <ul className="flex flex-wrap gap-2">
              {rel.siblings.map((sibId) => (
                <li key={sibId}>
                  <button
                    type="button"
                    onClick={() => onNavigate(sibId)}
                    className="rounded-full bg-slate-100 px-2 py-1 text-xs text-blue-700 hover:bg-slate-200"
                  >
                    {tree.persons[sibId]?.name.trim() || "(no name)"}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {(rel.grandparents.paternalGrandfather ||
          rel.grandparents.paternalGrandmother ||
          rel.grandparents.maternalGrandfather ||
          rel.grandparents.maternalGrandmother ||
          rel.grandchildren.length > 0) && (
          <section className="flex flex-col gap-2 border-t border-slate-200 pt-3">
            <h3 className="text-sm font-semibold text-slate-800">Extended family</h3>
            <ul className="flex flex-wrap gap-2">
              {[
                ["Paternal grandfather", rel.grandparents.paternalGrandfather],
                ["Paternal grandmother", rel.grandparents.paternalGrandmother],
                ["Maternal grandfather", rel.grandparents.maternalGrandfather],
                ["Maternal grandmother", rel.grandparents.maternalGrandmother],
                ...rel.grandchildren.map((id) => ["Grandchild", id] as const),
              ].map(([labelText, id], i) =>
                id ? (
                  <li key={`${labelText}-${id}-${i}`}>
                    <button
                      type="button"
                      onClick={() => onNavigate(id)}
                      title={labelText}
                      className="rounded-full bg-slate-100 px-2 py-1 text-xs text-blue-700 hover:bg-slate-200"
                    >
                      {tree.persons[id]?.name.trim() || "(no name)"}
                    </button>
                  </li>
                ) : null
              )}
            </ul>
          </section>
        )}
      </fieldset>
    </aside>
  );
}
