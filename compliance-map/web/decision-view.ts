import { esc, words, type ViewReport } from "./view.js";

const clipped = (value: string) =>
  value.length > 170 ? value.slice(0, 165).replace(/\s+\S*$/, "") + "…" : value;
const items = (values: string[]) =>
  values.length
    ? `<ul>${values.map((value) => `<li>${esc(value)}</li>`).join("")}</ul>`
    : '<p class="cell-gap">Not established for this scope.</p>';

/** Equal dimensions stay aligned; detail filters never rewrite the comparison. */
export function decisionSection(report: ViewReport, index: number): string {
  const decision = report.decision;
  if (!decision) return "";
  const labels: Record<string, string> = {
    supported: "Reviewed evidence",
    conditional_only: "Conditional",
    unknown: "Open question",
    outside_scope: "Outside scope",
  };
  const rows = decision.dimensions
    .map(
      (dimension) =>
        `<tr><th scope="row">${esc(dimension.label)}</th>${dimension.places
          .map((cell) => {
            const place = report.places.find((p) => p.id === cell.place_id)!;
            const summary = decision.places.find(
              (p) => p.place_id === cell.place_id,
            )!;
            const values = [...cell.values];
            if (dimension.key === "costs") {
              for (const [name, subtotals] of [
                ["Conditional", summary.conditional_fee_subtotals],
                ["Optional", summary.optional_fee_subtotals],
              ] as const)
                for (const subtotal of subtotals)
                  values.push(
                    `${name}: ${subtotal.currency} ${subtotal.subtotal_decimal ?? "subtotal withheld"} / ${words(subtotal.period)}. This is separate from required fees.`,
                  );
              if (summary.unknown_cost_count)
                values.push(
                  `${summary.unknown_cost_count} required or unreviewed cost lines remain unresolved; missing amounts are not zero.`,
                );
            }
            const refs = [
              ...new Set([
                ...cell.applicable_step_ids,
                ...cell.conditional_step_ids,
                ...cell.optional_step_ids,
              ]),
            ].filter((id) => place.facts.some((fact) => fact.id === id));
            return `<td><span class="comparison-state state-${esc(cell.status)}">${esc(labels[cell.status] ?? "Open question")}</span>${items(values.slice(0, 2).map(clipped))}${values.length > 2 || values.some((value) => value.length > 170) ? `<details class="cell-details"><summary>Read all ${values.length} entries</summary>${items(values)}</details>` : ""}${refs.length ? `<details class="cell-details"><summary>Requirements & sources (${refs.length})</summary><ul>${refs.map((id) => `<li><a href="#requirement-${index}-${esc(place.id)}-${esc(id)}">${esc(id.replaceAll("-", " "))} ↗</a></li>`).join("")}</ul></details>` : ""}</td>`;
          })
          .join("")}</tr>`,
    )
    .join("");
  return `<section class="decision-overview" aria-label="Aligned decision comparison"><div class="decision-heading"><div><p class="mono">The same questions, side by side</p><h4>Compare the routes.</h4></div><p>Required, conditional and optional costs stay separate. Known subtotals cover only the cited items; complete setup costs and opening dates may remain unknown.</p></div><div class="comparison-scroll" tabindex="0" role="region" aria-label="Comparison table; scroll horizontally on small screens"><table class="comparison-table"><caption>${esc(report.name)} — reviewed requirements by place. Filters affect source details only; this summary uses reviewed evidence.</caption><thead><tr><th scope="col">Decision</th>${report.places.map((place) => `<th scope="col">${esc(place.name)}<span>${esc(place.region)}</span></th>`).join("")}</tr></thead><tbody>${rows}</tbody></table></div><p class="comparison-help">Small screen? Focus the table and scroll sideways. Open a requirement for its official source, checked date and applicability.</p></section>`;
}
