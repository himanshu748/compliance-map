/** Pure comparison arithmetic over semantically reviewed official-source evidence. */
export type Applicability =
  "required" | "conditional" | "optional" | "outside_scope" | "unknown";
export type DecisionCost = {
  amount: number | null;
  currency: string | null;
  period: string;
  scope: string;
  obligation_key?: string | null | undefined;
  applicability?: string | null | undefined;
  alternative_group?: string | null | undefined;
};
export type DecisionSource = {
  url: string;
  quote_check: string;
  checked_at?: string | null | undefined;
  quote?: string | null | undefined;
};
export type ClaimReview = {
  status: string;
  checked_at?: string | null | undefined;
  source_urls?: readonly string[] | undefined;
  applicability?: string | undefined;
  conditions?: readonly string[] | undefined;
  notes?: readonly string[] | undefined;
  obligation_key?: string | undefined;
  decision_role?: "registration" | "other" | undefined;
  registration_role?: string | undefined;
  registration_start_rule?: string | undefined;
};
export type DecisionStep = {
  id: string;
  kind: string;
  requirement: string;
  authority?: string | undefined;
  costs: readonly DecisionCost[];
  time: {
    minimum_days: number | null;
    maximum_days: number | null;
    unit: string;
    kind: string;
    conditions: string;
  };
  renewal: { description: string | null; interval_months: number | null };
  ongoing_filings: readonly string[];
  sources: readonly DecisionSource[];
  claim_review?: ClaimReview | undefined;
};
export type DecisionPlace = {
  id: string;
  name: string;
  steps: readonly DecisionStep[];
  unknowns: readonly string[];
};
export type DecisionReport = {
  activity?:
    { id: string; label: string; description?: string | undefined } | undefined;
  priority?: string | undefined;
  recommendation?: { priority?: string | undefined } | undefined;
  places: readonly DecisionPlace[];
};
export type DecisionOptions = {
  priority?: string | undefined;
  registrationRole?: string;
};
export type FeeSubtotal = {
  currency: string;
  period: string;
  subtotal: number | null;
  subtotal_decimal: string | null;
  complete: false;
  cost_refs: string[];
  components: {
    obligation_key: string | null;
    amount_decimal: string;
    cost_refs: string[];
  }[];
  unknown_cost_count: number;
  withheld_reasons: string[];
};
export type CostGap = {
  cost_ref: string;
  step_id: string;
  reason: string;
  scope: string;
};
export type TimingMilestone = {
  step_id: string;
  requirement: string;
  applicability: Applicability;
  kind: string;
  unit: string;
  minimum_days: number | null;
  maximum_days: number | null;
  conditions: string[];
  source_urls: string[];
};
export type PlaceDecision = {
  place_id: string;
  name: string;
  applicable_step_ids: string[];
  conditional_step_ids: string[];
  optional_step_ids: string[];
  outside_scope_step_ids: string[];
  unreviewed_step_ids: string[];
  known_fee_subtotals: FeeSubtotal[];
  conditional_fee_subtotals: FeeSubtotal[];
  optional_fee_subtotals: FeeSubtotal[];
  unknown_cost_count: number;
  conditional_unknown_cost_count: number;
  optional_unknown_cost_count: number;
  cost_gaps: CostGap[];
  total_cost: null;
  total_cost_status: "unknown";
  overall_time_to_approval: null;
  timing_milestones: TimingMilestone[];
  renewals: {
    step_id: string;
    applicability: Applicability;
    description: string | null;
    interval_months: number | null;
    source_urls: string[];
  }[];
  ongoing_filings: {
    step_id: string;
    applicability: Applicability;
    text: string;
    source_urls: string[];
  }[];
  tradeoffs: string[];
  unknowns: string[];
};
export type DimensionCell = {
  place_id: string;
  status: "supported" | "conditional_only" | "unknown" | "outside_scope";
  applicable_step_ids: string[];
  conditional_step_ids: string[];
  optional_step_ids: string[];
  outside_scope_step_ids: string[];
  unreviewed_step_ids: string[];
  values: string[];
  unknowns: string[];
};
export type DecisionSummary = {
  activity_id: string | null;
  places: PlaceDecision[];
  dimensions: { key: string; label: string; places: DimensionCell[] }[];
  recommendation: {
    status: "insufficient_evidence" | "scoped_preference";
    shortlist: string[];
    scope: string;
    reasons: string[];
    tradeoffs: { place_id: string; place_name: string; items: string[] }[];
  };
  limitations: string[];
};
type Reviewed = {
  step: DecisionStep;
  applicability: Applicability;
  urls: string[];
};
type Candidate = {
  ref: string;
  step: DecisionStep;
  cost: DecisionCost;
  identity: string | null;
  decimal: string;
};
const periods = new Set(["one_time", "annual", "monthly", "per_event"]);
const kinds = ["licence", "filing", "tax", "premises", "training", "other"];
const unique = (items: readonly string[]) => [...new Set(items)];
const norm = (v: string) =>
  v
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
const dated = (v: string | null | undefined) =>
  !!v &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(v) &&
  Number.isFinite(Date.parse(v)) &&
  new Date(v).toISOString().slice(0, 19) === v.slice(0, 19);
