import { readFile, open, rename } from "node:fs/promises";
import { join, isAbsolute } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import {
  auditComplianceBatch,
  type OfficialClaimReview,
  type OfficialObservation,
  type PriorPeriodCorroboration,
} from "../src/audit.js";
import { buildDecisionSummary } from "../src/decision.js";
import type { ResearchReceipt } from "../../providers/research.js";
import { ComplianceBatch } from "../src/general.js";

const [reviewDirectory, batchDirectory] = process.argv.slice(2);
const replaceDerived = process.argv[4] === "--replace-derived";
if (
  !reviewDirectory ||
  !batchDirectory ||
  !isAbsolute(reviewDirectory) ||
  !isAbsolute(batchDirectory)
)
  throw new Error(
    "Use explicit absolute existing private review and original-batch directories.",
  );
const digest = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
const receiptBytes = await readFile(
  join(batchDirectory, "original-receipt.json"),
);
const receipt = JSON.parse(receiptBytes.toString("utf8")) as ResearchReceipt;
const request = JSON.parse(
  await readFile(join(batchDirectory, "request.json"), "utf8"),
) as { input: unknown };
const modelBytes = await readFile(join(reviewDirectory, "reviewed-model.json")),
  reviewBytes = await readFile(join(reviewDirectory, "claim-reviews.json"));
// This is an earlier actual ordinary-HTTPS check, not a reconstructed TinyFish body.
const priorReviewBytes = await readFile(
  "compliance-map/evidence/source-review/report.json",
);
const priorReview = JSON.parse(priorReviewBytes.toString("utf8")) as {
  jurisdictions: {
    id: string;
    facts: {
      id: string;
      claim: string;
      value: {
        type: string;
        amount?: number;
        currency?: string;
        period?: string;
      };
      sources: {
        url: string;
        quote: string;
        quote_check: string;
        checked_at: string | null;
        text_sha256: string | null;
      }[];
    }[];
  }[];
};
const fee = priorReview.jurisdictions
  .find((place) => place.id === "new-york-city")
  ?.facts.find((fact) => fact.id === "permit-fee");
const annual = fee?.sources.find(
  (source) => source.quote === "Annually" && source.quote_check === "matched",
);
const amount = fee?.sources.find(
  (source) => source.quote === "$280.00" && source.quote_check === "matched",
);
const permitUrl =
  "https://nyc-business.nyc.gov/nycbusiness/description/food-service-establishment-permit";
if (
  !fee ||
  fee.value.type !== "fee" ||
  fee.value.amount !== 280 ||
  fee.value.currency !== "USD" ||
  fee.value.period !== "annual" ||
  !/280 annually/i.test(fee.claim) ||
  !annual?.checked_at ||
  !annual.text_sha256 ||
  !amount ||
  amount.url !== permitUrl ||
  annual.url !== permitUrl ||
  amount.checked_at !== annual.checked_at ||
  amount.text_sha256 !== annual.text_sha256
)
  throw new Error(
    "The existing dated NYC annual-fee corroboration is incomplete or inconsistent",
  );
const priorPeriods: PriorPeriodCorroboration[] = [
  {
    step_id: "nyc-cafe-fse-permit",
    cost_index: 0,
    amount: 280,
    currency: "USD",
    period: "annual",
    method: "ordinary_https_source_review",
    artifact: "source-review/report.json",
    artifact_sha256: digest(priorReviewBytes),
    fact_id: "permit-fee",
    source_url: permitUrl,
    checked_at: annual.checked_at,
    text_sha256: annual.text_sha256,
    quote: "Annually",
    quote_check: "matched",
  },
];
const report = auditComplianceBatch({
  input: ComplianceBatch.parse(request.input),
  receipt,
  original_receipt_sha256: digest(receiptBytes),
  reviewed_model: JSON.parse(modelBytes.toString("utf8")),
  reviews: JSON.parse(reviewBytes.toString("utf8")) as Record<
    string,
    OfficialClaimReview
  >,
  observations: JSON.parse(
    await readFile(join(reviewDirectory, "observations.json"), "utf8"),
  ) as OfficialObservation[],
  evidence_mode: "saved_live",
  prior_period_corroborations: priorPeriods,
});
const decisions = report.reports.map((activity) =>
  buildDecisionSummary(activity),
);
const auditBytes = await readFile(
    "compliance-map/evidence/official-source-audit.json",
  ),
  audit = JSON.parse(auditBytes.toString("utf8")) as {
    distinct_source_checks: number;
    halted: boolean;
    outcomes: { status: string }[];
  };
