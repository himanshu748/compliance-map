import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request as httpRequest } from "node:http";
import { spawn } from "node:child_process";
import { setTimeout as pause } from "node:timers/promises";
import { PrivateApiKey, PoolLedger } from "../../shared/index.js";
import type { ResearchReceipt } from "../../providers/research.js";
import { complianceBatchResult, demonstrationBatch } from "../src/general.js";
import {
  createComplianceServer,
  validateRecordedBatch,
  type ComplianceServerOptions,
} from "../src/server.js";

function fixture() {
  const input = structuredClone(demonstrationBatch);
  const reports = input.activities.map((activity) => ({
    activity_id: activity.id,
    places: input.places.map((place) => ({
      place_id: place.id,
      steps: [
        {
          id: "synthetic-filing",
          kind: "filing",
          requirement:
            "Synthetic fixture filing; not a government requirement.",
          authority: "Synthetic test only",
          costs: [],
          time: {
            minimum_days: null,
            maximum_days: null,
            unit: "unspecified",
            kind: "unknown",
            conditions: "Unknown in this fixture.",
          },
          renewal: { description: null, interval_months: null },
          ongoing_filings: [],
          sources: [
            {
              url: `https://www.gov.uk/synthetic-fixture/${activity.id}/${place.id}`,
              quote: "Synthetic source excerpt for an isolated server test.",
              published_on: null,
              observed_at: "2026-11-08T07:30:00.000Z",
            },
          ],
        },
      ],
      unknowns: ["Synthetic fixture; no legal facts asserted."],
    })),
    limitations: ["Synthetic HTTP fixture only."],
  }));
  const receipt: ResearchReceipt = {
    provider: "tinyfish-research",
    mode: "deep",
    research_run_id: randomUUID(),
    reservation_id: randomUUID(),
    reserved_microusd: 2_000_000,
    status: "COMPLETED",
    recorded_at: "2026-11-08T07:30:00.000Z",
    result: JSON.stringify({ reports }),
    citations: reports.flatMap((r) =>
      r.places.flatMap((p) =>
        p.steps.flatMap((s) => s.sources.map((x) => x.url)),
      ),
    ),
    termination_reason: "planner_done",
    warnings: [],
  };
  return { input, receipt, batch: complianceBatchResult(input, receipt) };
}
async function setup(t: TestContext, options: ComplianceServerOptions = {}) {
  const directory = await mkdtemp(join(tmpdir(), "compliance-http-offline-"));
  const f = fixture();
  const file = join(directory, "recorded.json");
  await writeFile(file, JSON.stringify(f.batch));
  const server = createComplianceServer({
    ...(options.evidenceDirectory ? {} : { recordedReportFile: file }),
    privateOutputDirectory: join(directory, "private"),
    ...options,
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const origin = `http://127.0.0.1:${address.port}`;
  t.after(async () => {
    server.abortActiveRequests();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  });
  const post = (
    body: unknown = { input: f.input, request_id: randomUUID() },
    headers: Record<string, string> = {},
  ) =>
    fetch(origin + "/api/compliance-map/v2", {
      method: "POST",
      headers: {
        Origin: origin,
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify(body),
    });
  return { ...f, directory, file, server, origin, post };
}
function offlineControls(directory: string) {
  const material = "synthetic-server-fixture-not-a-real-provider-key";
  return {
    key: new PrivateApiKey(material),
    pool: new PoolLedger({
      version: 1,
      provider: "tinyfish",
      pool_id: "synthetic-http-fixture",
      grant_id: randomUUID(),
      authorized_at: new Date(Date.now() - 1000).toISOString(),
      expires_at: new Date(Date.now() + 60000).toISOString(),
      currency: "USD",
      max_reserved_microusd: 2_000_000,
      max_concurrent_operations: 1,
      state_directory: join(directory, "unused-offline-pool"),
      key_sha256: createHash("sha256").update(material).digest("hex"),
      allowed_bounties: ["compliance-map"],
      policies: [
        {
          id: "research-deep",
          unit: "run",
          max_units_per_operation: 1,
          max_unit_price_microusd: 2_000_000,
          max_operations: 1,
          max_active_operations: 1,
          enforcement: {
            mechanism: "fixed_request_contract",
            source_url: "https://docs.tinyfish.ai/research",
            description:
              "Synthetic offline HTTP test; never dispatches a provider job.",
          },
        },
      ],
    }),
  };
}

test("standalone recorded HTTP serves normalized evidence, local fonts, health and exact CSP hashes", async (t) => {
  const f = await setup(t);
  await writeFile(
    f.file,
    JSON.stringify({
      ...f.batch,
      api_key: "synthetic-private-value",
      raw_receipt: { result: "must not escape" },
    }),
  );
  const page = await fetch(f.origin);
  assert.equal(page.status, 200);
  const content = await page.text();
  assert.match(content, /Compliance Map/);
  assert.match(content, /TinyResearch candidate/);
  assert.doesNotMatch(content, /synthetic-private-value|must not escape/);
  const csp = page.headers.get("content-security-policy")!;
  assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval/);
  for (const tag of ["style", "script"])
    for (const m of content.matchAll(
      new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "g"),
    ))
      assert.ok(
        csp.includes(
          `'sha256-${createHash("sha256").update(m[1]!).digest("base64")}'`,
        ),
      );
  assert.equal(page.headers.get("x-content-type-options"), "nosniff");
  assert.equal(page.headers.get("referrer-policy"), "no-referrer");
  const evidence = await fetch(f.origin + "/evidence/report.json");
  assert.equal(evidence.status, 200);
  const exported = await evidence.json();
  for (const report of exported.reports)
    assert.deepEqual(
      report.recommendation.shortlist,
      report.decision.recommendation.shortlist,
    );
  assert.deepEqual(exported, validateRecordedBatch(f.batch));
  for (const font of ["manrope", "dmsans"]) {
    const r = await fetch(f.origin + `/assets/${font}.woff2`);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("content-type"), "font/woff2");
    assert.ok((await r.arrayBuffer()).byteLength > 1000);
  }
  assert.deepEqual(await (await fetch(f.origin + "/health")).json(), {
    service: "compliance-map",
    mode: "recorded_only",
    automatic_retry: false,
  });
  for (const path of [
    "/%2e%2e/shared/config.ts",
    "/assets/%2e%2e/server.ts",
    "/source-hunter",
    "/reports/" + randomUUID() + ".html",
    "/assets/manrope.woff2?x=1",
  ])
    assert.equal((await fetch(f.origin + path)).status, 404);
});

