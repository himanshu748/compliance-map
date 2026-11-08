import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDecisionSummary,
  type DecisionStep,
  type DecisionPlace,
  type DecisionReport,
} from "../src/decision.js";

// All records and URLs below are synthetic fixtures, not live government rules.
const url = "https://www.gov.uk/synthetic-decision-fixture",
  date = "2026-11-08T10:00:00.000Z";
function step(
  id: string,
  amount: number | null = 10,
  overrides: Partial<DecisionStep> = {},
): DecisionStep {
  return {
    id,
    kind: "licence",
    requirement: `Synthetic ${id} obligation`,
    costs: [
      {
        amount,
        currency: "GBP",
        period: "one_time",
        scope: `Synthetic ${id} fee`,
      },
    ],
    time: {
      minimum_days: null,
      maximum_days: null,
      unit: "unspecified",
      kind: "unknown",
      conditions: "Synthetic timing not established.",
    },
    renewal: { description: null, interval_months: null },
    ongoing_filings: [],
    sources: [{ url, quote_check: "matched", checked_at: date, quote: null }],
    claim_review: {
      status: "supported",
      checked_at: date,
      source_urls: [url],
      applicability: "required",
      obligation_key: id,
    },
    ...overrides,
  };
}
const place = (steps: DecisionStep[], id = "alpha"): DecisionPlace => ({
  id,
  name: `Synthetic ${id}`,
  steps,
  unknowns: [],
});
const report = (steps: DecisionStep[]): DecisionReport => ({
  activity: { id: "synthetic", label: "Synthetic test activity" },
  places: [place(steps)],
});
const first = (steps: DecisionStep[]) =>
  buildDecisionSummary(report(steps)).places[0]!;

