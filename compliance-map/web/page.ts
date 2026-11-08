import { demonstrationBatch } from "../src/general.js";
import { atlas, reportSection } from "./fragments.js";
import { researchForm } from "./form.js";
import { complianceStyles } from "./styles.js";
import { complianceClient } from "./client.js";
import { esc, serial, shortDate, type HtmlOptions, type View } from "./view.js";

export function renderPage(view: View, options: HtmlOptions): string {
  const places = view.reports[0]!.places;
  const sourceCount = new Set(
    view.reports.flatMap((r) =>
      r.places.flatMap((p) =>
        p.facts.flatMap((f) => f.sources.map((s) => s.url).filter(Boolean)),
      ),
    ),
  ).size;
  const factCount = view.reports.reduce(
    (n, r) => n + r.places.reduce((n, p) => n + p.facts.length, 0),
    0,
  );
  const report = `<section id="report" class="report-wrap" aria-label="Jurisdiction comparison"><div class="section-title"><div><p class="eyebrow">02 / The evidence</p><h2>A clearer starting point.</h2></div><p class="section-note">Compare like with like. Keep a source next to every claim, and an open question next to every gap.</p></div><div class="report-meta"><span class="evidence-mode"><span class="dot"></span>${esc(view.modeLabel)}</span><span class="report-date">Recorded ${esc(shortDate(view.observed))}</span></div>${view.reports.length > 1 ? `<div class="activity-tabs" aria-label="Choose activity">${view.reports.map((r, i) => `<button type="button" class="activity-tab" data-activity-tab="${i}" aria-pressed="${i === 0}">${esc(r.name)}</button>`).join("")}</div>` : ""}<div class="toolbar"><div class="filters" aria-label="Filter comparison facts">${[
    ["all", "All facts"],
    ["fee", "Costs"],
    ["timing", "Timing"],
    ["renewal", "Renewals"],
    ["filing", "Filings"],
    ["unknowns", "Open questions"],
  ]
    .map(
      ([key, label]) =>
        `<button class="filter" type="button" data-filter="${key}" aria-pressed="${key === "all"}">${label}</button>`,
    )
    .join(
      "",
    )}</div><div class="tools"><label class="search-label"><input id="report-search" type="search" placeholder="Find a requirement" aria-label="Find a requirement"></label><button type="button" id="expand-sources">Open all sources</button><button type="button" id="download">Export JSON ↓</button></div></div>${view.reports.map(reportSection).join("")}<details class="limitations"><summary>About this evidence and its limits</summary><p>A source review and a TinyResearch candidate are different evidence states. Matching an excerpt confirms text presence, not legal completeness. Total setup cost and permission to open are not established by a partial report.</p><p>Recorded ${esc(view.observed)}${view.run ? " · Run " + esc(view.run) : " · No provider run"}</p></details></section>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>Compliance Map — A clearer route to starting</title><style>${complianceStyles}</style></head><body><a class="skip" href="#workspace">Skip to comparison</a><div class="shell"><nav class="nav" aria-label="Main navigation"><a class="brand" href="#top"><span class="brand-mark" aria-hidden="true"><i></i><i></i></span>Compliance<br>Map</a><div class="navlinks"><a class="desktop-link" href="#method">How it works</a><a class="desktop-link" href="#report">Recorded evidence</a><a class="nav-cta" href="#workspace">Build a comparison <span aria-hidden="true">↗</span></a></div></nav><main id="top"><section class="hero"><div class="reveal"><p class="eyebrow"><span class="dot"></span>Decision research / jurisdiction by jurisdiction</p><h1><span>Different places.</span><span>Different rules.</span><span class="blue">One clear view.</span></h1><p class="lede">Bring the paperwork into focus. Compare the requirements, costs and open questions across places—then go straight to the source.</p><div class="hero-actions"><a class="primary" href="#workspace">Compare the routes <span aria-hidden="true">↗</span></a><a class="text-link" href="#report">Explore the recorded review ↓</a></div></div>${atlas(places)}</section><div class="facts-strip"><div class="strip-note"><span class="dot"></span><span><strong>${esc(view.mode === "source_review" ? "A sourced starting point." : "Evidence before a decision.")}</strong><br>${esc(view.mode === "source_review" ? "Explore the café review or prepare a different brief." : "Read the source links and keep the gaps in view.")}</span></div><div class="strip-item"><span class="strip-number">${String(places.length).padStart(2, "0")}</span><span class="strip-label">places in<br>this comparison</span></div><div class="strip-item"><span class="strip-number">${String(sourceCount).padStart(2, "0")}</span><span class="strip-label">distinct linked<br>source pages</span></div><div class="strip-item"><span class="strip-number">${String(factCount).padStart(2, "0")}</span><span class="strip-label">recorded facts<br>with evidence</span></div></div>${researchForm(view, options)}<p class="status" id="status" role="status" aria-live="polite">${esc(view.modeLabel)}. No new research request has been made.</p>${report}<section class="method" id="method" aria-label="How it works"><article><p class="mono">01 / Frame the question</p><h3>One activity.<br>Several real options.</h3><p>A clear scope makes the paperwork comparable. Put the same business idea in each place.</p></article><article><p class="mono">02 / Follow the evidence</p><h3>The rule, the date,<br>the original page.</h3><p>Read licences, filings, costs, timing and renewals beside their source. Unknown stays unknown.</p></article><article><p class="mono">03 / Make the next move</p><h3>A starting point,<br>with the trade-offs.</h3><p>Export the research, check what remains open and confirm applicability with the relevant authority.</p></article></section></main><footer class="footer"><strong>Compliance Map / A clearer route to starting.</strong><span>Research before action. Keep the sources close.</span><button type="button" id="motion-toggle" aria-pressed="false">Motion: on</button></footer></div><script type="application/json" id="initial-report">${serial(view.raw)}</script><script type="application/json" id="view-model">${serial({ reports: view.reports, seed: view.seed, presets: demonstrationBatch.activities, liveEnabled: options.liveEnabled === true })}</script><script>${complianceClient}</script></body></html>`;
}
