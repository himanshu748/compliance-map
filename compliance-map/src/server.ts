import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, open, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { z } from "zod";
import { loadControlsFromEnvironment } from "../../shared/index.js";
import { runDeepResearch } from "../../providers/research.js";
import { publicUrl } from "../../providers/public-url.js";
import { OfficialClaimReviewSchema } from "./audit.js";
import { buildDecisionSummary } from "./decision.js";
import {
  Activity,
  Place,
  ComplianceBatch,
  GeneralModelReport,
  complianceBatchQuery,
  complianceBatchResult,
} from "./general.js";
import { renderGeneralComplianceHtml } from "./html.js";

const MAX_BODY = 32 * 1024;
const MAX_RECORDED = 2 * 1024 * 1024;
const evidence = fileURLToPath(new URL("../evidence/", import.meta.url));
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const stamp = z.iso.datetime();
const text = z.string().max(4000);
const modelStep =
  GeneralModelReport.shape.reports.element.shape.places.element.shape.steps
    .element;
const status = z.enum(["research_candidate", "unresolved", "source_reviewed"]);
const cost = modelStep.shape.costs.element.extend({
  index: z.number().int().min(0).max(4).optional(),
  applicability: z
    .enum(["required", "conditional", "optional", "outside_scope"])
    .optional(),
  alternative_group: z.string().max(200).nullable().optional(),
  obligation_key: z.string().max(200).optional(),
  period_corroboration: z
    .object({
      method: z.literal("ordinary_https_source_review"),
      artifact: z.literal("source-review/report.json"),
      artifact_sha256: digest,
      fact_id: z.string().max(64),
      source_url: z.url(),
      checked_at: stamp,
      text_sha256: digest,
      quote: z.string().max(1000).nullable(),
      quote_check: z.literal("matched"),
      original_quote_sha256: digest,
      quote_excerpt_status: z.enum(["complete", "withheld"]),
      verification_limit: text,
    })
    .nullable()
    .optional(),
});
const source = modelStep.shape.sources.element.extend({
  quote: z.string().max(1000).nullable(),
  quote_check: z.enum([
    "not_checked",
    "matched",
    "not_matched",
    "fetch_failed",
  ]),
  quote_excerpt_status: z.enum(["complete", "truncated", "withheld"]),
  quote_withheld_words: z.number().int().nonnegative(),
  quote_withheld_reason: z.literal("per_page_25_word_export_limit").nullable(),
  original_quote_sha256: digest,
  checked_at: stamp.nullable().optional(),
  text_sha256: digest.nullable().optional(),
  reservation_id: z.uuid().optional(),
});
const step = modelStep.extend({
  costs: z.array(cost).max(5),
  sources: z.array(source).min(1).max(4),
  provenance: z.enum(["provider_reported", "source_reviewed"]),
  claim_review: OfficialClaimReviewSchema.optional(),
});
const storedPlace = Place.extend({
  steps: z.array(step).max(20),
  total_cost: z.null(),
  total_cost_status: z.literal("unknown"),
  known_cost_lines: z
    .array(cost.extend({ step_id: z.string().max(64) }))
    .max(100),
  overall_time_to_approval: z.null(),
  unknowns: z.array(text).max(150),
});
const storedReport = z.object({
  activity: Activity,
  places: z.array(storedPlace).min(3).max(6),
  status,
  comparison_rows: z
    .array(
      z.object({
        kind: modelStep.shape.kind,
        places: z
          .array(
            z.object({
              place_id: z.string().max(64),
              steps: z.array(step).max(20),
              unknown: z.boolean(),
            }),
          )
          .min(3)
          .max(6),
      }),
    )
    .max(6),
  recommendation: z.object({
    shortlist: z.array(z.string().max(64)).max(6),
    basis: z
      .array(
        z.object({
          place_id: z.string().max(64),
          sourced_steps: z.number().int().nonnegative(),
          known_fees: z.number().int().nonnegative(),
          known_timing: z.number().int().nonnegative(),
          unknowns: z.number().int().nonnegative(),
        }),
      )
      .max(6),
    priority: ComplianceBatch.shape.priority,
    explanation: text,
    tradeoffs: z
      .array(
        z.object({
          place_id: z.string().max(64),
          unresolved: z.array(text).max(150),
        }),
      )
      .max(6),
  }),
  limitations: z.array(text).max(100),
});
const storedBatch = z.object({
  format: z.literal("compliance-map-batch-v2"),
  input: ComplianceBatch,
  provider_run_id: z.uuid(),
  provider_jobs: z.literal(1),
  observed_at: stamp,
  status,
  reports: z.array(storedReport).min(1).max(3),
  evidence_mode: z.enum(["saved_live", "synthetic_fixture"]).optional(),
  qualification: z
    .object({
      kind: z.literal("official-source-field-review-v1"),
      original_receipt_sha256: digest,
      original_research_recorded_at: stamp,
      reviewed_at: stamp,
      new_research_jobs: z.literal(0),
      source_observations: z.number().int().nonnegative(),
      secondary_ordinary_https_period_checks: z
        .number()
        .int()
        .nonnegative()
        .optional(),
      prior_ordinary_https_period_checks: z
        .object({
          count: z.number().int().nonnegative(),
          artifact: z.literal("source-review/report.json"),
          artifact_sha256: digest,
          checked_at: stamp,
          method: z.literal("ordinary_https_source_review"),
          included_in_tinyfish_fetch_counts: z.literal(false),
        })
        .optional(),
      secondary_period_corroboration_file: z
        .literal("source-review/report.json")
        .optional(),
      secondary_period_corroboration_sha256: digest.optional(),
      accepted_steps: z.number().int().nonnegative(),
      original_steps: z.number().int().nonnegative().optional(),
      reviewed_model_sha256: digest.optional(),
      claim_reviews_sha256: digest.optional(),
      source_audit_file: z.literal("official-source-audit.json").optional(),
      source_audit_sha256: digest.optional(),
      source_operations: z.number().int().nonnegative().optional(),
      source_pool_halted: z.boolean().optional(),
      new_paid_jobs: z.literal(0).optional(),
      withheld: z
        .array(
          z.object({
            activity_id: text,
            place_id: text,
            step_id: text,
            reason: text,
          }),
        )
        .max(360),
      limits: text,
    })
    .optional(),
});
type RenderedBatch = Parameters<typeof renderGeneralComplianceHtml>[0];

