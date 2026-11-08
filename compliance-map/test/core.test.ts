import test from "node:test";
import assert from "node:assert/strict";
import { load } from "cheerio";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ResearchReceipt } from "../../providers/research.js";
import {
  complianceQuery,
  complianceResult,
  ModelReport,
  officialUrl,
  type ComplianceInput,
} from "../src/core.js";
import { sourceReviewReport } from "../src/reviewed.js";
import { corroborateSources } from "../src/sources.js";
import { renderComplianceHtml } from "../src/html.js";

const input: ComplianceInput = {
  business: "fixed-premises-cafe",
  priority: "registration_fee",
  scope_confirmed: true,
};
const observed = "2026-11-08T07:15:10.000Z";
function fixture() {
  const example = sourceReviewReport();
  const model = {
    scenario: "fixed-premises-cafe",
    jurisdictions: example.jurisdictions.map((p) => ({
      id: p.id,
      unknowns: p.unknowns,
      facts: p.facts.map((f) => ({
        ...f,
        sources: f.sources.map(
          ({ quote_check: _q, checked_at: _c, text_sha256: _h, ...s }) => s,
        ),
      })),
    })),
    limitations: [
      "Synthetic provider transport fixture derived from the separately labeled public-source review.",
    ],
  };
  const receipt: ResearchReceipt = {
    provider: "tinyfish-research",
    mode: "deep",
    research_run_id: "82c21858-d31f-4eb1-9183-9238a02ae1bd",
    reservation_id: "aa8cad4b-354c-42bc-a16d-99cde32cba8e",
    reserved_microusd: 2000000,
    status: "COMPLETED",
    recorded_at: observed,
    result: JSON.stringify(model),
    citations: [
      ...new Set(
        example.jurisdictions.flatMap((p) =>
          p.facts.flatMap((f) => f.sources.map((s) => s.url)),
        ),
      ),
    ],
    termination_reason: "planner_done",
    warnings: [],
  };
  return { model, receipt };
}

test("the query fixes three distinct places and scope and uses current corrected source URLs", () => {
  const query = complianceQuery(input);
  assert.match(query, /Square Mile/);
  assert.match(query, /NOT Greater London/);
  assert.match(query, /Dublin/);
  assert.match(query, /New York City/);
  assert.match(query, /No alcohol, outdoor seating/);
  assert.match(
    query,
    /business-standards\/food-safety\/food-premises-registration/,
  );
  assert.doesNotMatch(
    query,
    /environmental-health\/food-safety\/food-business-registration/,
  );
  assert.throws(() =>
    complianceQuery({
      ...input,
      scope_confirmed: false,
    } as unknown as ComplianceInput),
  );
  assert.throws(() =>
    complianceQuery({
      ...input,
      business: "bar",
    } as unknown as ComplianceInput),
  );
});

test("fees retain scope, period and currency; typical Dublin processing is never a legal opening promise", () => {
  const { receipt } = fixture(),
    report = complianceResult(input, receipt);
  assert.equal(report.status, "research_candidate");
  assert.equal(report.jurisdictions.length, 3);
  const fee = report.jurisdictions[1]!.facts.find(
    (f) => f.category === "fee",
  )!.value;
  assert.deepEqual(
    fee.type === "fee" && [fee.amount, fee.currency, fee.period],
    [280, "USD", "annual"],
  );
  assert.deepEqual(report.recommendation.shortlist, [
    "city-of-london",
    "dublin",
  ]);
  assert.ok(
    report.jurisdictions.every((p) =>
      p.facts.every((f) =>
        f.sources.every((s) => s.quote_check === "not_checked"),
      ),
    ),
  );
  const timing = complianceResult(
    { ...input, priority: "timing_clarity" },
    receipt,
  );
  assert.deepEqual(timing.recommendation.shortlist, [
    "city-of-london",
    "new-york-city",
  ]);
  assert.match(
    timing.recommendation.explanation,
    /not comparable opening dates/,
  );
  assert.match(timing.recommendation.caveat, /No overall easiest/);
  assert.equal(
    report.jurisdictions[2]!.facts.find((f) => f.id === "processing-estimate")
      ?.value.type,
    "timing",
  );
});

