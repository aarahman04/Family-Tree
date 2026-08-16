import { describe, expect, it } from "vitest";
import { buildSearchIndex, searchPeople } from "../../src/lib/search.js";
import { parseNodeFtt } from "../../../src/parser/index.js";
import { buildNodeFtt, personRow } from "../../../tests/helpers.js";

function tree() {
  return parseNodeFtt(
    buildNodeFtt(
      [
        personRow({ id: 100, name: "Mohammad Abdul Khadar" }),
        personRow({ id: 200, name: "Sheik imam", nickname: "OG" }),
        personRow({ id: 300, name: "" }),
      ],
      []
    )
  ).tree;
}

describe("search", () => {
  it("matches on partial name, case-insensitively", () => {
    const t = tree();
    const index = buildSearchIndex(t);
    const results = searchPeople(t, index, "abdul");
    expect(results.map((r) => r.label)).toContain("Mohammad Abdul Khadar");
  });

  it("matches on nickname", () => {
    const t = tree();
    const index = buildSearchIndex(t);
    const results = searchPeople(t, index, "og");
    expect(results.some((r) => r.label === "Sheik imam")).toBe(true);
  });

  it("matches on original FTZ ID", () => {
    const t = tree();
    const index = buildSearchIndex(t);
    const results = searchPeople(t, index, "100");
    expect(results.map((r) => r.label)).toContain("Mohammad Abdul Khadar");
  });

  it("matches on internal UUID", () => {
    const t = tree();
    const index = buildSearchIndex(t);
    const target = Object.values(t.persons).find((p) => p.name === "Sheik imam")!;
    const results = searchPeople(t, index, target.id);
    expect(results.map((r) => r.id)).toContain(target.id);
  });

  it("returns nothing for an empty query", () => {
    const t = tree();
    const index = buildSearchIndex(t);
    expect(searchPeople(t, index, "")).toHaveLength(0);
    expect(searchPeople(t, index, "   ")).toHaveLength(0);
  });

  it("labels a blank-name person as (no name) rather than an empty string", () => {
    const t = tree();
    const index = buildSearchIndex(t);
    const results = searchPeople(t, index, "300");
    expect(results.map((r) => r.label)).toContain("(no name)");
  });

  it("respects the result limit", () => {
    const rows = Array.from({ length: 30 }, (_, i) => personRow({ id: i + 1, name: "Match Me" }));
    const t = parseNodeFtt(buildNodeFtt(rows, [])).tree;
    const index = buildSearchIndex(t);
    expect(searchPeople(t, index, "match", 5)).toHaveLength(5);
  });
});
