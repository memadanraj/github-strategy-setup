# DCXORA implementation status

This is an evidence-based phase tracker for the master plan. A UI control or source file alone is not proof a feature is complete. `COMPLETE` should be used only after persistence, security, error paths, and relevant tests pass.

**Working branch:** `hardening/phase-6-render-export-integrity`  
**Target:** stacked draft PR; no direct changes to `main`  
**Status date:** 2026-10-12

| Plan phase | Current status | Evidence / remaining work |
|---|---|---|
| 0. Repository audit | PARTIAL | Stack, routes, database/auth, provider keys, tests, and migration inconsistencies inspected. Continue auditing during each implementation step. |
| 1. Foundation (auth, ownership, persistence, errors) | TEST | Existing Supabase auth/RLS; env secrets removed from branch tip. Add automated cross-user access tests and verify signup/login/reset and persistence against staging. |
| 2. Projects and scenes | PARTIAL / TEST | Scene breakdown validates AI output and uses `0015` for transactional replacement. Version saves/restores use `0017`; creation, deletion, and reordering use owner-checked transactional RPCs in `0019` and `0020`. Client tests cover RPC contracts and failures. Database execution, RLS, asset cascade behavior, and concurrent edits still require staging integration tests. |
| 3. Central jobs | PARTIAL / TEST | Async clip start validates provider-job-ID persistence; clip status polling retries transient network/timeouts until the global deadline. Visual jobs and synchronous AI tasks use `fail_generation_job_checked`; lost completion responses are resolved against terminal DB state, and refunds are reported only for confirmed refunded terminal states. Unit tests cover refund/unknown/no-reservation/already-complete cases. Migrations `0013` and `0021`, concurrency, and staging tests remain. |
| 4. Provider abstraction | PARTIAL / TEST | Added bounded visual-provider HTTP helpers: image generation timeout 120s, video start 45s, polling 20s; metadata JSON capped at 512 KiB and image JSON capped at 44 MiB. Network/timeouts are safe typed failures; transient poll failures retry. Tests cover timeout/network failures, response-size limits and malformed JSON. Shared adapters/retries across all providers and staging behavior remain. |
| 5. Script generation | EXISTING / TEST | Research/hooks/script/scene drafting flows exist. Mainline operations still execute synchronously and structured generation/persistence needs failure tests. |
| 6. Video clip generation | PARTIAL / TEST | Start/poll requests are bounded, transient poll network/timeouts are retried, provider status JSON has a size limit, and the overall job has a 15-minute deadline. Downloader bounds bytes/time, validates HTTPS/redirects/content type and does not forward gateway secrets to third-party hosts. Provider start/poll, cancel, retries and actual result playback still need staging validation. |
| 7. Voice generation | EXISTING / TEST | Voice provider code and UI exist, but live verification requires `ELEVENLABS_API_KEY` and/or supported voice-provider credentials. |
| 8. Captions | EXISTING / TEST | Caption/transcription model exists; timing, edit, export-format and rendered-caption acceptance tests remain. |
| 9. Basic editor/timeline | PARTIAL / TEST | Client and DB guardrails cap timeline times at 24 hours. Caption text/time and clip properties now use local drafts plus explicit save actions rather than issuing writes on every keystroke. Unit/component tests cover atomic form saves and retaining edits after a failed save. Migration `0024` still needs a staging existing-row audit and constraint validation; drag/trim/split/undo/redo remain open. |
| 10. Rendering | PARTIAL / TEST | Render-provider adapters, bounded download and serialized finalization exist. New `mp4-validation.ts` checks allowed media types, the 512 MiB limit, valid top-level box lengths and required `ftyp`/`moov`/non-empty `mdat` boxes before export upload. Structurally invalid output marks the render job failed and releases the finalization claim. Seven MP4 tests pass; real-provider render, codec/decode, playback and staging finalization-race tests remain. |
| 11. Export and sharing | PARTIAL / TEST | Share links store only SHA-256 token hashes, support optional scrypt password protection, 1/7/30-day or no-expiry links, revocation, a password lockout and temporary signed MP4 playback. Migration `0018`; token/password primitives are unit-tested. Route, storage, expiry, revocation, and migration behavior require staging verification. |
| 12. Credits | PARTIAL / TEST | Synchronous AI tasks now use `fail_generation_job_checked` instead of the older void failure RPC. Refund wording depends on returned terminal state; `already_complete` plus a persisted result returns success, while unknown settlement triggers reconciliation messaging. Ledger race/concurrency, idempotency and live billing/job integration tests remain. |
| 13. Billing | PARTIAL | Paddle client, webhook signature/event handling and tables exist. Price IDs and sandbox lifecycle tests remain; legacy Stripe SQL files/migration order need careful reconciliation. |
| 14. Admin | EXISTING / TEST | Admin users/plans/credits/jobs UI/server code exists. Role-denial and audit-trail tests remain. |
| 15. AI Director | MISSING / FUTURE | Requires a proposed change plan, preview/approval, safe apply and undo/versioning. |
| 16. Advanced editor and scale | FUTURE | Collaboration, advanced effects/keyframes, 4K/60 FPS, social publishing, marketplace and public API are later-stage work. |

