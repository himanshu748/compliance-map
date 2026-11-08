import { loadControlsFromEnvironment } from "../../shared/index.js";
import { runDeepResearch } from "../../providers/research.js";
import {
  complianceQuery,
  complianceResult,
  type ComplianceInput,
} from "./core.js";
import {
  complianceBatchQuery,
  complianceBatchResult,
  GeneralComplianceInput,
  type BatchInput,
  type GeneralInput,
} from "./general.js";

/** All activities share ONE Deep job and its one existing-pool reservation. */
export async function researchComplianceBatch(
  input: BatchInput,
  options: { requestId: string; signal?: AbortSignal },
) {
  const query = complianceBatchQuery(input),
    controls = await loadControlsFromEnvironment();
  const receipt = await runDeepResearch({
    controls,
    bounty: "compliance-map",
    query,
    requestId: options.requestId,
    signal: options.signal,
  });
  return { receipt, report: complianceBatchResult(input, receipt) };
}
export async function researchGeneralCompliance(
  input: GeneralInput,
  options: { requestId: string; signal?: AbortSignal },
) {
  const p = GeneralComplianceInput.parse(input);
  return researchComplianceBatch(
    { activities: [p.activity], places: p.places, priority: p.priority },
    options,
  );
}

/** One Deep run, one shared reservation. No fallback to fixtures after live errors. */
export async function researchCompliance(
  input: ComplianceInput,
  options: { requestId: string; signal?: AbortSignal },
) {
  const query = complianceQuery(input);
  const controls = await loadControlsFromEnvironment();
  const receipt = await runDeepResearch({
    controls,
    bounty: "compliance-map",
    query,
    requestId: options.requestId,
    signal: options.signal,
  });
  return { receipt, report: complianceResult(input, receipt) };
}
