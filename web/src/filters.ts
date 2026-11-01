// Map filter state and pure helpers (unit tested).
import type { FruitMarker, Kind } from "./api.ts";

export interface Filters {
  /** Selected kind keys; empty means all kinds. */
  kinds: ReadonlySet<string>;
  /** Harvest month 1–12, or null for the whole year. */
  month: number | null;
  /** Only plants people reported ripe in the last days. */
  ripeOnly: boolean;
}

export const NO_FILTERS: Filters = { kinds: new Set(), month: null, ripeOnly: false };

export function isFiltered(filters: Filters): boolean {
  return filters.kinds.size > 0 || filters.month !== null || filters.ripeOnly;
}

export function toggleKind(filters: Filters, key: string): Filters {
  const kinds = new Set(filters.kinds);
  if (kinds.has(key)) kinds.delete(key);
  else kinds.add(key);
  return { ...filters, kinds };
}

export function visibleMarkers(markers: readonly FruitMarker[], filters: Filters): FruitMarker[] {
  return filters.kinds.size === 0 ? [...markers] : markers.filter((marker) => filters.kinds.has(marker.kind));
}

/** Number of places per kind key. */
export function countByKind(markers: readonly FruitMarker[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const marker of markers) counts.set(marker.kind, (counts.get(marker.kind) ?? 0) + 1);
  return counts;
}

/** Kinds that have places, most common first; a search narrows them by name. */
export function kindTiles(kinds: ReadonlyMap<string, Kind>, counts: ReadonlyMap<string, number>, search = ""): Kind[] {
  const query = normalize(search);
  return [...kinds.values()]
    .filter((kind) => (counts.get(kind.key) ?? 0) > 0 && (!query || normalize(kind.name).includes(query)))
    .sort((a, b) => (counts.get(b.key) ?? 0) - (counts.get(a.key) ?? 0) || a.name.localeCompare(b.name, "cs"));
}

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}
