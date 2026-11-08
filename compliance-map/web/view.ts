import { officialUrl, type ComplianceResult } from "../src/core.js";
import {
  demonstrationBatch,
  type complianceBatchResult,
  type BatchInput,
} from "../src/general.js";
import { publicUrl } from "../../providers/public-url.js";
import type { AuditedComplianceBatch } from "../src/audit.js";
import { buildDecisionSummary, type DecisionSummary } from "../src/decision.js";

export type ViewSource = {
  url: string;
  title: string;
  quote: string | null;
  check: string;
  observed: string;
  published: string | null;
  checked: string | null;
};
export type ViewFact = {
  id?: string;
  applicability?: string;
  reviewSummary?: string;
  category: string;
  kinds: string[];
  value: string;
  claim: string;
  condition: string;
  values: Array<{ label: string; text: string }>;
  sources: ViewSource[];
};
export type ViewPlace = {
  id: string;
  name: string;
  region: string;
  country: string;
  facts: ViewFact[];
  unknowns: string[];
};
export type ViewReport = {
  decision?: DecisionSummary;
  name: string;
  scope: string;
  places: ViewPlace[];
  shortlist: string[];
  explanation: string;
  caveat: string;
  limitations: string[];
};
export type View = {
  mode: string;
  modeLabel: string;
  observed: string;
  run: string | null;
  reports: ViewReport[];
  seed: BatchInput;
  raw: unknown;
};
export type GeneralBatch =
  ReturnType<typeof complianceBatchResult> | AuditedComplianceBatch;
export type HtmlOptions = { liveEnabled?: boolean };
export const esc = (value: unknown) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export const serial = (value: unknown) =>
  JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
export const words = (value: string) => value.replaceAll("_", " ");
export const shortDate = (value: string | null) =>
  value && Number.isFinite(Date.parse(value))
    ? new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(value))
    : "Date not stated";