## Automated checks

GitHub Actions is configured to run:
1. `bun install --frozen-lockfile`
2. `bun run lint`
3. `bun run typecheck`
4. `bun run test`
5. `bun run build`

The initial lint run exposed thousands of inherited Prettier/explicit-`any` findings. Those two rules are warnings on this branch to make functional lint failures actionable; this is not equivalent to a clean formatted/type-safe codebase. Do not report checks as passing until the latest workflow run concludes successfully.

## Release gate: end-to-end MVP

Do not claim production readiness until a staging user can sign up, create a project, generate script/scenes, generate and store clips, generate voice and captions, assemble a timeline, render a valid MP4, download and play it, see correct credit deductions/refunds, and an admin can inspect job history. Repeat with simulated provider timeout, malformed/expired output URL, duplicate poll/callback, download/storage failures, and unauthorized cross-user project/asset/job/export/billing requests.


## Latest incremental hardening

- Added a pure provider-response contract for video job IDs, status, output URL variants, and error messages, with unit tests for valid, malformed, missing, and alternate response shapes.
- Async clip creation now checks the database write for the external provider job ID. If persistence fails, the existing failure/refund path runs instead of returning a job that can only spin until timeout.
- Provider HTTP tests cover timeout/network mapping, timeout bounds, limited chunked response reads, oversized `Content-Length`, malformed JSON and empty responses. Synchronous AI settlement tests cover lost completion responses and checked refund states. Code commit `3f89c3a3e830fcef99c0c0ce6426ac597ccec6bf` passed CI; live database/provider behavior remains unverified.


## Master plan — exact implementation order and gates

This checklist follows the uploaded plan's order. “Exists” means code is present, not that the stage is production-complete. Do not check a stage off until its functional and failure-path tests pass.

