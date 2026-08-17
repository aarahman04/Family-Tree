import { useEffect, useRef, useState } from "react";
import type {
  DatePart,
  FamilyTree,
  Gender,
  UUID,
  ValidationIssue,
} from "../../../../src/models/types.js";
import {
  addChildToPerson,
  addSpouse,
  createPerson,
  removeChildFromFamily,
  removeSpouse,
  setFather,
  setMother,
  setPersonPhoto,
  updatePersonFields,
} from "../../../../src/editor/operations.js";
import { fatherOf, getRelationships, motherOf } from "../../../../src/parser/relationships.js";
import {
  DEPTH_CAP,
  ancestorPaths,
  ancestralCousinMarriages,
  kinshipCoefficient,
  parentsRelated,
  relatePair,
  type Confidence,
  type CoupleRelation,
  type MarriageAnalysis,
  type TreeAnalysis,
} from "../../../../src/analysis/index.js";
import { isAcceptedPhotoType, processImageFile } from "../../lib/photo.js";
import { photoAlt, resolvePhoto } from "../../lib/resolvePhoto.js";
import type { SearchIndex } from "../../lib/search.js";
import { PersonPicker } from "./PersonPicker.js";

interface PersonInspectorProps {
  tree: FamilyTree;
  personId: UUID;
  searchIndex: SearchIndex;
  /** Whole-tree relationship analysis (Insights v2). Omitted in contexts that don't need it —
   * the relationship-intelligence section and inline badges simply don't render without it. */
  analysis?: TreeAnalysis;
  onNavigate: (id: UUID) => void;
  onEdit: (mutate: (tree: FamilyTree) => FamilyTree) => void;
  onClose: () => void;
  /** True while a GEDCOM export is in flight — see EditorPage for why editing pauses then. */
  disabled?: boolean;
}

const CONFIDENCE_STYLE: Record<Confidence, string> = {
  confirmed: "text-green-700 dark:text-green-400",
  likely: "text-blue-700 dark:text-blue-400",
  possible: "text-amber-700 dark:text-amber-300",
  unknown: "text-slate-500 dark:text-slate-400",
};

function ConfidenceTag({ level }: { level: Confidence }) {
  return (
    <span
      data-role="confidence-tag"
      className={`shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide dark:bg-slate-800 ${CONFIDENCE_STYLE[level]}`}
    >
      {level}
    </span>
  );
}

/** Collapsed-by-default audit trail for why a classification was made (CP4.3, reasons[] from
 * classifyConfidence). */
function ConfidenceReasons({ reasons }: { reasons: string[] }) {
  if (reasons.length === 0) return null;
  return (
    <details className="text-xs text-slate-500 dark:text-slate-400">
      <summary className="cursor-pointer select-none">Why?</summary>
      <ul className="mt-1 list-disc space-y-0.5 pl-4">
        {reasons.map((reason, i) => (
          <li key={i}>{reason}</li>
        ))}
      </ul>
    </details>
  );
}

function RelationshipBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-blue-500 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 dark:border-blue-500 dark:bg-blue-950/40 dark:text-blue-400">
      {label}
    </span>
  );
}

/**
 * The couple's relationship in one line (D-16).
 *
 * A negative result splits on how much ancestry the tree actually holds, rather than collapsing
 * both cases into "unknown". `classifyConfidence` has already made exactly this judgement — it
 * returns "confirmed" for a negative only when BOTH people have at least two generations on file
 * — so the level is reused here instead of recomputing depth. On the reference tree this matters
 * a lot: 105 of 136 couples land in the negative bucket, and most of them genuinely cannot be
 * ruled either way.
 */
function relationSummary(rel: CoupleRelation): string {
  if (rel.relation.kind === "unrelated") {
    return rel.confidence.level === "confirmed"
      ? "Not a cousin marriage — checked both lines, no shared ancestor"
      : "No shared ancestor found, but their recorded ancestry is too shallow to be sure";
  }
  if (rel.relation.kind === "direct-lineage") return "Direct ancestor/descendant match";
  return rel.relation.label;
}

/** φ as a percentage, e.g. 0.0625 -> "6.25%". */
function kinshipPercent(phi: number): string {
  return `${(phi * 100).toFixed(2).replace(/\.?0+$/, "")}%`;
}

