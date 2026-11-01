import { describe, expect, test } from "bun:test";
import type { FruitMarker, Kind } from "./api.ts";
import {
  NO_FILTERS,
  countByKind,
  isFiltered,
  kindTiles,
  toggleKind,
  visibleMarkers,
} from "./filters.ts";

const marker = (id: number, kind: string): FruitMarker => ({ id, kind, lat: "50", lng: "14", time: "", url: "" });
const markers = [marker(1, "a1"), marker(2, "a1"), marker(3, "b2")];
const kinds = new Map<string, Kind>([
  ["a1", { key: "a1", name: "Jabloň", col: "E73932", cls: "Trees" }],
  ["b2", { key: "b2", name: "Švestka", col: "3973B9", cls: "Trees" }],
  ["c3", { key: "c3", name: "Mandloň", col: "FFFFFF", cls: "Nuts" }],
]);

describe("map filters", () => {
  test("no filter shows the whole map", () => {
    expect(isFiltered(NO_FILTERS)).toBe(false);
    expect(visibleMarkers(markers, NO_FILTERS)).toHaveLength(3);
  });

  test("kinds toggle on and off", () => {
    const one = toggleKind(NO_FILTERS, "b2");
    expect(isFiltered(one)).toBe(true);
    expect(visibleMarkers(markers, one).map((item) => item.id)).toEqual([3]);
    expect(isFiltered(toggleKind(one, "b2"))).toBe(false);
  });

  test("month or ripe filter counts as filtered", () => {
    expect(isFiltered({ ...NO_FILTERS, month: 7 })).toBe(true);
    expect(isFiltered({ ...NO_FILTERS, ripeOnly: true })).toBe(true);
  });

  test("kind tiles: only kinds with places, most common first, search ignores diacritics", () => {
    const counts = countByKind(markers);
    expect(kindTiles(kinds, counts).map((kind) => kind.key)).toEqual(["a1", "b2"]);
    expect(kindTiles(kinds, counts, "svest").map((kind) => kind.key)).toEqual(["b2"]);
  });
});