| # | Workstream | Status | Exit gate |
|---:|---|---|---|
| 1 | Repository audit | PARTIAL | Finish route, dependency, secrets/history, build and test inventory. |
| 2 | Database audit | PARTIAL | Apply migrations to staging; verify ordering, constraints, RLS, grants, and rollback/recovery. |
| 3 | API/server-function audit | PARTIAL | Enumerate every mutation and verify auth, ownership, validation, error shape, and idempotency. |
| 4 | Authentication | TEST | Automated signup/login/reset and expired/invalid token checks; staging verification required. |
| 5 | Authorization / ownership | TEST | Cross-user project, scene, asset, job, export, admin, and billing denial tests. |
| 6 | Project model | EXISTING / TEST | Create/update/delete, settings persistence, recovery, and RLS integration tests. |
| 7 | Scene model | PARTIAL / TEST | Transactional scene replacement (`0015`), version snapshot/restore (`0017`), reordering (`0019`), and create/delete (`0020`). Scene create/delete/reorder use a locked parent project and keep positions normalized; client tests cover boundaries, returned IDs, and surfaced errors. SQL/RLS integration tests remain. |
| 8 | Asset model | PARTIAL / TEST | Upload, metadata, signed URLs, delete cleanup, and cross-project rejection tests. |
| 9 | Central job system | PARTIAL / TEST | Atomic reservation, dedupe, claims, terminal-state idempotency, retry, and refunds under concurrency. |
| 10 | Error handling | PARTIAL | Standardize safe user errors, structured server logs, correlation IDs, and provider failure classification. |
| 11 | Provider abstraction | PARTIAL | Contract tests for text/image/video/audio/render adapters, timeouts, retries, and malformed responses. |
| 12 | Script generation | EXISTING / TEST | Structured output validation, save-before-next-step, retries, and credit settlement tests. |
| 13 | Video generation | PARTIAL / TEST | Start/poll/timeout/failure/cancel/retry against a staging provider; no long synchronous request. |
| 14 | Result download | PARTIAL / TEST | URL/redirect/content-type/size/time bounds, transient errors, and invalid-output recovery. |
| 15 | Asset persistence | PARTIAL / TEST | Upload + asset row + scene linkage consistency and orphan cleanup tests. |
| 16 | Voice generation | EXISTING / TEST | Provider success/failure, preview, cloning consent, timeout, and credit refund tests. |
| 17 | Captions | EXISTING / TEST | Timing bounds, editing persistence, transcript failure, and render/export format tests. |
| 18 | Timeline | EXISTING / TEST | Drag/trim/split/order, undo/redo, reload persistence, and invalid duration tests. |
| 19 | Rendering | PARTIAL / TEST | Queue, provider status, timeout/retry/cancel, valid output, and job/asset consistency tests. |
| 20 | Export | PARTIAL / TEST | Export integrity, signed download expiry, missing file, MIME type, and playback tests. |
| 21 | Share links | PARTIAL / TEST | Owner-only create/list/revoke for ready exports; hashed random tokens; optional password hashes; expiry; failed-password lockout; public playback of only the selected export. Token/password unit tests pass. Staging RLS, expiry, revocation, and signed-URL behavior remains unverified. |
| 22 | Credits | EXISTING / TEST | Race-safe ledger, duplicate events, actual-cost reconciliation, refunds, and audit history. |
| 23 | Billing | PARTIAL / TEST | Paddle sandbox checkout, subscription lifecycle, duplicate/out-of-order webhooks, and refunds. |
| 24 | Admin | EXISTING / TEST | Role denial, audited credit adjustments, job inspection, and sensitive-action tests. |
| 25 | Monitoring | PARTIAL | Correlation IDs, safe structured logs, provider latency/failure metrics, and actionable alerts. |
| 26 | Research | PARTIAL | Validate source-backed claims, persist research, and distinguish generated suggestions from verified facts. |
| 27 | Templates | PARTIAL | Template CRUD, versioning, validation, and project instantiation tests. |
| 28 | Brand kits | MISSING / FUTURE | Persist brand assets/tokens and apply them consistently to generation/rendering. |
| 29 | AI Director | MISSING / FUTURE | Proposed change plan, user preview/approval, safe apply, version snapshot, and undo. |
| 30 | Advanced editor | FUTURE | Only after basic editor/render/export acceptance tests are stable. |
| 31 | Scaling and release | FUTURE | Load/concurrency tests, deployment runbook, backups/restore, and full end-to-end MVP sign-off. |

### Current-head evidence

- GitHub Actions for commit `e03856ebfff833b3332fda18a9ae4cd256fba050` passed lint, TypeScript typecheck, unit/component tests, and production build (21 test files passed).
- New-project and writing-panel failure-path tests pass in CI; scene-breakdown normalization tests pass in CI. The SQL migration itself still requires application and integration verification against a staging Supabase database.
- No staging Supabase database, live AI provider, render service, or Paddle sandbox has been exercised from this environment.


- New-project creation now catches auth/network/insert failures and always clears its loading state; unit tests cover rejected auth and failed inserts.
- WritingPanel stops AI generation/scene replacement when saving an edited idea or script fails; component tests cover both paths.
- Script-to-scenes now validates the generated scene list before mutation and calls a transactional SQL function, preventing the previous delete-then-insert flow from leaving a project with zero scenes when insertion fails.

- The creation wizard stores a versioned production brief and an eight-stage plan in `projects.settings`. Script, research, hook/title, and scene prompts now receive those settings; script word targets are derived from the selected duration.

- AI task startup now fails early when the task configuration is missing. Completion settlement is retried once because the database operation is intended to be idempotent; refund failure is surfaced as a reconciliation requirement instead of falsely telling the user their credits were returned.


- Project share links are implemented on the branch. Tokens are stored as hashes, passwords as salted scrypt hashes, and the public resolver returns only metadata plus a short-lived signed URL for the selected ready export. Migration `0018_project_share_links.sql` has not been applied to staging.
- Scene reordering now calls one owner-checked database RPC and normalizes scene positions transactionally. The client no longer fires two independent scene updates and ignores their errors. Migration `0019_atomic_scene_reordering.sql` still requires staging application and SQL integration testing.
- Restoring a version now uses `0017_atomic_project_versions.sql`; scene replacement, version restore, share-link access, and scene reorder database logic still need staging verification.


