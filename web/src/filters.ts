// Map filter state and pure helpers (unit tested).
import type { Bbox, FruitMarker, Kind } from "./api.ts";

/** Bounding box of the Czech Republic: [west, south, east, north]. */
export const CZECHIA_BBOX: Bbox = [12.09, 48.55, 18.86, 51.06];

/** The visible map area limited to the Czech Republic, or null when the view lies outside it. */
export function clampToCzechia(bbox: Bbox): Bbox | null {
  const [west, south, east, north] = bbox;
  const clamped: Bbox = [
    Math.max(west, CZECHIA_BBOX[0]),
    Math.max(south, CZECHIA_BBOX[1]),
    Math.min(east, CZECHIA_BBOX[2]),
    Math.min(north, CZECHIA_BBOX[3]),
  ];
  return clamped[0] < clamped[2] && clamped[1] < clamped[3] ? clamped : null;
}

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