const qualified = {
  ...report,
  reports: report.reports.map((activity, index) => {
    const decision = decisions[index]!;
    return {
      ...activity,
      decision,
      recommendation: {
        ...activity.recommendation,
        shortlist: decision.recommendation.shortlist,
        explanation: [
          decision.recommendation.scope,
          ...decision.recommendation.reasons,
        ].join(" "),
        tradeoffs: decision.recommendation.tradeoffs.map((p) => ({
          place_id: p.place_id,
          unresolved: p.items,
        })),
      },
    };
  }),
  qualification: {
    ...report.qualification,
    reviewed_model_sha256: digest(modelBytes),
    claim_reviews_sha256: digest(reviewBytes),
    source_audit_file: "official-source-audit.json",
    source_audit_sha256: digest(auditBytes),
    source_operations: audit.distinct_source_checks,
    source_pool_halted: audit.halted,
    new_paid_jobs: 0,
    prior_ordinary_https_period_checks: {
      count: report.qualification.secondary_ordinary_https_period_checks,
      artifact: "source-review/report.json",
      artifact_sha256: digest(priorReviewBytes),
      checked_at: annual.checked_at,
      method: "ordinary_https_source_review",
      included_in_tinyfish_fetch_counts: false,
    },
    secondary_period_corroboration_file: "source-review/report.json",
    secondary_period_corroboration_sha256: digest(priorReviewBytes),
  },
};
const criteria = {
  format: "compliance-map-criterion-evidence-v1",
  checked_at: new Date().toISOString(),
  scope:
    "Backend/source evidence only; the parent owns current UI, packaging and publication checks.",
  brief: {
    source: "https://www.tinybounties.com/",
    captured_on: "2026-11-08",
    capture:
      "work/all-bounties/research/current-portal/compliance-map-full.txt",
  },
  original_research_run_id: receipt.research_run_id,
  original_receipt_sha256: digest(receiptBytes),
  source_evidence: {
    artifact: "official-source-audit.json",
    distinct_operations: audit.distinct_source_checks,
    retrieved: audit.outcomes.filter((s) => s.status === "fetched").length,
    uncorroborated: audit.outcomes.filter((s) => s.status !== "fetched").length,
    pool_halted: audit.halted,
    retries: 0,
    new_paid_jobs: 0,
    prior_ordinary_https_period_checks:
      qualified.qualification.prior_ordinary_https_period_checks,
  },
  requirements: [
    {
      id: "S1",
      requirement: "Activity and at least three places are inputs",
      status: "verified",
      evidence: ["src/general.ts", "test/general.test.ts"],
      limits:
        "Actual live demonstrations use the same three places; different-place query behavior is tested locally.",
    },
    {
      id: "S2",
      requirement: "Requirements come from official government sources",
      status: "verified_with_explicit_gaps",
      evidence: ["qualified-batch-report.json", "official-source-audit.json"],
      limits:
        "31 narrowed requirements have explicit local field review and exact-source evidence; 2 unsupported home-premises requirements remain withheld.",
    },
    {
      id: "S3",
      requirement:
        "Side-by-side steps, total cost, approval time, renewals and filings",
      status: "verified_with_explicit_gaps",
      evidence: ["qualified-batch-decision.json", "src/decision.ts"],
      limits:
        "Known fee subtotals stay separate by currency/period and applicability. Complete total costs and end-to-end approval times remain null; this is displayed as unknown, never zero.",
    },
    {
      id: "S4",
      requirement: "Recommendation with trade-offs",
      status: decisions.every(
        (d) => d.recommendation.status === "scoped_preference",
      )
        ? "verified"
        : "blocked",
      evidence: ["qualified-batch-decision.json"],
      limits:
        "Café recommendation concerns food-registration fees only. Consultancy recommendation concerns documented permission to trade before sole-trader registration; neither is an overall easiest/fastest claim.",
    },
    {
      id: "S5",
      requirement: "Demonstrate two different activities",
      status: "verified",
      evidence: ["live-batch-metadata.json", "qualified-batch-report.json"],
      limits:
        "One genuine Deep batch, two activities × three places; not two independent Research jobs.",
    },
    {
      id: "S6",
      requirement: "Use TinyResearch and explain its use",
      status: "verified",
      evidence: ["src/service.ts", "live-batch-metadata.json"],
      limits:
        "TinyResearch discovered the original 33 requirements; subsequent one-URL TinyFish Fetch observations support the local field audit. No new paid Research job was started.",
    },
    {
      id: "A1",
      requirement:
        "Every retained requirement has official source/date checked",
      status: "verified",
      evidence: ["qualified-batch-report.json", "test/audit.test.ts"],
      limits:
        "Matched excerpt plus explicit interpretation review; no claim of legal completeness or human legal review.",
    },
    {
      id: "A2",
      requirement: "Comparable categories across every place",
      status: "verified",
      evidence: ["qualified-batch-decision.json", "test/decision.test.ts"],
      limits:
        "Absent categories retain unknown cells; unlike currencies, periods and timing kinds are not ranked or summed together.",
    },
    {
      id: "A3",
      requirement: "Works with different activities and places",
      status: "verified_backend_contract",
      evidence: ["src/general.ts", "test/general.test.ts"],
      limits:
        "Generic 1–3 activity/3–6 place contract, with a different drone/US-city query regression. Fresh extra-place live runs were not authorized.",
    },
    {
      id: "A4",
      requirement: "Flag gaps, never guess",
      status: "verified",
      evidence: [
        "qualified-batch-report.json",
        "test/audit.test.ts",
        "test/decision.test.ts",
      ],
      limits:
        "Two unsupported local-premises assertions and unsupported field details are withheld. Uncertain source call halted the pool and was not retried.",
    },
    {
      id: "A5",
      requirement: "Not checking licence holders",
      status: "verified",
      evidence: ["src/general.ts"],
      limits:
        "Activity requirements only; no named person or business licence-holder check.",
    },
  ],
  release_gates: [
    {
      gate: "Current UI, keyboard/mobile/reduced-motion checks",
      status: "parent_owned",
    },
    {
      gate: "Standalone documented startup and release review",
      status: "parent_owned",
    },
    {
      gate: "Repository/deployment/submission",
      status: "parent_owned_not_established_here",
    },
    {
      gate: "Additional live operations under the existing halted pool",
      status: "blocked_do_not_retry",
    },
  ],
  approval_status: "not_submitted_or_approved",
  readiness:
    "core_evidence_qualified_with_explicit_gaps; release gates belong to parent",
};
const metadata = {
  kind: "compliance-qualified-offline-derivation",
  created_at: new Date().toISOString(),
  original_receipt_sha256: digest(receiptBytes),
  reviewed_model_sha256: digest(modelBytes),
  claim_reviews_sha256: digest(reviewBytes),
  audit_engine_sha256: digest(await readFile("compliance-map/src/audit.ts")),
  decision_engine_sha256: digest(
    await readFile("compliance-map/src/decision.ts"),
  ),
  source_audit_sha256: digest(auditBytes),
  secondary_period_corroboration_file: "source-review/report.json",
  secondary_period_corroboration_sha256: digest(priorReviewBytes),
  secondary_ordinary_https_period_checks:
    report.qualification.secondary_ordinary_https_period_checks,
  originals_preserved: true,
  provider_operations_in_this_derivation: 0,
  accepted_steps: report.qualification.accepted_steps,
  withheld_steps: report.qualification.withheld.length,
  coverage: report.reports.map((r) => ({
    activity: r.activity.id,
    places: r.places.map((p) => ({
      place_id: p.id,
      steps: p.steps.length,
      source_checked_steps: p.steps.filter(
        (s) => s.claim_review.status === "supported",
      ).length,
    })),
  })),
  recommendations: decisions.map((d) => ({
    activity_id: d.activity_id,
    status: d.recommendation.status,
    shortlist: d.recommendation.shortlist,
  })),
};
for (const [name, value] of Object.entries({
  "qualified-batch-report.json": qualified,
  "qualified-batch-decision.json": decisions,
  "criterion-status.json": criteria,
  "qualified-batch-metadata.json": metadata,
})) {
  const text = JSON.stringify(value, null, 2) + "\n";
  if (
    /(?:TINYFISH_API_KEY\s*=|Bearer\s+[A-Za-z0-9_-]{16,}|-----BEGIN .*PRIVATE KEY-----)/i.test(
      text,
    )
  )
    throw new Error("Sensitive-pattern export withheld");
  const target = join("compliance-map/evidence", name);
  const destination = replaceDerived
    ? target + ".local-" + randomUUID()
    : target;
  const file = await open(destination, "wx", 0o600);
  try {
    await file.writeFile(text);
    await file.sync();
  } finally {
    await file.close();
  }
  if (replaceDerived) await rename(destination, target);
}
if (
  digest(await readFile(join(batchDirectory, "original-receipt.json"))) !==
  digest(receiptBytes)
)
  throw new Error("Original receipt changed");
process.stdout.write(
  JSON.stringify({
    accepted_steps: metadata.accepted_steps,
    withheld_steps: metadata.withheld_steps,
    recommendations: metadata.recommendations,
    provider_operations: 0,
  }) + "\n",
);
