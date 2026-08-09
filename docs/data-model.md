# Canonical Internal Data Model

Format-independent. Neither FTZ nor GEDCOM concepts leak in — both are just I/O adapters around this model.

```
FTZ ──▶ Parser ──▶ Internal Model ──▶ Editor ──▶ GEDCOM Generator ──▶ .ged
                         ▲
                  (future) FTZ / GEDCOM importers write here too
```

The application **never edits FTZ records directly** — it edits the internal model. FTZ is a one-way import source.

## Design decisions

1. **Dual ID**: every record gets a stable `UUID` (internal identity, generated once at import, never changes) *and* keeps its original `ftzId` for traceability/debugging/round-trip audit. UUIDs exist because a future GEDCOM importer, manual entry, or a second FTZ file merged into the same tree would otherwise collide on the FTZ integer ID space.
2. **Relationships are computed, not stored redundantly.** `Person` stores `famcId` (one) and `famsIds` (many) — the same shape the FTZ data actually has. Father/mother/siblings/grandparents/grandchildren are *derived* via the functions in `validation-report.md`, not cached fields, so they can never desync from the source of truth after an edit.
3. **Zero-data-loss requirement**: every original tab-separated field — including the ones with unknown/Low-confidence meaning documented in `ftz-format-spec.md` — is preserved as `raw` on the record. Even if today's parser doesn't interpret column 9, tomorrow's re-analysis can, without re-importing.
4. **Layout coordinates are preserved but explicitly non-genealogical** — kept for optional "restore original FTZ layout" rendering, never treated as data.

## Interfaces

```typescript
type UUID = string;      // crypto.randomUUID() — internal identity
type FtzId = number;     // original FTZ integer node ID, preserved for traceability only

interface DatePart {
  year?: number;
  month?: number;
  day?: number;
}

interface Metadata {
  sourceFormat: "ftz" | "gedcom" | "manual";
  sourceFileName?: string;
  importedAt: string;        // ISO 8601
  ftzAnchorId?: FtzId;       // header's 3rd value, if source was FTZ
  formatVersion?: string;    // reserved: unknown today, populate if future FTZ exports declare one
}

interface ValidationIssue {
  severity: "error" | "warning" | "info";
  code:
    | "DUPLICATE_PERSON_ID" | "DUPLICATE_FAMILY_ID" | "ID_NAMESPACE_COLLISION"
    | "BROKEN_FAMC" | "BROKEN_SPOUSE_REF" | "SELF_MARRIAGE" | "SELF_PARENT"
    | "CIRCULAR_ANCESTRY" | "GENDER_ROLE_MISMATCH" | "FAMILY_MISSING_PARENT"
    | "MALFORMED_ROW" | "UNKNOWN_RECORD_GROUP";
  message: string;
  relatedIds: UUID[];
}

interface ValidationState {
  validatedAt: string;
  issues: ValidationIssue[];
  isValid: boolean;          // true iff no "error"-severity issues
}

interface Event {
  id: UUID;
  type: "birth" | "death" | "marriage" | "custom";
  date?: DatePart;
  place?: string;
  note?: string;
}

interface MediaRef {
  id: UUID;
  fileName: string;
  role?: "portrait" | "document" | "other";
  sourcePath?: string;       // path inside the original archive, if known
}

interface NoteEntry {
  id: UUID;
  text: string;
  category?: "biography" | "event" | "general"; // "general" covers FTZ col 29; "event" covers the rarer col 26
}

interface Person {
  id: UUID;
  ftzId?: FtzId;
  name: string;
  nickname?: string;
  gender: "male" | "female" | "unknown";
  birth?: Event;
  death?: Event;
  notes: NoteEntry[];
  media: MediaRef[];
  famcId?: UUID;              // family this person belongs to as a child
  famsIds: UUID[];            // families this person belongs to as a spouse (usually 0 or 1; format allows more)
  layout?: { x: number; y: number };  // preserved from FTZ, cosmetic only
  raw?: string[];             // original tab-split fields, verbatim — zero-data-loss safety net
}

interface Family {
  id: UUID;
  ftzId?: FtzId;
  husbandId?: UUID;
  wifeId?: UUID;
  childrenIds: UUID[];        // ordered by original birth-order field
  marriage?: Event;
  layout?: { x: number; y: number };
  raw?: string[];
}

// Not persisted — the shape returned by relationship queries (see validation-report.md for derivation rules)
interface Relationship {
  personId: UUID;
  father?: UUID;
  mother?: UUID;
  spouses: UUID[];
  children: UUID[];
  siblings: UUID[];
  grandparents: {
    paternalGrandfather?: UUID;
    paternalGrandmother?: UUID;
    maternalGrandfather?: UUID;
    maternalGrandmother?: UUID;
  };
  grandchildren: UUID[];
}

interface FamilyTree {
  metadata: Metadata;
  persons: Record<UUID, Person>;
  families: Record<UUID, Family>;
  validation: ValidationState;
}
```

## Notes on fields intentionally left out

- No `spouseId` on `Person` — spouse resolution always goes through `famsIds → Family`, because the FTZ source of truth stores it that way and duplicating it on `Person` would be exactly the kind of redundant, desyncable state decision 2 above rules out.
- No cached `siblings`/`grandparents`/`grandchildren` arrays on `Person` — same reasoning; these are always computed from `famcId`/`famsIds` at query time.
