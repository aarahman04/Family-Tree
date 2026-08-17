# Family Tree GEDCOM Insight System — Phased Build Plan v2

## 1. Purpose

This document defines the next version of the family tree application built from GEDCOM / FTZ data.

The goal is not just to display the tree, but to make the tree **analytical and easy to understand**:
- detect cousin marriages
- classify how close the relationship is
- expose branch overlap and pedigree collapse
- surface family structure insights directly inside the existing scroll and click flow
- keep the experience lightweight, not a separate dashboard-heavy product
- make the UI work well on both desktop and mobile

The output should feel like a family tree viewer with intelligence built into every person node.

---

## 2. Core Product Direction

The best UX is:

- the tree remains the main canvas
- clicking any person opens a right-side or inline detail panel
- the panel shows:
  - who this person is
  - their parents, spouse(s), children
  - whether their parents were related
  - whether their marriage was a cousin marriage
  - whether their children continue a cousin-marriage chain
  - how many generations deep this pattern goes
- insights should be visible **inside the same scroll flow**, not hidden in a separate analytics page

So the app should behave like this:

1. User clicks a person
2. App resolves their parents, spouse(s), and ancestry
3. App checks whether the person or their parents are part of a cousin marriage
4. App shows a structured explanation:
   - “This person’s parents are first cousins.”
   - “This person’s grandparents are connected by a cousin marriage.”
   - “This branch has repeated cousin marriages across 3 generations.”
5. App highlights the relevant lineage visually in the tree

---

## 3. Main Insight Categories

The app should support these insight groups:

### A. Family Structure Insights
- total members
- male / female / unspecified
- living / deceased
- generations
- marriages
- average children per family
- largest generation
- largest family
- most common names
- most common surnames

### B. Cousin Marriage Insights
- total confirmed cousin marriages
- cousin marriage percentage out of all confirmed marriages
- first cousin marriages
- first cousin once removed marriages
- second cousin marriages
- more distant cousin marriages
- unknown / unclassified marriages due to missing ancestry
- cousin marriage chains across generations

### C. Branch Overlap Insights
- pedigree collapse score
- ancestor reuse / overlap score
- repeated ancestor paths
- branch interconnection score
- families that merge repeatedly

### D. Tree Health / Data Quality Insights
- missing parent links
- missing spouse links
- duplicate names
- duplicate people suspects
- incomplete dates
- isolated records
- suspicious loops that may indicate bad data instead of true cousin links

### E. Branch Vitality Insights
- descendant count by branch
- number of living descendants by branch
- branch growth over generations
- branch depth
- branch spread
- most influential ancestor

---

## 4. The Most Important UX Rule

Do **not** make the user open a separate analytics dashboard just to understand the tree.

Instead:

- keep the tree as the main view
- show insights in a compact sidebar or expandable panel
- make every person card clickable
- use smart inline badges
- keep the layout clean on small screens

Recommended inline badges:
- `Cousin Marriage`
- `Parents Related`
- `2nd Cousin Link`
- `Branch Merge`
- `Pedigree Collapse`
- `Incomplete Record`

This makes the tree usable without feeling like a spreadsheet.

---

## 5. Cousin Marriage Detection Logic

This is the most important technical feature.

### 5.1 What should count as a cousin marriage?
A marriage should be marked as a cousin marriage only when the spouses share one or more common ancestors within a reasonable generation window.

The app should classify the relationship, not just label it as “yes/no”.

### 5.2 Suggested relationship classes
- First cousins
- First cousins once removed
- Second cousins
- Second cousins once removed
- Third cousins
- Double cousins
- Distant cousin relationship
- Unclassified due to missing ancestry

### 5.3 What should be shown on click
When a person is clicked, the app should be able to say things like:

- “This person’s parents were first cousins.”
- “This person is the child of a cousin marriage.”
- “This person’s grandparents also had a cousin marriage in a previous generation.”
- “This branch contains repeated cousin marriages across 3 generations.”
- “This marriage links two branches that already overlap through ancestor X.”

### 5.4 Chain visualization
The app should also be able to show a path such as:

- Person A married Person B
- Their children continue into Branch C
- Branch C later reconnects with Branch D
- That later marriage creates another cousin loop

This is useful for explaining how repeated cousin marriages stack through generations.