test("malformed JSON, repeated/missing jurisdictions and invalid typed facts produce unresolved reports without a fixture fallback", () => {
  for (const mutate of [
    (m: ReturnType<typeof fixture>["model"]) => {
      m.jurisdictions.pop();
    },
    (m: ReturnType<typeof fixture>["model"]) => {
      m.jurisdictions[1]!.id = "city-of-london";
    },
    (m: ReturnType<typeof fixture>["model"]) => {
      m.jurisdictions[0]!.facts[0]!.category = "fee";
    },
  ]) {
    const f = fixture();
    mutate(f.model);
    const report = complianceResult(input, {
      ...f.receipt,
      result: JSON.stringify(f.model),
    });
    assert.equal(report.status, "unresolved");
    assert.ok(report.jurisdictions.every((p) => p.facts.length === 0));
    assert.equal(report.recommendation.shortlist.length, 0);
  }
  const f = fixture();
  assert.equal(
    complianceResult(input, { ...f.receipt, result: "not JSON" }).status,
    "unresolved",
  );
  assert.ok(
    complianceResult(input, {
      ...f.receipt,
      status: "FAILED",
      result: null,
    }).jurisdictions.every((p) => p.facts.length === 0),
  );
});

test("official host, citation, date and currency checks withhold unsupported facts", () => {
  const mutations = [
    (m: ReturnType<typeof fixture>["model"]) => {
      m.jurisdictions[0]!.facts[0]!.sources[0]!.url =
        "https://www.cityoflondon.gov.uk.attacker.example/food";
    },
    (m: ReturnType<typeof fixture>["model"]) => {
      m.jurisdictions[0]!.facts[0]!.sources[0]!.observed_at =
        "2026-12-01T00:00:00.000Z";
    },
    (m: ReturnType<typeof fixture>["model"]) => {
      m.jurisdictions[0]!.facts[0]!.sources[0]!.observed_at =
        "2026-01-01T00:00:00.000Z";
    },
  ];
  for (const mutate of mutations) {
    const f = fixture();
    mutate(f.model);
    const report = complianceResult(input, {
      ...f.receipt,
      result: JSON.stringify(f.model),
    });
    assert.ok(
      !report.jurisdictions[0]!.facts.some((v) => v.id === "food-registration"),
    );
    assert.ok(
      report.jurisdictions[0]!.unknowns.some((v) =>
        v.includes("Withheld fact"),
      ),
    );
  }
  const f = fixture();
  const fee = f.model.jurisdictions[0]!.facts[1]!.value;
  if (fee.type === "fee") fee.currency = "USD";
  assert.ok(
    !complianceResult(input, {
      ...f.receipt,
      result: JSON.stringify(f.model),
    }).jurisdictions[0]!.facts.some((v) => v.category === "fee"),
  );
  assert.throws(() =>
    officialUrl("https://www.nyc.gov/private?token=secret", "new-york-city"),
  );
  assert.throws(() => officialUrl("https://www.nyc.gov/food", "dublin"));
  const uncited = complianceResult(input, {
    ...fixture().receipt,
    citations: [],
  });
  assert.ok(uncited.jurisdictions.every((p) => !p.facts.length));
});

test("quote budgets count canonical URLs and reject excessive source extraction", () => {
  const f = fixture();
  f.model.jurisdictions[0]!.facts[0]!.sources[0]!.quote = Array(26)
    .fill("word")
    .join(" ");
  assert.equal(ModelReport.safeParse(f.model).success, false);
  const alias = fixture();
  alias.model.jurisdictions[0]!.facts[0]!.sources[0]!.quote = Array(20)
    .fill("word")
    .join(" ");
  alias.model.jurisdictions[0]!.facts[0]!.sources[0]!.url += "?view=1";
  assert.equal(ModelReport.safeParse(alias.model).success, false);
});

test("a contradictory fee amount or typical-time quote cannot manufacture a better recommendation", () => {
  const f = fixture();
  const fee = f.model.jurisdictions[1]!.facts.find(
    (v) => v.id === "permit-fee",
  )!.value;
  if (fee.type === "fee") fee.amount = 0;
  const processing = f.model.jurisdictions[2]!.facts.find(
    (v) => v.id === "processing-estimate",
  )!.value;
  if (processing.type === "timing") processing.kind = "operation_route";
  const report = complianceResult(
    { ...input, priority: "timing_clarity" },
    { ...f.receipt, result: JSON.stringify(f.model) },
  );
  assert.ok(!report.jurisdictions[1]!.facts.some((v) => v.id === "permit-fee"));
  assert.ok(
    !report.jurisdictions[2]!.facts.some((v) => v.id === "processing-estimate"),
  );
  assert.ok(!report.recommendation.shortlist.includes("dublin"));
});

test("typed legal day counts must match a day quantity in the supporting excerpt", () => {
  const f = fixture();
  const timing = f.model.jurisdictions[0]!.facts.find(
    (v) => v.id === "advance-notice",
  )!.value;
  if (timing.type === "timing") {
    timing.days_min = 1;
    timing.days_max = 1;
  }
  const report = complianceResult(
    { ...input, priority: "timing_clarity" },
    { ...f.receipt, result: JSON.stringify(f.model) },
  );
  assert.ok(
    !report.jurisdictions[0]!.facts.some((v) => v.id === "advance-notice"),
  );
  assert.ok(!report.recommendation.shortlist.includes("city-of-london"));
  assert.ok(
    report.jurisdictions[0]!.unknowns.some((v) =>
      v.includes("Withheld fact advance-notice"),
    ),
  );
});

