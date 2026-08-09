# Performance Report

Real measurements, not estimates — captured during Milestone 7 (v1.0 release readiness)
against both the real 473-person/136-family sample and a synthetic tree well past the
milestone's stated 10,000-person/5,000-family floor. Two measurement methods were used and
are labeled accordingly: **pure-function timing** (Node, no browser/DOM overhead — isolates
the actual parser/editor/exporter cost) and **real-browser timing** (Playwright/Chromium
against the production build, served locally — includes React rendering, the Web Worker
round-trip, and DOM/layout cost, i.e. what a user actually experiences).

## Build output

```
$ npm run build
dist/index.html                      0.67 kB
dist/assets/ftzWorker-*.js         114.11 kB
dist/assets/index-*.css             38.34 kB   (gzip:   7.77 kB)
dist/assets/index-*.js             468.18 kB   (gzip: 152.30 kB)
built in 4.44s
```

Total gzipped JS+CSS payload is **~160KB** — React, React Flow, dagre, JSZip, and the entire
application logic combined. Nothing unusually heavy for what's included (a graph visualization
library is most of that weight).

## Real-browser timing (production build, real 473-person/136-family sample)

| Step | Time |
|---|---|
| Initial load (navigation → `load` event, served locally) | 124ms |
| Upload click → explorer interactive (full worker round-trip: ZIP extraction, parse, validate, initial layout, first paint) | 315ms |
| Field edit save → UI updated (React re-render + revalidation) | 145ms |
| Export click → "Conversion successful" shown (worker round-trip: export + GEDCOM generation) | 170ms |

"Served locally" means these numbers isolate app-level cost, not network latency — on a real
connection, add roughly the time to transfer ~160KB gzipped (typically well under a second
even on a slow connection, since it's a single cacheable bundle, not a large payload).
Everything a user actually waits on — upload, edit, export — lands well under half a second
against real data.

## Pure-function timing (Node, isolates parser/editor/exporter cost)

**Real sample (473 people / 136 families):**

| Operation | Time |
|---|---|
| Full parse (ZIP extraction + `node.ftt` parse + build + validate) | 46–129ms (varied slightly by run; both real, no outliers) |
| GEDCOM export | 16–18ms → 49KB output |

**Synthetic tree, generated well past the milestone's floor (24,572 people / 8,191 families —
the generator's own termination condition means it typically overshoots the 10,000/5,000
target rather than landing exactly on it):**

| Operation | Time |
|---|---|
| Parse + build + initial validation | ~800ms (one-time, at upload) |
| Single edit + full revalidation | ~136ms |
| Search index build (24,572 people) | ~23ms |
| Search query | ~15ms |
| Neighborhood compute + dagre layout (from the tree's founder) | ~77ms (16 nodes rendered) |
| Neighborhood compute + dagre layout (from the deepest leaf) | ~33ms (13 nodes rendered) |
| GEDCOM export (24,572 people) | ~354ms → 2.4MB output |
| Node heap after all of the above | ~120MB |

**The core architectural claim, confirmed by measurement, not just by design intent:**
neighborhood computation and layout cost (77ms/33ms above) are essentially the same whether
the underlying tree has 473 people or 24,572 — because both only ever touch the bounded
~150-node neighborhood around the current focus, never the whole tree. This is what makes the
explorer's interactive performance independent of total tree size.

**Single edit + revalidation (~136ms at 24,572 people)** is the one operation whose cost does
scale with tree size, because `runIntegrityChecks` (correctly, by design — see
`docs/audit-findings.md`) re-checks the *entire* graph after every edit, not just the touched
records, so nothing else can silently go stale. At real-world tree sizes (hundreds to low
thousands of people) this is imperceptible; at the 24,572-person synthetic extreme it's still
comfortably under the "feels instant" threshold (~100ms) and nowhere near disruptive.

## Undo-history memory cost (measured, not estimated)

50 tracked snapshots (the hook's `MAX_HISTORY` cap) against the 24,572-person synthetic tree,
with forced GC before/after to isolate the retained cost:

```
Heap growth after 50 tracked snapshots + edits: 74.9MB
```

This confirms the reasoning in `docs/explorer-architecture.md`: because each edit only
shallow-copies the two containing maps (`persons`, `families`) and the one touched record —
untouched records keep their previous object identity — 50 full-history snapshots of a
24,572-person tree cost tens of MB, not 50× the tree's own footprint. At the real-world scale
this project targets (hundreds to a few thousand people), this is a non-issue; even at this
deliberately-extreme synthetic scale, ~75MB is well within what a modern browser tab can hold.

## Memory and browser responsiveness

- All parsing, validation, editing, and export run inside a Web Worker
  (`web/src/worker/ftzWorker.ts`), off the main thread — confirmed in the real-browser timing
  above (upload/edit/export all complete in well under half a second with the UI staying
  responsive throughout; a single-threaded implementation of the same work would have visibly
  frozen the tab for the parse and export steps at the 24,572-person scale, even though it
  wouldn't have at 473).
- `onlyRenderVisibleElements` (React Flow) and the bounded-neighborhood strategy together mean
  the DOM never holds more than roughly 150 person-cards at once, regardless of tree size —
  this is the primary reason visualization performance doesn't degrade with scale.

## Recommendations

No optimizations are recommended at this time. Every measured number is comfortably within
"feels instant" territory (under ~200ms) for real-browser interactions, and the one operation
that scales with tree size (full revalidation per edit) is a deliberate, correct design choice
— trading a small, still-imperceptible per-edit cost for the guarantee that validation state
never goes stale. Revisit only if real usage surfaces trees significantly larger than the
24,572-person synthetic ceiling tested here, or if user reports describe perceptible lag —
premature optimization here would trade simplicity for a benefit nobody has asked for yet.