export function safeLink(value: string): string | null {
  try {
    const url = publicUrl(value),
      host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    if (
      /(?:^|\.)(?:gov|gov\.uk|gov\.ie|gov\.au|gov\.in|gov\.sg|govt\.nz|gouv\.fr)$/.test(
        host,
      ) ||
      [
        "about.hse.ie",
        "hse.ie",
        "fsai.ie",
        "pointofsinglecontact.ie",
        "dublincity.ie",
        "revenue.ie",
        "cro.ie",
      ].includes(host)
    )
      return url;
  } catch {
    /* Untrusted URLs never become executable anchors. */
  }
  return null;
}
export function legacyView(report: ComplianceResult): View {
  return {
    mode: report.evidence_mode,
    modeLabel:
      report.evidence_mode === "source_review"
        ? "Official source review · no TinyResearch run"
        : report.evidence_mode === "synthetic_fixture"
          ? "Synthetic fixture · no live evidence"
          : "TinyResearch candidate · inspect the sources",
    observed: report.observed_at,
    run: report.provider_run_id,
    raw: report,
    seed: {
      activities: [demonstrationBatch.activities[0]!],
      places: demonstrationBatch.places,
      priority:
        report.scenario.priority === "timing_clarity"
          ? "timing_clarity"
          : "cost_clarity",
    },
    reports: [
      {
        name: "Open a small café",
        scope: report.scope,
        shortlist: report.recommendation.shortlist,
        explanation: report.recommendation.explanation,
        caveat: report.recommendation.caveat,
        limitations: report.limitations,
        places: report.jurisdictions.map((place) => ({
          id: place.id,
          name: place.name,
          region: place.region,
          country: "",
          unknowns: place.unknowns,
          facts: place.facts.map((fact) => {
            const v = fact.value;
            return {
              category: fact.category,
              kinds: [fact.category],
              value:
                v.type === "fee"
                  ? `${v.currency} ${v.amount.toLocaleString("en-GB")} / ${words(v.period)}`
                  : v.type === "timing"
                    ? `${v.days_min === v.days_max ? v.days_min : v.days_min + "–" + v.days_max} days · ${words(v.kind)}`
                    : v.summary,
              claim: fact.claim,
              condition:
                v.type === "fee"
                  ? v.scope
                  : v.type === "timing"
                    ? v.conditions
                    : "",
              values: [],
              sources: fact.sources.map((s) => {
                let url = "";
                try {
                  url = officialUrl(s.url, place.id);
                } catch {}
                return {
                  url,
                  title: s.title,
                  quote: s.quote,
                  check: s.quote_check,
                  observed: s.observed_at,
                  published: s.published_on,
                  checked: s.checked_at,
                };
              }),
            };
          }),
        })),
      },
    ],
  };
}
export function generalView(batch: GeneralBatch): View {
  return {
    mode: "tinyresearch",
    modeLabel:
      batch.status === "source_reviewed"
        ? "TinyResearch · official fields reviewed"
        : batch.status === "unresolved"
          ? "Research unresolved · gaps stay visible"
          : "TinyResearch candidate · inspect the sources",
    observed: batch.observed_at,
    run: batch.provider_run_id,
    seed: batch.input,
    raw: batch,
    reports: batch.reports.map((report) => {
      const decision = buildDecisionSummary(report, {
        priority: batch.input.priority,
      });
      return {
        decision,
        name: report.activity.label,
        scope: report.activity.description,
        shortlist: decision.recommendation.shortlist,
        explanation: decision.recommendation.reasons.join(" "),
        caveat:
          "Total setup cost and overall approval duration remain unestablished. Review the open questions with the relevant authority.",
        limitations: report.limitations,
        places: report.places.map((place) => ({
          id: place.id,
          name: place.name,
          region: place.region,
          country: place.country,
          unknowns: place.unknowns,
          facts: place.steps.map((step) => {
            const review =
              "claim_review" in step ? step.claim_review : undefined;
            const t = step.time,
              hasTime = t.minimum_days !== null || t.maximum_days !== null;
            const time = hasTime
              ? `${t.minimum_days ?? "?"}${t.maximum_days !== t.minimum_days ? "–" + (t.maximum_days ?? "?") : ""} ${t.unit === "unspecified" ? "" : t.unit + " "}days · ${words(t.kind)}`
              : "Not established";
            const costs =
              step.costs
                .map(
                  (c) =>
                    `${c.amount === null ? "Amount unknown" : (c.currency ?? "Currency unknown") + " " + c.amount.toLocaleString("en-GB")} / ${words(c.period)} — ${c.scope}`,
                )
                .join("; ") || "Not established";
            const kinds = [
              step.kind,
              ...(step.costs.length ? ["fee"] : []),
              ...(hasTime ? ["timing"] : []),
              ...(step.renewal.description ? ["renewal"] : []),
              ...(step.ongoing_filings.length ? ["filing"] : []),
            ];
            return {
              id: step.id,
              applicability: review?.applicability ?? "unreviewed",
              reviewSummary: review
                ? review.notes.join(" ")
                : "Provider-reported item; interpretation has not been reviewed against the official source.",
              category: step.kind,
              kinds,
              value: step.requirement,
              claim: step.authority,
              condition: t.conditions,
              values: [
                { label: "Cost lines", text: costs },
                { label: "Timing", text: time },
                {
                  label: "Renewal",
                  text: step.renewal.description ?? "Not established",
                },
                {
                  label: "Ongoing filings",
                  text: step.ongoing_filings.join("; ") || "Not established",
                },
              ],
              sources: step.sources.map((s) => ({
                url: safeLink(s.url) ?? "",
                title: (() => {
                  try {
                    return new URL(s.url).hostname.replace(/^www\./, "");
                  } catch {
                    return "Source unavailable";
                  }
                })(),
                quote: s.quote,
                check: s.quote_check,
                observed: s.observed_at,
                published: s.published_on,
                checked: "checked_at" in s ? s.checked_at : null,
              })),
            };
          }),
        })),
      };
    }),
  };
}
