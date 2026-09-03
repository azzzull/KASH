import { strict as assert } from "node:assert";
import { createReportPeriod, reportQueryRange } from "../src/lib/reportPeriod.ts";

function specificMonth(year: number, month: number) {
  return createReportPeriod({ preset: "specific_month", year, month, label: "fixture" });
}

const august = specificMonth(2026, 7);
assert.deepEqual({ start: august.start, end: august.end }, { start: "2026-08-01", end: "2026-08-31" });
const augustRange = reportQueryRange(august);
const inRange = (timestamp: string) => timestamp >= augustRange.start && timestamp < augustRange.endExclusive;
assert.equal(inRange("2026-07-31T16:59:00.000Z"), false, "31 Jul 23:59 WIB must be excluded");
assert.equal(inRange("2026-07-31T17:00:00.000Z"), true, "01 Aug 00:00 WIB must be included");
assert.equal(inRange("2026-08-31T16:59:00.000Z"), true, "31 Aug 23:59 WIB must be included");
assert.equal(inRange("2026-08-31T17:00:00.000Z"), false, "01 Sep 00:00 WIB must be excluded");
assert.deepEqual([specificMonth(2026, 1).start, specificMonth(2026, 1).end], ["2026-02-01", "2026-02-28"]);
assert.deepEqual([specificMonth(2026, 3).start, specificMonth(2026, 3).end], ["2026-04-01", "2026-04-30"]);
assert.deepEqual([specificMonth(2026, 11).start, specificMonth(2026, 11).end], ["2026-12-01", "2026-12-31"]);
assert.deepEqual([specificMonth(2027, 0).start, specificMonth(2027, 0).end], ["2027-01-01", "2027-01-31"]);
console.log("Report-period fixtures: PASS");