/**
 * S-6: neutral, non-jurisdictional context. Deliberately makes NO legal claim — cousin-marriage
 * law varies by country and over time, and this app describes what is in the user's data rather
 * than advising on it (D-14).
 */
function ConsanguinityNote() {
  return (
    <details className="text-xs text-slate-500 dark:text-slate-400">
      <summary className="cursor-pointer select-none [@media(pointer:coarse)]:min-h-11">
        About cousin marriage
      </summary>
      <p className="mt-1 leading-relaxed">
        Marriage between cousins is common in many cultures and its legal status varies between
        countries and over time. This panel describes only the relationships found in your own data
        — it does not provide legal or medical guidance.
      </p>
    </details>
  );
}

/**
 * Mini lineage-path viewer (CP5.9). Replaces the single flat
 * "Person → … → Common ancestor → … → Person" string, which merged both sides into one line and
 * left the reader unable to tell where one descent ended and the other began. Instead it shows the
 * shared ancestor once, then ONE LEG PER SIDE running from that ancestor down to each person — so
 * the convergence that makes the couple related is the shape of the thing, not something to parse
 * out of an arrow run. Legs wrap on narrow screens rather than scrolling the panel sideways.
 */
function LineagePath({
  tree,
  aId,
  bId,
  ancestorId,
}: {
  tree: FamilyTree;
  aId: UUID;
  bId: UUID;
  ancestorId: UUID;
}) {
  const name = (id: UUID) => tree.persons[id]?.name.trim() || "(no name)";
  // ancestorPaths runs person -> ancestor; reversed, each leg reads as a descent from the shared
  // ancestor, which is the direction the convergence is easiest to follow in.
  const legs = [aId, bId]
    .map((id) => ancestorPaths(tree, id, ancestorId, DEPTH_CAP, 1)[0])
    .filter((path): path is UUID[] => path !== undefined)
    .map((path) => [...path].reverse());
  if (legs.length < 2) return null;

  return (
    <div
      role="group"
      aria-label={`Lineage path through ${name(ancestorId)}`}
      className="flex flex-col gap-0.5 text-xs text-slate-500 dark:text-slate-400"
    >
      <span>
        Common ancestor:{" "}
        <span className="font-medium text-slate-700 dark:text-slate-300">{name(ancestorId)}</span>
      </span>
      <ul className="flex list-none flex-col gap-0.5 pl-2">
        {legs.map((leg, i) => (
          <li key={i} className="flex flex-wrap items-baseline gap-x-1 break-words">
            <span aria-hidden="true">↳</span>
            {leg.map((id, step) => (
              <span key={id}>
                {step > 0 && <span aria-hidden="true"> → </span>}
                <span
                  className={
                    step === 0 ? "font-medium text-slate-700 dark:text-slate-300" : undefined
                  }
                >
                  {name(id)}
                </span>
              </span>
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * One couple, as a self-contained card (CP6.5). Previously the parents' line and each marriage
 * line were bare siblings in a flex column, so two unrelated facts ran together as one sentence.
 * A bordered card with its own title, badge row and confidence tag makes the boundary obvious.
 */
function RelationshipCard({
  tree,
  title,
  titleIds,
  rel,
  aId,
  bId,
  onNavigate,
}: {
  tree: FamilyTree;
  title: string;
  titleIds: UUID[];
  rel: CoupleRelation;
  aId: UUID;
  bId: UUID;
  onNavigate: (id: UUID) => void;
}) {
  const isCousinLink = rel.relation.kind === "cousins";
  const phi = isCousinLink ? kinshipCoefficient(tree, aId, bId) : 0;
  return (
    <div
      data-role="relationship-card"
      className="flex flex-col gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/60"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
          {titleIds.map((id, i) => (
            <span key={id}>
              {i > 0 && <span className="text-slate-400 dark:text-slate-500"> × </span>}
              <button
                type="button"
                onClick={() => onNavigate(id)}
                // Labelled "View <name>" rather than bare "<name>": the sidebar already has
                // navigation buttons carrying the plain name, and a screen reader (or a test)
                // cannot tell two same-named buttons apart.
                aria-label={`View ${tree.persons[id]?.name.trim() || "(no name)"}`}
                className="rounded text-blue-700 underline-offset-2 hover:underline dark:text-blue-400"
              >
                {tree.persons[id]?.name.trim() || "(no name)"}
              </button>
            </span>
          ))}
          <span className="sr-only">{title}</span>
        </p>
        <ConfidenceTag level={rel.confidence.level} />
      </div>

      <p className="text-sm text-slate-700 dark:text-slate-300">{relationSummary(rel)}</p>

      {isCousinLink && (
        <p
          className="text-xs text-slate-500 dark:text-slate-400"
          title="Kinship coefficient φ: the chance a gene taken at random from each of them is inherited from the same ancestor. Assumes their shared ancestors were not themselves related, so it is a slight under-estimate."
        >
          Kinship {kinshipPercent(phi)}
          <span className="ml-1 rounded bg-amber-100 px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:bg-amber-400/15 dark:text-amber-300">
            est.
          </span>
        </p>
      )}

      {rel.relation.closest && (
        <LineagePath tree={tree} aId={aId} bId={bId} ancestorId={rel.relation.closest.ancestorId} />
      )}
      <ConfidenceReasons reasons={rel.confidence.reasons} />
      {isCousinLink && <ConsanguinityNote />}
    </div>
  );
}

/**
 * S-1 — "how is this person related to that one?" for ANY two people, not just spouses.
 *
 * Composes `relatePair`, which reuses the same classifier and confidence rule the relationship
 * cards use, so the calculator can never give a different answer for a pair the panel already
 * describes. Collapsed until asked for: it is a lookup tool, not something to wade past on the
 * way to a person's details.
 */
function RelationshipCalculator({
  tree,
  personId,
  searchIndex,
  onNavigate,
}: {
  tree: FamilyTree;
  personId: UUID;
  searchIndex: SearchIndex;
  onNavigate: (id: UUID) => void;
}) {
  const [picking, setPicking] = useState(false);
  const [otherId, setOtherId] = useState<UUID | undefined>(undefined);

  const other = otherId ? tree.persons[otherId] : undefined;
  const result = other ? relatePair(tree, personId, otherId!) : undefined;

  return (
    <section
      data-testid="relationship-calculator"
      className="flex flex-col gap-2 border-t border-slate-200 pt-3 dark:border-slate-800"
    >
      <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
        How are they related?
      </h3>

      {picking ? (
        <PersonPicker
          tree={tree}
          index={searchIndex}
          label="Compare with"
          excludeId={personId}
          onPick={(id) => {
            setOtherId(id);
            setPicking(false);
          }}
          // Creating a person from here would be a side effect nobody asked for -- this is a
          // read-only question about two people who already exist.
          onCreateNew={() => setPicking(false)}
          onCancel={() => setPicking(false)}
        />
      ) : (
        <button
          type="button"
          onClick={() => setPicking(true)}
          className="self-start rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 [@media(pointer:coarse)]:min-h-11 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          {result ? "Compare with someone else" : "Pick someone to compare"}
        </button>
      )}

      {result && other && (
        <div
          data-testid="relationship-result"
          className="flex flex-col gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/60"
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
              <button
                type="button"
                onClick={() => onNavigate(otherId!)}
                aria-label={`View ${other.name.trim() || "(no name)"}`}
                className="rounded text-blue-700 underline-offset-2 hover:underline dark:text-blue-400"
              >
                {other.name.trim() || "(no name)"}
              </button>
            </p>
            <ConfidenceTag level={result.confidence.level} />
          </div>

          <p className="text-sm text-slate-700 dark:text-slate-300">
            {result.relation.kind === "unrelated" ? relationSummary(result) : result.relation.label}
          </p>

          {result.relation.closest && (
            <LineagePath
              tree={tree}
              aId={personId}
              bId={otherId!}
              ancestorId={result.relation.closest.ancestorId}
            />
          )}

          {/* The user asked to be told when more than one route exists rather than being shown
              one path as if it were the only one. */}
          {result.commonAncestors.length > 1 && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {result.multiplePaths
                ? `Linked through ${result.relation.lines} separate ancestral lines — the closest is shown.`
                : `They share ${result.commonAncestors.length} ancestors from the same line — the closest is shown.`}
            </p>
          )}

          <ConfidenceReasons reasons={result.confidence.reasons} />
        </div>
      )}
    </section>
  );
}

/**
 * Every cousin marriage standing above this person, not just their parents'.
 *
 * The old chain notice was a single number ("chain: 2 generations"), which says a pattern exists
 * but not where or between whom. This lists each link in order with its degree, its shared
 * ancestor and its confidence, so someone tracing their own line can actually read it.
 */
function AncestralChain({
  tree,
  personId,
  analysis,
  onNavigate,
}: {
  tree: FamilyTree;
  personId: UUID;
  analysis: TreeAnalysis;
  onNavigate: (id: UUID) => void;
}) {
  const links = ancestralCousinMarriages(tree, personId, analysis.marriages);
  if (links.length === 0) return null;

  const label = (id: UUID) => tree.persons[id]?.name.trim() || "(no name)";
  const generationName = (up: number) =>
    up === 1 ? "Parents" : up === 2 ? "Grandparents" : `${"Great-".repeat(up - 2)}grandparents`;

  return (
    <section className="flex flex-col gap-2" data-testid="ancestral-chain">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
        Cousin marriages in their ancestry ({links.length})
      </h4>
      <ol aria-label="Cousin marriages in their ancestry" className="flex flex-col gap-1.5">
        {links.map((link) => (
          <li
            key={link.familyId}
            className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs dark:border-amber-900 dark:bg-amber-950/40"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="font-medium text-amber-900 dark:text-amber-200">
                {generationName(link.generationsUp)}
              </span>
              <ConfidenceTag level={link.confidence.level} />
            </div>
            <div className="mt-0.5 text-amber-900 dark:text-amber-200">
              {[link.husbandId, link.wifeId].map((personRef, i) => (
                <span key={personRef}>
                  {i > 0 && <span className="opacity-60"> × </span>}
                  <button
                    type="button"
                    onClick={() => onNavigate(personRef)}
                    aria-label={`View ${label(personRef)}`}
                    className="rounded underline-offset-2 hover:underline"
                  >
                    {label(personRef)}
                  </button>
                </span>
              ))}
              <span className="ml-1 opacity-80">— {link.relation.label}</span>
            </div>
            {link.relation.closest && (
              <div className="mt-0.5 opacity-75">
                <LineagePath
                  tree={tree}
                  aId={link.husbandId}
                  bId={link.wifeId}
                  ancestorId={link.relation.closest.ancestorId}
                />
              </div>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * Why a cousin link might be missed for THIS person, stated where the answer is read.
 *
 * Cousin degree is a function of recorded depth: second cousins need three generations on both
 * sides, third cousins four. On a sparse tree a silent "no cousin link" is indistinguishable from
 * "not enough ancestry to find one" — on the reference tree every one of the 31 detected links is
 * a FIRST-cousin link, not because deeper ties are absent but because the records stop too soon
 * to see them. Saying so is the difference between an answer and a false negative.
 */
function DetectionLimits({
  tree,
  personId,
  analysis,
}: {
  tree: FamilyTree;
  personId: UUID;
  analysis: TreeAnalysis;
}) {
  const notes: string[] = [];

  const parentIds = [fatherOf(tree, personId), motherOf(tree, personId)].filter(
    (id): id is UUID => !!id
  );
  const grandparentCount = parentIds
    .flatMap((id) => [fatherOf(tree, id), motherOf(tree, id)])
    .filter(Boolean).length;

  if (parentIds.length === 0) {
    notes.push("No parents are recorded, so no cousin link can be detected for them at all.");
  } else if (parentIds.length === 1) {
    notes.push("Only one parent is recorded — any link through the other side is invisible.");
  }

  if (parentIds.length > 0 && grandparentCount === 0) {
    notes.push(
      "No grandparents are recorded. First cousins need grandparents to detect, second cousins need great-grandparents."
    );
  } else if (grandparentCount > 0 && grandparentCount < 4) {
    notes.push(
      `${grandparentCount} of 4 grandparents recorded — links through the missing branches cannot be found.`
    );
  }

  // A repeated name is the most common way a relationship path goes wrong: two different people
  // merged in the reader's head, or in the data.
  const duplicateName = analysis.quality.duplicateNameGroups.find((group) =>
    group.personIds.includes(personId)
  );
  if (duplicateName) {
    notes.push(
      `Their name appears ${duplicateName.personIds.length} times in this tree — check the path follows the right person.`
    );
  }

  if (notes.length === 0) return null;
  return (
    <div
      data-testid="detection-limits"
      className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300"
    >
      <p className="font-medium">Why a link might be missed</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-4">
        {notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </div>
  );
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
  analysis,
  onNavigate,
  onEdit,
  onClose,
  disabled,
}: PersonInspectorProps) {
  const person = tree.persons[personId];
  const [draft, setDraft] = useState<Draft>(() => draftFromPerson(tree, personId));
  const [picker, setPicker] = useState<PickerTarget | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
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

  const parentRel = analysis ? parentsRelated(tree, personId) : undefined;
  const marriages: MarriageAnalysis[] = analysis
    ? person.famsIds
        .map((famId) => analysis.marriages.get(famId))
        .filter((m): m is MarriageAnalysis => m !== undefined)
    : [];
  const chain = analysis?.chains.byPerson.get(personId);
  const cousinMarriages = marriages.filter((m) => m.isCousinMarriage);

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

  // Encode-then-dispatch: `processImageFile` is awaited to completion BEFORE `onEdit` fires, so
  // the tree only ever holds the old photo or the finished new one — never a half-encoded frame
  // an autosave could snapshot. Progress lives in component state (`photoBusy`), not in the tree.
  async function handlePhotoFile(file: File | undefined) {
    if (!file) return;
    if (!isAcceptedPhotoType(file.type)) {
      setPhotoError("Please choose a PNG, JPEG, or WebP image.");
      return;
    }
    setPhotoBusy(true);
    setPhotoError(null);
    try {
      const photo = await processImageFile(file);
      onEdit((t) => setPersonPhoto(t, personId, photo));
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : "Could not process that image.");
    } finally {
      setPhotoBusy(false);
    }
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
      <div className="flex flex-col gap-1.5">
        <div className="flex items-start justify-between">
          <h2
            ref={headingRef}
            tabIndex={-1}
            className="text-lg font-semibold text-slate-900 dark:text-slate-100"
          >
            {person.name.trim() || "(no name)"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close inspector"
            className="inline-flex min-h-6 min-w-6 items-center justify-center text-slate-400 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-300 [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11"
          >
            ✕
          </button>
        </div>
        {(parentRel?.related || cousinMarriages.length > 0) && (
          <div className="flex flex-wrap gap-1.5">
            {parentRel?.related && <RelationshipBadge label="Parents Related" />}
            {cousinMarriages.map((m) => (
              <RelationshipBadge key={m.familyId} label={m.relation.label} />
            ))}
          </div>
        )}
      </div>

      {disabled && (
        <p
          role="status"
          className="rounded-md border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
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
          <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
            <p className="font-medium">Validation warnings for this person</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              {warnings.map((w, i) => (
                <li key={i}>{w.message}</li>
              ))}
            </ul>
          </div>
        )}

        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
          <dt>Internal ID</dt>
          <dd className="truncate font-mono" title={person.id}>
            {person.id}
          </dd>
          <dt>Original FTZ ID</dt>
          <dd className="font-mono">{person.ftzId ?? "—"}</dd>
        </dl>

        <section
          className="flex flex-col gap-2 border-t border-slate-200 pt-3 dark:border-slate-800"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            void handlePhotoFile(e.dataTransfer.files?.[0]);
          }}
        >
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Photo</h3>
          <div className="flex items-center gap-3">
            {resolvePhoto(person, "thumb") ? (
              <img
                src={resolvePhoto(person, "thumb")}
                alt={photoAlt(person)}
                className="h-16 w-16 rounded-md border border-slate-200 object-cover dark:border-slate-700"
              />
            ) : (
              <div
                role="img"
                aria-label="No photo available"
                className="flex h-16 w-16 items-center justify-center rounded-md border border-dashed border-slate-300 bg-slate-100 text-slate-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-500"
              >
                <span aria-hidden="true">👤</span>
              </div>
            )}
            <div className="flex flex-col items-start gap-1 text-xs">
              <label className="inline-flex cursor-pointer items-center rounded border border-slate-300 px-2 py-1 text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800 [@media(pointer:coarse)]:min-h-11">
                {person.photo ? "Replace" : "Upload"} photo
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={photoBusy}
                  className="sr-only"
                  onChange={(e) => void handlePhotoFile(e.target.files?.[0])}
                />
              </label>
              {person.photo && (
                <button
                  type="button"
                  disabled={photoBusy}
                  onClick={() => {
                    onEdit((t) => setPersonPhoto(t, personId, undefined));
                    // Keep keyboard focus in the section instead of letting it fall to <body>
                    // when this button unmounts; the upload input is always mounted.
                    fileInputRef.current?.focus();
                  }}
                  className="inline-flex items-center rounded px-2 py-1 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40 [@media(pointer:coarse)]:min-h-11"
                >
                  Remove photo
                </button>
              )}
              <span className="text-slate-400 dark:text-slate-500">or drag an image here</span>
            </div>
          </div>
          {photoBusy && (
            <p className="text-xs text-slate-500 dark:text-slate-400">Processing image…</p>
          )}
          {photoError && (
            <p role="alert" className="text-xs text-red-700 dark:text-red-400">
              {photoError}
            </p>
          )}
        </section>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            saveDraft();
          }}
          className="flex flex-col gap-3 border-t border-slate-200 pt-3 dark:border-slate-800"
        >
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Edit</h3>

          <label className="flex flex-col gap-1 text-xs font-medium text-slate-700 dark:text-slate-300">
            Name
            <input
              type="text"
              value={draft.name}
              onChange={(e) => updateDraft({ name: e.target.value })}
              className="rounded border border-slate-500 px-2 py-1 text-sm font-normal dark:border-slate-500 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-400"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs font-medium text-slate-700 dark:text-slate-300">
            Nickname
            <input
              type="text"
              value={draft.nickname}
              onChange={(e) => updateDraft({ nickname: e.target.value })}
              className="rounded border border-slate-500 px-2 py-1 text-sm font-normal dark:border-slate-500 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-400"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs font-medium text-slate-700 dark:text-slate-300">
            Gender
            <select
              value={draft.gender}
              onChange={(e) => updateDraft({ gender: e.target.value as Gender })}
              // Light-mode bg/text stated explicitly, and repeated on each <option>: a select
              // styled only for dark mode leaves its popup list to the platform default, which
              // is where unreadable white-on-white options come from.
              className="rounded border border-slate-500 bg-white px-2 py-1 text-sm font-normal text-slate-900 dark:border-slate-500 dark:bg-slate-800 dark:text-slate-100"
            >
              {(
                [
                  ["unknown", "Unknown"],
                  ["male", "Male"],
                  ["female", "Female"],
                ] as const
              ).map(([value, optionLabel]) => (
                <option
                  key={value}
                  value={value}
                  className="bg-white text-slate-900 dark:bg-slate-800 dark:text-slate-100"
                >
                  {optionLabel}
                </option>
              ))}
            </select>
          </label>

          <fieldset className="flex flex-col gap-1">
            <legend className="text-xs font-medium text-slate-700 dark:text-slate-300">
              Birth date
            </legend>
            <div className="flex gap-1">
              <input
                type="number"
                placeholder="Year"
                value={draft.birthYear}
                onChange={(e) => updateDraft({ birthYear: e.target.value })}
                aria-label="Birth year"
                className="w-1/3 rounded border border-slate-500 px-2 py-1 text-sm dark:border-slate-500 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-400"
              />
              <input
                type="number"
                placeholder="Mo"
                value={draft.birthMonth}
                onChange={(e) => updateDraft({ birthMonth: e.target.value })}
                aria-label="Birth month"
                className="w-1/3 rounded border border-slate-500 px-2 py-1 text-sm dark:border-slate-500 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-400"
              />
              <input
                type="number"
                placeholder="Day"
                value={draft.birthDay}
                onChange={(e) => updateDraft({ birthDay: e.target.value })}
                aria-label="Birth day"
                className="w-1/3 rounded border border-slate-500 px-2 py-1 text-sm dark:border-slate-500 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-400"
              />
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-1">
            <legend className="text-xs font-medium text-slate-700 dark:text-slate-300">
              Death date
            </legend>
            <div className="flex gap-1">
              <input
                type="number"
                placeholder="Year"
                value={draft.deathYear}
                onChange={(e) => updateDraft({ deathYear: e.target.value })}
                aria-label="Death year"
                className="w-1/3 rounded border border-slate-500 px-2 py-1 text-sm dark:border-slate-500 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-400"
              />
              <input
                type="number"
                placeholder="Mo"
                value={draft.deathMonth}
                onChange={(e) => updateDraft({ deathMonth: e.target.value })}
                aria-label="Death month"
                className="w-1/3 rounded border border-slate-500 px-2 py-1 text-sm dark:border-slate-500 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-400"
              />
              <input
                type="number"
                placeholder="Day"
                value={draft.deathDay}
                onChange={(e) => updateDraft({ deathDay: e.target.value })}
                aria-label="Death day"
                className="w-1/3 rounded border border-slate-500 px-2 py-1 text-sm dark:border-slate-500 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-400"
              />
            </div>
          </fieldset>

          <label className="flex flex-col gap-1 text-xs font-medium text-slate-700 dark:text-slate-300">
            Notes (one per line)
            <textarea
              value={draft.notes}
              onChange={(e) => updateDraft({ notes: e.target.value })}
              rows={3}
              className="rounded border border-slate-500 px-2 py-1 text-sm font-normal dark:border-slate-500 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-400"
            />
          </label>

          <button
            type="submit"
            className="rounded-md bg-blue-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-800"
          >
            Save changes
          </button>
        </form>

        <section className="flex flex-col gap-2 border-t border-slate-200 pt-3 dark:border-slate-800">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Parents</h3>
          {(["father", "mother"] as const).map((role) => {
            const relId = role === "father" ? rel.father : rel.mother;
            return (
              <div key={role} className="flex items-center justify-between text-sm">
                <span className="capitalize text-slate-500 dark:text-slate-400">{role}:</span>
                {relId ? (
                  <span className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onNavigate(relId)}
                      className="min-w-0 truncate text-left text-blue-700 underline dark:text-blue-400"
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
                      className="inline-flex shrink-0 items-center text-xs text-red-600 hover:underline dark:text-red-400 [@media(pointer:coarse)]:min-h-11"
                    >
                      Remove
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setPicker({ kind: role })}
                    className="inline-flex shrink-0 items-center text-xs text-blue-700 hover:underline dark:text-blue-400 [@media(pointer:coarse)]:min-h-11"
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

        <section className="flex flex-col gap-2 border-t border-slate-200 pt-3 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Spouses</h3>
            <button
              type="button"
              onClick={() => setPicker({ kind: "spouse" })}
              className="inline-flex shrink-0 items-center text-xs text-blue-700 hover:underline dark:text-blue-400 [@media(pointer:coarse)]:min-h-11"
            >
              + Add spouse
            </button>
          </div>
          {rel.spouses.length === 0 && (
            <p className="text-xs text-slate-500 dark:text-slate-400">None recorded.</p>
          )}
          <ul className="flex flex-col gap-1">
            {/* dedupe: a self-marriage in the source data produces the same id twice in rel.spouses */}
            {[...new Set(rel.spouses)].map((spouseId) => (
              <li key={spouseId} className="flex items-center justify-between text-sm">
                <button
                  type="button"
                  onClick={() => onNavigate(spouseId)}
                  className="min-w-0 truncate text-left text-blue-700 underline dark:text-blue-400"
                >
                  {tree.persons[spouseId]?.name.trim() || "(no name)"}
                </button>
                <button
                  type="button"
                  onClick={() => onEdit((t) => removeSpouse(t, personId, spouseId))}
                  className="inline-flex shrink-0 items-center text-xs text-red-600 hover:underline dark:text-red-400 [@media(pointer:coarse)]:min-h-11"
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

        <section className="flex flex-col gap-2 border-t border-slate-200 pt-3 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Children</h3>
            <button
              type="button"
              onClick={startAddChild}
              className="inline-flex shrink-0 items-center text-xs text-blue-700 hover:underline dark:text-blue-400 [@media(pointer:coarse)]:min-h-11"
            >
              + Add child
            </button>
          </div>
          {rel.children.length === 0 && (
            <p className="text-xs text-slate-500 dark:text-slate-400">None recorded.</p>
          )}
          <ul className="flex flex-col gap-1">
            {rel.children.map((childId) => {
              const child = tree.persons[childId];
              return (
                <li key={childId} className="flex items-center justify-between text-sm">
                  <button
                    type="button"
                    onClick={() => onNavigate(childId)}
                    className="min-w-0 truncate text-left text-blue-700 underline dark:text-blue-400"
                  >
                    {child?.name.trim() || "(no name)"}
                  </button>
                  {child?.famcId && (
                    <button
                      type="button"
                      onClick={() =>
                        onEdit((t) => removeChildFromFamily(t, child.famcId!, childId))
                      }
                      className="inline-flex shrink-0 items-center text-xs text-red-600 hover:underline dark:text-red-400 [@media(pointer:coarse)]:min-h-11"
                    >
                      Remove
                    </button>
                  )}
                </li>
              );
            })}
          </ul>

          {picker?.kind === "choose-family-for-child" && (
            <div className="rounded-md border border-slate-300 bg-white p-3 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100">
              <p className="mb-2 text-xs font-medium text-slate-700 dark:text-slate-300">
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
                        className="w-full rounded px-2 py-1 text-left hover:bg-slate-100 dark:hover:bg-slate-700 [@media(pointer:coarse)]:min-h-11"
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
                className="mt-2 inline-flex items-center text-xs text-slate-500 hover:underline dark:text-slate-400 [@media(pointer:coarse)]:min-h-11"
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
          <section className="flex flex-col gap-2 border-t border-slate-200 pt-3 dark:border-slate-800">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Siblings</h3>
            <ul className="flex flex-wrap gap-2">
              {rel.siblings.map((sibId) => (
                <li key={sibId}>
                  <button
                    type="button"
                    onClick={() => onNavigate(sibId)}
                    className="inline-flex items-center rounded-full bg-slate-100 px-2 py-1 text-xs text-blue-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-blue-400 dark:hover:bg-slate-700 [@media(pointer:coarse)]:min-h-11"
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
          <section className="flex flex-col gap-2 border-t border-slate-200 pt-3 dark:border-slate-800">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              Extended family
            </h3>
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
                      className="inline-flex items-center rounded-full bg-slate-100 px-2 py-1 text-xs text-blue-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-blue-400 dark:hover:bg-slate-700 [@media(pointer:coarse)]:min-h-11"
                    >
                      {tree.persons[id]?.name.trim() || "(no name)"}
                    </button>
                  </li>
                ) : null
              )}
            </ul>
          </section>
        )}

        <RelationshipCalculator
          tree={tree}
          personId={personId}
          searchIndex={searchIndex}
          onNavigate={onNavigate}
        />

        {analysis && (
          <details
            open
            data-section="relationship-intelligence"
            className="flex flex-col gap-3 border-t border-slate-200 pt-3 dark:border-slate-800"
          >
            <summary className="flex cursor-pointer select-none items-center text-sm font-semibold text-slate-800 [@media(pointer:coarse)]:min-h-11 dark:text-slate-100">
              Relationship intelligence
            </summary>

            <section className="flex flex-col gap-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                Their parents
              </h4>
              {parentRel ? (
                <RelationshipCard
                  tree={tree}
                  title="the parents of this person"
                  titleIds={[parentRel.fatherId, parentRel.motherId]}
                  rel={parentRel}
                  aId={parentRel.fatherId}
                  bId={parentRel.motherId}
                  onNavigate={onNavigate}
                />
              ) : (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Both parents aren&apos;t recorded, so their relationship can&apos;t be checked.
                </p>
              )}
            </section>

            <section className="flex flex-col gap-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                {marriages.length === 1 ? "Their marriage" : "Their marriages"}
              </h4>
              {marriages.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  No marriage recorded in this tree.
                </p>
              ) : (
                marriages.map((m) => {
                  const spouseId = m.husbandId === personId ? m.wifeId : m.husbandId;
                  return (
                    <RelationshipCard
                      key={m.familyId}
                      tree={tree}
                      title="this marriage"
                      titleIds={[personId, spouseId]}
                      rel={m}
                      aId={personId}
                      bId={spouseId}
                      onNavigate={onNavigate}
                    />
                  );
                })
              )}
            </section>

            {analysis && (
              <AncestralChain
                tree={tree}
                personId={personId}
                analysis={analysis}
                onNavigate={onNavigate}
              />
            )}

            {analysis && <DetectionLimits tree={tree} personId={personId} analysis={analysis} />}

            {chain?.continuesInDescendants && (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                The pattern continues in their descendants.
              </p>
            )}
          </details>
        )}
      </fieldset>
    </aside>
  );
}
