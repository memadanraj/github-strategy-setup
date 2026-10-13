# DCXORA — Current State (updated October 12, 2026)

This file distinguishes **code present**, **automated checks**, and **live/staging verification**. A green local/CI build does not prove the connected database, payment provider, or AI providers are configured correctly.

## Application stack

- **Web app/server:** TanStack Start, React 19, Vite, TypeScript, Bun.
- **Auth/database/storage:** Supabase-compatible Postgres, managed auth, RLS, and private `project-assets` storage.
- **AI:** Lovable AI Gateway for structured text, image and video calls.
- **Audio:** provider adapters for voice/music; live behavior requires credentials and staging checks.
- **Rendering:** Shotstack or a compatible `RENDERER_URL`.
- **Billing:** Paddle checkout/webhook implementation.
- **Deployment direction:** Cloudflare Workers is a target, but edge-runtime compatibility and a real deployment must be tested separately before claiming it is deploy-ready.

## Current routes and capabilities

| Area | Code status | Verification still needed |
|---|---|---|
| Landing, auth, reset | Existing routes | Sign-up/login/reset against staging, OAuth callback, invalid/expired session cases |
| Dashboard and projects | Existing routes | Database-backed end-to-end project CRUD and cross-user access denial |
| Creation wizard | Implemented | Persists versioned production brief in `projects.settings`; migration `0016` must be applied to staging |
| Writing/research/scripts | Existing; persistence failure gates tested | Real gateway/schema failure, rate/timeout behavior, evidence-backed research not implemented |
| Scene breakdown | Implemented | AI output validated before replacing scenes; RPC migration `0015` needs staging verification |
| Scene CRUD/order | Implemented in branch | Create/delete/reorder use transactional RPCs; migrations `0019` and `0020` need staging RLS/concurrency verification |
| Project versions | Implemented in branch | Atomic snapshots/restores via `0017`; staging restore and asset-link checks remain |
| Asset uploads | Implemented in branch | File validation and cleanup paths are unit-tested; storage policies, orphan cleanup, and cross-user isolation need staging tests |
| Async video clips | Partial | Provider job IDs/status/output are normalized; media download is bounded and hardened. Live provider timeout/retry/cancel/asset linking remains untested |
| Voice/music/captions/timeline | Existing UI/code | Live provider output, timed captions, editor persistence/undo/redo need acceptance tests |
| Rendering and exports | Partial | Provider adapter and failure tests exist; real MP4 render/download/playback and retry tests remain |
| Share links | Implemented in branch | Hashed tokens, optional password, expiry/revoke, lockout, and short-lived signed export URLs; migration `0018` and live access controls need staging checks |
| Paddle billing | Partial | Signature, price mapping, webhook delivery and credit-ledger wrappers have unit tests; sandbox checkout/subscription/renewal/cancel/refund remains unverified |
| Admin and YouTube | Existing/partial | Role denial/audit testing and Google OAuth/publishing with staging credentials remain |
| Monitoring | Partial | Sentry/logging/alerts need real configuration and redaction review |

## Recent verified branch work

The original hardening PR was merged into `main`. Follow-on improvements are being developed as stacked draft PRs: `hardening/phase-3-media-persistence` (media/provider/settlement), `hardening/phase-4-timeline-guardrails` (timeline bounds), and `hardening/phase-5-timeline-editing-ux` (explicit draft/save interaction). These follow-on branches remain unmerged.

Code commit `3f89c3a3e830fcef99c0c0ce6426ac597ccec6bf` passed GitHub Actions:

- locked Bun dependency installation
- lint (inherited formatting/explicit-`any` findings remain warnings)
- TypeScript typecheck
- unit/component tests (**27 test files passed**)
- production build

Added or improved on this branch: environment-file ignore rules; secure remote-media handling; normalized async video job contracts; AI task completion/refund error handling; create-project/writing failure paths; a persisted production plan; atomic scene replacement/version restore/reorder/create/delete; asset validation/cleanup; secure public export sharing; Paddle webhook and credit-ledger tests.

