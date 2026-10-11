# DCXORA implementation status

This is an evidence-based phase tracker for the master plan. A UI control or source file alone is not proof a feature is complete. `COMPLETE` should be used only after persistence, security, error paths, and relevant tests pass.

**Working branch:** `hardening/phase-0-security-and-ci`  
**Target:** draft PR, not `main`  
**Status date:** 2026-10-11

| Plan phase | Current status | Evidence / remaining work |
|---|---|---|
| 0. Repository audit | PARTIAL | Stack, routes, database/auth, provider keys, tests, and migration inconsistencies inspected. Continue auditing during each implementation step. |
| 1. Foundation (auth, ownership, persistence, errors) | TEST | Existing Supabase auth/RLS; env secrets removed from branch tip. Add automated cross-user access tests and verify signup/login/reset and persistence against staging. |
| 2. Projects and scenes | PARTIAL / TEST | Scene breakdown validates AI output and uses `0015` for transactional replacement. Version saves/restores use `0017`; creation, deletion, and reordering use owner-checked transactional RPCs in `0019` and `0020`. Client tests cover RPC contracts and failures. Database execution, RLS, asset cascade behavior, and concurrent edits still require staging integration tests. |
| 3. Central jobs | PARTIAL / TEST | Migration `0013_job_pipeline_hardening.sql` adds events, active-clip dedupe, atomic download claim, and idempotent terminal state/refund. Async clip start validates provider-job-ID persistence; AI job completion retries once and failures no longer claim a refund unless the refund RPC succeeds. Unit tests cover settlement retry and refund-RPC failure. Staging migration application and concurrency tests remain. |
| 4. Provider abstraction | PARTIAL | Render/audio adapters exist. Text/image/video still call gateway from domain functions; define common provider response schemas and add adapter contract tests. |
| 5. Script generation | EXISTING / TEST | Research/hooks/script/scene drafting flows exist. Mainline operations still execute synchronously and structured generation/persistence needs failure tests. |
| 6. Video clip generation | PARTIAL / TEST | Client-polled provider job exists; downloader bounds bytes/time, checks HTTPS/redirects and avoids forwarding gateway secrets to third-party hosts. Provider job IDs/status/output URLs are normalized and malformed responses have unit coverage. Need staging provider success/failure/timeout/retry/cancel tests and apply migration 0013 first. |
| 7. Voice generation | EXISTING / TEST | Voice provider code and UI exist, but live verification requires `ELEVENLABS_API_KEY` and/or supported voice-provider credentials. |
| 8. Captions | EXISTING / TEST | Caption/transcription model exists; timing, edit, export-format and rendered-caption acceptance tests remain. |
| 9. Basic editor/timeline | EXISTING / TEST | Timeline tracks/clips, audio/text/caption data and UI exist. Drag/trim/split/undo/redo and persistence tests remain. |
| 10. Rendering | PARTIAL | Shotstack and compatible HTTP renderer adapters exist. Clear missing-provider failure and bounded MP4 result download added. Render-provider tests added; end-to-end render/playback and idempotent retry tests remain. |
| 11. Export and sharing | PARTIAL / TEST | Share links store only SHA-256 token hashes, support optional scrypt password protection, 1/7/30-day or no-expiry links, revocation, a password lockout and temporary signed MP4 playback. Migration `0018`; token/password primitives are unit-tested. Route, storage, expiry, revocation, and migration behavior require staging verification. |
| 12. Credits | EXISTING / TEST | SQL reserve/complete/fail/refund ledger exists. Concurrency, idempotency, reconciliation, actual-cost reporting, and billing/job integration tests remain. |
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
- These code changes are committed to the working branch. They are not considered verified until the workflow for the latest head passes; staging database/provider behavior remains unverified.


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

- GitHub Actions for commit `1097f0e682c580e4fd9f08fac2006923fc902c53` passed lint, TypeScript typecheck, unit/component tests, and production build (18 test files passed).
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
