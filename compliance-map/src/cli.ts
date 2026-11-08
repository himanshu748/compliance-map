import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import {
  complianceQuery,
  complianceResult,
  type ComplianceResult,
  type ComplianceInput,
} from "./core.js";
import { sourceReviewReport } from "./reviewed.js";
import { corroborateSources } from "./sources.js";
import { renderComplianceHtml } from "./html.js";
import {
  ComplianceBatch,
  complianceBatchQuery,
  complianceBatchResult,
  demonstrationBatch,
} from "./general.js";

const Receipt = z
  .object({
    provider: z.literal("tinyfish-research"),
    mode: z.literal("deep"),
    research_run_id: z.uuid(),
    reservation_id: z.uuid(),
    reserved_microusd: z.number().int().min(0),
    status: z.enum([
      "QUEUED",
      "RUNNING",
      "COMPLETED",
      "FAILED",
      "CANCELLED",
      "TIMED_OUT",
    ]),
    recorded_at: z.iso.datetime(),
    result: z.string().max(1_500_000).nullable(),
    citations: z.array(z.string().max(4000)).max(1000),
    termination_reason: z.string().max(100).nullable(),
    warnings: z.array(z.string().max(1000)).max(100),
  })
  .strict();
async function bundle(path: string, report: ComplianceResult) {
  await mkdir(path);
  await writeFile(
    join(path, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
    { flag: "wx" },
  );
  await writeFile(join(path, "index.html"), renderComplianceHtml(report), {
    flag: "wx",
  });
}
async function main() {
  const args = process.argv.slice(2),
    check = args.includes("--check-sources"),
    clean = args.filter((v) => v !== "--check-sources");
  const [command, first, second, third] = clean;
  if (command === "batch-example" && first && clean.length === 2 && !check) {
    await writeFile(first, JSON.stringify(demonstrationBatch, null, 2) + "\n", {
      flag: "wx",
    });
    process.stdout.write(
      "Wrote two activity requests and three places; provider calls:0.\n",
    );
    return;
  }
  if (
    (command === "batch-query" || command === "batch-report") &&
    first &&
    second &&
    !check
  ) {
    if ((await stat(first)).size > 25000) throw new Error("Request too large");
    const request = ComplianceBatch.parse(
      JSON.parse(
        new TextDecoder("utf8", { fatal: true }).decode(await readFile(first)),
      ),
    );
    if (command === "batch-query" && clean.length === 3) {
      await writeFile(second, complianceBatchQuery(request) + "\n", {
        flag: "wx",
      });
      process.stdout.write("Wrote one batched Deep query; provider calls:0.\n");
      return;
    }
    if (command === "batch-report" && third && clean.length === 4) {
      if ((await stat(second)).size > 2000000)
        throw new Error("Receipt too large");
      const receipt = Receipt.parse(
          JSON.parse(
            new TextDecoder("utf8", { fatal: true }).decode(
              await readFile(second),
            ),
          ),
        ),
        report = complianceBatchResult(request, receipt);
      await mkdir(third);
      await writeFile(
        join(third, "report.json"),
        JSON.stringify(report, null, 2) + "\n",
        { flag: "wx" },
      );
      process.stdout.write(
        `Normalized ${report.reports.length} activity comparisons from one saved receipt; no new provider run.\n`,
      );
      return;
    }
  }
  if (command === "source-review" && first && clean.length === 2) {
    const baseline = sourceReviewReport();
    const report = check ? await corroborateSources(baseline) : baseline;
    await bundle(first, report);
    process.stdout.write(
      "Wrote a manually reviewed official-source comparison and HTML. TinyResearch calls: 0.\n",
    );
    return;
  }
  const priority = z
    .enum(["registration_fee", "timing_clarity"])
    .parse(command === "query" ? first : (third ?? "registration_fee"));
  const input: ComplianceInput = {
    business: "fixed-premises-cafe",
    priority,
    scope_confirmed: true,
  };
  if (command === "query" && second && clean.length === 3 && !check) {
    await writeFile(second, complianceQuery(input) + "\n", { flag: "wx" });
    process.stdout.write(
      "Wrote the scoped research query; provider calls: 0.\n",
    );
    return;
  }
  if (command === "report" && first && second && clean.length <= 4) {
    if ((await stat(first)).size > 2_000_000)
      throw new Error("Receipt is too large");
    const receipt = Receipt.parse(
      JSON.parse(
        new TextDecoder("utf8", { fatal: true }).decode(await readFile(first)),
      ) as unknown,
    );
    const initial = complianceResult(input, receipt),
      report = check ? await corroborateSources(initial) : initial;
    await bundle(second, report);
    process.stdout.write(
      `Wrote a ${report.status} report from a saved receipt; no new TinyResearch run.\n`,
    );
    return;
  }
  throw new Error("Usage");
}
main().catch(() => {
  process.stderr.write(
    "LOCAL_FAILURE: Use batch-example <new-request.json>, batch-query <request.json> <new.txt>, batch-report <request.json> <saved-receipt.json> <new-dir>, source-review <new-dir> [--check-sources], query <registration_fee|timing_clarity> <new.txt>, or report <saved-receipt.json> <new-dir> [priority] [--check-sources]. Inputs must match the strict schema; outputs are never overwritten. No paid job was started.\n",
  );
  process.exitCode = 1;
});