---

## 6. Best Way to Present the Insight

The insight should not be a wall of text.

For each selected person, show:

### Summary line
A one-line summary such as:
- `Parents are first cousins`
- `Spouse is a second cousin`
- `This person belongs to a repeated cousin-marriage chain`
- `No cousin-marriage evidence found`
- `Relationship unknown because ancestry is incomplete`

### Relationship path
Show a compact path:
- `Person -> Parent -> Grandparent -> Common Ancestor -> Other Branch -> Spouse`

### Generation depth
Show:
- cousin link generation distance
- closest common ancestor distance
- number of generations since the first known merge

### Branch history
Show:
- which side of the family the link came from
- whether it is a sibling-branch marriage
- whether it reconnects an already merged line

---

## 7. Suggested Feature Phases

The project should be built in phases so the difficult parts do not block the rest.

---

## Phase 1 — Foundation and Tree Intelligence Basics

These are the easiest and most important items to finish first.

### Goals
- parse GEDCOM / FTZ correctly
- build person, family, spouse, child, parent, and sibling relationships
- render the tree reliably
- allow person click selection
- show standard family stats
- ensure the layout is responsive on mobile from the start

### Features
- total members
- male / female / unspecified
- living / deceased
- generations
- marriages
- average children per family
- largest generation
- largest family
- most common names
- most common surnames

### Deliverables
- stable GEDCOM import
- clean tree rendering
- person details panel
- basic stats in sidebar
- export / print support already working
- mobile-friendly base layout

### Why this comes first
Nothing else matters if the base tree is unstable.

---

## Phase 2 — Relationship Intelligence and Cousin Marriage Detection

This is the core differentiator.

### Goals
- detect whether two spouses are related
- classify the relationship type
- show the result inside the person details panel
- build ancestor-path lookup
- support repeated cousin-marriage chains
- make cousin identification accurate enough to trust

### Features
- confirmed cousin marriage detection
- relationship type classification
- first cousin / second cousin / once removed support
- “parents were related” detection
- “spouse was related through branch X” detection
- chain explanation across generations
- warning when ancestry is incomplete and result is uncertain
- clear distinction between confirmed, likely, possible, and unknown

### Deliverables
- click a person, see cousin-marriage status
- click a marriage, see relationship class
- click a spouse link, see the common ancestor path
- highlight the relevant branch in the tree
- show a confidence score for the classification

### Why this is a separate phase
This requires graph traversal, ancestor resolution, and strong error handling. It is much harder than basic tree rendering.

---

## Phase 3 — Branch Overlap, Pedigree Collapse, and Family Health Metrics

This phase adds the deeper analytics.

### Goals
- measure how much the tree folds back into itself
- identify dense cousin-marriage regions
- rank branches by interconnection

### Features
- pedigree collapse score
- branch overlap percentage
- repeated ancestor reuse
- descendant count by branch
- living descendant count by branch
- branch vitality score
- marriage bridge score
- family health summary

### Deliverables
- compact “family health” metrics inside the same scroll panel
- badges on branches with high interconnection
- top risky / dense branches
- top influential ancestors

### Important UX note
Do not make this a giant separate dashboard.  
Keep it as scrollable insight blocks in the same panel.

### Why this phase matters
This is where the product becomes genuinely useful for genealogical analysis.

---

## Phase 4 — Data Quality, Validation, and Trust Layer

This phase prevents bad data from ruining the analysis.

### Goals
- detect incomplete records
- detect suspicious loops caused by missing or wrong links
- explain when the app is making an estimate

### Features
- duplicate person detection
- duplicate name warnings
- missing parent / spouse / date warnings
- isolated record detection
- suspicious cousin-marrying pattern validation
- confidence score for each insight
- confirmed vs estimated labels
- simple cues that help users verify the data manually

### Deliverables
- data quality panel
- confidence tags on insight cards
- warnings for low-confidence cousin classifications
- audit trail for why a classification was made

### Why this matters
Genealogy data is messy. Without confidence handling, the app will look smart but be untrustworthy.

---

## Phase 5 — Advanced Visualization and Polish

This is the presentation layer.

### Goals
- make complex relationships understandable instantly
- make the tree look premium
- reduce cognitive overload

