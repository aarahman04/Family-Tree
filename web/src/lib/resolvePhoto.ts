import type { FamilyTree, Person, UUID } from "../../../src/models/types.js";

export type PhotoQuality = "thumb" | "print";

/** The ONLY code that knows photos are data URIs today. Swap this to blob/file/remote URLs
 * later without touching the renderer, which only ever receives an opaque href string. */
export function resolvePhoto(person: Person, quality: PhotoQuality): string | undefined {
  return person.photo?.[quality];
}

export function photoAlt(person: Person): string {
  return person.photo?.alt ?? `Photo of ${person.name}`;
}

export function buildPhotoMap(tree: FamilyTree, quality: PhotoQuality): Map<UUID, string> {
  const map = new Map<UUID, string>();
  for (const [id, person] of Object.entries(tree.persons)) {
    const href = resolvePhoto(person, quality);
    if (href) map.set(id, href);
  }
  return map;
}
