import { createHash } from "node:crypto";
import { z } from "zod";
import { publicUrl } from "../../providers/public-url.js";
import type { ResearchReceipt } from "../../providers/research.js";
import { researchJson } from "../../providers/research-json.js";
import {
  ComplianceBatch,
  GeneralModelReport,
  type BatchInput,
} from "./general.js";

export const ClaimApplicabilitySchema = z.enum([
  "required",
  "conditional",
  "optional",
  "outside_scope",
]);
const SourceObservation = z
  .object({
    url: z.string(),
    final_url: z.string(),
    observed_at: z.iso.datetime(),
    reservation_id: z.uuid(),
    text_sha256: z.string().regex(/^[a-f0-9]{64}$/),
    text: z.string().max(500000),
  })
  .strict();
export type OfficialObservation = z.infer<typeof SourceObservation>;
export const OfficialClaimReviewSchema = z
  .object({
    status: z.enum(["supported", "unsupported", "unreviewed"]),
    checked_at: z.iso.datetime(),
    notes: z.array(z.string().min(1).max(600)).min(1).max(10),
    source_urls: z.array(z.string()).min(1).max(4),
    applicability: ClaimApplicabilitySchema,
    conditions: z.array(z.string().min(1).max(500)).max(8),
    obligation_key: z.string().min(1).max(200),
    decision_role: z.enum(["registration", "other"]).optional(),
    registration_start_rule: z
      .literal("may_trade_before_registration")
      .optional(),
    fields_reviewed: z
      .array(
        z.enum(["requirement", "costs", "time", "renewal", "ongoing_filings"]),
      )
      .length(5),
    cost_treatments: z
      .array(
        z
          .object({
            index: z.number().int().min(0).max(4),
            applicability: ClaimApplicabilitySchema,
            alternative_group: z.string().min(1).max(200).nullable(),
            obligation_key: z.string().min(1).max(200),
          })
          .strict(),
      )
      .max(5),
  })
  .strict();
export type OfficialClaimReview = z.infer<typeof OfficialClaimReviewSchema>;
export const PriorPeriodCorroborationSchema = z
  .object({
    step_id: z.string().min(1).max(200),
    cost_index: z.number().int().min(0).max(4),
    amount: z.number().finite().min(0),
    currency: z.string().regex(/^[A-Z]{3}$/),
    period: z.literal("annual"),
    method: z.literal("ordinary_https_source_review"),
    artifact: z.literal("source-review/report.json"),
    artifact_sha256: z.string().regex(/^[a-f0-9]{64}$/),
    fact_id: z.literal("permit-fee"),
    source_url: z.string(),
    checked_at: z.iso.datetime(),
    text_sha256: z.string().regex(/^[a-f0-9]{64}$/),
    quote: z.literal("Annually"),
    quote_check: z.literal("matched"),
  })
  .strict();
export type PriorPeriodCorroboration = z.infer<
  typeof PriorPeriodCorroborationSchema
>;
type Model = z.infer<typeof GeneralModelReport>;
type ModelStep = Model["reports"][number]["places"][number]["steps"][number];
const normalize = (value: string) =>
  value.replace(/\s+/g, " ").trim().toLowerCase();
