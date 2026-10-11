# DCXORA implementation status

This is an evidence-based phase tracker for the master plan. A UI control or source file alone is not proof a feature is complete. `COMPLETE` should be used only after persistence, security, error paths, and relevant tests pass.

**Working branch:** `hardening/phase-0-security-and-ci`  
**Target:** draft PR, not `main`  
**Status date:** 2026-10-11

| Plan phase | Current status | Evidence / remaining work |
|---|---|---|
| 0. Repository audit | PARTIAL | Stack, routes, database/auth, provider keys, tests, and migration inconsistencies inspected. Continue auditing during each implementation step. |
| 1. Foundation (auth, ownership, persistence, errors) | TEST | Existing Supabase auth/RLS; env secrets removed from branch tip. Add automated cross-user access tests and verify signup/login/reset and persistence against staging. |
| 2. Projects and scenes | EXISTING / TEST | Project/scene APIs and tables exist. Automated CRUD, ordering, deletion, recovery and persistence tests are not comprehensive. |
| 3. Central jobs | PARTIAL / TEST | Existing `generation_jobs`; migration `0013_job_pipeline_hardening.sql` adds events, active-clip dedupe, atomic download claim, and idempotent terminal state/refund. Async clip start now checks provider-job-ID persistence, and provider response parsing is normalized with unit tests. Staging migration application, SQL/concurrency tests, and live provider tests are still required. |
| 4. Provider abstraction | PARTIAL | Render/audio adapters exist. Text/image/video still call gateway from domain functions; define common provider response schemas and add adapter contract tests. |
| 5. Script generation | EXISTING / TEST | Research/hooks/script/scene drafting flows exist. Mainline operations still execute synchronously and structured generation/persistence needs failure tests. |
| 6. Video clip generation | PARTIAL / TEST | Client-polled provider job exists; downloader bounds bytes/time, checks HTTPS/redirects and avoids forwarding gateway secrets to third-party hosts. Provider job IDs/status/output URLs are normalized and malformed responses have unit coverage. Need staging provider success/failure/timeout/retry/cancel tests and apply migration 0013 first. |
| 7. Voice generation | EXISTING / TEST | Voice provider code and UI exist, but live verification requires `ELEVENLABS_API_KEY` and/or supported voice-provider credentials. |
| 8. Captions | EXISTING / TEST | Caption/transcription model exists; timing, edit, export-format and rendered-caption acceptance tests remain. |
| 9. Basic editor/timeline | EXISTING / TEST | Timeline tracks/clips, audio/text/caption data and UI exist. Drag/trim/split/undo/redo and persistence tests remain. |
| 10. Rendering | PARTIAL | Shotstack and compatible HTTP renderer adapters exist. Clear missing-provider failure and bounded MP4 result download added. Render-provider tests added; end-to-end render/playback and idempotent retry tests remain. |
| 11. Export and sharing | PARTIAL | Export listing and signed download URL exist. Public/private/unlisted/password/expiry links are missing or unverified. |
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
