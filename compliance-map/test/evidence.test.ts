import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { validateRecordedBatch } from "../src/server.js";

const load = (name: string) =>
  readFile(new URL(`../evidence/${name}`, import.meta.url));
const sha = (data: Uint8Array) =>
  createHash("sha256").update(data).digest("hex");

test("shipped reviewed evidence preserves annual fee provenance and two scoped decisions", async () => {
  const raw = JSON.parse(
    (await load("qualified-batch-report.json")).toString(),
  );
  const batch = validateRecordedBatch(raw);
  assert.equal(batch.status, "source_reviewed");
  assert.equal(batch.reports.length, 2);
  assert.equal(raw.qualification.accepted_steps, 31);
  assert.equal(raw.qualification.withheld.length, 2);
  assert.equal(raw.qualification.source_observations, 35);
  assert.equal(raw.qualification.source_pool_halted, true);
  assert.equal(
    sha(await load("official-source-audit.json")),
    raw.qualification.source_audit_sha256,
  );
  assert.equal(
    sha(await load("source-review/report.json")),
    raw.qualification.secondary_period_corroboration_sha256,
  );
  const normalized = JSON.parse(JSON.stringify(batch));
  assert.deepEqual(
    normalized.reports.map(
      (r: { decision: { recommendation: { shortlist: string[] } } }) =>
        r.decision.recommendation.shortlist,
    ),
    [["city-of-london", "dublin"], ["city-of-london"]],
  );
  for (const report of normalized.reports) {
    assert.deepEqual(
      report.recommendation.shortlist,
      report.decision.recommendation.shortlist,
    );
    for (const place of report.places) {
      assert.equal(place.total_cost, null);
      assert.equal(place.overall_time_to_approval, null);
      for (const step of place.steps) {
        assert.equal(step.claim_review.status, "supported");
        assert.ok(
          step.sources.every(
            (s: { checked_at?: string; quote_check: string }) =>
              s.checked_at && s.quote_check === "matched",
          ),
        );
      }
    }
  }
  const permit = normalized.reports[0].places
    .find((p: { id: string }) => p.id === "new-york-city")
    .steps.find((s: { id: string }) => s.id === "nyc-cafe-fse-permit");
  assert.equal(permit.costs[0].amount, 280);
  assert.equal(permit.costs[0].period, "annual");
  assert.equal(
    permit.costs[0].period_corroboration.method,
    "ordinary_https_source_review",
  );
  assert.equal(permit.costs[0].period_corroboration.quote, "Annually");
});
