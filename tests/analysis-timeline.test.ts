import { describe, expect, it } from "vitest";
import { parseNodeFtt } from "../src/parser/index.js";
import type { FamilyTree, Person, UUID } from "../src/models/types.js";
import {
  DEFAULT_GENERATION_GAP,
  analyzeTimeline,
} from "../src/analysis/timeline.js";
import { MAX_PLAUSIBLE_AGE, isPresumedLiving } from "../src/models/living.js";
import { buildNodeFtt, familyRow, personRow } from "./helpers.js";

const idByName = (t: FamilyTree, name: string) =>
  Object.values(t.persons).find((p) => p.name === name)!.id;

/** G1 (b.1900) -> P1 (b.1930) -> C1 (b.1960): two clean 30-year parent->child gaps. */
function threeGenerations() {
  return parseNodeFtt(
    buildNodeFtt(
      [
        personRow({ id: 1, name: "G1", gender: 1, birthYear: 1900 }),
        personRow({ id: 2, name: "P1", famc: 10, gender: 1, birthYear: 1930 }),
        personRow({ id: 3, name: "C1", famc: 20, gender: 1, birthYear: 1960 }),
      ],
      [familyRow({ id: 10, husband: 1 }), familyRow({ id: 20, husband: 2 })],
    ),
  ).tree;
}

/**
 * A single dated line of `count` people, each `gap` years after the last. Generated rather than
 * hand-written because MIN_GAP_SAMPLES is calibrated for real genealogy files, so a fixture has
 * to supply a real sample before the gap counts as measured.
 */
function datedLineage(count: number, gap: number, startYear = 1800) {
  const people = [];
  const families = [];
  for (let i = 0; i < count; i++) {
    people.push(
      personRow({
        id: i + 1,
        name: `L${i}`,
        gender: 1,
        birthYear: startYear + i * gap,
        ...(i > 0 ? { famc: 100 + i - 1 } : {}),
      }),
    );
    if (i < count - 1) families.push(familyRow({ id: 100 + i, husband: i + 1 }));
  }
  return parseNodeFtt(buildNodeFtt(people, families)).tree;
}

describe("analyzeTimeline — measured generation gap", () => {
  it("measures the tree's OWN median parent-to-child gap instead of assuming a constant", () => {
    const t = datedLineage(12, 27); // 11 measurable pairs, all exactly 27 years
    const timeline = analyzeTimeline(t, 2026);

    expect(timeline.generationGap).toBe(27);
    expect(timeline.gapSampleSize).toBe(11);
    expect(timeline.gapIsFallback).toBe(false);
  });

  it("will not call a gap 'measured' on a sample too small to mean anything", () => {
    // The real 473-person tree yields only 3 measurable pairs. Reporting a median over 3 points
    // as a measurement is what this guards against.
    const t = datedLineage(4, 27); // 3 pairs — under MIN_GAP_SAMPLES
    const timeline = analyzeTimeline(t, 2026);

    expect(timeline.gapSampleSize).toBe(3);
    expect(timeline.gapIsFallback).toBe(true);
    expect(timeline.generationGap).toBe(DEFAULT_GENERATION_GAP);
  });

  it("takes the MEDIAN so one absurd birth year cannot drag the gap with it", () => {
    // Ten clean 25-year gaps, then one 59-year outlier that is still inside the accepted window.
    // A mean would visibly follow it; the median must stay on the sane cluster.
    const people = [];
    const families = [];
    for (let i = 0; i < 11; i++) {
      people.push(
        personRow({
          id: i + 1,
          name: `A${i}`,
          gender: 1,
          birthYear: 1700 + i * 25,
          ...(i > 0 ? { famc: 100 + i - 1 } : {}),
        }),
      );
      if (i < 10) families.push(familyRow({ id: 100 + i, husband: i + 1 }));
    }
    people.push(personRow({ id: 50, name: "B0", gender: 1, birthYear: 1900 }));
    people.push(personRow({ id: 51, name: "B1", gender: 1, birthYear: 1959, famc: 200 }));
    families.push(familyRow({ id: 200, husband: 50 }));
    const t = parseNodeFtt(buildNodeFtt(people, families)).tree;

    const timeline = analyzeTimeline(t, 2026);
    expect(timeline.gapSampleSize).toBe(11);
    expect(timeline.generationGap).toBe(25);
  });

  it("discards biologically implausible gaps rather than letting bad data define the norm", () => {
    // The only two measurable gaps are 2 years and 300 years — both outside 12..60, so nothing
    // usable survives and the fallback must kick in rather than a nonsense measured gap.
    const t = parseNodeFtt(
      buildNodeFtt(
        [
          personRow({ id: 1, name: "X0", gender: 1, birthYear: 1900 }),
          personRow({ id: 2, name: "X1", famc: 10, gender: 1, birthYear: 1902 }),
          personRow({ id: 3, name: "Y0", gender: 1, birthYear: 1500 }),
          personRow({ id: 4, name: "Y1", famc: 20, gender: 1, birthYear: 1800 }),
        ],
        [familyRow({ id: 10, husband: 1 }), familyRow({ id: 20, husband: 3 })],
      ),
    ).tree;

    const timeline = analyzeTimeline(t, 2026);
    expect(timeline.gapSampleSize).toBe(0);
    expect(timeline.gapIsFallback).toBe(true);
    expect(timeline.generationGap).toBe(DEFAULT_GENERATION_GAP);
  });
});

