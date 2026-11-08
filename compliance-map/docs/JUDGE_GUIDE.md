# Judge guide

Compliance Map helps someone compare the paperwork for the same business activity across several places. Open a recorded comparison, line up the requirements, inspect an official source and its checked date, then read the recommendation with its conditions.

The recorded demonstration covers a small café and a home-based, sole-trader software consultancy in the City of London (Square Mile), New York City and Dublin. Both activities came from one genuine TinyResearch Deep run on 8 November 2026. A later local review retained 31 requirements and withheld 2 whose cited pages did not support the claim. Missing evidence remains visible.

## Run the standalone build

Use Node.js 22 or newer. From the standalone repository root:

```sh
npm ci
npm start
```

Open [Compliance Map on localhost](http://127.0.0.1:4390). The default preview serves recorded evidence with live research disabled. Browsing, changing filters, preparing a brief and exporting JSON start no TinyFish job. Installation needs access to the npm registry; the running preview serves its fonts locally.

For the development monorepo, run this from `bounty-drop-002` instead:

```sh
BOUNTY_POOL_LIVE=0 COMPLIANCE_MAP_PORT=4390 npx tsx compliance-map/src/server.ts
```

The standalone server serves the reviewed artifact when present. If that file is invalid, it returns an error rather than substituting an older report. `GET /evidence/report.json` returns the validated public report, and `GET /health` identifies whether the server is in recorded-only mode. Raw provider receipts and credentials are never served.

## A five-minute review

1. Read the recorded-evidence label and activity scope. The café excludes alcohol, outdoor seating, late-night service, frozen desserts and wholesale supply. The consultancy excludes employees and regulated advice.
2. Open **Open a small café**. Compare the same dimensions across all three places, then expand a requirement to inspect its official source, checked date and applicability.
3. Read the recommendation. City of London and Dublin have a scoped advantage on the reviewed food-registration charge. This does not establish the lowest complete setup cost or the easiest place overall.
4. Switch to **Start a software consultancy**. Its recommendation concerns an affirmative rule about the registration sequence in the City of London. Unknown sequencing elsewhere remains unknown; the report does not infer that the other places forbid trading first.
5. Inspect conditional and optional costs separately. Alternative filing routes are not added together. Open the trade-offs and unresolved requirements, then export the JSON.
6. Prepare a brief with a different activity and at least three places. Export it to inspect the input contract. In the recorded-only preview, this demonstrates input handling without pretending that a new live comparison has run.

## How TinyResearch is used

The server validates one to three activities and three to six distinct places, then creates one batched Deep query. TinyResearch investigates the official requirements across every requested activity/place pair. The parser checks exact input coverage, citation membership, official source ownership patterns, dates and evidence for typed amounts and day counts.

For the recorded demonstration, TinyFish Fetch retrieved the exact official pages in a separate bounded audit. A local review then checked the meaning and applicability of each retained field against those saved pages. The decision layer groups costs by currency and payment period, keeps required, conditional and optional obligations separate, and explains any scoped preference.

```text
Activity + places → one TinyResearch Deep run → validated candidate
                                            ↓
Exact official-page Fetch observations → local field review
                                            ↓
Aligned comparison + scoped recommendation + explicit gaps
```

The original Research run is `01a1ba34-7c95-7888-8787-ebfedb8187fb`. Its public metadata records one completed job and a $2 retained reservation; that reservation is not an independently verified invoice. Replaying the report creates no new Research job.

## Requirements and evidence

The mapping follows the authenticated Compliance Map brief and rulebook checked on 8 November 2026. The current brief is available from the [TinyBounties board](https://www.tinybounties.com/); account access may be required.

| Brief requirement                                           | Inspect                                                                                                            | Evidence and limits                                                                                                                                                                                                                    |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Accept an activity and three or more places                 | Editable form; `ComplianceBatch` in [general.ts](../src/general.ts)                                                | Arbitrary descriptions and three to six distinct places are validated. The saved live example covers two activities and three places. A fresh arbitrary-input provider run is a separate action.                                       |
| Research official requirements in each place                | [Reviewed report](../evidence/qualified-batch-report.json), [source audit](../evidence/official-source-audit.json) | 35 official pages were fetched. The 36th check was not corroborated and halted the shared pool; the report preserves that failure. Retrieval alone does not establish a legal claim.                                                   |
| Compare steps, costs, timing, renewals and filings          | Aligned comparison and source details; [decision.ts](../src/decision.ts)                                           | Scoped costs and milestones are comparable. Complete setup totals and end-to-end approval times remain unknown where evidence is incomplete. This is an explicit limitation against the brief's total-cost and approval-time ambition. |
| Explain a recommendation and trade-offs                     | Both activity recommendations; [decision export](../evidence/qualified-batch-decision.json)                        | Preferences have a named scope, supporting requirements and place-specific trade-offs. The report does not claim an overall cheapest or fastest jurisdiction.                                                                          |
| Demonstrate two different activities                        | Café and consultancy tabs                                                                                          | Both belong to the same genuine completed Research batch. They are recorded results, not two newly executed jobs.                                                                                                                      |
| Use TinyResearch and explain its role                       | Data flow above; [Research metadata](../evidence/live-batch-metadata.json)                                         | TinyResearch performs the original investigation. Fetch and local review corroborate the retained fields; they do not replace the Research integration.                                                                                |
| Link each requirement to its official page and checked date | Source disclosures; each step's `sources` and `claim_review`                                                       | The reviewed artifact has links and checked dates for the retained requirements. Short or withheld quote exports retain their evidence metadata; absence of an exported excerpt is not a new quote.                                    |
| Align equivalent questions across places                    | Comparison table                                                                                                   | Licences, filings, tax, premises, training, costs, timing, renewals and ongoing filings remain distinct dimensions.                                                                                                                    |
| Support varied activities and places                        | Form, generic schema/query and tests                                                                               | Input handling is generic. Only the named two-activity, three-place batch is claimed as the recorded live demonstration.                                                                                                               |
| Expose missing or unclear rules                             | Open questions, withheld requirements and null totals                                                              | Two unsupported requirements were withheld. Missing fees are not zero; unknown rules are not permission to operate.                                                                                                                    |
| Research obligations rather than licence-holder status      | Activity scope and query                                                                                           | This build investigates what is required to start; it does not check whether an individual or business holds a licence.                                                                                                                |

The [qualification metadata](../evidence/qualified-batch-metadata.json) separates the original provider result, subsequent source retrieval and local review. The earlier [reconciled candidate](../evidence/live-batch-reconciled-report.json) remains preserved; its 22 retained candidate steps are a historical parsing stage, not the final reviewed count.

## Validation and release status

Run the package checks from the standalone repository root:

```sh
npm test
npm run typecheck
npm run build
```

The standalone HTTP implementation passed 9 tests covering recorded reports, source/identity validation, CSP, fonts, hostile hosts and origins, bounded input, live-off behavior, receipt persistence and disconnect cancellation. Provider lifecycle tests use an isolated offline transport. They do not establish a new live Research execution. The final standalone package passed 95 tests, TypeScript, build and formatting. The real in-app browser journey also passed; see [VERIFICATION.md](VERIFICATION.md) for dated receipts and limits.

| Gate                                                                  | Status at this documentation checkpoint                                                                                                |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Recorded Research and reviewed comparison                             | Available locally; exact evidence linked above                                                                                         |
| Complete legal coverage, total setup cost and guaranteed opening time | Not established                                                                                                                        |
| Fresh arbitrary-input live Research in this preview                   | Disabled by default; no further paid allowance remains in the existing pool                                                            |
| Standalone package verification                                       | Verified: 95 standalone tests, TypeScript/build/format and in-app browser checks; see VERIFICATION.md                                  |
| Public repository                                                     | Published: [GitHub](https://github.com/himanshu748/compliance-map); anonymous clone, 95 tests and build passed                         |
| Required LinkedIn post tagging TinyFish                               | Published: [tagged announcement](https://www.linkedin.com/feed/update/urn:li:activity:7525191322413158400/); company mention read back |
| Required TinyFish Discord `#showcase` share                           | Blocked because Discord sign-in is unavailable; no share made                                                                          |
| Bounty submission and approval                                        | Not established by this local build or guide                                                                                           |

The technical deadline in the checked rulebook is 17 November 2026 at 23:59 Pacific time, equivalent to 18 November at 13:29 India time. Verify the portal before submitting because submissions are final. The checked rules do not impose a universal video requirement; [DEMO.md](DEMO.md) provides an optional short visual walkthrough.

Return to the [standalone README](../../README.md). Promotion and submission drafts are in [SUBMISSION.md](SUBMISSION.md).
