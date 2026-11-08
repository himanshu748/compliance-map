import { createHash } from "node:crypto";
import { load } from "cheerio";
import {
  officialUrl,
  recommend,
  type ComplianceResult,
  type QuoteCheck,
} from "./core.js";

const normalize = (text: string) => text.replace(/\s+/g, " ").trim();

/** Official-host HTTPS only, no redirects/cookies/key, bounded bytes and deadline. */
export async function corroborateSources(
  report: ComplianceResult,
  options: {
    request?: typeof fetch;
    signal?: AbortSignal;
    clock?: () => number;
  } = {},
): Promise<ComplianceResult> {
  const pages = new Map<
    string,
    { text: string | null; hash: string | null; checkedAt: string }
  >();
  const copy = structuredClone(report);
  for (const place of copy.jurisdictions)
    for (const fact of place.facts)
      for (const source of fact.sources) {
        const url = officialUrl(source.url, place.id);
        if (!pages.has(url)) {
          let text: string | null = null,
            hash: string | null = null;
          try {
            options.signal?.throwIfAborted();
            const signal = AbortSignal.any([
              options.signal ?? new AbortController().signal,
              AbortSignal.timeout(10_000),
            ]);
            const response = await (options.request ?? fetch)(url, {
              signal,
              redirect: "error",
              headers: {
                "User-Agent": "ComplianceMap-SourceReview/0.1",
                Accept: "text/html",
              },
            });
            if (
              !response.ok ||
              !response.headers.get("content-type")?.includes("text/html")
            ) {
              await response.body?.cancel();
              throw new Error("Unsupported official page response");
            }
            const reader = response.body?.getReader();
            if (!reader) throw new Error("No source body");
            const chunks: Uint8Array[] = [];
            let bytes = 0;
            for (;;) {
              const part = await reader.read();
              if (part.done) break;
              bytes += part.value.byteLength;
              if (bytes > 1_500_000) {
                await reader.cancel();
                throw new Error("Source body limit");
              }
              chunks.push(part.value);
            }
            const html = new TextDecoder("utf8", { fatal: true }).decode(
              Buffer.concat(chunks),
            );
            const $ = load(html);
            $("script,style,noscript").remove();
            text = normalize($("body").text());
            hash = createHash("sha256").update(text).digest("hex");
          } catch {
            /* Preserve the failed check explicitly; never fill source text. */
          }
          pages.set(url, {
            text,
            hash,
            checkedAt: new Date((options.clock ?? Date.now)()).toISOString(),
          });
        }
        const page = pages.get(url)!;
        source.quote_check = (
          page.text === null
            ? "fetch_failed"
            : page.text.includes(normalize(source.quote))
              ? "matched"
              : "not_found"
        ) as QuoteCheck;
        source.checked_at = page.checkedAt;
        source.text_sha256 = page.hash;
      }
  copy.recommendation = recommend(copy.jurisdictions, copy.scenario.priority);
  if (
    copy.jurisdictions.some((p) =>
      p.facts.some((f) =>
        f.sources.some((s) =>
          ["not_found", "fetch_failed"].includes(s.quote_check),
        ),
      ),
    )
  )
    copy.limitations.push(
      "Some cited excerpts could not be corroborated. Those facts are excluded from the provisional recommendation.",
    );
  return copy;
}