describe("analyzeTimeline — birth-year estimation", () => {
  it("keeps recorded birth years exactly, at hop 0", () => {
    const t = threeGenerations();
    const timeline = analyzeTimeline(t, 2026);

    const g1 = timeline.birthYears.get(idByName(t, "G1"))!;
    expect(g1).toEqual({ year: 1900, hops: 0 });
    expect(timeline.recordedBirthCount).toBe(3);
  });

  it("estimates an undated ancestor by walking UP from the nearest dated descendant", () => {
    // Only the youngest has a date; the two ancestors must be estimated one gap apart each.
    const t = parseNodeFtt(
      buildNodeFtt(
        [
          personRow({ id: 1, name: "G1", gender: 1 }),
          personRow({ id: 2, name: "P1", famc: 10, gender: 1 }),
          personRow({ id: 3, name: "C1", famc: 20, gender: 1, birthYear: 2000 }),
        ],
        [familyRow({ id: 10, husband: 1 }), familyRow({ id: 20, husband: 2 })],
      ),
    ).tree;

    const timeline = analyzeTimeline(t, 2026);
    expect(timeline.gapIsFallback).toBe(true); // no measurable gaps in this fixture
    expect(timeline.birthYears.get(idByName(t, "P1"))).toEqual({
      year: 2000 - DEFAULT_GENERATION_GAP,
      hops: 1,
    });
    expect(timeline.birthYears.get(idByName(t, "G1"))).toEqual({
      year: 2000 - 2 * DEFAULT_GENERATION_GAP,
      hops: 2,
    });
    expect(timeline.recordedBirthCount).toBe(1);
  });

  it("estimates from the NEAREST dated person, not an arbitrary one", () => {
    // P1 sits between two dated people. The parent (1 hop up) must win over the grandchild
    // (2 hops down), so P1 reads 1900+30 and not 1990-2*30.
    const t = parseNodeFtt(
      buildNodeFtt(
        [
          personRow({ id: 1, name: "G1", gender: 1, birthYear: 1900 }),
          personRow({ id: 2, name: "P1", famc: 10, gender: 1 }),
          personRow({ id: 3, name: "C1", famc: 20, gender: 1 }),
          personRow({ id: 4, name: "GC1", famc: 30, gender: 1, birthYear: 1990 }),
        ],
        [
          familyRow({ id: 10, husband: 1 }),
          familyRow({ id: 20, husband: 2 }),
          familyRow({ id: 30, husband: 3 }),
        ],
      ),
    ).tree;

    const timeline = analyzeTimeline(t, 2026);
    const p1 = timeline.birthYears.get(idByName(t, "P1"))!;
    expect(p1.hops).toBe(1);
    expect(p1.year).toBe(1900 + timeline.generationGap);
  });

  it("gives a spouse the same estimated year as their dated partner", () => {
    const t = parseNodeFtt(
      buildNodeFtt(
        [
          personRow({ id: 1, name: "H", gender: 1, birthYear: 1950 }),
          personRow({ id: 2, name: "W", gender: 2 }),
        ],
        [familyRow({ id: 10, husband: 1, wife: 2 })],
      ),
    ).tree;

    expect(analyzeTimeline(t, 2026).birthYears.get(idByName(t, "W"))).toEqual({
      year: 1950,
      hops: 1,
    });
  });

  it("leaves a person with no dated relative anywhere in their component unestimated", () => {
    const t = parseNodeFtt(
      buildNodeFtt([personRow({ id: 1, name: "Lonely", gender: 1 })], []),
    ).tree;

    const timeline = analyzeTimeline(t, 2026);
    expect(timeline.birthYears.get(idByName(t, "Lonely"))).toBeUndefined();
    expect(timeline.earliestBirthYear).toBeUndefined();
    expect(timeline.treeAgeYears).toBeUndefined();
  });
});

