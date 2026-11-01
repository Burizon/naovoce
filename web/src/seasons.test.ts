import { describe, expect, test } from "bun:test";
import { daysUntil, describeStart, describeTypical, shortDate, typicalMonths } from "./seasons.ts";

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