The earlier hardening changes were merged to `main`. The current follow-on work lives on `hardening/phase-3-media-persistence` and remains isolated from `main` until its draft PR is reviewed/merged.

## Database and deployment warning

The SQL migration history is inconsistent: there are duplicate numeric prefixes (including `0010_*` and `0011_*`), several SQL files are not represented in Drizzle's journal, and the Drizzle schema/snapshot files are not authoritative. Do not blindly run all SQL files by filename order or run schema generation against production.

Migrations `0015` through `0021` contain new functions/tables needed by the implemented branch. They have not been applied/verified against a staging database from this environment. Take a backup, inspect the actual migration ledger and current schema, apply only missing migrations in dependency order in staging, and test RLS/ownership before any deployment.

A tracked `.env` was removed from the branch tip, but deleting it does not erase the value from Git history. Rotate any real credentials ever committed. This document does not assert which secrets are currently configured.

## Release gate still open

Do not call the app production-ready until a staging user can sign in, create/edit/restore a project, generate and store scenes/media, produce voice/captions, assemble the timeline, render/download/play a valid MP4, share/revoke an export, and complete Paddle sandbox checkout/refund flows. Repeat with timeouts, malformed provider output, duplicate/out-of-order events, storage failures, concurrent edits, and unauthorized cross-user requests.


## Update — media persistence and settlement (October 12, 2026)

- Image generation and asynchronous video-clip persistence now check the asset insert, scene attachment, and job-completion writes instead of ignoring database errors.
- On a confirmed failed job, media cleanup is attempted and cleanup failures are surfaced. If the settlement call itself cannot be confirmed, media is preserved to avoid deleting a result that may already be complete; the user is told that credit state needs reconciliation instead of being falsely told a refund happened.
- New migration `0021_checked_visual_job_settlement.sql` adds a service-role-only RPC that returns the observed terminal state and refunds a reservation in the same transaction as marking the job failed.
- GitHub Actions passed lint, typecheck, tests (**21 test files passed**) and the production build on commit `e03856ebfff833b3332fda18a9ae4cd256fba050`.
- The staging database has not been connected from this environment. Migration `0021`, storage cleanup behavior, and provider race/retry cases still require staging verification.


## Update — audio job settlement and media consistency (October 12, 2026)

- Voiceover, voice preview, voice cloning, and music generation now check database writes and completion results rather than silently accepting failed asset/track/scene associations.
- These paths use `src/lib/audio-job-settlement.ts`, which calls the checked failure/refund RPC. User-facing errors do not claim a refund unless the database confirms the failed terminal state and reservation refund.
- Voiceover cleanup attempts to restore the previous scene-audio association before removing new rows; preview files use unique storage paths; music and voiceover cleanup checks row deletion and file removal. If database cleanup fails, the shared cleanup helper preserves media files that may still be referenced.
- Added `src/test/audio-job-settlement.test.ts` for completion RPC failures, confirmed refunds, unknown settlement, and already-complete handling. Latest CI run passes with **21 test files**.
- The code is still branch-only. Audio provider, storage, and rollback behavior require staging end-to-end tests; provider-created remote voice clones cannot always be compensated by local database cleanup alone.


## Update — bounded visual-provider HTTP and synchronous AI settlement (October 12, 2026)

- Image generation is bounded to 120 seconds, video-job creation to 45 seconds, and each clip status poll to 20 seconds; the overall clip deadline remains 15 minutes.
- Visual provider JSON responses use byte limits (512 KiB for metadata/status responses; 44 MiB for image-generation JSON). Malformed responses fail explicitly. Transient poll network/timeouts retry rather than immediately failing the job.
- Synchronous text-AI tasks use the checked failure/refund RPC. A lost completion response is reconciled against the database; if the job is already complete and the result was persisted, the request returns success. Refund claims require a confirmed terminal state.
- CI passed lint, typecheck, 27 test files, and production build on code commit `3f89c3a3e830fcef99c0c0ce6426ac597ccec6bf`. The following documentation-only commit has not had a separate workflow run yet.
- Live provider timeouts, database races, and actual media responses still require staging validation.


