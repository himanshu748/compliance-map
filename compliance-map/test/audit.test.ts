import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  auditComplianceBatch,
  type OfficialClaimReview,
  type OfficialObservation,
  type PriorPeriodCorroboration,
} from "../src/audit.js";
import { demonstrationBatch } from "../src/general.js";
import type { ResearchReceipt } from "../../providers/research.js";

const digest = (text: string) =>
  createHash("sha256").update(text).digest("hex");
function fixture() {
  const input = structuredClone(demonstrationBatch);
  input.activities = input.activities.slice(0, 1);
  const text =
    "Synthetic fixture only. Registration costs £231. Register 28 days before opening. Renew each year. Keep annual records.";
  const url = "https://www.gov.uk/synthetic-audit-test",
    checked = "2026-11-08T12:01:00.000Z",
    observed = "2026-11-08T12:00:00.000Z";
  const steps = input.places.map((place) => ({
    id: place.id + "-test-registration",
    kind: "filing" as const,
    requirement: "Synthetic registration test, not an actual rule.",
    authority: "Synthetic official-source fixture",
    costs: [
      {
        amount: 231,
        currency: "GBP",
        period: "one_time" as const,
        scope: "Synthetic test only",
      },
    ],
    time: {
      minimum_days: 28,
      maximum_days: null as number | null,
      unit: "unspecified" as const,
      kind: "notice" as const,
      conditions: "Synthetic test notice",
    },
    renewal: {
      description: "Synthetic yearly renewal.",
      interval_months: 12 as number | null,
    },
    ongoing_filings: ["Synthetic records only."],
    sources: [{ url, quote: text, published_on: null, observed_at: observed }],
  }));
  const model = {
    reports: [
      {
        activity_id: input.activities[0]!.id,
        places: input.places.map((p, i) => ({
          place_id: p.id,
          steps: [steps[i]!],
          unknowns: ["Synthetic test only."],
        })),
        limitations: ["Synthetic fixture, not a government rule."],
      },
    ],
  };
  const original = JSON.stringify(model);
  const receipt: ResearchReceipt = {
    provider: "tinyfish-research",
    mode: "deep",
    research_run_id: "b92e9410-5568-4c9c-94d2-6476ca67ae38",
    reservation_id: "5348a874-4f4b-45f1-a6c4-081be337bb22",
    reserved_microusd: 2000000,
    status: "COMPLETED",
    recorded_at: "2026-11-08T11:00:00.000Z",
    result: original,
    citations: [url],
    termination_reason: "planner_done",
    warnings: [],
  };
  const reviews: Record<string, OfficialClaimReview> = Object.fromEntries(
    steps.map((s) => [
      s.id,
      {
        status: "supported",
        checked_at: checked,
        notes: ["Explicit synthetic test field review."],
        source_urls: [url],
        applicability: "required",
        conditions: ["Synthetic fixture only."],
        obligation_key: "test-registration",
        fields_reviewed: [
          "requirement",
          "costs",
          "time",
          "renewal",
          "ongoing_filings",
        ],
        cost_treatments: [
          {
            index: 0,
            applicability: "required",
            alternative_group: null,
            obligation_key: "test-registration",
          },
        ],
      },
    ]),
  );
  const observations: OfficialObservation[] = [
    {
      url,
      final_url: url,
      observed_at: observed,
      reservation_id: "09cdeccc-dc20-48fd-8daa-b9ee5b38375b",
      text_sha256: digest(text),
      text,
    },
  ];
  const args = {
    input,
    receipt,
    reviewed_model: model,
    reviews,
    observations,
    evidence_mode: "synthetic_fixture" as const,
    original_receipt_sha256: digest(original),
  };
  return { args, steps, model, reviews, observations, receipt };
}
test("excerpt matches alone never substitute for interpretation and complete field review", () => {
  const f = fixture();
  f.reviews[f.steps[0]!.id]!.status = "unreviewed";
  f.reviews[f.steps[1]!.id]!.fields_reviewed = [
    "requirement",
    "requirement",
    "time",
    "renewal",
    "ongoing_filings",
  ];
  const report = auditComplianceBatch(f.args);
  assert.equal(report.qualification.accepted_steps, 1);
  assert.equal(report.qualification.withheld.length, 2);
  assert.equal(report.reports[0]!.places[0]!.steps.length, 0);
});

