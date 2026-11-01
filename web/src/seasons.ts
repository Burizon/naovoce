// Presentation helpers for harvest seasons; pure functions with unit tests.
import type { SeasonStatus, TypicalSeason, Window, WindowSource } from "./api.ts";

export const MONTHS_SHORT = ["led", "úno", "bře", "dub", "kvě", "čvn", "čvc", "srp", "zář", "říj", "lis", "pro"];
export const MONTHS = [
  "leden",
  "únor",
  "březen",
  "duben",
  "květen",
  "červen",
  "červenec",
  "srpen",
  "září",
  "říjen",
  "listopad",
  "prosinec",
];

export const STATUS_LABEL: Record<SeasonStatus, string> = {
  ripe: "Zralé podle hlášení",
  over: "Po sezóně podle hlášení",
  unripe: "Zatím nezralé podle hlášení",
  in_season: "Teď je sezóna",
  soon: "Sezóna se blíží",
  off: "Mimo sezónu",
  unknown: "Sezóna zatím neznámá",
};

export const SOURCE_LABEL: Record<WindowSource, string> = {
  reported: "podle letošních hlášení",
  observed: "podle hlášení z minulých let",
  typical: "podle typické sezóny druhu",
};

/** Months (1–12) covered by the typical seasons, in calendar order. */
export function typicalMonths(seasons: readonly TypicalSeason[]): Set<number> {
  return new Set(seasons.flatMap((season) => season.months));
}

/** "červen–červenec" or "září–listopad" for one typical season. */
export function describeTypical(season: TypicalSeason): string {
  const first = season.months[0];
  const last = season.months[season.months.length - 1];
  if (first === undefined || last === undefined) return "";
  const name = (month: number) => MONTHS[month - 1] ?? "";
  return first === last ? name(first) : `${name(first)}–${name(last)}`;
}

/** Czech short date "12. 6." from an ISO date. */
export function shortDate(iso: string): string {
  const [, month, day] = iso.split("-").map(Number);
  return `${day}. ${month}.`;
}

export function describeWindow(window: Window): string {
  return `${shortDate(window.start)} – ${shortDate(window.end)}`;
}

/** Whole days from `today` to the ISO date (negative when in the past). */
export function daysUntil(iso: string, today: Date = new Date()): number {
  const [year, month, day] = iso.split("-").map(Number);
  const target = Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1);
  const base = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((target - base) / 86_400_000);
}

/** Human description of when a window starts relative to today. */
export function describeStart(window: Window, today: Date = new Date()): string {
  const days = daysUntil(window.start, today);
  const end = daysUntil(window.end, today);
  if (days <= 0 && end >= 0) return "právě probíhá";
  if (end < 0) return "letos skončila";
  if (days === 1) return "začíná zítra";
  if (days < 5) return `začíná za ${days} dny`;
  return `začíná za ${days} dní`;
}

/** Hex color "#RRGGBB" from the API's "RRGGBB". */
export const kindColor = (col: string): string => `#${col.replace(/^#/, "")}`;
