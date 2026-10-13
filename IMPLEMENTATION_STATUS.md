# DCXORA implementation status

This is an evidence-based phase tracker for the master plan. A UI control or source file alone is not proof a feature is complete. `COMPLETE` should be used only after persistence, security, error paths, and relevant tests pass.

**Working branch:** `hardening/phase-4-timeline-guardrails`  
**Target:** draft PR, not `main`  
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
| 9. Basic editor/timeline | PARTIAL / TEST | Client timing validation now enforces a 24-hour ceiling for clip/caption times, verifies clip end using the saved timing, caps transition names at 80 chars and caption text at 5000 chars. Migration `0024_timeline_timing_bounds.sql` adds database-side upper bounds (`NOT VALID`) so direct API writes cannot bypass the same constraints. Drag/trim/split/undo/redo interaction tests, existing-row audit, and staging constraint validation remain. |
| 10. Rendering | PARTIAL | Shotstack and compatible HTTP renderer adapters exist. Clear missing-provider failure and bounded MP4 result download added. Render-provider tests added; end-to-end render/playback and idempotent retry tests remain. |
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