const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");
function officialUrl(value: string) {
  const url = new URL(publicUrl(value)),
    host = url.hostname.replace(/^www\./, "");
  if (
    !/(?:^|\.)(?:gov|gov\.uk|gov\.ie|gov\.au|gov\.in|gov\.sg|govt\.nz|gouv\.fr)$/.test(
      host,
    ) &&
    ![
      "about.hse.ie",
      "hse.ie",
      "fsai.ie",
      "pointofsinglecontact.ie",
      "dublincity.ie",
      "revenue.ie",
      "cro.ie",
    ].includes(host)
  )
    throw new Error("Official source ownership is not established");
  return url.href;
}
function quantitySupport(
  step: ModelStep,
  priorPeriods: ReadonlyMap<number, PriorPeriodCorroboration>,
) {
  const quote = step.sources.map((s) => s.quote).join(" ");
  const numbers = [
    ...quote.matchAll(/(?:^|[^\d.])(\d[\d,]*(?:\.\d+)?)(?=$|[^\d.]|\.(?!\d))/g),
  ].map((m) => Number(m[1]!.replaceAll(",", "")));
  for (const [index, cost] of step.costs.entries())
    if (cost.amount !== null) {
      const free =
        cost.amount === 0 &&
        /\b(?:free|no cost|no charge|no fee)\b/i.test(quote) &&
        !/\bnot free\b/i.test(quote);
      if (!free && !numbers.includes(cost.amount))
        throw new Error("Unsupported amount");
      if (
        cost.period === "annual" &&
        !priorPeriods.has(index) &&
        !/\b(?:annual|annually|yearly|per year)\b/i.test(quote)
      )
        throw new Error("Unsupported fee period");
    }
  const time = step.time;
  if (time.minimum_days !== null || time.maximum_days !== null) {
    const ranges = [
      ...quote.matchAll(
        /\b(\d+)\s*(?:[-–]\s*(\d+))?\s*(?:(?:calendar|business|working)\s+)?days?\b/gi,
      ),
    ].map((m) => [Number(m[1]), Number(m[2] ?? m[1])]);
    if (
      !ranges.some(
        ([a, b]) =>
          (time.minimum_days === null || a === time.minimum_days) &&
          (time.maximum_days === null || b === time.maximum_days),
      )
    )
      throw new Error("Unsupported day count");
    if (time.unit === "calendar" && !/\bcalendar days?\b/i.test(quote))
      throw new Error("Unsupported calendar-day unit");
    if (
      time.unit === "business" &&
      !/\b(?:business|working) days?\b/i.test(quote)
    )
      throw new Error("Unsupported business-day unit");
    if (
      time.kind !== "estimate" &&
      /\b(?:typically|generally|estimated|usually)\b/i.test(quote)
    )
      throw new Error("Estimate is not a legal wait");
  }
  const months = step.renewal.interval_months;
  if (
    months !== null &&
    !(
      new RegExp(`\\b${months}\\s+months?\\b`, "i").test(quote) ||
      (months === 12 &&
        /\b(?:annual|annually|yearly|each year|one year)\b/i.test(quote))
    )
  )
    throw new Error("Unsupported renewal interval");
}

/** A local evidence audit of a genuine Research result; it never fabricates or edits a provider receipt.
 * An explicit review of every retained field is required in addition to excerpt presence.
 */