- Scene creation and deletion now use transactional RPCs in migration `0020_atomic_scene_crud.sql`. The database locks the owning project, assigns a server-side position, rejects cross-project IDs, and compacts positions after deletion. The UI reports failures instead of silently refreshing.
- Added five Paddle webhook delivery tests: invalid signatures, malformed event payloads, duplicate processed events, active processing leases, and replay of a failed event. Signature and price-validation tests remain separate; real Paddle sandbox behavior and database event-lock races have not been exercised here.


## Credit ledger test coverage

Added `src/test/paddle-credit-ledger.test.ts` to verify that credit grants use the idempotent `apply_credit_transaction` RPC, invalid amounts and idempotency keys are rejected before database calls, and an RPC failure is returned as an error rather than reported as a successful grant. The SQL procedure and concurrent duplicate-event behavior still require database integration testing.


- Media persistence now uses a shared checked-settlement helper. Image/clip paths only report a confirmed refund after the database reports the job failed with a reservation refund (or an already-failed terminal state); settlement uncertainty is explicitly surfaced for reconciliation.
- Migration `0021_checked_visual_job_settlement.sql` provides a privileged RPC that checks/locks the job, marks it failed, logs the event, restores reserved credits, and returns an explicit state. It is not applied to staging from this environment.


## Audio generation hardening — October 12, 2026

- Extracted `src/lib/audio-job-settlement.ts` so the audio routes share one tested checked-completion / checked-failure contract.
- Voiceover verifies the audio file upload, asset row, voiceover row, prior scene-audio settings read, scene-audio attachment, signed playback URL, and completion RPC. If a later step fails, it attempts conditional rollback of the new association and new records before removing the upload.
- Voice preview uses unique storage paths, prepares playback before completion, and only reports a charged success after completion is confirmed or the job is confirmed already complete.
- Music verifies the asset and track rows and prepares playback before completion; failed persistence triggers cleanup with errors surfaced.
- Voice cloning checks the local clone/voice record writes and completion. If the provider created the clone but later local persistence fails, the response warns that the provider-side clone may need manual review.
- Five helper tests cover success, completion failure, refund confirmation, settlement uncertainty, and preserving results for already-complete jobs. GitHub Actions passed on `e03856ebfff833b3332fda18a9ae4cd256fba050`.
- Remaining risk: these are compensating actions across multiple database/storage operations, not one atomic transaction. Exercise all failure points and concurrent requests against staging before production.


## Timeline guardrails — October 12, 2026

- Clip start, duration, source-in and clip end are bounded to 24 hours in client-side validation; caption start/end are also bounded to 24 hours.
- Transition fields are limited to 80 characters, caption text to 5,000 characters, and timeline grid size matches the DB rule of 0.1–10 seconds.
- Database migration `0024_timeline_timing_bounds.sql` adds matching constraints with `NOT VALID` so existing data is not silently modified or immediately scanned during migration.
- CI for code commit `30117a02dec8360c147af234f04fc8326f282736` passed lint, TypeScript typecheck, 27 test files, and the production build.
- Before release, count records violating the new checks in staging, review/repair any outliers, then run `VALIDATE CONSTRAINT` for each constraint.


## Timeline edit forms — October 12, 2026

- Caption text and timing remain local while the user types; one explicit save sends text/start/end together.
- Clip start/duration/source-in/volume remain local while editing; one explicit save sends the complete patch, which is validated against existing clip timing before persistence.
- Failed saves keep the local draft so the user can correct/retry instead of losing input.
- CI for code commit `48b25b7e2c3ce86fdd94e21e3480bc0e42d7a40d` passed lint, typecheck, **28 test files**, and production build.


## Render/export integrity — October 12, 2026

- Renderer output is now structurally validated before upload to private storage and before an export row can be marked ready.
- Validation rejects unexpected content types, oversized output, truncated/invalid ISO BMFF boxes, missing file/movie/media-data boxes, and empty media-data boxes.
- Structurally invalid output is treated as a permanent render failure, with the job failure state saved and its finalization claim cleared. If saving that state fails, the job remains in a reconciliation-safe state rather than being reported as completed.
- GitHub Actions for code commit `611893c00bc9826d24d31581e58552a592d8d664` passed lint, TypeScript typecheck, **29 test files**, and production build.
- The validator checks container structure only. It does not prove codec compatibility, all media samples decode, or that an actual hosted export plays correctly. Those acceptance checks remain a staging gate.


