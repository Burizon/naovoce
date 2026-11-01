import { describe, expect, test } from "bun:test";
import type { CalendarRow } from "./api.ts";
import {
  activeMonths,
  daysUntil,
  defaultMonth,
  describeStart,
  describeTypical,
  harvestInMonth,
  shortDate,
  typicalMonths,
} from "./seasons.ts";

const row = (kind: string, months: number[], reports: Record<number, number> = {}): CalendarRow => ({
  kind,
  name: kind,
  col: "000000",
  cls: "Trees",
  count: 1,
  typical: [{ part: "plody", start: months[0] ?? 1, duration: months.length, months }],
  ripe_reports_by_month: Array.from({ length: 12 }, (_, index) => reports[index + 1] ?? 0),
});

describe("seasons helpers", () => {
  test("typical months union", () => {
    const months = typicalMonths([
      { part: "květy", start: 5, duration: 2, months: [5, 6] },
      { part: "plody", start: 8, duration: 2, months: [8, 9] },
    ]);
    expect([...months]).toEqual([5, 6, 8, 9]);
  });

  test("typical season description, also over New Year", () => {
    expect(describeTypical({ part: "plody", start: 6, duration: 2, months: [6, 7] })).toBe("červen–červenec");
    expect(describeTypical({ part: "plody", start: 11, duration: 3, months: [11, 12, 1] })).toBe(
      "listopad–leden",
    );
    expect(describeTypical({ part: "plody", start: 10, duration: 1, months: [10] })).toBe("říjen");
  });

  test("short Czech date", () => {
    expect(shortDate("2026-06-12")).toBe("12. 6.");
  });

  test("days until and start description", () => {
    const today = new Date(2026, 5, 20);
    expect(daysUntil("2026-06-25", today)).toBe(5);
    expect(daysUntil("2026-06-01", today)).toBe(-19);
    const window = { part: "plody", source: "typical" as const };
    expect(describeStart({ ...window, start: "2026-06-01", end: "2026-07-31" }, today)).toBe("právě probíhá");
    expect(describeStart({ ...window, start: "2026-06-21", end: "2026-07-31" }, today)).toBe("začíná zítra");
    expect(describeStart({ ...window, start: "2026-06-23", end: "2026-07-31" }, today)).toBe("začíná za 3 dny");
    expect(describeStart({ ...window, start: "2026-07-20", end: "2026-07-31" }, today)).toBe("začíná za 30 dní");
    expect(describeStart({ ...window, start: "2026-05-01", end: "2026-05-31" }, today)).toBe("letos skončila");
  });
});

describe("calendar months", () => {
  const rows = [row("Třešeň", [6, 7], { 5: 3, 6: 10 }), row("Rybíz", [5, 6]), row("Trnka", [10, 11])];

  test("only months with a harvest or reports are shown", () => {
    expect(activeMonths(rows)).toEqual([5, 6, 7, 10, 11]);
  });

  test("a month lists typical kinds first, then kinds known from reports", () => {
    const may = harvestInMonth(rows, 5);
    expect(may.map((entry) => [entry.row.kind, entry.typical, entry.reports])).toEqual([
      ["Rybíz", true, 0],
      ["Třešeň", false, 3],
    ]);
  });

  test("default month is the current one or the next with a harvest", () => {
    expect(defaultMonth([5, 6, 7, 10, 11], new Date(2026, 9, 3))).toBe(10);
    expect(defaultMonth([5, 6, 7, 10, 11], new Date(2026, 7, 3))).toBe(10);
    expect(defaultMonth([5, 6, 7, 10, 11], new Date(2026, 11, 3))).toBe(5);
  });
});
