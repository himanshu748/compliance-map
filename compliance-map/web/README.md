# Compliance Map interface

An editorial landing page and working research workspace built around a recorded comparison. The atlas is an original schematic illustration, not a geographic map. Selecting a place changes its fact count and highlights its column; it does not imply a new source lookup.

`renderComplianceHtml()` keeps the earlier café source review as its explicit default. `renderGeneralComplianceHtml(batch, options)` accepts the complete parsed v2 batch and displays every activity with separate tabs. Neither renderer starts a provider job. Both export their normalized public report. The standalone server validates recorded input and regenerates both recommendation forms from the reviewed facts before rendering or exporting; it never exposes a raw provider receipt.

The workspace supports a scoped activity, an optional second example activity, three to six distinct places and a priority. **Prepare comparison** only builds a local brief. A separate reviewed-scope checkbox gates the research action; live controls are disabled by default. An enabled action sends one explicit request to `/api/compliance-map/v2`. The server must enforce the private shared policy independently of the UI flag. Cancellation stops observation and asks the server to establish remote termination; the UI does not claim a provider stopped on a local abort.

Recorded evidence has activity tabs, category filters, text search, native source disclosures, open questions and a complete JSON export. Unknown totals, unsupported links and unretained excerpts remain visible as gaps. Source candidates are not described as independently verified.

The visual system uses local Manrope and DM Sans assets served at `/assets/manrope.woff2` and `/assets/dmsans.woff2`, with system sans fallbacks for standalone files. Ivory, ink and cobalt, fine rules and large type carry the hierarchy. Motion is limited to brief entrance/selection feedback; reduced-motion preferences disable animation, transitions and smooth scrolling. Controls are semantic and keyboard reachable with visible focus.

From the workspace root:

```sh
node --import tsx --test compliance-map/test/*.test.ts
npm run typecheck
```

The local tests include escaping, exact embedded-JSON round-tripping, both activity views, safe official-source links, missing excerpts, disabled paid controls and client syntax. The parent also checked the real server in the in-app browser at 320, 390 and 1440 pixels: no page overflow, atlas/activity selection, costs/open-question filters, search, source disclosures, custom prepare-only scope, disabled research and JSON export passed. Keyboard navigation showed visible focus. The app's motion control disabled animation and used `scroll-behavior:auto`; OS-level preference emulation was unavailable. See the [dated release review](../docs/VERIFICATION.md).