test("source corroboration fetches each official page once and only claims exact text matches", async () => {
  const report = sourceReviewReport(),
    pages = new Map<string, string[]>();
  for (const p of report.jurisdictions)
    for (const f of p.facts)
      for (const s of f.sources)
        pages.set(s.url, [...(pages.get(s.url) ?? []), s.quote]);
  let calls = 0;
  const checked = await corroborateSources(report, {
    clock: () => Date.parse(observed),
    request: async (url, init) => {
      calls++;
      assert.equal(init?.redirect, "error");
      assert.equal(new Headers(init?.headers).get("X-API-Key"), null);
      return new Response(
        "<html><body>" +
          pages.get(String(url))!.join("<br>") +
          "</body></html>",
        { headers: { "content-type": "text/html" } },
      );
    },
  });
  assert.equal(calls, 4);
  assert.ok(
    checked.jurisdictions.every((p) =>
      p.facts.every((f) =>
        f.sources.every(
          (s) => s.quote_check === "matched" && s.text_sha256?.length === 64,
        ),
      ),
    ),
  );
  assert.ok(
    report.jurisdictions.every((p) =>
      p.facts.every((f) =>
        f.sources.every((s) => s.quote_check === "not_checked"),
      ),
    ),
  );
  const missing = await corroborateSources(report, {
    request: async () =>
      new Response("<html><body>Unrelated text</body></html>", {
        headers: { "content-type": "text/html" },
      }),
  });
  assert.equal(missing.recommendation.shortlist.length, 0);
  assert.ok(
    missing.limitations.some((l) => l.includes("could not be corroborated")),
  );
});

test("failed, redirected and oversized official page reads remain unverified and cannot support a recommendation", async () => {
  for (const request of [
    async () => {
      throw new Error("network failure");
    },
    async () => new Response("", { status: 302 }),
    async () =>
      new Response("x".repeat(1_500_001), {
        headers: { "content-type": "text/html" },
      }),
  ]) {
    const report = await corroborateSources(sourceReviewReport(), { request });
    assert.equal(report.recommendation.shortlist.length, 0);
    assert.ok(
      report.jurisdictions.every((p) =>
        p.facts.every((f) =>
          f.sources.every((s) => s.quote_check === "fetch_failed"),
        ),
      ),
    );
  }
});

test("HTML escapes research text and embedded JSON, with labels, reduced motion and disabled paid controls", () => {
  const report = sourceReviewReport();
  report.jurisdictions[0]!.facts[0]!.claim =
    "</script><img src=x onerror=alert(1)>";
  report.jurisdictions[0]!.facts[0]!.sources[0]!.url = "javascript:alert(1)";
  const html = renderComplianceHtml(report),
    $ = load(html);
  assert.equal($("img").length, 0);
  assert.equal($('a[href^="javascript:"]').length, 0);
  assert.ok($("#fresh").is(":disabled"));
  assert.equal($("select#priority").length, 1);
  assert.ok($('label[for="priority"]').length);
  assert.equal($('[aria-live="polite"]').length, 1);
  assert.match(html, /prefers-reduced-motion/);
  assert.match(html, /:focus-visible/);
  assert.equal($(".place").length, 3);
  assert.equal(JSON.parse($("#initial-report").text()).provider_run_id, null);
});

test("the documented offline CLI builds a real usable HTML/JSON bundle and refuses overwrite", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "compliance-cli-offline-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const args = [
    "--import",
    "tsx",
    "compliance-map/src/cli.ts",
    "source-review",
    join(dir, "review"),
  ];
  const result = await promisify(execFile)(process.execPath, args, {
    cwd: process.cwd(),
    env: { ...process.env, BOUNTY_POOL_LIVE: "0" },
  });
  assert.match(result.stdout, /TinyResearch calls: 0/);
  const report = JSON.parse(
    await readFile(join(dir, "review", "report.json"), "utf8"),
  );
  assert.equal(report.evidence_mode, "source_review");
  assert.equal(report.provider_run_id, null);
  assert.equal(report.jurisdictions.length, 3);
  assert.match(
    await readFile(join(dir, "review", "index.html"), "utf8"),
    /Compare the routes/,
  );
  await assert.rejects(
    promisify(execFile)(process.execPath, args, { cwd: process.cwd() }),
  );
});