export function auditComplianceBatch(args: {
  input: BatchInput;
  receipt: ResearchReceipt;
  reviewed_model: unknown;
  reviews: Readonly<Record<string, OfficialClaimReview>>;
  observations: readonly OfficialObservation[];
  evidence_mode: "saved_live" | "synthetic_fixture";
  original_receipt_sha256: string;
  prior_period_corroborations?: readonly PriorPeriodCorroboration[];
}) {
  const input = ComplianceBatch.parse(args.input),
    model = GeneralModelReport.parse(args.reviewed_model);
  if (
    args.receipt.status !== "COMPLETED" ||
    !args.receipt.result ||
    !/^[a-f0-9]{64}$/.test(args.original_receipt_sha256)
  )
    throw new Error(
      "A completed original Research receipt and digest are required",
    );
  const originalModel = GeneralModelReport.parse(
    researchJson(args.receipt.result),
  );
  const originalKeys = new Set(
    originalModel.reports.flatMap((a) =>
      a.places.flatMap((p) =>
        p.steps.map((s) => `${a.activity_id}/${p.place_id}/${s.id}`),
      ),
    ),
  );
  const reviewedKeys = new Set(
    model.reports.flatMap((a) =>
      a.places.flatMap((p) =>
        p.steps.map((s) => `${a.activity_id}/${p.place_id}/${s.id}`),
      ),
    ),
  );
  if ([...reviewedKeys].some((key) => !originalKeys.has(key)))
    throw new Error(
      "Reviewed requirements differ from the original Research activity/place identities",
    );
  if (
    model.reports.length !== input.activities.length ||
    new Set(model.reports.map((r) => r.activity_id)).size !==
      input.activities.length ||
    model.reports.some(
      (r) => !input.activities.some((a) => a.id === r.activity_id),
    )
  )
    throw new Error("Activity coverage differs from the request");
  const sources = new Map<string, OfficialObservation>();
  for (const raw of args.observations) {
    const source = SourceObservation.parse(raw),
      url = officialUrl(source.url);
    if (
      source.final_url !== source.url ||
      sources.has(url) ||
      sha256(source.text) !== source.text_sha256
    )
      throw new Error("Recorded source identity or digest differs");
    sources.set(url, source);
  }
  const quoted = new Map<string, number>(),
    withheld: {
      activity_id: string;
      place_id: string;
      step_id: string;
      reason: string;
    }[] = [];
  const priorChecks = (args.prior_period_corroborations ?? []).map((value) =>
    PriorPeriodCorroborationSchema.parse(value),
  );
  if (
    new Set(priorChecks.map((check) => `${check.step_id}/${check.cost_index}`))
      .size !== priorChecks.length
  )
    throw new Error("Duplicate prior fee-period corroboration");
  let secondaryChecksUsed = 0;
  for (const a of originalModel.reports)
    for (const p of a.places)
      for (const s of p.steps)
        if (!reviewedKeys.has(`${a.activity_id}/${p.place_id}/${s.id}`))
          withheld.push({
            activity_id: a.activity_id,
            place_id: p.place_id,
            step_id: s.id,
            reason:
              "The original citation did not establish this requirement; no supported local-source review was retained.",
          });
  const reports = input.activities.map((activity) => {
    const original = model.reports.find((r) => r.activity_id === activity.id)!;
    if (
      original.places.length !== input.places.length ||
      new Set(original.places.map((p) => p.place_id)).size !==
        input.places.length ||
      original.places.some(
        (p) => !input.places.some((i) => i.id === p.place_id),
      )
    )
      throw new Error("Place coverage differs from the request");
    const places = input.places.map((place) => {
      const candidate = original.places.find((p) => p.place_id === place.id)!,
        unknowns = [...candidate.unknowns];
      const seen = new Set<string>();
      const steps = candidate.steps.flatMap((step) => {
        try {
          if (seen.has(step.id)) throw new Error("duplicate requirement");
          seen.add(step.id);
          const review = OfficialClaimReviewSchema.parse(args.reviews[step.id]);
          if (
            review.status !== "supported" ||
            new Set(review.fields_reviewed).size !== 5
          )
            throw new Error(
              "claim fields have not all been semantically reviewed",
            );
          const declared = new Set(review.source_urls.map(officialUrl));
          const cited = new Set(
            step.sources.map((source) => officialUrl(source.url)),
          );
          if (
            declared.size !== cited.size ||
            [...declared].some((url) => !cited.has(url))
          )
            throw new Error(
              "reviewed source identities differ from the retained citations",
            );
          if (
            review.cost_treatments.length !== step.costs.length ||
            new Set(review.cost_treatments.map((c) => c.index)).size !==
              step.costs.length ||
            review.cost_treatments.some((c) => c.index >= step.costs.length)
          )
            throw new Error("cost applicability was not reviewed");
          const priorPeriods = new Map<number, PriorPeriodCorroboration>();
          for (const check of priorChecks.filter(
            (candidate) => candidate.step_id === step.id,
          )) {
            const cost = step.costs[check.cost_index],
              sourceUrl = officialUrl(check.source_url);
            if (
              !cost ||
              cost.amount !== check.amount ||
              cost.currency !== check.currency ||
              cost.period !== check.period ||
              !cited.has(sourceUrl) ||
              Date.parse(check.checked_at) > Date.parse(review.checked_at) ||
              Date.parse(review.checked_at) - Date.parse(check.checked_at) >
                30 * 86400000
            )
              throw new Error(
                "Prior fee-period corroboration does not match this reviewed cost",
              );
            priorPeriods.set(check.cost_index, check);
          }
          quantitySupport(step, priorPeriods);
          const sourceChecks = step.sources.map((s) => {
            const url = officialUrl(s.url),
              observation = sources.get(url);
            if (
              !observation ||
              !review.source_urls.includes(url) ||
              !normalize(observation.text).includes(normalize(s.quote))
            )
              throw new Error(
                "official excerpt not found on the exact observed page",
              );
            if (
              Date.parse(review.checked_at) <
                Date.parse(observation.observed_at) ||
              Date.parse(review.checked_at) -
                Date.parse(observation.observed_at) >
                86400000
            )
              throw new Error(
                "review timestamp does not follow the recorded observation",
              );
            return { s, url, observation };
          });
          const periodExports = new Map<
            number,
            {
              method: "ordinary_https_source_review";
              artifact: "source-review/report.json";
              artifact_sha256: string;
              fact_id: "permit-fee";
              source_url: string;
              checked_at: string;
              text_sha256: string;
              quote: "Annually" | null;
              quote_check: "matched";
              original_quote_sha256: string;
              quote_excerpt_status: "complete" | "withheld";
              verification_limit: string;
            }
          >();
          for (const [index, check] of priorPeriods) {
            const page = new URL(check.source_url);
            page.search = "";
            page.pathname = page.pathname.replace(/\/+$/, "") || "/";
            const available = (quoted.get(page.href) ?? 0) < 25;
            if (available)
              quoted.set(page.href, (quoted.get(page.href) ?? 0) + 1);
            periodExports.set(index, {
              method: check.method,
              artifact: check.artifact,
              artifact_sha256: check.artifact_sha256,
              fact_id: check.fact_id,
              source_url: check.source_url,
              checked_at: check.checked_at,
              text_sha256: check.text_sha256,
              quote: available ? check.quote : null,
              quote_check: check.quote_check,
              original_quote_sha256: sha256(check.quote),
              quote_excerpt_status: available ? "complete" : "withheld",
              verification_limit:
                "Saved earlier ordinary HTTPS full-page quote check; its body was not retained or rechecked here. Separate from the 35 TinyFish Fetch observations.",
            });
          }
          const exported = sourceChecks.map(({ s, url, observation }) => {
            const page = new URL(url);
            page.search = "";
            page.pathname = page.pathname.replace(/\/+$/, "") || "/";
            const words = s.quote.split(/\s+/),
              available = Math.max(0, 25 - (quoted.get(page.href) ?? 0)),
              selected = words.slice(0, available);
            quoted.set(
              page.href,
              (quoted.get(page.href) ?? 0) + selected.length,
            );
            return {
              ...s,
              url,
              observed_at: observation.observed_at,
              checked_at: review.checked_at,
              quote: selected.length ? selected.join(" ") : null,
              quote_check: "matched" as const,
              quote_excerpt_status:
                selected.length === words.length
                  ? ("complete" as const)
                  : selected.length
                    ? ("truncated" as const)
                    : ("withheld" as const),
              quote_withheld_words: words.length - selected.length,
              quote_withheld_reason:
                words.length > selected.length
                  ? "per_page_25_word_export_limit"
                  : null,
              original_quote_sha256: sha256(s.quote),
              text_sha256: observation.text_sha256,
              reservation_id: observation.reservation_id,
            };
          });
          secondaryChecksUsed += periodExports.size;
          return [
            {
              ...step,
              costs: step.costs.map((cost, index) => ({
                ...cost,
                ...review.cost_treatments.find((c) => c.index === index)!,
                period_corroboration: periodExports.get(index) ?? null,
              })),
              sources: exported,
              provenance: "source_reviewed" as const,
              claim_review: review,
            },
          ];
        } catch (error) {
          const reason =
            error instanceof Error && !(error instanceof z.ZodError)
              ? error.message
              : "incomplete review record";
          withheld.push({
            activity_id: activity.id,
            place_id: place.id,
            step_id: step.id,
            reason,
          });
          unknowns.push(`Withheld ${step.id}: ${reason}.`);
          return [];
        }
      });
      return {
        ...place,
        steps,
        total_cost: null,
        total_cost_status: "unknown" as const,
        known_cost_lines: steps.flatMap((s) =>
          s.costs.map((c) => ({ step_id: s.id, ...c })),
        ),
        overall_time_to_approval: null,
        unknowns: [
          ...unknowns,
          "Overall cost and opening time depend on unresolved scope and premises; no complete total or end-to-end duration is claimed.",
        ],
      };
    });
    return {
      activity,
      places,
      status: "source_reviewed" as const,
      comparison_rows: (
        ["licence", "filing", "tax", "premises", "training", "other"] as const
      ).map((kind) => ({
        kind,
        places: places.map((p) => ({
          place_id: p.id,
          steps: p.steps.filter((s) => s.kind === kind),
          unknown: !p.steps.some((s) => s.kind === kind),
        })),
      })),
      recommendation: {
        shortlist: [] as string[],
        basis: [] as unknown[],
        priority: input.priority,
        explanation:
          "Resolve the scoped totals, timings and trade-offs with the decision layer before selecting a place.",
        tradeoffs: places.map((p) => ({
          place_id: p.id,
          unresolved: p.unknowns,
        })),
      },
      limitations: [
        ...original.limitations,
        "Local source review supports only the retained fields; it is not a legal-completeness certification or a licence-holder check.",
      ],
    };
  });
  return {
    format: "compliance-map-batch-v2" as const,
    input,
    provider_run_id: args.receipt.research_run_id,
    provider_jobs: 1,
    observed_at: args.receipt.recorded_at,
    status: "source_reviewed" as const,
    evidence_mode: args.evidence_mode,
    reports,
    qualification: {
      kind: "official-source-field-review-v1",
      original_receipt_sha256: args.original_receipt_sha256,
      original_research_recorded_at: args.receipt.recorded_at,
      reviewed_at: new Date().toISOString(),
      new_research_jobs: 0,
      source_observations: sources.size,
      secondary_ordinary_https_period_checks: secondaryChecksUsed,
      accepted_steps: reports.reduce(
        (n, a) => n + a.places.reduce((s, p) => s + p.steps.length, 0),
        0,
      ),
      withheld,
      original_steps: originalKeys.size,
      limits:
        "Explicit local interpretation review plus exact recorded-page excerpts; neither an excerpt match nor provider text alone proves legal completeness.",
    },
  };
}
export type AuditedComplianceBatch = ReturnType<typeof auditComplianceBatch>;