function officialSource(value: string): void {
  const host = new URL(publicUrl(value)).hostname.replace(/^www\./, "");
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
    throw new Error("Unreviewed source host");
}
/** Only public normalized fields survive parsing; raw receipts and unknown fields never reach HTTP. */
export function validateRecordedBatch(raw: unknown): RenderedBatch {
  const batch = storedBatch.parse(raw);
  if (
    batch.reports.length !== batch.input.activities.length ||
    new Set(batch.reports.map((r) => r.activity.id)).size !==
      batch.reports.length
  )
    throw new Error("Recorded activity coverage differs");
  for (const report of batch.reports) {
    const activity = batch.input.activities.find(
      (a) => a.id === report.activity.id,
    );
    if (
      !activity ||
      JSON.stringify(activity) !== JSON.stringify(report.activity) ||
      report.places.length !== batch.input.places.length ||
      new Set(report.places.map((p) => p.id)).size !== report.places.length ||
      report.status !== batch.status
    )
      throw new Error("Recorded request identity differs");
    for (const place of report.places) {
      const expected = batch.input.places.find((p) => p.id === place.id);
      if (
        !expected ||
        JSON.stringify(expected) !==
          JSON.stringify(
            Place.parse({
              id: place.id,
              name: place.name,
              region: place.region,
              country: place.country,
            }),
          ) ||
        new Set(place.steps.map((s) => s.id)).size !== place.steps.length
      )
        throw new Error("Recorded place or requirement identity differs");
      for (const item of place.steps) {
        for (const s of item.sources) officialSource(s.url);
        for (const line of item.costs) {
          if (line.period_corroboration) {
            officialSource(line.period_corroboration.source_url);
            if (
              !item.sources.some(
                (source) =>
                  source.url === line.period_corroboration!.source_url,
              )
            )
              throw new Error("Period corroboration source differs");
          }
        }
        for (const url of item.claim_review?.source_urls ?? [])
          officialSource(url);
        if (
          batch.status === "source_reviewed" &&
          (item.provenance !== "source_reviewed" ||
            item.claim_review?.status !== "supported" ||
            item.sources.some(
              (s) =>
                s.quote_check !== "matched" ||
                !s.checked_at ||
                !s.text_sha256 ||
                !s.reservation_id ||
                !item.claim_review!.source_urls.includes(s.url) ||
                Date.parse(s.checked_at) < Date.parse(s.observed_at),
            ))
        )
          throw new Error("Recorded review lacks source evidence");
      }
      for (const line of place.known_cost_lines)
        if (!place.steps.some((s) => s.id === line.step_id))
          throw new Error("Unknown cost reference");
    }
    const ids = new Set(report.places.map((p) => p.id));
    if (
      report.recommendation.priority !== batch.input.priority ||
      report.recommendation.shortlist.some((id) => !ids.has(id)) ||
      report.recommendation.tradeoffs.some((p) => !ids.has(p.place_id))
    )
      throw new Error("Unknown recommendation identity");
    for (const row of report.comparison_rows) {
      if (
        row.places.length !== report.places.length ||
        new Set(row.places.map((p) => p.place_id)).size !== ids.size
      )
        throw new Error("Comparison coverage differs");
      for (const cell of row.places) {
        const p = report.places.find((place) => place.id === cell.place_id);
        if (
          !p ||
          JSON.stringify(cell.steps) !==
            JSON.stringify(p.steps.filter((s) => s.kind === row.kind))
        )
          throw new Error("Comparison sources differ");
      }
    }
  }
  if (
    batch.status === "source_reviewed" &&
    (!batch.qualification || batch.evidence_mode !== "saved_live")
  )
    throw new Error("Recorded review metadata is missing");
  if (
    batch.qualification &&
    (batch.qualification.original_research_recorded_at !== batch.observed_at ||
      batch.qualification.accepted_steps !==
        batch.reports.reduce(
          (n, r) => n + r.places.reduce((m, p) => m + p.steps.length, 0),
          0,
        ))
  )
    throw new Error("Recorded review totals or timestamp differ");
  // Derive the public decision from validated facts, never trust a stored decision blob.
  const normalized = {
    ...batch,
    reports: batch.reports.map((report) => {
      const decision = buildDecisionSummary(report, {
        priority: batch.input.priority,
      });
      return {
        ...report,
        decision,
        recommendation: {
          ...report.recommendation,
          shortlist: decision.recommendation.shortlist,
          basis: [],
          explanation: [
            decision.recommendation.scope,
            ...decision.recommendation.reasons,
          ].join(" "),
          tradeoffs: decision.recommendation.tradeoffs.map((place) => ({
            place_id: place.place_id,
            unresolved: place.items,
          })),
        },
      };
    }),
  };
  return normalized as unknown as RenderedBatch;
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}
async function requestBody(req: IncomingMessage): Promise<unknown> {
  const length = req.headers["content-length"];
  if (length && (!/^\d+$/.test(length) || Number(length) > MAX_BODY))
    throw new HttpError(413, "BODY_TOO_LARGE");
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const raw of req) {
    const chunk = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
    size += chunk.length;
    if (size > MAX_BODY) throw new HttpError(413, "BODY_TOO_LARGE");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new HttpError(400, "INVALID_INPUT");
  }
}
function json(res: ServerResponse, code: number, value: unknown) {
  if (res.destroyed) return;
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(value));
}
function html(res: ServerResponse, value: string) {
  const hashes = (tag: string) =>
    [
      ...value.matchAll(
        new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "g"),
      ),
    ]
      .map(
        (m) =>
          `'sha256-${createHash("sha256").update(m[1]!).digest("base64")}'`,
      )
      .join(" ");
  res.setHeader(
    "Content-Security-Policy",
    `default-src 'self'; script-src 'self' ${hashes("script")}; style-src 'self' ${hashes("style")}; font-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; object-src 'none'`,
  );
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(value);
}
async function privateDirectory(path: string) {
  if (!isAbsolute(path))
    throw new Error("An absolute private output path is required");
  await mkdir(path, { recursive: true, mode: 0o700 });
  const stat = await lstat(path);
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    (stat.mode & 0o077) !== 0 ||
    stat.uid !== process.getuid?.()
  )
    throw new Error("The output directory must be private and owner-only");
}
async function savePrivate(path: string, value: unknown) {
  const file = await open(path, "wx", 0o600);
  try {
    await file.writeFile(JSON.stringify(value, null, 2) + "\n");
    await file.sync();
  } finally {
    await file.close();
  }
  const directory = await open(dirname(path), "r");
  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
}
export interface ComplianceServerOptions {
  liveEnabled?: boolean;
  recordedReportFile?: string;
  evidenceDirectory?: string;
  privateOutputDirectory?: string;
  /** Dependency injection is for isolated offline transport tests; CLI always uses shared controls. */
  loadControls?: typeof loadControlsFromEnvironment;
  research?: typeof runDeepResearch;
}
export function createComplianceServer(options: ComplianceServerOptions = {}) {
  if (options.recordedReportFile && !isAbsolute(options.recordedReportFile))
    throw new Error("Recorded override must be absolute");
  const live = options.liveEnabled === true;
  let busy = false;
  const reports = new Map<string, { html: string; expires: number }>();
  const controllers = new Set<AbortController>();
  async function recorded() {
    let path = options.recordedReportFile;
    if (!path) {
      const directory = options.evidenceDirectory ?? evidence;
      path = join(directory, "qualified-batch-report.json");
      try {
        await lstat(path);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        path = join(directory, "live-batch-reconciled-report.json");
      }
    }
    const file = await open(path, "r");
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.size > MAX_RECORDED)
        throw new Error("Recorded report exceeds its bound");
      return validateRecordedBatch(
        JSON.parse(await file.readFile("utf8")) as unknown,
      );
    } finally {
      await file.close();
    }
  }
  const server = createServer(async (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    );
    try {
      const address = server.address();
      if (!address || typeof address === "string")
        throw new HttpError(503, "NOT_LISTENING");
      const origin = `http://127.0.0.1:${address.port}`;
      if (req.headers.host !== new URL(origin).host)
        throw new HttpError(403, "HOST_REJECTED");
      const path = req.url ?? "";
      if (req.method === "GET" && path === "/health") {
        json(res, 200, {
          service: "compliance-map",
          mode: live ? "live_enabled_shared_controls" : "recorded_only",
          automatic_retry: false,
        });
        return;
      }
      const assets: Record<string, URL> = {
        "/assets/manrope.woff2": new URL(
          "../../ui/assets/manrope.woff2",
          import.meta.url,
        ),
        "/assets/dmsans.woff2": new URL(
          "../../ui/assets/dmsans.woff2",
          import.meta.url,
        ),
      };
      if (req.method === "GET" && Object.hasOwn(assets, path)) {
        const bytes = await readFile(assets[path]!);
        res.writeHead(200, {
          "Content-Type": "font/woff2",
          "Cache-Control": "public, max-age=3600",
        });
        res.end(bytes);
        return;
      }
      if (
        req.method === "GET" &&
        ["/", "/compliance-map", "/evidence/report.json"].includes(path)
      ) {
        let report: RenderedBatch;
        try {
          report = await recorded();
        } catch {
          throw new HttpError(503, "RECORDED_REPORT_UNAVAILABLE");
        }
        if (path === "/evidence/report.json") json(res, 200, report);
        else
          html(res, renderGeneralComplianceHtml(report, { liveEnabled: live }));
        return;
      }
      for (const [key, value] of reports)
        if (value.expires <= Date.now()) reports.delete(key);
      if (
        req.method === "GET" &&
        /^\/reports\/[a-f0-9-]{36}\.html$/.test(path)
      ) {
        const report = reports.get(path);
        if (!report) throw new HttpError(404, "NOT_FOUND");
        html(res, report.html);
        return;
      }
      if (path !== "/api/compliance-map/v2" || req.method !== "POST")
        throw new HttpError(404, "NOT_FOUND");
      if (
        req.headers.origin !== origin ||
        (req.headers["sec-fetch-site"] &&
          req.headers["sec-fetch-site"] !== "same-origin")
      )
        throw new HttpError(403, "ORIGIN_REJECTED");
      if (
        !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(
          req.headers["content-type"] ?? "",
        )
      )
        throw new HttpError(415, "JSON_REQUIRED");
      const body = z
        .object({ input: ComplianceBatch, request_id: z.uuid() })
        .strict()
        .safeParse(await requestBody(req));
      if (!body.success) throw new HttpError(400, "INVALID_INPUT");
      if (!live) throw new HttpError(503, "LIVE_DISABLED");
      if (busy) throw new HttpError(409, "BUSY");
      busy = true;
      const controller = new AbortController();
      controllers.add(controller);
      const abort = () => {
        if (!res.writableEnded) controller.abort();
      };
      req.once("aborted", abort);
      res.once("close", abort);
      let output: string | undefined;
      try {
        const controls = await (
          options.loadControls ?? loadControlsFromEnvironment
        )();
        const directory =
          options.privateOutputDirectory ??
          join(
            homedir(),
            ".config",
            "tinyfish-bounty-drop-002",
            "compliance-map-web",
          );
        await privateDirectory(directory);
        const id = randomUUID();
        output = join(directory, id);
        await privateDirectory(output);
        await savePrivate(join(output, "request.json"), body.data);
        const receipt = await (options.research ?? runDeepResearch)({
          controls,
          bounty: "compliance-map",
          query: complianceBatchQuery(body.data.input),
          requestId: body.data.request_id,
          signal: controller.signal,
          onStarted: async (accepted) => {
            await savePrivate(join(output!, "accepted.json"), accepted);
          },
        });
        await savePrivate(join(output, "research-receipt.json"), receipt);
        if (controller.signal.aborted) throw new HttpError(499, "CANCELLED");
        const report = validateRecordedBatch(
          complianceBatchResult(body.data.input, receipt),
        );
        await savePrivate(join(output, "report.json"), report);
        const content = renderGeneralComplianceHtml(report, {
          liveEnabled: live,
        });
        const url = `/reports/${id}.html`;
        if (reports.size >= 20) reports.delete(reports.keys().next().value!);
        reports.set(url, {
          html: content,
          expires: Date.now() + 30 * 60 * 1000,
        });
        json(res, 200, { report_url: url, status: report.status });
      } catch (error) {
        const code =
          error instanceof HttpError
            ? error.code
            : error &&
                typeof error === "object" &&
                "code" in error &&
                typeof error.code === "string" &&
                /^[A-Z_]{1,80}$/.test(error.code)
              ? error.code
              : "RESEARCH_FAILED";
        if (output)
          await savePrivate(join(output, "failure.json"), {
            code,
            observed_at: new Date().toISOString(),
            automatic_retry: false,
          }).catch(() => undefined);
        throw new HttpError(
          error instanceof HttpError ? error.status : 503,
          code,
        );
      } finally {
        controllers.delete(controller);
        req.removeListener("aborted", abort);
        res.removeListener("close", abort);
        busy = false;
      }
    } catch (error) {
      const failure =
        error instanceof HttpError
          ? error
          : new HttpError(500, "SERVER_FAILURE");
      json(res, failure.status, {
        code: failure.code,
        message:
          "The request did not produce a new report. No automatic retry or recorded-report substitution was made.",
      });
    }
  });
  const abortActiveRequests = () => {
    for (const controller of controllers) controller.abort();
  };
  server.on("close", abortActiveRequests);
  server.requestTimeout = 30_000;
  server.headersTimeout = 10_000;
  server.timeout = 0;
  return Object.assign(server, { abortActiveRequests });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const port = Number(
    process.env.COMPLIANCE_MAP_PORT ?? process.env.PORT ?? "4390",
  );
  if (!Number.isInteger(port) || port < 0 || port > 65535)
    throw new Error("Invalid local port");
  const server = createComplianceServer({
    liveEnabled: process.env.BOUNTY_POOL_LIVE === "1",
    ...(process.env.COMPLIANCE_RECORDED_REPORT
      ? { recordedReportFile: process.env.COMPLIANCE_RECORDED_REPORT }
      : {}),
    ...(process.env.COMPLIANCE_PRIVATE_OUTPUT_DIRECTORY
      ? {
          privateOutputDirectory:
            process.env.COMPLIANCE_PRIVATE_OUTPUT_DIRECTORY,
        }
      : {}),
  });
  server.listen(port, "127.0.0.1", () => {
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("Missing loopback address");
    console.log(
      `Compliance Map: http://127.0.0.1:${address.port} (live ${process.env.BOUNTY_POOL_LIVE === "1" ? "enabled with shared controls" : "disabled"})`,
    );
  });
  const stop = () => {
    server.abortActiveRequests();
    server.close();
    const deadline = setTimeout(() => {
      server.closeAllConnections();
    }, 30_000);
    deadline.unref();
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}
