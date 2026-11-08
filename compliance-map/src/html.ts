import { sourceReviewReport } from "./reviewed.js";
import type { ComplianceResult } from "./core.js";
import {
  legacyView,
  generalView,
  type GeneralBatch,
  type HtmlOptions,
} from "../web/view.js";
import { renderPage } from "../web/page.js";

export type ComplianceHtmlOptions = HtmlOptions;
/** Existing CLI API: renders the explicitly labelled source review when no report is passed. */
export function renderComplianceHtml(
  report: ComplianceResult = sourceReviewReport(),
  options: ComplianceHtmlOptions = {},
): string {
  return renderPage(legacyView(report), options);
}
/** Whole parsed v2 batch; no substitution of source-review facts into a missing live result. */
export function renderGeneralComplianceHtml(
  batch: GeneralBatch,
  options: ComplianceHtmlOptions = {},
): string {
  return renderPage(generalView(batch), options);
}
