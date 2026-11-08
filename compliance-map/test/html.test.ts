import test from "node:test";
import assert from "node:assert/strict";
import { Script } from "node:vm";
import { load } from "cheerio";
import { renderGeneralComplianceHtml } from "../src/html.js";
import { complianceBatchResult, demonstrationBatch } from "../src/general.js";
import type { ResearchReceipt } from "../../providers/research.js";
import { serial, safeLink } from "../web/view.js";

test("script JSON preserves exact exported data while preventing script termination", () => {
  const data = {
    text: "<b>text</b></script><img src=x>",
    separator: "\u2028\u2029",
    literal: "\\u003c",
  };
  const embedded = serial(data);
  assert.equal(embedded.includes("<"), false);
  assert.equal(embedded.includes("\u2028"), false);
  assert.equal(embedded.includes("\u2029"), false);
  assert.deepEqual(JSON.parse(embedded), data);
});

test("v2 view preserves both activities, raw JSON, source links and deliberately missing excerpts", () => {
  // Synthetic parser/render fixture only. These URLs and requirements are not live evidence.
  const input = structuredClone(demonstrationBatch);
  const reports = input.activities.map((activity) => ({
    activity_id: activity.id,
    places: input.places.map((place) => ({
      place_id: place.id,
      steps: [
        {
          id: "synthetic-filing",
          kind: "filing",
          requirement: "Synthetic <b>filing</b> fixture",
          authority: "Synthetic fixture authority",
          costs: [],
          time: {
            minimum_days: null,
            maximum_days: null,
            unit: "unspecified",
            kind: "unknown",
            conditions: "Synthetic only.",
          },
          renewal: { description: null, interval_months: null },
          ongoing_filings: [],
          sources: [
            {
              url: "https://www.revenue.ie/en/synthetic-fixture",
              quote:
                "Synthetic fixture excerpt only; no real government rule is asserted in this test.",
              published_on: null,
              observed_at: "2026-11-08T07:30:00.000Z",
            },
          ],
        },
      ],
      unknowns: ["Synthetic fixture; no live validation."],
    })),
    limitations: ["Synthetic fixture only."],
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
    citations: ["https://www.revenue.ie/en/synthetic-fixture"],
    termination_reason: "planner_done",
    warnings: [],
  };
  const batch = complianceBatchResult(input, receipt);
  const html = renderGeneralComplianceHtml(batch, { liveEnabled: false }),
    $ = load(html);
  assert.equal($("[data-report]").length, 2);
  assert.equal($('[data-report="0"] .place').length, 3);
  assert.equal($('[data-report="1"] .place').length, 3);
  assert.equal($("[data-activity-tab]").length, 2);
  assert.equal($('[data-report="1"]').prop("hidden"), true);
  assert.equal($("b").length, 0);
  assert.match($(".fact-value").first().text(), /<b>filing<\/b>/);
  assert.ok(
    $('a[href="https://www.revenue.ie/en/synthetic-fixture"]').length > 0,
  );
  assert.match($(".source").last().text(), /Excerpt not retained/);
  assert.doesNotMatch($(".source").text(), /“null”/);
  assert.deepEqual(JSON.parse($("#initial-report").text()), batch);
  assert.equal($("#fresh").prop("disabled"), true);
  assert.equal($('[aria-live="polite"]').length, 1);
  // Parse actual emitted client code. This is a syntax check, not a browser interaction claim.
  assert.doesNotThrow(() => new Script($("script:not([type])").text()));
});

test("source controls only link to supported public official hosts", () => {
  assert.equal(
    safeLink("https://www.revenue.ie/en/example"),
    "https://www.revenue.ie/en/example",
  );
  assert.equal(safeLink("https://cro.ie/example"), "https://cro.ie/example");
  for (const url of [
    "javascript:alert(1)",
    "https://www.gov.uk.evil.example/",
    "http://127.0.0.1/",
    "https://user:secret@www.gov.uk/",
  ]) {
    assert.equal(safeLink(url), null);
  }
});