const app = (v: string | null | undefined): Applicability =>
  ["required", "conditional", "optional", "outside_scope"].includes(v ?? "")
    ? (v as Applicability)
    : "unknown";
function costApplicability(
  step: Applicability,
  cost: string | null | undefined,
): Applicability {
  const item = cost == null ? step : app(cost);
  if (step === "outside_scope" || item === "outside_scope")
    return "outside_scope";
  if (step === "unknown" || item === "unknown") return "unknown";
  if (step === "optional" || item === "optional") return "optional";
  if (step === "conditional" || item === "conditional") return "conditional";
  return "required";
}
function official(v: string): string | null {
  try {
    const u = new URL(v),
      h = u.hostname.toLowerCase().replace(/^www\./, "");
    if (u.protocol !== "https:" || u.username || u.password || u.port || u.hash)
      return null;
    return /(?:^|\.)(?:gov|gov\.uk|gov\.ie|gov\.au|gov\.in|gov\.sg|govt\.nz|gouv\.fr)$/.test(
      h,
    ) ||
      [
        "about.hse.ie",
        "hse.ie",
        "fsai.ie",
        "pointofsinglecontact.ie",
        "dublincity.ie",
        "revenue.ie",
        "cro.ie",
      ].includes(h)
      ? u.href
      : null;
  } catch {
    return null;
  }
}
function reviewed(s: DecisionStep): Reviewed | null {
  const r = s.claim_review;
  if (r?.status !== "supported" || !dated(r.checked_at)) return null;
  const declared = new Set(
    (r.source_urls ?? []).map(official).filter((u): u is string => !!u),
  );
  const urls = unique(
    s.sources.flatMap((source) => {
      const u = official(source.url);
      return u &&
        declared.has(u) &&
        source.quote_check === "matched" &&
        dated(source.checked_at)
        ? [u]
        : [];
    }),
  );
  return urls.length
    ? { step: s, applicability: app(r.applicability), urls }
    : null;
}
/** Preserve exact decimals rather than introducing binary floating-point fee errors. */
function decimal(n: number): string | null {
  if (!Number.isFinite(n) || n < 0 || n > Number.MAX_SAFE_INTEGER) return null;
  const [m = "", e = "0"] = n.toString().toLowerCase().split("e"),
    [w = "", f = ""] = m.split("."),
    digits = w + f,
    scale = f.length - Number(e);
  if (Math.abs(scale) > 20) return null;
  const padded = digits.padStart(scale + 1, "0"),
    value =
      scale <= 0
        ? digits + "0".repeat(-scale)
        : padded.slice(0, -scale) + "." + padded.slice(-scale);
  return value.includes(".")
    ? value.replace(/0+$/, "").replace(/\.$/, "")
    : value;
}
function sum(values: string[]): string {
  const scale = Math.max(0, ...values.map((v) => v.split(".")[1]?.length ?? 0));
  const n = values
    .reduce((a, v) => {
      const [w = "0", f = ""] = v.split(".");
      return a + BigInt(w + f.padEnd(scale, "0"));
    }, 0n)
    .toString();
  if (!scale) return n;
  const p = n.padStart(scale + 1, "0");
  return (p.slice(0, -scale) + "." + p.slice(-scale))
    .replace(/0+$/, "")
    .replace(/\.$/, "");
}
function fees(
  place: DecisionPlace,
  evidence: Reviewed[],
  applicability: Applicability,
) {
  const buckets = new Map<
      string,
      { currency: string; period: string; lines: Candidate[]; unknown: number }
    >(),
    gaps: CostGap[] = [];
  function gap(
    s: DecisionStep,
    i: number | null,
    reason: string,
    c?: DecisionCost,
  ) {
    gaps.push({
      cost_ref: `${place.id}/${s.id}/costs/${i ?? "missing"}`,
      step_id: s.id,
      reason,
      scope: c?.scope ?? "No cost evidence supplied.",
    });
    if (c?.currency && /^[A-Z]{3}$/.test(c.currency) && periods.has(c.period)) {
      const key = c.currency + "|" + c.period,
        b = buckets.get(key) ?? {
          currency: c.currency,
          period: c.period,
          lines: [],
          unknown: 0,
        };
      b.unknown++;
      buckets.set(key, b);
    }
  }
  for (const v of evidence) {
    const s = v.step;
    if (!s.costs.length && v.applicability === applicability)
      gap(s, null, "No supported cost amount supplied; absence is not zero.");
    s.costs.forEach((c, i) => {
      if (costApplicability(v.applicability, c.applicability) !== applicability)
        return;
      if (c.amount === null) {
        gap(s, i, "Amount unknown.", c);
        return;
      }
      const d = decimal(c.amount);
      if (d === null) {
        gap(s, i, "Amount invalid or unsafe to represent.", c);
        return;
      }
      if (!c.currency || !/^[A-Z]{3}$/.test(c.currency)) {
        gap(s, i, "Currency unknown or invalid.", c);
        return;
      }
      if (!periods.has(c.period)) {
        gap(s, i, "Payment period not established.", c);
        return;
      }
      const key = c.currency + "|" + c.period,
        b = buckets.get(key) ?? {
          currency: c.currency,
          period: c.period,
          lines: [],
          unknown: 0,
        };
      b.lines.push({
        ref: `${place.id}/${s.id}/costs/${i}`,
        step: s,
        cost: c,
        identity:
          c.obligation_key?.trim() ||
          (s.costs.length === 1
            ? s.claim_review?.obligation_key?.trim()
            : null) ||
          null,
        decimal: d,
      });
      buckets.set(key, b);
    });
  }
  const subtotals: FeeSubtotal[] = [];
  const allLines = [...buckets.values()].flatMap((bucket) => bucket.lines);
  for (const b of [...buckets.values()].sort((a, b) =>
    (a.currency + "|" + a.period).localeCompare(b.currency + "|" + b.period),
  )) {
    if (!b.lines.length) continue;
    const reasons: string[] = [],
      components = new Map<string, FeeSubtotal["components"][number]>();
    for (const line of b.lines) {
      if (
        line.cost.alternative_group &&
        allLines.filter(
          (c) => c.cost.alternative_group === line.cost.alternative_group,
        ).length > 1
      )
        reasons.push(
          `Mutually exclusive alternatives in ${line.cost.alternative_group}; no option selected.`,
        );
      if (
        !line.identity &&
        b.lines.filter((c) => norm(c.cost.scope) === norm(line.cost.scope))
          .length > 1
      )
        reasons.push(
          `Ambiguous charge identity for ${line.ref}; similarly scoped lines may overlap.`,
        );
      if (
        !line.identity &&
        ["filing", "tax"].includes(line.step.kind) &&
        b.lines.length > 1
      )
        reasons.push(
          `Unreviewed filing/tax charge identity for ${line.ref}; subtotal withheld rather than double-counting.`,
        );
      const key = line.identity ?? line.ref,
        old = components.get(key);
      if (old) {
        if (old.amount_decimal !== line.decimal)
          reasons.push(`Conflicting amounts for reviewed obligation ${key}.`);
        old.cost_refs.push(line.ref);
      } else
        components.set(key, {
          obligation_key: line.identity,
          amount_decimal: line.decimal,
          cost_refs: [line.ref],
        });
    }
    const value = reasons.length
        ? null
        : sum([...components.values()].map((c) => c.amount_decimal)),
      number = value === null ? NaN : Number(value);
    subtotals.push({
      currency: b.currency,
      period: b.period,
      subtotal_decimal: value,
      subtotal:
        Number.isFinite(number) && number <= Number.MAX_SAFE_INTEGER
          ? number
          : null,
      complete: false,
      cost_refs: b.lines.map((c) => c.ref),
      components: [...components.values()],
      unknown_cost_count: b.unknown,
      withheld_reasons: unique(reasons),
    });
  }
  return { subtotals, gaps };
}
function placeSummary(place: DecisionPlace): PlaceDecision {
  const evidence = place.steps.flatMap((s) => {
      const r = reviewed(s);
      return r ? [r] : [];
    }),
    ids = (a: Applicability) =>
      evidence.filter((v) => v.applicability === a).map((v) => v.step.id);
  const required = fees(place, evidence, "required"),
    conditional = fees(place, evidence, "conditional"),
    optional = fees(place, evidence, "optional");
  const unreviewed = place.steps.filter(
    (s) => !evidence.some((v) => v.step === s),
  );
  const otherGaps = place.steps.flatMap((s) => {
    const v = evidence.find((v) => v.step === s),
      reason = !v
        ? "Item lacks dated semantic support and a checked official source."
        : v.applicability === "unknown"
          ? "Applicability is not established."
          : null;
    if (!reason)
      return s.costs.flatMap((c, i) =>
        costApplicability(v!.applicability, c.applicability) === "unknown"
          ? [
              {
                cost_ref: `${place.id}/${s.id}/costs/${i}`,
                step_id: s.id,
                reason: "Cost applicability is not established.",
                scope: c.scope,
              },
            ]
          : [],
      );
    return (s.costs.length ? s.costs : [{ scope: "Unknown." }]).map((c, i) => ({
      cost_ref: `${place.id}/${s.id}/costs/${s.costs.length ? i : "missing"}`,
      step_id: s.id,
      reason,
      scope: c.scope,
    }));
  });
  const relevant = evidence.filter(
    (v) => !["outside_scope", "unknown"].includes(v.applicability),
  );
  const timing_milestones: TimingMilestone[] = relevant.map((v) => ({
    step_id: v.step.id,
    requirement: v.step.requirement,
    applicability: v.applicability,
    kind: v.step.time.kind,
    unit: v.step.time.unit,
    minimum_days: v.step.time.minimum_days,
    maximum_days: v.step.time.maximum_days,
    conditions: unique(
      [
        v.step.time.conditions,
        ...(v.step.claim_review?.conditions ?? []),
      ].filter(Boolean),
    ),
    source_urls: v.urls,
  }));
  const tradeoffs = [
    ...relevant
      .filter((v) => ["licence", "filing"].includes(v.step.kind))
      .map((v) => `${place.name}: ${v.applicability} ${v.step.requirement}`),
    ...timing_milestones
      .filter((t) => t.minimum_days !== null || t.maximum_days !== null)
      .map(
        (t) =>
          `${place.name}: ${t.kind} milestone ${t.step_id}: ${t.minimum_days ?? "?"}–${t.maximum_days ?? "?"} ${t.unit} days; ${t.conditions.join(" ")}`,
      ),
    ...relevant
      .filter((v) => v.step.renewal.description)
      .map(
        (v) =>
          `${place.name}: ${v.applicability} renewal for ${v.step.id}: ${v.step.renewal.description}`,
      ),
    ...place.unknowns.map((u) => `${place.name}: ${u}`),
  ];
  if (required.gaps.length || otherGaps.length)
    tradeoffs.push(
      `${place.name}: unresolved costs/applicability prevent a complete setup-cost comparison.`,
    );
  return {
    place_id: place.id,
    name: place.name,
    applicable_step_ids: ids("required"),
    conditional_step_ids: ids("conditional"),
    optional_step_ids: ids("optional"),
    outside_scope_step_ids: ids("outside_scope"),
    unreviewed_step_ids: unreviewed.map((s) => s.id),
    known_fee_subtotals: required.subtotals,
    conditional_fee_subtotals: conditional.subtotals,
    optional_fee_subtotals: optional.subtotals,
    unknown_cost_count: required.gaps.length + otherGaps.length,
    conditional_unknown_cost_count: conditional.gaps.length,
    optional_unknown_cost_count: optional.gaps.length,
    cost_gaps: [
      ...required.gaps,
      ...conditional.gaps,
      ...optional.gaps,
      ...otherGaps,
    ],
    total_cost: null,
    total_cost_status: "unknown",
    overall_time_to_approval: null,
    timing_milestones,
    renewals: relevant.map((v) => ({
      step_id: v.step.id,
      applicability: v.applicability,
      ...v.step.renewal,
      source_urls: v.urls,
    })),
    ongoing_filings: relevant.flatMap((v) =>
      v.step.ongoing_filings.map((text) => ({
        step_id: v.step.id,
        applicability: v.applicability,
        text,
        source_urls: v.urls,
      })),
    ),
    tradeoffs,
    unknowns: [...place.unknowns],
  };
}
function aligned(
  report: DecisionReport,
  summaries: PlaceDecision[],
): DecisionSummary["dimensions"] {
  const defs = [
    ...kinds.map((key) => ({
      key,
      label: key[0]!.toUpperCase() + key.slice(1),
    })),
    { key: "costs", label: "Known scoped fees" },
    { key: "total_cost", label: "Total setup cost" },
    { key: "time_to_approval", label: "Approval / notice milestones" },
    { key: "renewals", label: "Renewals" },
    { key: "ongoing_filings", label: "Ongoing filings" },
  ];
  return defs.map(({ key, label }) => ({
    key,
    label,
    places: report.places.map((p, i) => {
      const summary = summaries[i]!,
        relevant = p.steps.filter((s) =>
          kinds.includes(key)
            ? s.kind === key
            : key === "costs" || key === "total_cost"
              ? true
              : key === "time_to_approval"
                ? !!s.time.conditions
                : key === "renewals"
                  ? !!s.renewal.description
                  : s.ongoing_filings.length > 0,
        ),
        set = new Set(relevant.map((s) => s.id)),
        select = (ids: string[]) => ids.filter((id) => set.has(id));
      let values: string[];
      if (key === "total_cost")
        values = [
          "Not established. Known fees are partial, not a complete setup total.",
        ];
      else if (key === "costs")
        values = summary.known_fee_subtotals.map((s) =>
          s.subtotal_decimal === null
            ? `${s.currency} / ${s.period}: subtotal withheld; charge identity/alternatives unresolved.`
            : `${s.currency} ${s.subtotal_decimal} / ${s.period} (known scoped subtotal only)`,
        );
      else if (key === "time_to_approval")
        values = summary.timing_milestones.map(
          (t) =>
            `${t.applicability}: ${t.kind}, ${t.minimum_days ?? "?"}–${t.maximum_days ?? "?"} ${t.unit} days. ${t.conditions.join(" ")}`,
        );
      else if (key === "renewals")
        values = summary.renewals.map(
          (r) => `${r.applicability}: ${r.description ?? "Not established"}`,
        );
      else if (key === "ongoing_filings")
        values = summary.ongoing_filings.map(
          (f) => `${f.applicability}: ${f.text}`,
        );
      else
        values = relevant.flatMap((s) => {
          const v = reviewed(s);
          return v && v.applicability !== "outside_scope"
            ? [`${v.applicability}: ${s.requirement}`]
            : [];
        });
      const required = select(summary.applicable_step_ids),
        conditional = select(summary.conditional_step_ids),
        optional = select(summary.optional_step_ids),
        outside = select(summary.outside_scope_step_ids),
        unreviewed = select(summary.unreviewed_step_ids);
      const status: DimensionCell["status"] =
        key === "total_cost"
          ? "unknown"
          : required.length && values.length
            ? "supported"
            : conditional.length || optional.length
              ? "conditional_only"
              : outside.length && !unreviewed.length
                ? "outside_scope"
                : "unknown";
      return {
        place_id: p.id,
        status,
        applicable_step_ids: required,
        conditional_step_ids: conditional,
        optional_step_ids: optional,
        outside_scope_step_ids: outside,
        unreviewed_step_ids: unreviewed,
        values: values.length ? values : ["Not established."],
        unknowns: unique([
          ...p.unknowns,
          ...(unreviewed.length ? ["Unreviewed items are excluded."] : []),
          ...(key === "total_cost"
            ? ["Complete cost scope is not established."]
            : []),
        ]),
      };
    }),
  }));
}
function recommend(
  report: DecisionReport,
  places: PlaceDecision[],
  options: DecisionOptions,
): DecisionSummary["recommendation"] {
  const priority =
    options.priority ??
    report.priority ??
    report.recommendation?.priority ??
    "coverage";
  const tradeoffs = places.map((p, index) => ({
    place_id: p.place_id,
    place_name: p.name,
    items: unique([
      ...p.tradeoffs,
      ...report.places[index]!.steps.flatMap((step) => {
        const v = reviewed(step);
        if (!v || v.applicability === "outside_scope") return [];
        return [
          ...step.costs.map(
            (c) =>
              `${p.name}: ${costApplicability(v.applicability, c.applicability)} cost for ${step.id}: ${c.amount === null ? "amount unknown" : (c.currency ?? "currency unknown") + " " + c.amount} / ${c.period}; ${c.scope}${c.alternative_group ? " (unselected alternative " + c.alternative_group + ")" : ""}.`,
          ),
          ...(!step.renewal.description
            ? [`${p.name}: renewal terms for ${step.id} are not established.`]
            : []),
        ];
      }),
    ]),
  }));
  const base: DecisionSummary["recommendation"] = {
    status: "insufficient_evidence",
    shortlist: [],
    scope:
      "No overall easiest, cheapest or fastest jurisdiction is established.",
    reasons: [
      `No supported registration preference is established for priority ${priority}. Compare the named obligations and unresolved facts; source counts are not a measure of legal ease.`,
    ],
    tradeoffs,
  };
  const registrations = report.places.flatMap((place, index) =>
    place.steps.flatMap((step) => {
      const v = reviewed(step),
        review = step.claim_review;
      if (
        !v ||
        !review ||
        !["required", "conditional"].includes(v.applicability)
      )
        return [];
      const role =
        review.registration_role ??
        (review.decision_role === "registration"
          ? review.obligation_key
          : null);
      if (
        !role ||
        (options.registrationRole && role !== options.registrationRole)
      )
        return [];
      return [{ place, index, evidence: v, role }];
    }),
  );
  const groupKeys = unique(registrations.map((r) => r.role)).sort();
  const candidates: DecisionSummary["recommendation"][] = [];
  for (const role of groupKeys) {
    const group = registrations.filter((r) => r.role === role);
    const initialCandidates = candidates.length;
    // Multiple steps for one place under the same role require explicit reviewer disambiguation.
    if (new Set(group.map((r) => r.place.id)).size !== group.length) continue;
    if (priority !== "cost_clarity" && priority !== "registration_fee") {
      // Affirmative sequence evidence supports a next step, not a comparative prohibition elsewhere.
      const permitted = group.filter(
        (r) =>
          r.evidence.step.claim_review?.registration_start_rule ===
          "may_trade_before_registration",
      );
      if (permitted.length) {
        candidates.push({
          status: "scoped_preference",
          shortlist: permitted.map((r) => r.place.id),
          scope: `Start due diligence on the reviewed registration sequence ${role}; no zero-day opening or overall-ease claim.`,
          reasons: [
            ...permitted.map(
              (r) =>
                `Start due diligence with ${r.place.name}: its checked official rule expressly permits trading before this registration. ${r.evidence.step.requirement} Conditions: ${unique([...(r.evidence.step.claim_review?.conditions ?? []), r.evidence.step.time.conditions].filter(Boolean)).join(" ")}`,
            ),
            "This affirmative permission is the reason for the next step. It does not establish that other places prohibit trading first; their unestablished sequence remains unknown. Other licences, premises, tax and personal eligibility may still apply.",
          ],
          tradeoffs,
        });
        continue;
      }
      // Compare only the same reviewed milestone kind and explicit day unit.
      const timed = group.filter(
        (r) =>
          r.evidence.applicability === "required" &&
          ["notice", "approval"].includes(r.evidence.step.time.kind) &&
          ["calendar", "business"].includes(r.evidence.step.time.unit) &&
          r.evidence.step.time.minimum_days !== null &&
          Number.isFinite(r.evidence.step.time.minimum_days) &&
          r.evidence.step.time.minimum_days! >= 0,
      );
      const timeKeys = unique(
        timed.map(
          (r) => r.evidence.step.time.kind + "|" + r.evidence.step.time.unit,
        ),
      );
      for (const timeKey of timeKeys) {
        const comparable = timed.filter(
          (r) =>
            r.evidence.step.time.kind + "|" + r.evidence.step.time.unit ===
            timeKey,
        );
        if (comparable.length < 2) continue;
        const kind = comparable[0]!.evidence.step.time.kind,
          unit = comparable[0]!.evidence.step.time.unit;
        const valid = comparable.filter((r) => {
          const t = r.evidence.step.time;
          return t.maximum_days === null
            ? kind === "notice"
            : Number.isFinite(t.maximum_days) &&
                t.maximum_days >= t.minimum_days!;
        });
        if (valid.length < 2) continue;
        const winners = valid.filter((r) =>
          valid.every(
            (other) =>
              other === r ||
              (kind === "notice"
                ? r.evidence.step.time.minimum_days! <
                  other.evidence.step.time.minimum_days!
                : r.evidence.step.time.maximum_days! <
                  other.evidence.step.time.minimum_days!),
          ),
        );
        if (winners.length !== 1) continue;
        const winner = winners[0]!,
          t = winner.evidence.step.time;
        candidates.push({
          status: "scoped_preference",
          shortlist: [winner.place.id],
          scope: `Only ${kind === "notice" ? "the stated minimum advance-notice requirement" : "the stated approval interval"} for reviewed registration ${role}; not overall opening duration.`,
          reasons: [
            `Start due diligence with ${winner.place.name} if this ${kind === "notice" ? "minimum notice lead time" : "approval interval"} is your priority: ${kind === "notice" ? t.minimum_days : t.minimum_days + "–" + t.maximum_days} ${unit} days for the same reviewed registration role.`,
            ...valid
              .filter((r) => r !== winner)
              .map(
                (r) =>
                  `${r.place.name}: ${r.evidence.step.time.minimum_days}${kind === "approval" ? "–" + r.evidence.step.time.maximum_days : ""} ${unit} days for the same ${kind} milestone.`,
              ),
            "Different fees, renewal duties, conditions and unresolved requirements remain named trade-offs. Estimates are excluded; no notice or approval intervals are added together.",
            ...report.places
              .filter((p) => !valid.some((r) => r.place.id === p.id))
              .map(
                (p) =>
                  `${p.name} is not ranked on this milestone: a comparable checked kind/unit/quantity is not established.`,
              ),
          ],
          tradeoffs,
        });
      }
      if (candidates.length > initialCandidates) continue;
    }
    if (priority === "timing_clarity") continue;
    // Zero versus a positive required registration charge needs no exchange-rate comparison.
    const costed = group.flatMap((r) => {
      if (
        r.evidence.applicability !== "required" ||
        r.evidence.step.costs.some(
          (c) =>
            costApplicability(r.evidence.applicability, c.applicability) ===
            "unknown",
        )
      )
        return [];
      const costs = r.evidence.step.costs.filter(
        (c) =>
          costApplicability(r.evidence.applicability, c.applicability) ===
          "required",
      );
      if (
        !costs.length ||
        costs.some(
          (c) =>
            c.amount === null ||
            decimal(c.amount) === null ||
            !c.currency ||
            !/^[A-Z]{3}$/.test(c.currency) ||
            !periods.has(c.period) ||
            c.alternative_group,
        )
      )
        return [];
      return [{ ...r, costs, zero: costs.every((c) => c.amount === 0) }];
    });
    const free = costed.filter((r) => r.zero),
      charged = costed.filter((r) => !r.zero);
    if (free.length && charged.length) {
      candidates.push({
        status: "scoped_preference",
        shortlist: free.map((r) => r.place.id),
        scope: `Only the verified registration-fee advantage for ${role}; not total setup cost, exchange-rate ranking or overall easiest place.`,
        reasons: [
          `Start due diligence with ${free.map((r) => r.place.name).join(" or ")} if avoiding this required registration charge is the priority: the checked official source explicitly supports zero for the scoped registration fee.`,
          ...charged.map(
            (r) =>
              `${r.place.name} has a verified positive required registration charge: ${r.costs.map((c) => `${c.currency} ${c.amount} / ${c.period}`).join("; ")}. Payment period and renewal duties remain separate trade-offs.`,
          ),
          ...report.places
            .filter((p) => !costed.some((r) => r.place.id === p.id))
            .map(
              (p) =>
                `${p.name} is not ranked on registration fees: the same required fee scope or amount is not established.`,
            ),
          "Zero versus a documented charge uses no currency conversion. Other setup costs, conditional charges and overall opening times are unresolved unless separately established.",
        ],
        tradeoffs,
      });
    }
  }
  if (!candidates.length) return base;
  const signatures = unique(
    candidates.map((c) => [...c.shortlist].sort().join("|")),
  );
  if (signatures.length !== 1)
    return {
      ...base,
      reasons: [
        "Different reviewed registration dimensions favor different places; choose a named priority or registration role before selecting a route.",
      ],
      tradeoffs,
    };
  const selected = candidates[0]!;
  return candidates.length === 1
    ? selected
    : {
        ...selected,
        scope: candidates.map((c) => c.scope).join(" "),
        reasons: unique(candidates.flatMap((c) => c.reasons)),
      };
}
export function buildDecisionSummary(
  report: DecisionReport,
  options: DecisionOptions = {},
): DecisionSummary {
  if (
    new Set(report.places.map((p) => p.id)).size !== report.places.length ||
    report.places.some(
      (p) => new Set(p.steps.map((s) => s.id)).size !== p.steps.length,
    )
  )
    throw new Error(
      "Unique place/step IDs are required for stable references.",
    );
  const places = report.places.map(placeSummary);
  return {
    activity_id: report.activity?.id ?? null,
    places,
    dimensions: aligned(report, places),
    recommendation: recommend(report, places, options),
    limitations: [
      "Only semantically supported items with checked dated official sources enter verified comparisons.",
      "Known subtotals group currency and payment period; conditional/optional obligations are separate. Complete setup totals remain unknown.",
      "Ambiguous identities, conflicting charges and unselected alternatives withhold subtotals. No currency conversion or ranking.",
      "Notice, approval and estimate milestones stay separate; durations are never summed.",
    ],
  };
}