test("known subtotals use exact decimals and retain stable cost refs; they never become complete totals", () => {
  const input = report([step("first", 0.1), step("second", 0.2)]),
    before = structuredClone(input),
    r = buildDecisionSummary(input),
    p = r.places[0]!,
    fee = p.known_fee_subtotals[0]!;
  assert.equal(fee.subtotal_decimal, "0.3");
  assert.equal(fee.subtotal, 0.3);
  assert.equal(fee.complete, false);
  assert.deepEqual(fee.cost_refs, [
    "alpha/first/costs/0",
    "alpha/second/costs/0",
  ]);
  assert.equal(p.total_cost, null);
  assert.equal(p.total_cost_status, "unknown");
  assert.deepEqual(input, before);
  assert.equal(
    r.dimensions.find((d) => d.key === "total_cost")!.places[0]!.status,
    "unknown",
  );
});
test("currencies and payment periods remain separate; unknown fees are not zero", () => {
  const p = first([
    step("gbp", 10),
    step("usd", 20, {
      costs: [
        {
          amount: 20,
          currency: "USD",
          period: "one_time",
          scope: "Synthetic US fee",
        },
      ],
    }),
    step("annual", 30, {
      costs: [
        {
          amount: 30,
          currency: "GBP",
          period: "annual",
          scope: "Synthetic annual fee",
        },
      ],
    }),
    step("missing", null),
  ]);
  assert.deepEqual(
    p.known_fee_subtotals.map((s) => [
      s.currency,
      s.period,
      s.subtotal_decimal,
    ]),
    [
      ["GBP", "annual", "30"],
      ["GBP", "one_time", "10"],
      ["USD", "one_time", "20"],
    ],
  );
  assert.equal(p.unknown_cost_count, 1);
  assert.equal(
    p.known_fee_subtotals.find(
      (s) => s.currency === "GBP" && s.period === "one_time",
    )!.unknown_cost_count,
    1,
  );
});
test("conditional, optional and out-of-scope lines cannot inflate required sums, including cost overrides", () => {
  const required = step("base", 10),
    conditional = step("conditional", 50),
    optional = step("optional", 70),
    outside = step("outside", 900);
  conditional.claim_review!.applicability = "conditional";
  conditional.costs = [{ ...conditional.costs[0]!, applicability: "required" }];
  optional.claim_review!.applicability = "optional";
  outside.claim_review!.applicability = "outside_scope";
  outside.costs = [{ ...outside.costs[0]!, applicability: "required" }];
  const p = first([required, conditional, optional, outside]);
  assert.equal(p.known_fee_subtotals[0]!.subtotal_decimal, "10");
  assert.equal(p.conditional_fee_subtotals[0]!.subtotal_decimal, "50");
  assert.equal(p.optional_fee_subtotals[0]!.subtotal_decimal, "70");
  assert.deepEqual(p.outside_scope_step_ids, ["outside"]);
  assert.equal(p.cost_gaps.length, 0);
});
test("a supported claim still needs a dated matched source explicitly included in its semantic review", () => {
  const steps = [
    step("unreviewed"),
    step("unchecked"),
    step("undated"),
    step("wrong-source"),
    step("spoof"),
  ];
  steps[0]!.claim_review!.status = "not_checked";
  steps[1]!.sources = [{ url, quote_check: "not_checked", checked_at: date }];
  steps[2]!.sources = [{ url, quote_check: "matched", checked_at: null }];
  steps[3]!.claim_review!.source_urls = ["https://www.gov.uk/different"];
  steps[4]!.sources = [
    {
      url: "https://www.gov.uk.attacker.example/",
      quote_check: "matched",
      checked_at: date,
    },
  ];
  steps[4]!.claim_review!.source_urls = [
    "https://www.gov.uk.attacker.example/",
  ];
  const p = first(steps);
  assert.equal(p.known_fee_subtotals.length, 0);
  assert.equal(p.unreviewed_step_ids.length, 5);
  assert.equal(p.unknown_cost_count, 5);
});
test("reviewed duplicate charge identities deduplicate; conflicting or ambiguous identities withhold the subtotal", () => {
  const a = step("first-filing", 100, { kind: "filing" }),
    b = step("same-filing", 100, { kind: "tax" });
  a.claim_review!.obligation_key = "same-obligation";
  b.claim_review!.obligation_key = "same-obligation";
  const p = first([a, b]);
  assert.equal(p.known_fee_subtotals[0]!.subtotal_decimal, "100");
  assert.equal(p.known_fee_subtotals[0]!.components.length, 1);
  assert.equal(p.known_fee_subtotals[0]!.components[0]!.cost_refs.length, 2);
  b.costs = [{ ...b.costs[0]!, amount: 120 }];
  assert.equal(first([a, b]).known_fee_subtotals[0]!.subtotal_decimal, null);
  delete a.claim_review!.obligation_key;
  delete b.claim_review!.obligation_key;
  const ambiguous = first([a, b]).known_fee_subtotals[0]!;
  assert.equal(ambiguous.subtotal_decimal, null);
  assert.match(ambiguous.withheld_reasons.join(" "), /identity/);
});
test("mutually exclusive alternatives are not summed, even across payment periods", () => {
  const s = step("training", null, {
    costs: [
      {
        amount: 24,
        currency: "USD",
        period: "one_time",
        scope: "Online synthetic option",
        alternative_group: "training-mode",
      },
      {
        amount: 114,
        currency: "USD",
        period: "annual",
        scope: "Classroom synthetic option",
        alternative_group: "training-mode",
      },
    ],
  });
  const fees = first([s]).known_fee_subtotals;
  assert.equal(fees.length, 2);
  assert.ok(fees.every((f) => f.subtotal_decimal === null));
  assert.ok(
    fees.every((f) =>
      f.withheld_reasons.some((r) => r.includes("alternatives")),
    ),
  );
});
test("numeric cost with unknown applicability, unknown period or unsafe amount is withheld and counted", () => {
  const a = step("unknown-app", 10, {
      costs: [
        {
          amount: 10,
          currency: "GBP",
          period: "one_time",
          scope: "Synthetic conditionality unknown",
          applicability: "unknown",
        },
      ],
    }),
    b = step("unknown-period", 5, {
      costs: [
        {
          amount: 5,
          currency: "GBP",
          period: "unknown",
          scope: "Synthetic period unknown",
        },
      ],
    }),
    c = step("invalid", -1);
  const p = first([a, b, c]);
  assert.equal(p.known_fee_subtotals.length, 0);
  assert.equal(p.unknown_cost_count, 3);
});
test("notice, approval and estimate timings remain separate and are never added or ranked together", () => {
  const a = step("notice"),
    b = step("approval"),
    c = step("estimate");
  a.time = {
    minimum_days: 28,
    maximum_days: 28,
    unit: "calendar",
    kind: "notice",
    conditions: "Synthetic advance notice.",
  };
  b.time = {
    minimum_days: 5,
    maximum_days: 10,
    unit: "business",
    kind: "approval",
    conditions: "Synthetic approval after review.",
  };
  c.time = {
    minimum_days: 3,
    maximum_days: 5,
    unit: "unspecified",
    kind: "estimate",
    conditions: "Synthetic estimate only.",
  };
  const p = first([a, b, c]);
  assert.deepEqual(
    p.timing_milestones.map((t) => [t.kind, t.unit, t.minimum_days]),
    [
      ["notice", "calendar", 28],
      ["approval", "business", 5],
      ["estimate", "unspecified", 3],
    ],
  );
  assert.equal(p.overall_time_to_approval, null);
});
function registration(id: string, days: number): DecisionStep {
  const s = step(id, 0);
  s.claim_review!.decision_role = "registration";
  s.claim_review!.obligation_key = "synthetic-registration";
  s.time = {
    minimum_days: days,
    maximum_days: days,
    unit: "calendar",
    kind: "notice",
    conditions: "Synthetic exact same scoped registration.",
  };
  s.renewal = { description: "Synthetic annual renewal.", interval_months: 12 };
  return s;
}
test("only an explicitly comparable reviewed registration milestone can support a narrow preference", () => {
  const input: DecisionReport = {
    places: [
      place([registration("alpha-reg", 5)], "alpha"),
      place([registration("beta-reg", 28)], "beta"),
    ],
  };
  const r = buildDecisionSummary(input);
  assert.equal(r.recommendation.status, "scoped_preference");
  assert.deepEqual(r.recommendation.shortlist, ["alpha"]);
  assert.match(r.recommendation.scope, /not overall opening/);
  assert.match(r.recommendation.reasons.join(" "), /Synthetic beta/);
  input.places[1]!.steps[0]!.costs = [
    {
      amount: 0,
      currency: "USD",
      period: "one_time",
      scope: "Synthetic different currency",
    },
  ];
  assert.equal(
    buildDecisionSummary(input).recommendation.status,
    "scoped_preference",
  );
});
test("unverified, conditional and mismatched-unit routes cannot produce a timing preference", () => {
  for (const alter of [
    (s: DecisionStep) => {
      s.claim_review!.status = "not_checked";
    },
    (s: DecisionStep) => {
      s.claim_review!.applicability = "conditional";
    },
    (s: DecisionStep) => {
      s.time.unit = "business";
    },
  ]) {
    const a = registration("alpha-reg", 5),
      b = registration("beta-reg", 28);
    alter(b);
    assert.equal(
      buildDecisionSummary({
        places: [place([a], "alpha"), place([b], "beta")],
      }).recommendation.status,
      "insufficient_evidence",
    );
  }
});
test("all places have the same aligned dimensions and absent coverage stays unknown", () => {
  const r = buildDecisionSummary({
    places: [
      place([step("filing", 10, { kind: "filing" })], "alpha"),
      place([], "beta"),
    ],
  });
  assert.ok(r.dimensions.every((d) => d.places.length === 2));
  assert.equal(
    r.dimensions.find((d) => d.key === "filing")!.places[1]!.status,
    "unknown",
  );
  assert.equal(r.recommendation.status, "insufficient_evidence");
  assert.throws(
    () =>
      buildDecisionSummary({ places: [place([step("same"), step("same")])] }),
    /Unique/,
  );
});