describe("analyzeTimeline — tree age", () => {
  it("reports how far back the tree reaches, counting estimated births as well as recorded ones", () => {
    const t = parseNodeFtt(
      buildNodeFtt(
        [
          personRow({ id: 1, name: "G1", gender: 1 }),
          personRow({ id: 2, name: "P1", famc: 10, gender: 1 }),
          personRow({ id: 3, name: "Me", famc: 20, gender: 1, birthYear: 2004 }),
        ],
        [familyRow({ id: 10, husband: 1 }), familyRow({ id: 20, husband: 2 })],
      ),
    ).tree;

    // The "I'm 22, how old is this tree?" case: one real date, walked up two generations.
    const timeline = analyzeTimeline(t, 2026);
    expect(timeline.earliestBirthYear).toBe(2004 - 2 * DEFAULT_GENERATION_GAP);
    expect(timeline.treeAgeYears).toBe(2026 - (2004 - 2 * DEFAULT_GENERATION_GAP));
  });

  it("rates confidence from the evidence rather than asserting it", () => {
    // Every date real and a genuine gap sample -> high.
    expect(analyzeTimeline(datedLineage(12, 27), 2026).confidence).toBe("high");

    // The shape of a real genealogy file: a long undated line hanging off a couple of dates.
    // Measured-looking but thin, and almost nothing recorded -> must report low, not medium.
    const people = [personRow({ id: 1, name: "S0", gender: 1, birthYear: 1900 })];
    const families = [];
    for (let i = 1; i < 40; i++) {
      people.push(
        personRow({ id: i + 1, name: `S${i}`, gender: 1, famc: 100 + i - 1 }),
      );
      families.push(familyRow({ id: 100 + i - 1, husband: i }));
    }
    const sparse = parseNodeFtt(buildNodeFtt(people, families)).tree;
    const timeline = analyzeTimeline(sparse, 2026);
    expect(timeline.gapIsFallback).toBe(true);
    expect(timeline.recordedBirthCount).toBe(1);
    expect(timeline.confidence).toBe("low");
  });

  it("is deterministic — the same tree and the same `now` give the same answer", () => {
    const t = threeGenerations();
    expect(analyzeTimeline(t, 2026)).toEqual(analyzeTimeline(t, 2026));
  });
});

describe("isPresumedLiving — the single shared rule", () => {
  const P = (o: Partial<Person> = {}): Person => ({
    id: "x",
    name: "X",
    gender: "unknown",
    notes: [],
    media: [],
    famsIds: [],
    ...o,
  });

  it("caps presumed life at 100 years, not 110", () => {
    expect(MAX_PLAUSIBLE_AGE).toBe(100);
    expect(isPresumedLiving(P({ birth: { id: "b", type: "birth", date: { year: 1900 } } }), 2026)).toBe(false);
    expect(isPresumedLiving(P({ birth: { id: "b", type: "birth", date: { year: 1990 } } }), 2026)).toBe(true);
  });

  it("treats a recorded death as decisive regardless of age", () => {
    expect(isPresumedLiving(P({ death: { id: "d", type: "death" } }), 2026)).toBe(false);
  });

  it("presumes someone with no dates at all is living", () => {
    expect(isPresumedLiving(P(), 2026)).toBe(true);
  });

  it("applies the cap to an ESTIMATED birth year, so undated people are still classified", () => {
    // This is what lets the timeline's estimates drive living/deceased for people whose own
    // records carry no dates at all.
    expect(isPresumedLiving(P(), 2026, 1850)).toBe(false);
    expect(isPresumedLiving(P(), 2026, 1990)).toBe(true);
  });

  it("prefers a person's OWN recorded birth year over any estimate passed in", () => {
    const person = P({ birth: { id: "b", type: "birth", date: { year: 1990 } } });
    expect(isPresumedLiving(person, 2026, 1850)).toBe(true);
  });
});