## Update — timeline timing guardrails (October 12, 2026)

- Client-side clip/caption validation and database constraints now agree on a maximum timeline time of 24 hours. The client also rejects combined clip ranges ending after 24 hours, transition values over 80 characters, and caption text over 5,000 characters.
- New migration `0024_timeline_timing_bounds.sql` uses `NOT VALID` checks to avoid silently changing existing records during migration. Operators must audit historic violations and validate the constraints in staging after any remediation.
- CI passed lint, typecheck, **27 test files**, and production build for code commit `30117a02dec8360c147af234f04fc8326f282736`. Live database migration/staging behavior remains unverified.


## Update — timeline edit workflow (October 12, 2026)

- Caption and clip inputs now use local draft state; database writes occur on explicit save rather than each keystroke. This avoids interrupted decimal entry and racing requests while a user is typing.
- Caption saves submit text, start and end together. Clip saves submit start, duration, source-in and volume together so combined timing validation runs on one consistent patch.
- Failed saves retain drafts and show the existing error feedback instead of resetting the user's input.
- CI passed lint, typecheck, **28 test files**, and build on code commit `48b25b7e2c3ce86fdd94e21e3480bc0e42d7a40d`. Current migration/staging gates described above still apply.


## Update — rendered MP4 integrity (October 12, 2026)

- Render downloads are still bounded to 512 MiB and now also need an MP4-compatible content type and a structurally valid ISO BMFF container before upload.
- The structural checks require file-type, movie and non-empty media-data boxes; truncated/oversized boxes and malformed/non-MP4 responses are rejected.
- Invalid container output becomes a failed render, rather than a ready export. CI passed lint, typecheck, **29 test files** (7 MP4 validation tests), and production build on code commit `611893c00bc9826d24d31581e58552a592d8d664`.
- This is not a codec-level validation or an end-to-end playback result. A real renderer, storage, export-download and browser playback test is still required in staging.


## Update — clip MP4 integrity and timeline undo/redo (October 13, 2026)

- Generated scene clips now use an MP4-compatible MIME + ISO BMFF structural validation path with a 128 MiB cap before storage/asset/scene/job completion. A stale or inaccessible provider output URL falls back to the authenticated provider-content endpoint.
- Timeline clip editing includes bounded in-memory undo/redo history for successfully persisted clip edits, limited to 100 steps. A failed save does not commit a history entry.
- The clip checks validate container structure, not codec decoding or real playback. Provider-backed download, asset linking, media playback, and the staging database migration/RLS checks remain release gates.


## Update — scene drafting settlement (October 13, 2026)

- Scene drafting uses the shared checked AI-job runner; structured output and scene counts are validated before rows are persisted.
- Inserted scene IDs are preassigned so only rows from the attempted draft are eligible for compensating cleanup when an insert response may have been lost.
- Staging must still exercise gateway timeouts/schema errors, concurrent requests, persistence races and checked credit settlement against the real database.


## Update — render finalization recovery (October 13, 2026)

- Render status polling reconciles a failed/cancelled job to completed only when a ready export for that render job is confirmed in the database.
- This covers the crash window where the export row persisted but the job's final status update was lost. Missing, non-ready, or unreadable exports do not silently turn into success.
- Unit coverage includes terminal/nonterminal states, ready-export recovery, lost update response, and lookup/write failures. Real provider and concurrent database behavior still require staging validation.


## Update — Paddle cancellation entitlement reconciliation (October 13, 2026)

- A subscription-canceled event now confirms the subscription row was actually marked canceled, then recomputes the account's effective plan from any remaining active, trialing, or past-due subscriptions.
- The account falls back to free only when no qualifying subscription remains; a database lookup or profile update error is surfaced instead of silently claiming reconciliation succeeded.
- Regression tests cover multiple subscriptions, pending payment recovery, cancelled/paused rows and missing qualifying subscriptions. Paddle sandbox lifecycle/order and legacy billing migration reconciliation remain staging gates.