### Features
- cousin-marriage loops drawn in a distinct color
- branch merge indicators
- generation bands
- collapsible detail cards
- mini lineage path viewer
- heatmap for high-interconnection branches
- export poster with optional analytics overlays
- mobile-responsive tree interaction and readable cards

### Deliverables
- polished print/export output
- toggles for “simple tree” and “insight mode”
- visual highlight for selected person’s ancestry path
- responsive spacing, font sizes, and touch-friendly controls

---

## 8. Recommended Architecture

### 8.1 Data model
Use a graph-style internal model even if the source is GEDCOM.

Recommended entities:

#### Person
- id
- name
- gender
- birth/death dates
- parents
- spouses
- children
- families participated in
- tags / notes

#### Family / Union
- union id
- spouse 1
- spouse 2
- children
- marriage date
- marriage place
- relationship classification
- confidence score

#### Ancestor Path
- person id
- ancestor id
- generation distance
- path nodes
- cached result

### 8.2 Core processing steps
1. Parse GEDCOM
2. Normalize people and families
3. Build parent-child graph
4. Build spouse / marriage graph
5. Compute ancestor paths
6. Detect common ancestors between spouses
7. Classify cousin relationship
8. Generate insight metrics
9. Render tree and inline insights

### 8.3 Caching
Cache:
- ancestor sets
- shortest path between people
- relationship classifications
- branch overlap calculations

This is important because the same lookups will be repeated many times.

---

## 9. Relationship Classification Logic

The app should use graph logic, not surname matching.

### Rule
Two people are related if they share a common ancestor in the ancestry graph and are not a direct parent-child or ancestor-descendant match.

### Example categories
- Same branch marriage
- Sibling-branch marriage
- First-cousin marriage
- Second-cousin marriage
- First cousin once removed
- Distant cousin marriage
- Unknown due to missing ancestry

### What should be displayed
- closest common ancestor
- generation distance for both spouses
- confidence level
- explanation path

---

## 10. What the Person Detail Panel Should Show

For the selected person, the panel should ideally include:

### Identity section
- full name
- gender
- birth / death
- branch label
- generation number

### Family section
- parents
- spouse(s)
- children
- siblings

### Relationship intelligence
- whether parents are related
- whether spouse is related
- cousin degree
- common ancestor
- ancestry path
- cousin-marriage chain depth

### Metrics
- descendants count
- branch contribution
- relation confidence
- data completeness score

### Notes / warnings
- missing ancestry
- ambiguous link
- duplicate name risk
- estimated relationship rather than confirmed

---

## 11. Useful Metrics to Add Later

These can come after the main phases:

- most connected person
- most influential ancestor
- largest branch by descendants
- highest cousin-marriage density branch
- branch with most pedigree collapse
- generation with most marriages
- generation with most cousin marriages
- branch with most repeated names
- branch with highest data completeness
- branch with lowest confidence / most missing links

---

## 12. Practical Build Priority

If the team wants the fastest valuable release, build in this order:

### Must have
1. stable import and tree rendering
2. person click panel
3. marriage and parent-child graph model
4. cousin-marriage detection
5. relationship classification
6. inline insight display
7. mobile-responsive layout

### Should have
8. branch overlap scoring
9. pedigree collapse scoring
10. confidence levels
11. data quality warnings

### Nice to have
12. advanced heatmaps
13. export overlays
14. visual branch analytics

---

## 13. Final Product Goal

The final product should answer questions like:

- Who is this person?
- Which branch do they belong to?
- Are their parents related?
- Was their marriage a cousin marriage?
- If yes, how close?
- Is this the first time this branch merges, or is it repeated?
- How much of the tree overlaps because of intermarriage?
- Which branches are most tightly connected?
- How reliable is this classification?
- Can this be used comfortably on mobile?

That is the level of intelligence the app should aim for.

---

## 14. Summary

This app should not be just a family tree printer.

It should become a **family relationship analysis engine** with:
- tree visualization
- cousin-marriage detection
- ancestry path reasoning
- branch overlap analysis
- pedigree collapse scoring
- data quality checks
- inline insight cards
- printable poster output
- mobile-friendly responsive styling

The most important principle is simple:

**keep the tree central, and make the intelligence appear naturally when the user clicks a person or marriage.**

That will make the product much more useful than a separate dashboard.