test("a supported review cannot certify an absent excerpt or an unused source identity", () => {
  const f = fixture();
  f.steps[0]!.sources[0]!.quote +=
    " This extra sentence is absent from the recorded page.";
  f.reviews[f.steps[1]!.id]!.source_urls.push(
    "https://www.gov.uk/unobserved-synthetic-source",
  );
  const report = auditComplianceBatch(f.args);
  assert.equal(report.qualification.accepted_steps, 1);
  assert.equal(report.qualification.withheld.length, 2);
  assert.ok(
    report.qualification.withheld.some((s) =>
      s.reason.includes("excerpt not found"),
    ),
  );
  assert.ok(
    report.qualification.withheld.some((s) =>
      s.reason.includes("source identities differ"),
    ),
  );
});
test("reviewed fees ending in sentence punctuation survive without accepting a different numeric amount", () => {
  const f = fixture();
  f.steps[1]!.costs[0]!.amount = 2310;
  const report = auditComplianceBatch(f.args);
  assert.equal(report.reports[0]!.places[0]!.steps[0]!.costs[0]!.amount, 231);
  assert.equal(report.reports[0]!.places[1]!.steps.length, 0);
  assert.equal(report.qualification.withheld[0]!.reason, "Unsupported amount");
});
test("typed time, unstated calendar units and unsupported renewal intervals are withheld", () => {
  const f = fixture();
  f.steps[0]!.time.minimum_days = 1;
  Object.assign(f.steps[1]!.time, { unit: "calendar" });
  f.steps[2]!.renewal.interval_months = 6;
  const report = auditComplianceBatch(f.args);
  assert.equal(report.qualification.accepted_steps, 0);
  assert.equal(report.qualification.withheld.length, 3);
});
test("changed bodies, redirects and unrelated activity identities cannot become audited evidence", () => {
  const f = fixture();
  f.observations[0]!.text += " altered";
  assert.throws(() => auditComplianceBatch(f.args), /identity or digest/);
  const redirected = fixture();
  redirected.observations[0]!.final_url += "/different";
  assert.throws(
    () => auditComplianceBatch(redirected.args),
    /identity or digest/,
  );
  const foreign = fixture();
  foreign.steps[0]!.id = "invented-requirement";
  assert.throws(() => auditComplianceBatch(foreign.args), /original Research/);
});
test("the shared page excerpt budget preserves hashes and source checks when later quotes are withheld", () => {
  const f = fixture(),
    report = auditComplianceBatch(f.args);
  const sources = report.reports[0]!.places.flatMap((p) =>
    p.steps.flatMap((s) => s.sources),
  );
  assert.ok(
    sources.reduce((n, s) => n + (s.quote?.split(/\s+/).length ?? 0), 0) <= 25,
  );
  assert.equal(sources.at(-1)!.quote, null);
  assert.equal(sources.at(-1)!.quote_check, "matched");
  assert.equal(sources.at(-1)!.text_sha256, f.observations[0]!.text_sha256);
  assert.equal(report.provider_run_id, f.receipt.research_run_id);
  assert.equal(f.receipt.result, JSON.stringify(f.model));
});
test("omitted original requirements stay in the audit trail and old reviews cannot claim new observations", () => {
  const f = fixture();
  f.model.reports[0]!.places[0]!.steps = [];
  f.reviews[f.steps[1]!.id]!.checked_at = "2026-11-08T11:59:00.000Z";
  const report = auditComplianceBatch(f.args);
  assert.equal(report.qualification.original_steps, 3);
  assert.equal(report.qualification.accepted_steps, 1);
  assert.equal(report.qualification.withheld.length, 2);
  assert.ok(
    report.qualification.withheld.some((s) => s.step_id === f.steps[0]!.id),
  );
  assert.equal(report.reports[0]!.places[2]!.total_cost, null);
});

function annualFixture() {
  const f = fixture();
  const text =
    "Synthetic fixture only. Registration costs £231. Register 28 days before opening. Renew each year.";
  f.observations[0]!.text = text;
  f.observations[0]!.text_sha256 = digest(text);
  for (const step of f.steps) step.sources[0]!.quote = text;
  Object.assign(f.steps[0]!.costs[0]!, { period: "annual" });
  const corroboration: PriorPeriodCorroboration = {
    step_id: f.steps[0]!.id,
    cost_index: 0,
    amount: 231,
    currency: "GBP",
    period: "annual",
    method: "ordinary_https_source_review",
    artifact: "source-review/report.json",
    artifact_sha256: digest("synthetic earlier report"),
    fact_id: "permit-fee",
    source_url: f.observations[0]!.url,
    checked_at: "2026-11-08T11:30:00.000Z",
    text_sha256: digest("synthetic earlier full-page text"),
    quote: "Annually",
    quote_check: "matched",
  };
  return { ...f, corroboration };
}

test("earlier matched annual-fee corroboration stays separate from current source-body observations", () => {
  const f = annualFixture();
  assert.equal(auditComplianceBatch(f.args).qualification.accepted_steps, 2);
  const report = auditComplianceBatch({
    ...f.args,
    prior_period_corroborations: [f.corroboration],
  });
  assert.equal(report.qualification.accepted_steps, 3);
  assert.equal(report.qualification.source_observations, 1);
  assert.equal(report.qualification.secondary_ordinary_https_period_checks, 1);
  const cost = report.reports[0]!.places[0]!.steps[0]!.costs[0]!;
  assert.equal(cost.period, "annual");
  assert.equal(
    cost.period_corroboration?.method,
    "ordinary_https_source_review",
  );
  assert.equal(
    cost.period_corroboration?.text_sha256,
    f.corroboration.text_sha256,
  );
  assert.notEqual(
    cost.period_corroboration?.text_sha256,
    f.observations[0]!.text_sha256,
  );
  const quoted = report.reports[0]!.places.flatMap((p) =>
    p.steps.flatMap((s) => s.sources.map((source) => source.quote)),
  );
  assert.ok(
    quoted.reduce((n, quote) => n + (quote?.split(/\s+/).length ?? 0), 1) <= 25,
  );
});

test("a prior period check cannot certify a different fee, URL or unmatched receipt", () => {
  const f = annualFixture();
  for (const changed of [
    { ...f.corroboration, amount: 999 },
    { ...f.corroboration, source_url: "https://www.gov.uk/a-different-source" },
  ]) {
    const report = auditComplianceBatch({
      ...f.args,
      prior_period_corroborations: [changed],
    });
    assert.equal(report.reports[0]!.places[0]!.steps.length, 0);
    assert.ok(
      report.qualification.withheld.some((step) =>
        step.reason.includes("corroboration does not match"),
      ),
    );
  }
  assert.throws(() =>
    auditComplianceBatch({
      ...f.args,
      prior_period_corroborations: [
        {
          ...f.corroboration,
          quote_check: "not_found",
        } as unknown as PriorPeriodCorroboration,
      ],
    }),
  );
});