test("timing preference names different fees and unknown renewals as trade-offs instead of vetoing the timing fact", () => {
  const a = registration("alpha-reg", 5),
    b = registration("beta-reg", 28);
  b.costs = [
    {
      amount: 280,
      currency: "USD",
      period: "annual",
      scope: "Synthetic annual registration charge",
    },
  ];
  a.renewal = { description: null, interval_months: null };
  const r = buildDecisionSummary(
    { places: [place([a], "alpha"), place([b], "beta")] },
    { priority: "timing_clarity" },
  );
  assert.deepEqual(r.recommendation.shortlist, ["alpha"]);
  assert.equal(r.recommendation.status, "scoped_preference");
  assert.match(
    r.recommendation.tradeoffs[1]!.items.join(" "),
    /USD 280 \/ annual/,
  );
  assert.match(
    r.recommendation.tradeoffs[0]!.items.join(" "),
    /renewal terms.*not established/,
  );
});
test("zero registration fees versus positive fees support a scoped choice without FX or total setup-cost ranking", () => {
  const a = registration("alpha-reg", 28),
    b = registration("beta-reg", 22),
    c = registration("gamma-reg", 5);
  b.costs = [
    {
      amount: 280,
      currency: "USD",
      period: "annual",
      scope: "Synthetic permit registration fee",
    },
  ];
  c.costs = [
    {
      amount: 0,
      currency: "EUR",
      period: "one_time",
      scope: "Synthetic free notification",
    },
  ];
  const r = buildDecisionSummary(
    { places: [place([a], "alpha"), place([b], "beta"), place([c], "gamma")] },
    { priority: "cost_clarity" },
  );
  assert.deepEqual(r.recommendation.shortlist, ["alpha", "gamma"]);
  assert.match(r.recommendation.scope, /not total setup cost/);
  assert.match(r.recommendation.reasons.join(" "), /USD 280 \/ annual/);
  assert.match(r.recommendation.reasons.join(" "), /no currency conversion/);
  assert.ok(r.places.every((p) => p.total_cost === null));
});
test("unknown, conditional and alternative charges never become a zero-registration-fee recommendation", () => {
  for (const alter of [
    (s: DecisionStep) => {
      s.costs = [{ ...s.costs[0]!, amount: null }];
    },
    (s: DecisionStep) => {
      s.claim_review!.applicability = "conditional";
    },
    (s: DecisionStep) => {
      s.costs = [{ ...s.costs[0]!, alternative_group: "unselected-option" }];
    },
    (s: DecisionStep) => {
      s.costs = [
        ...s.costs,
        {
          amount: 20,
          currency: "GBP",
          period: "one_time",
          scope: "Synthetic applicability unknown",
          applicability: "unknown",
        },
      ];
    },
  ]) {
    const a = registration("alpha-reg", 5),
      b = registration("beta-reg", 28);
    b.costs = [{ ...b.costs[0]!, amount: 100 }];
    alter(a);
    assert.equal(
      buildDecisionSummary(
        { places: [place([a], "alpha"), place([b], "beta")] },
        { priority: "cost_clarity" },
      ).recommendation.status,
      "insufficient_evidence",
    );
  }
});
test("positive charges in different currencies are not ranked by numeric magnitude", () => {
  const a = registration("alpha-reg", 5),
    b = registration("beta-reg", 28);
  a.costs = [{ ...a.costs[0]!, amount: 20 }];
  b.costs = [{ ...b.costs[0]!, amount: 10, currency: "USD" }];
  assert.equal(
    buildDecisionSummary(
      { places: [place([a], "alpha"), place([b], "beta")] },
      { priority: "cost_clarity" },
    ).recommendation.status,
    "insufficient_evidence",
  );
});
test("affirmative reviewed trade-before-registration rule supports due diligence without zero-day opening or inferred prohibitions elsewhere", () => {
  const a = registration("alpha-reg", 5),
    b = registration("beta-reg", 28);
  a.claim_review!.applicability = "conditional";
  a.claim_review!.registration_start_rule = "may_trade_before_registration";
  a.claim_review!.conditions = [
    "Synthetic tax registration required above a documented threshold.",
  ];
  a.time = {
    minimum_days: null,
    maximum_days: null,
    kind: "unknown",
    unit: "unspecified",
    conditions: "Synthetic trade-before-registration expressly permitted.",
  };
  b.time = {
    minimum_days: null,
    maximum_days: null,
    kind: "unknown",
    unit: "unspecified",
    conditions: "Synthetic sequence not established.",
  };
  const input = { places: [place([a], "alpha"), place([b], "beta")] },
    r = buildDecisionSummary(input, { priority: "timing_clarity" });
  assert.equal(r.recommendation.status, "scoped_preference");
  assert.deepEqual(r.recommendation.shortlist, ["alpha"]);
  assert.match(r.recommendation.scope, /no zero-day/);
  assert.match(
    r.recommendation.reasons.join(" "),
    /does not establish that other places prohibit/,
  );
  assert.equal(r.places[0]!.overall_time_to_approval, null);
  a.claim_review!.status = "not_checked";
  assert.equal(
    buildDecisionSummary(input, { priority: "timing_clarity" }).recommendation
      .status,
    "insufficient_evidence",
  );
});
test("estimates and unquantified before-operation conditions do not become shorter legal waits", () => {
  for (const alter of [
    (s: DecisionStep) => {
      s.time.kind = "estimate";
    },
    (s: DecisionStep) => {
      s.time.minimum_days = null;
      s.time.maximum_days = null;
      s.time.conditions = "Synthetic before operating, no quantity.";
    },
    (s: DecisionStep) => {
      s.time.kind = "approval";
    },
  ]) {
    const a = registration("alpha-reg", 5),
      b = registration("beta-reg", 28);
    alter(a);
    assert.equal(
      buildDecisionSummary(
        { places: [place([a], "alpha"), place([b], "beta")] },
        { priority: "timing_clarity" },
      ).recommendation.status,
      "insufficient_evidence",
    );
  }
});
test("stated priority selects a narrow advantage and notice minimums never become total durations", () => {
  const a = registration("alpha-reg", 28),
    b = registration("beta-reg", 5);
  a.time.maximum_days = null;
  b.time.maximum_days = null;
  b.costs = [{ ...b.costs[0]!, amount: 100 }];
  const input: DecisionReport = {
    recommendation: { priority: "cost_clarity" },
    places: [place([a], "alpha"), place([b], "beta")],
  };
  assert.deepEqual(buildDecisionSummary(input).recommendation.shortlist, [
    "alpha",
  ]);
  const timing = buildDecisionSummary(input, { priority: "timing_clarity" });
  assert.deepEqual(timing.recommendation.shortlist, ["beta"]);
  assert.match(timing.recommendation.scope, /minimum advance-notice/);
  assert.equal(timing.places[1]!.overall_time_to_approval, null);
});
