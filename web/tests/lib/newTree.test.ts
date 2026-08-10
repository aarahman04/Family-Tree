import { describe, expect, it } from "vitest";
import { buildNewTree, parseDateInput } from "../../src/lib/newTree.js";

describe("parseDateInput", () => {
  it("parses a full date and rejects junk", () => {
    expect(parseDateInput("1980-06-15")).toEqual({ year: 1980, month: 6, day: 15 });
    expect(parseDateInput("")).toBeUndefined();
    expect(parseDateInput("1980")).toBeUndefined();
  });
});

describe("buildNewTree", () => {
  it("creates a valid manual tree with one root person", () => {
    const tree = buildNewTree({
      name: "The Example Family",
      description: "A test tree",
      person: {
        firstName: "Ada",
        lastName: "Example",
        gender: "female",
        birthDate: "1815-12-10",
        living: false,
        deathDate: "1852-11-27",
        notes: "First programmer",
      },
    });

    expect(tree.metadata.sourceFormat).toBe("manual");
    expect(tree.metadata.name).toBe("The Example Family");
    expect(tree.metadata.description).toBe("A test tree");
    expect(tree.metadata.createdAt).toBeTruthy();

    const people = Object.values(tree.persons);
    expect(people).toHaveLength(1);
    const root = people[0]!;
    expect(root.name).toBe("Ada Example");
    expect(root.gender).toBe("female");
    expect(root.birth?.date).toEqual({ year: 1815, month: 12, day: 10 });
    expect(root.death?.date).toEqual({ year: 1852, month: 11, day: 27 });
    expect(root.notes.map((n) => n.text)).toContain("First programmer");
    expect(tree.validation.isValid).toBe(true);
  });

  it("omits the death event when the person is marked living", () => {
    const tree = buildNewTree({
      name: "Living Tree",
      person: {
        firstName: "Grace",
        lastName: "Hopper",
        gender: "female",
        living: true,
        deathDate: "2000-01-01", // ignored because living is true
      },
    });
    const root = Object.values(tree.persons)[0]!;
    expect(root.death).toBeUndefined();
  });
});
