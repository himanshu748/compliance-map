import test from "node:test";
import assert from "node:assert/strict";
import {
  ComplianceBatch,
  GeneralComplianceInput,
  complianceBatchQuery,
  complianceBatchResult,
  demonstrationBatch,
} from "../src/general.js";
import type { ResearchReceipt } from "../../providers/research.js";
function fixture() {
  const input = structuredClone(demonstrationBatch);
  const reports = input.activities.map((activity) => ({
    activity_id: activity.id,
    places: input.places.map((place) => ({
      place_id: place.id,
      steps: [
        {
          id: "business-registration",
          kind: "filing",
          requirement:
            "Synthetic test registration requirement, not legal guidance.",
          authority: "Synthetic official-source fixture",
          costs: [
            {
              amount: 0,
              currency: "GBP",
              period: "one_time",
              scope: "Synthetic test only",
            },
          ],
          time: {
            minimum_days: 28,
            maximum_days: 28,
            unit: "unspecified",
            kind: "notice",
            conditions: "Synthetic fixture notice",
          },
          renewal: { description: null, interval_months: null },
          ongoing_filings: [],
          sources: [
            {
              url:
                "https://www.gov.uk/synthetic-test/" +
                activity.id +
                "/" +
                place.id,
              quote: "Registration is free. Register 28 days before opening.",
              published_on: null,
              observed_at: "2026-11-08T07:30:00.000Z",
            },
          ],
        },
      ],
      unknowns: ["Synthetic fixture only; no actual government rule asserted."],
    })),
    limitations: ["Synthetic test report."],
  }));
  const receipt: ResearchReceipt = {
    provider: "tinyfish-research",
    mode: "deep",
    research_run_id: "fd47be78-e9c3-4ef0-95a2-df7bb96f030b",
    reservation_id: "da64e75a-68f5-4da4-a94e-e6203b786567",
    reserved_microusd: 2000000,
    status: "COMPLETED",
    recorded_at: "2026-11-08T07:30:00.000Z",
    result: JSON.stringify({ reports }),
    citations: reports.flatMap((r) =>
      r.places.flatMap((p) =>
        p.steps.flatMap((s) => s.sources.map((c) => c.url)),
      ),
    ),
    termination_reason: "planner_done",
    warnings: [],
  };
  return { input, reports, receipt };
}
test("activity and at least three places are genuine inputs; one query contains both demo activities", () => {
  const f = fixture();
  assert.equal(ComplianceBatch.safeParse(f.input).success, true);
  const q = complianceBatchQuery(f.input);
  assert.match(q, /ONE batched/);
  assert.match(q, /software consultancy/);
  assert.match(q, /café/);
  assert.ok(q.length < 10000);
  assert.equal(
    GeneralComplianceInput.safeParse({
      activity: f.input.activities[0],
      places: f.input.places.slice(0, 2),
      priority: "coverage",
    }).success,
    false,
  );
  const different = structuredClone(f.input);
  different.activities = [
    {
      id: "drone-service",
      label: "Drone photography service",
      description:
        "Start a commercial aerial photography service using small drones.",
      exclusions: [],
    },
  ];
  different.places = [
    {
      id: "seattle",
      name: "Seattle",
      region: "Washington",
      country: "United States",
    },
    { id: "austin", name: "Austin", region: "Texas", country: "United States" },
    {
      id: "portland",
      name: "Portland",
      region: "Oregon",
      country: "United States",
    },
  ];
  const other = complianceBatchQuery(different);
  assert.match(other, /Drone photography/);
  assert.doesNotMatch(other, /fixed-premises|Square Mile|Dublin/);
});
test("one receipt yields two distinct activity comparisons with fees, timing, renewal and filing gaps aligned", () => {
  const f = fixture(),
    r = complianceBatchResult(f.input, f.receipt);
  assert.equal(r.provider_jobs, 1);
  assert.equal(r.reports.length, 2);
  assert.ok(r.reports.every((a) => a.places.length === 3));
  assert.ok(
    r.reports.every((a) =>
      a.places.every(
        (p) =>
          p.steps.length === 1 &&
          p.total_cost === null &&
          p.overall_time_to_approval === null,
      ),
    ),
  );
  assert.ok(
    r.reports.every((a) =>
      a.places.every(
        (p) =>
          p.unknowns.some((u) => u.includes("Renewal")) &&
          p.unknowns.some((u) => u.includes("Ongoing")),
      ),
    ),
  );
  assert.ok(r.reports.every((a) => a.recommendation.shortlist.length === 3));
});
test("missing activities, spoofed official hosts and mismatched day counts never become complete results", () => {
  const f = fixture();
  assert.equal(
    complianceBatchResult(f.input, {
      ...f.receipt,
      result: JSON.stringify({ reports: f.reports.slice(0, 1) }),
    }).status,
    "unresolved",
  );
  const report = f.reports[0]!;
  report.places[0]!.steps[0]!.time.minimum_days = 1;
  report.places[0]!.steps[0]!.time.maximum_days = 1;
  report.places[1]!.steps[0]!.sources[0]!.url =
    "https://www.gov.uk.attacker.example/rule";
  const result = complianceBatchResult(f.input, {
    ...f.receipt,
    result: JSON.stringify({ reports: f.reports }),
  });
  assert.equal(result.reports[0]!.places[0]!.steps.length, 0);
  assert.equal(result.reports[0]!.places[1]!.steps.length, 0);
  assert.ok(
    result.reports[0]!.places[0]!.unknowns.some((u) =>
      u.includes("Withheld requirement"),
    ),
  );
});
test("long bounded requirements survive while quoted exports respect a shared per-page budget", () => {
  const f = fixture(),
    first = f.reports[0]!.places[0]!.steps[0]!,
    second = f.reports[1]!.places[0]!.steps[0]!;
  const wording =
    "Synthetic conditional registration requirement with its scope retained. ".repeat(
      12,
    );
  first.requirement = wording;
  first.sources[0]!.quote =
    "Registration is free. Register28days before opening. " +
    Array(40).fill("context").join(" ");
  first.sources[0]!.quote = first.sources[0]!.quote.replace(
    "Register28days",
    "Register 28 days",
  );
  second.sources[0]!.url = first.sources[0]!.url;
  const report = complianceBatchResult(f.input, {
    ...f.receipt,
    result: JSON.stringify({ reports: f.reports }),
  });
  const a = report.reports[0]!.places[0]!.steps[0]!,
    b = report.reports[1]!.places[0]!.steps[0]!;
  assert.equal(a.requirement, wording);
  assert.equal(a.sources[0]!.quote?.split(/\s+/).length, 25);
  assert.equal(a.sources[0]!.quote_excerpt_status, "truncated");
  assert.equal(b.sources[0]!.quote, null);
  assert.equal(b.sources[0]!.quote_excerpt_status, "withheld");
  assert.equal(
    b.sources[0]!.quote_withheld_reason,
    "per_page_25_word_export_limit",
  );
});