## Clip integrity and timeline edit history — October 13, 2026

- Integrated generated-clip MP4 structural validation and authenticated provider-content fallback on top of the latest main timeline settings/edit-form contracts.
- Reconciled Phase 9 timeline undo/redo with the Phase 5 explicit-save flow: clip save callbacks keep their Promise<boolean> result contract, and undo/redo history changes only after a confirmed persisted write.
- Added the 100-step bounded history module and unit tests alongside clip MP4 MIME/box-structure checks. Real provider results, codec/playback, staging DB/RLS, and migration verification remain untested from CI.


## Scene drafting checked settlement — October 13, 2026

- Scene drafting is integrated with the shared AI task settlement path instead of issuing unchecked complete/fail RPC calls.
- Structured output and scene counts are validated; inserted scene IDs are known before writes so cleanup can be scoped to this draft without deleting unrelated rows after an uncertain insert response.
- Existing completion state is checked before reporting success. Staging SQL/RLS, concurrency and provider failure injection remain release gates.


## Render finalization recovery — October 13, 2026

- Added a checked recovery helper so a ready export persisted before a lost job-status update is reconciled back to completed when a terminal render job is polled.
- The path does not infer completion from status alone: it checks the export row is ready and ties it to the same render job; missing/non-ready export and DB read/write failures remain explicit errors.
- Regression tests cover failed/cancelled rows with ready exports, no/missing export, non-ready export, lost status-update response, and database lookup/write failures. SQL/RLS races and provider-backed render/playback remain staging gates.


## Paddle cancellation plan reconciliation — October 13, 2026

- Cancellation webhook handling now checks the subscription update result and recalculates the user's effective plan from remaining active, trialing or past-due subscriptions before updating the profile.
- A canceled subscription can no longer downgrade a user who still has another entitlement-bearing subscription. Database errors prevent a falsely successful acknowledgement.
- Regression tests cover remaining-plan selection and missing/invalid candidate cases. Sandbox checkout, cancellation/renewal event ordering, refund behavior and staging schema/migration verification remain open.


## Audio job settlement — October 13, 2026

- Audio generation uses the checked job-settlement wrapper and validates completion RPC results rather than assuming a no-error response proves the job reached a successful terminal state.
- Refund messaging is tied to the actual checked settlement outcome; unknown settlement produces reconciliation messaging and avoids claiming a refund without evidence.
- Unit tests cover RPC failure and terminal-state settlement behavior. Real audio provider/storage failure injection and staging playback remain release gates.


## Shared audio and visual completion confirmation — October 13, 2026

- Added one shared checked-completion helper and wired it into audio, image and clip persistence. It requires a database read confirming generation_jobs.status = complete after the void completion RPC.
- Failed, nonterminal, missing, or unreadable terminal-state results become errors handled by the existing checked failure settlement/compensation logic; media is not cleaned up when the settled state is uncertain.
- Unit coverage exercises success, guarded no-op on failed jobs, unreadable/missing status, and RPC failures. Real provider/storage fault injection remains staging-only.


## YouTube publishing ownership guard — October 13, 2026

- Added a fail-closed ownership check before service-role export access, publication creation, token refresh or calls to the YouTube API.
- The ownership lookup uses the request-scoped authenticated client and filters by both project ID and the signed-in user's ID.
- Unit tests cover allowed, missing, mismatched, failed and thrown lookup cases. No database migration was needed; two-user staging verification remains a release gate.


## YouTube publication partial-success reconciliation — October 13, 2026

- Tracks upload attempt and confirmed video ID; the normal final publication update now verifies the expected row was returned.
- Confirmed remote success plus a later error attempts a checked local recovery to preserve published state, URL and provider ID. Ambiguous upload outcome is kept in uploading/reconciliation state instead of marked failed automatically.
- The UI distinguishes published-with-warning from full success. Unit coverage passed in CI; a real YouTube channel test is still required.


## Paddle webhook body-size guard — October 13, 2026

- Added a bounded raw-body reader for Paddle webhook requests (1 MiB maximum), with streamed-byte accounting, early declared-length rejection, and best-effort stream cancellation after overflow.
- Oversized requests return 413 and do not invoke signature verification or database access. Unreadable streams return 400. Valid raw bytes are decoded once and passed to the existing signature verifier.
- CI covers boundary and handler behavior. Deployed runtime ingress/body handling remains a staging verification item.
