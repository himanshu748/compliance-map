import type { BatchInput } from "../src/general.js";
import { decisionSection } from "./decision-view.js";
import {
  esc,
  safeLink,
  words,
  type ViewReport,
  type ViewSource,
  type ViewPlace,
} from "./view.js";

function sources(items: ViewSource[]) {
  const count = new Set(items.map((s) => s.url)).size;
  return `<details data-source-details><summary>${count} source${count === 1 ? "" : "s"} · inspect evidence</summary>${items
    .map((s) => {
      const url = safeLink(s.url);
      return `<div class="source">${url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)} ↗</a>` : "<span>Source link withheld</span>"}${s.quote ? `<blockquote>“${esc(s.quote)}”</blockquote>` : '<p class="source-meta">Excerpt not retained. Open the original source for context.</p>'}<p class="source-meta">Quote: ${esc(words(s.check))}<br>Observed ${esc(s.observed)}<br>Published ${esc(s.published ?? "date not stated")}${s.checked ? "<br>Text checked " + esc(s.checked) : ""}</p></div>`;
    })
    .join("")}</details>`;
}
export function reportSection(report: ViewReport, index: number) {
  return `<section data-report="${index}"${index ? " hidden" : ""}><div class="comparison-heading"><h3>${esc(report.name)}</h3><p>${esc(report.scope)}</p></div>${decisionSection(report, index)}<h4 class="details-heading">Steps & source detail</h4><div class="places">${report.places.map((place, i) => `<article class="place${i === 0 ? " is-focused" : ""}" data-place="${i}"><header><span class="place-no">0${i + 1}</span><h4>${esc(place.name)}</h4><p class="region">${esc([place.region, place.country].filter(Boolean).join(" · "))}</p></header>${place.facts.map((f) => `<section class="fact"${f.id ? ` id="requirement-${index}-${esc(place.id)}-${esc(f.id)}"` : ""} data-kind="${esc(f.category)}" data-kinds="${esc(f.kinds.join(" "))}"><p class="fact-label">${esc(words(f.category))}${f.applicability ? `<span class="applicability">${esc(words(f.applicability))}</span>` : ""}</p>${f.value.length <= 180 ? `<p class="fact-value">${esc(f.value)}</p>` : `<p class="fact-value fact-long">${esc(f.value.slice(0, 170).replace(/\s+\S*$/, ""))}…</p><details class="requirement-detail"><summary>Read the full requirement</summary><p class="fact-copy">${esc(f.value)}</p></details>`}<p class="fact-copy">${esc(f.claim)}</p>${f.condition ? `<p class="condition">${esc(f.condition)}</p>` : ""}${f.values.length ? `<div class="fact-values">${f.values.map((v) => `<div><span>${esc(v.label)}</span>${esc(v.text)}</div>`).join("")}</div>` : ""}${f.reviewSummary ? `<details class="review-notes"><summary>What was checked</summary><p>${esc(f.reviewSummary)}</p></details>` : ""}${sources(f.sources)}</section>`).join("") || '<p class="empty">No validated requirements returned. Missing evidence does not mean no requirement exists.</p>'}<details class="unknowns" data-kind="unknowns"><summary>Open questions (${place.unknowns.length})</summary><ul>${place.unknowns.map((u) => `<li>${esc(u)}</li>`).join("")}</ul></details></article>`).join("")}</div><section class="recommendation"${index ? "" : ' id="recommendation"'}><p class="eyebrow">A provisional<br>starting point ↗</p><div><h3>${report.shortlist.length ? report.shortlist.map((id) => esc(report.places.find((p) => p.id === id)?.name ?? id)).join(" + ") : "Resolve the evidence gaps first"}</h3><p>${esc(report.explanation)}</p><p class="condition">${esc(report.caveat)}</p>${report.decision ? `<details class="decision-tradeoffs"><summary>Trade-offs in each place</summary>${report.decision.recommendation.tradeoffs.map((t) => `<h4>${esc(t.place_name)}</h4><ul>${t.items.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>`).join("")}</details>` : ""}</div></section><details class="limitations"><summary>Scope, provenance & open questions</summary><p>${esc(report.scope)}</p><ul>${report.limitations.map((l) => `<li>${esc(l)}</li>`).join("")}</ul></details></section>`;
}
export function placeFields(places: BatchInput["places"]) {
  return places
    .map(
      (place, i) =>
        `<div class="place-inputs" data-place-input><span class="place-index">0${i + 1}</span><div class="city-field"><label for="place-name-${i}">City or place</label><input id="place-name-${i}" data-field="name" value="${esc(place.name)}" maxlength="100" required></div><div class="region-field"><label for="place-region-${i}">State or region</label><input id="place-region-${i}" data-field="region" value="${esc(place.region)}" maxlength="100" required></div><div class="country-field"><label for="place-country-${i}">Country</label><input id="place-country-${i}" data-field="country" value="${esc(place.country)}" maxlength="100" required></div><button class="remove-place" type="button" aria-label="Remove place ${i + 1}"${places.length <= 3 ? " disabled" : ""}>×</button></div>`,
    )
    .join("");
}
export function atlas(places: ViewPlace[]) {
  return `<div class="atlas reveal" aria-label="Interactive research atlas"><div class="atlas-top"><span>Research atlas / ${String(places.length).padStart(2, "0")}</span><span>Select a place ↓</span></div><div class="atlas-map"><svg class="atlas-lines" viewBox="0 0 640 420" aria-hidden="true"><path class="contour" d="M-80 365C90 260 65 140 255 148S420 20 690 80M-70 345C80 260 80 158 250 168S438 50 690 102M-90 322C80 242 85 180 250 190S440 80 690 125M-80 300C70 225 95 201 255 212S460 112 690 148M-80 279C60 220 105 224 270 235S460 144 690 174"/><path class="route" d="M115 278C160 278 235 226 275 189S360 98 410 113"/><circle cx="322" cy="211" r="132" class="contour"/><circle cx="322" cy="211" r="145" class="contour"/></svg><span class="atlas-watermark" aria-hidden="true">${String(places.length).padStart(2, "0")}</span>${places.map((p, i) => `<button type="button" class="atlas-point" data-atlas="${i}" aria-pressed="${i === 0}"><span>0${i + 1} / jurisdiction</span><strong>${esc(p.name)}</strong></button>`).join("")}</div><div class="atlas-caption"><div><span class="mono">Recorded evidence / select above</span><h3 id="atlas-name">${esc(places[0]?.name ?? "No place")}</h3><p id="atlas-detail">${esc(places[0]?.region ?? "No source facts")}</p></div><div class="atlas-value"><span id="atlas-count">${places[0]?.facts.length ?? 0}</span><small>recorded facts</small></div></div></div>`;
}