test("hostile hosts/origins, malformed/oversized bodies and live-off requests never load controls or call Research", async (t) => {
  let calls = 0;
  const f = await setup(t, {
    loadControls: async () => {
      calls++;
      throw new Error("must not load");
    },
    research: async () => {
      calls++;
      throw new Error("must not dispatch");
    },
  });
  for (const origin of [
    "https://evil.example",
    "null",
    "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    f.origin.replace("127.0.0.1", "localhost"),
  ]) {
    const r = await f.post(undefined, { Origin: origin });
    assert.equal(r.status, 403);
    assert.equal(r.headers.get("access-control-allow-origin"), null);
  }
  assert.equal(
    (await f.post(undefined, { "Sec-Fetch-Site": "cross-site" })).status,
    403,
  );
  const hostileHost = await new Promise<number>((resolve, reject) => {
    const req = httpRequest(
      f.origin + "/health",
      { headers: { Host: "evil.example" } },
      (res) => {
        res.resume();
        resolve(res.statusCode!);
      },
    );
    req.once("error", reject);
    req.end();
  });
  assert.equal(hostileHost, 403);
  assert.equal(
    (await f.post(undefined, { "Content-Type": "text/plain" })).status,
    415,
  );
  assert.equal(
    (await f.post({ input: f.input, request_id: "not-a-uuid" })).status,
    400,
  );
  assert.equal(
    (
      await f.post({
        input: f.input,
        request_id: randomUUID(),
        extra: "reject",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await f.post({
        input: { ...f.input, places: f.input.places.slice(0, 2) },
        request_id: randomUUID(),
      })
    ).status,
    400,
  );
  const malformed = await fetch(f.origin + "/api/compliance-map/v2", {
    method: "POST",
    headers: { Origin: f.origin, "Content-Type": "application/json" },
    body: "{",
  });
  assert.equal(malformed.status, 400);
  assert.equal((await f.post({ padding: "x".repeat(33 * 1024) })).status, 413);
  const off = await f.post();
  assert.equal(off.status, 503);
  assert.equal((await off.json()).code, "LIVE_DISABLED");
  assert.equal(calls, 0);
  assert.equal(
    (
      await fetch(f.origin + "/api/compliance-map/v2", {
        method: "OPTIONS",
        headers: { Origin: "https://evil.example" },
      })
    ).status,
    404,
  );
});

test("invalid recorded overrides, identity mismatches and source URLs fail closed instead of showing fixture facts", async (t) => {
  const f = await setup(t);
  const mutations: ((x: ReturnType<typeof fixture>["batch"]) => void)[] = [
    (x) => {
      x.provider_run_id = "invalid";
    },
    (x) => {
      x.reports[0]!.activity = {
        ...x.reports[0]!.activity,
        id: "different-activity",
      };
    },
    (x) => {
      x.reports[0]!.places[0]!.id = "different-place";
    },
    (x) => {
      x.reports[0]!.places[0]!.steps[0]!.sources[0]!.url =
        "http://127.0.0.1/private";
    },
    (x) => {
      x.reports[0]!.places[0]!.steps[0]!.sources[0]!.url =
        "https://www.gov.uk/?token=private";
    },
    (x) => {
      x.reports[0]!.places[0]!.steps[0]!.sources[0]!.url =
        "https://evil.example/claim";
    },
    (x) => {
      x.reports[0]!.comparison_rows[0]!.places[0]!.place_id = "unknown-place";
    },
  ];
  for (const mutate of mutations) {
    const invalid = structuredClone(f.batch);
    mutate(invalid);
    await writeFile(f.file, JSON.stringify(invalid));
    for (const route of ["/", "/evidence/report.json"]) {
      const r = await fetch(f.origin + route);
      assert.equal(r.status, 503);
      assert.equal((await r.json()).code, "RECORDED_REPORT_UNAVAILABLE");
    }
  }
  await writeFile(f.file, "{");
  assert.equal((await fetch(f.origin)).status, 503);
  await rm(f.file);
  assert.equal((await fetch(f.origin)).status, 503);
});

test("a present invalid qualified artifact never falls back to an older candidate", async (t) => {
  const directory = await mkdtemp(
    join(tmpdir(), "compliance-qualified-offline-"),
  );
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(
    join(directory, "live-batch-reconciled-report.json"),
    JSON.stringify(fixture().batch),
  );
  const f = await setup(t, { evidenceDirectory: directory });
  assert.equal((await fetch(f.origin)).status, 200);
  await writeFile(join(directory, "qualified-batch-report.json"), "{}");
  assert.equal((await fetch(f.origin)).status, 503);
});

test("qualified recorded evidence retains review metadata and refuses unsupported reviewed labels", async (t) => {
  const f = await setup(t);
  const checked = "2026-11-08T07:35:00.000Z";
  const reports = f.batch.reports.map((report) => {
    const places = report.places.map((place) => ({
      ...place,
      steps: place.steps.map((s) => ({
        ...s,
        provenance: "source_reviewed" as const,
        sources: s.sources.map((source) => ({
          ...source,
          quote_check: "matched" as const,
          checked_at: checked,
          text_sha256: "a".repeat(64),
          reservation_id: randomUUID(),
        })),
        claim_review: {
          status: "supported",
          checked_at: checked,
          notes: ["Synthetic semantic review for this HTTP test only."],
          source_urls: s.sources.map((source) => source.url),
          applicability: "required",
          conditions: [],
          obligation_key: "synthetic-filing",
          fields_reviewed: [
            "requirement",
            "costs",
            "time",
            "renewal",
            "ongoing_filings",
          ],
          cost_treatments: [],
        },
      })),
    }));
    return {
      ...report,
      status: "source_reviewed",
      places,
      comparison_rows: report.comparison_rows.map((row) => ({
        ...row,
        places: places.map((p) => ({
          place_id: p.id,
          steps: p.steps.filter((s) => s.kind === row.kind),
          unknown: !p.steps.some((s) => s.kind === row.kind),
        })),
      })),
    };
  });
  const reviewed = {
    ...f.batch,
    reports,
    status: "source_reviewed",
    evidence_mode: "saved_live",
    qualification: {
      kind: "official-source-field-review-v1",
      original_receipt_sha256: "b".repeat(64),
      original_research_recorded_at: f.batch.observed_at,
      reviewed_at: checked,
      new_research_jobs: 0,
      source_observations: 6,
      accepted_steps: 6,
      original_steps: 6,
      reviewed_model_sha256: "c".repeat(64),
      claim_reviews_sha256: "d".repeat(64),
      source_audit_file: "official-source-audit.json",
      source_audit_sha256: "e".repeat(64),
      source_operations: 6,
      source_pool_halted: true,
      new_paid_jobs: 0,
      withheld: [],
      limits: "Synthetic fixture only; not real evidence.",
    },
  };
  await writeFile(f.file, JSON.stringify(reviewed));
  const r = await fetch(f.origin + "/evidence/report.json");
  assert.equal(r.status, 200);
  const normalized = await r.json();
  assert.equal(normalized.status, "source_reviewed");
  assert.equal(normalized.qualification.accepted_steps, 6);
  assert.equal(normalized.qualification.source_pool_halted, true);
  assert.equal(normalized.qualification.reviewed_model_sha256, "c".repeat(64));
  assert.equal(normalized.qualification.source_audit_sha256, "e".repeat(64));
  assert.equal(normalized.reports[0].decision.places.length, 3);
  assert.equal(
    normalized.reports[0].decision.recommendation.status,
    "insufficient_evidence",
  );
  reviewed.reports[0] = {
    ...reviewed.reports[0]!,
    recommendation: {
      ...reviewed.reports[0]!.recommendation,
      shortlist: [reviewed.input.places[0]!.id],
      explanation: "Fabricated stored preference must be ignored.",
      tradeoffs: [],
    },
    decision: {
      recommendation: { status: "scoped_preference", shortlist: ["invented"] },
    },
  } as (typeof reviewed.reports)[0];
  await writeFile(f.file, JSON.stringify(reviewed));
  const recomputed = await (
    await fetch(f.origin + "/evidence/report.json")
  ).json();
  assert.equal(
    recomputed.reports[0].decision.recommendation.status,
    "insufficient_evidence",
  );
  assert.deepEqual(
    recomputed.reports[0].recommendation.shortlist,
    recomputed.reports[0].decision.recommendation.shortlist,
  );
  assert.deepEqual(recomputed.reports[0].recommendation.shortlist, []);
  assert.doesNotMatch(
    recomputed.reports[0].recommendation.explanation,
    /Fabricated stored preference/,
  );
  assert.equal(
    normalized.reports[0].places[0].steps[0].claim_review.status,
    "supported",
  );
  reviewed.reports[0]!.places[0]!.steps[0]!.claim_review.status = "unreviewed";
  await writeFile(f.file, JSON.stringify(reviewed));
  assert.equal((await fetch(f.origin)).status, 503);
});

test("one isolated live lifecycle persists accepted receipt privately and serves only its ephemeral report", async (t) => {
  const data = fixture();
  let calls = 0;
  const f = await setup(t, {
    liveEnabled: true,
    loadControls: async () => offlineControls(tmpdir()),
    research: async (args) => {
      calls++;
      assert.equal(args.bounty, "compliance-map");
      assert.ok(args.signal);
      assert.ok(args.requestId);
      assert.match(args.query, /ONE batched/);
      await args.onStarted?.({
        research_run_id: data.receipt.research_run_id,
        reservation: {
          id: data.receipt.reservation_id,
          request_id: args.requestId!,
          bounty_id: "compliance-map",
          policy_id: "research-deep",
          reserved_microusd: 2_000_000,
          created_at: data.receipt.recorded_at,
        },
      });
      return data.receipt;
    },
  });
  const r = await f.post();
  assert.equal(r.status, 200);
  const result = await r.json();
  assert.match(result.report_url, /^\/reports\/[a-f0-9-]{36}\.html$/);
  assert.equal(result.status, "research_candidate");
  assert.equal((await fetch(f.origin + result.report_url)).status, 200);
  assert.equal(calls, 1);
  const root = join(f.directory, "private");
  assert.equal((await stat(root)).mode & 0o077, 0);
  const runs = await readdir(root);
  assert.equal(runs.length, 1);
  const run = join(root, runs[0]!);
  assert.equal((await stat(run)).mode & 0o077, 0);
  for (const name of [
    "request.json",
    "accepted.json",
    "research-receipt.json",
    "report.json",
  ])
    assert.equal((await stat(join(run, name))).mode & 0o077, 0);
  assert.deepEqual(
    JSON.parse(await readFile(join(run, "research-receipt.json"), "utf8")),
    data.receipt,
  );
  assert.deepEqual(
    await (await fetch(f.origin + "/evidence/report.json")).json(),
    validateRecordedBatch(f.batch),
  );
  assert.equal((await fetch(f.origin + "/accepted.json")).status, 404);
});

test("provider failure is sanitized, never repeats or substitutes a recorded report", async (t) => {
  let calls = 0;
  const f = await setup(t, {
    liveEnabled: true,
    loadControls: async () => offlineControls(tmpdir()),
    research: async () => {
      calls++;
      throw Object.assign(new Error("private-provider-body-do-not-publish"), {
        code: "HALTED",
      });
    },
  });
  const r = await f.post();
  assert.equal(r.status, 503);
  const value = await r.text();
  assert.match(value, /HALTED/);
  assert.doesNotMatch(
    value,
    /private-provider-body|report_url|Synthetic source/,
  );
  assert.equal(calls, 1);
  assert.equal((await fetch(f.origin)).status, 200);
  const root = join(f.directory, "private"),
    runs = await readdir(root);
  assert.deepEqual(
    JSON.parse(await readFile(join(root, runs[0]!, "failure.json"), "utf8"))
      .code,
    "HALTED",
  );
});

test("client disconnect aborts the same Research signal, retains its receipt and releases local busy state", async (t) => {
  const data = fixture();
  let started!: () => void;
  const accepted = new Promise<void>((resolve) => {
    started = resolve;
  });
  let aborted = false;
  let controlsLoads = 0;
  let researchCalls = 0;
  const f = await setup(t, {
    liveEnabled: true,
    loadControls: async () => {
      if (++controlsLoads > 1)
        throw Object.assign(new Error("Offline idle-state probe only"), {
          code: "OFFLINE_DRAIN_PROBE",
        });
      return offlineControls(tmpdir());
    },
    research: async (args) => {
      researchCalls++;
      started();
      await new Promise<void>((resolve) =>
        args.signal!.addEventListener(
          "abort",
          () => {
            aborted = true;
            resolve();
          },
          { once: true },
        ),
      );
      return { ...data.receipt, status: "CANCELLED", result: null };
    },
  });
  const req = httpRequest(f.origin + "/api/compliance-map/v2", {
    method: "POST",
    headers: { Origin: f.origin, "Content-Type": "application/json" },
  });
  req.on("error", () => undefined);
  req.end(JSON.stringify({ input: f.input, request_id: randomUUID() }));
  await accepted;
  assert.equal((await f.post()).status, 409);
  req.destroy();
  let receiptPath: string | undefined;
  let failurePath: string | undefined;
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const dirs = await readdir(join(f.directory, "private"));
    const path = join(
      f.directory,
      "private",
      dirs[0]!,
      "research-receipt.json",
    );
    try {
      const failure = join(f.directory, "private", dirs[0]!, "failure.json");
      // A visible receipt can still be followed by the handler's async failure write.
      // Parse both complete files before probing whether its finally block released busy.
      assert.equal(
        JSON.parse(await readFile(path, "utf8")).status,
        "CANCELLED",
      );
      assert.equal(
        JSON.parse(await readFile(failure, "utf8")).code,
        "CANCELLED",
      );
      receiptPath = path;
      failurePath = failure;
      break;
    } catch {
      await pause(10);
    }
  }
  assert.equal(aborted, true);
  assert.ok(receiptPath);
  assert.ok(failurePath);
  assert.equal(
    JSON.parse(await readFile(receiptPath, "utf8")).status,
    "CANCELLED",
  );
  let drained = false;
  while (Date.now() < deadline) {
    const response = await f.post();
    const body = await response.json();
    if (response.status === 409) {
      await pause(10);
      continue;
    }
    assert.equal(response.status, 503);
    assert.equal(body.code, "OFFLINE_DRAIN_PROBE");
    drained = true;
    break;
  }
  assert.equal(
    drained,
    true,
    "Cancellation handler must finish before fixture teardown",
  );
  assert.equal(researchCalls, 1);
  assert.equal(controlsLoads, 2);
});

test("CLI listens independently on an ephemeral loopback port with live disabled", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "compliance-cli-offline-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, "recorded.json");
  await writeFile(file, JSON.stringify(fixture().batch));
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    COMPLIANCE_MAP_PORT: "0",
    COMPLIANCE_RECORDED_REPORT: file,
    BOUNTY_POOL_LIVE: "0",
  };
  delete env.TINYFISH_KEY_FILE;
  delete env.BOUNTY_POOL_GRANT_FILE;
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "compliance-map/src/server.ts"],
    { env, stdio: ["ignore", "pipe", "pipe"] },
  );
  t.after(() => {
    child.kill();
  });
  const origin = await new Promise<string>((resolve, reject) => {
    let output = "";
    const timer = setTimeout(
      () => reject(new Error("Standalone server did not start in25seconds")),
      25000,
    );
    timer.unref();
    child.stdout.on("data", (chunk) => {
      output += String(chunk);
      const address = output.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];
      if (address) {
        clearTimeout(timer);
        resolve(address);
      }
    });
    child.once("error", () => {
      clearTimeout(timer);
      reject(new Error("Standalone process could not start"));
    });
    child.once("exit", () => {
      clearTimeout(timer);
      reject(new Error("Standalone process exited before listening"));
    });
  });
  assert.equal((await fetch(origin)).status, 200);
  assert.equal(
    (await (await fetch(origin + "/health")).json()).mode,
    "recorded_only",
  );
});
