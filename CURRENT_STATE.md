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
| Writing/research/scripts | Existing; persistence failure gates tested | Scene drafting now uses the shared checked AI-job runner with structured-output validation and compensation for generated scene rows after confirmed settlement failure. Real gateway/schema failure, rate/timeout behavior, concurrency, and staging persistence remain to be verified; evidence-backed research is not implemented |
| Scene breakdown | Implemented | AI output validated before replacing scenes; RPC migration `0015` needs staging verification |
| Scene CRUD/order | Implemented in branch | Create/delete/reorder use transactional RPCs; migrations `0019` and `0020` need staging RLS/concurrency verification |
| Project versions | Implemented in branch | Atomic snapshots/restores via `0017`; staging restore and asset-link checks remain |
| Asset uploads | Implemented in branch | File validation and cleanup paths are unit-tested; storage policies, orphan cleanup, and cross-user isolation need staging tests |
| Async video clips | Partial | Provider job IDs/status/output are normalized; download is bounded; media MIME and MP4 box structure are validated before storage; invalid output URLs fall back to the authenticated content endpoint. Live provider timeout/retry/cancel/asset linking, codec compatibility and playback remain untested |
| Voice/music/captions/timeline | Existing UI/code | Live provider output, timed captions, editor persistence/undo/redo need acceptance tests |
| Rendering and exports | Partial | Provider adapter and failure tests exist; render polling now reconciles failed/cancelled jobs when a ready export was persisted before a lost final-state update. Real MP4 render/download/playback, database races and provider retry behavior still require staging tests |
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


## Update — generated clip MP4 integrity (October 12, 2026)

- Scene-clip downloads now preserve the provider response content type and accept only MP4 or generic binary responses for the clip path.
- Before a generated clip is uploaded, registered as an asset, attached to a scene, or marked complete, the bytes must pass the existing ISO BMFF container checks: valid top-level box boundaries, `ftyp`, `moov`, and non-empty `mdat`; generic binary MIME does not bypass byte validation.
- The clip path keeps a 128 MiB response limit. If the provider's returned URL is stale, invalid, non-MP4 or malformed, the code tries the authenticated provider-content endpoint; if that also fails, normal checked job-failure settlement runs rather than persisting invalid media as `.mp4`.
- CI passed locked dependency install, lint, TypeScript typecheck, unit/component tests and production build for commit `39ea7296a822d7b3869494b35e72cdf6e4d888f0`.
- Live AI provider output and actual playback still require staging verification; CI does not prove a real provider's codec output is playable.


## Update — scene drafting job settlement (October 12, 2026)

- `draftScenesWithAi` now uses the shared `runAiTask` job runner instead of maintaining its own credit reservation, completion, and legacy failure calls.
- Scene generation validates the returned scene payload before insertion, checks failures from the existing-scene count query, assigns IDs before insert, and removes only those IDs if an insert error may have occurred after the database commit.
- If completion fails twice and checked settlement confirms the generation job failed, the runner attempts to remove only the newly inserted scene rows. If settlement or cleanup is uncertain, the response reports reconciliation rather than claiming that the operation/refund succeeded.
- `already_failed` alone no longer produces a definitive “credits refunded” claim in shared AI/visual settlement messages. The clip poller's pre-existing failed-job response also no longer appends an unconditional refund claim.
- GitHub Actions passed locked dependency installation, lint, TypeScript typecheck, unit/component tests, and production build for commit `c46a58336fa825cee2e67a9ea1b2e775bfc039c2`.
- This is mocked/unit-level verification. Real provider calls, database failure races, and compensation behavior still require staging validation.


## Update — recovery of persisted render exports (October 12, 2026)

- Render status polling now checks whether a failed/cancelled render already has an export row marked `ready` before returning the terminal state unchanged.
- If a ready export exists, the server attempts to reconcile the render job to `completed`; if the update response is uncertain, it reloads the job before reporting recovery. If export lookup or status reconciliation fails, it surfaces an explicit reconciliation error rather than silently masking the discrepancy.
- Regression tests cover non-terminal jobs, missing/non-ready exports, failed and cancelled terminal rows with ready exports, lost update responses, and database lookup/write failures.
- GitHub Actions passed locked dependency installation, lint, TypeScript typecheck, unit/component tests, and production build for commit `6412a320fab769020b99720b1c6f64d4b7443ebf`.
- This is mocked/unit-level verification. Verify the crash window with staging Postgres/Storage and download/play the actual exported media before production.


## Update — Paddle cancellation plan reconciliation (October 12, 2026)

- A cancellation event now confirms the subscription row was actually marked canceled, then recomputes the account plan from any remaining active, trialing, or past-due subscriptions.
- The webhook no longer automatically sets a user to the free plan when another qualifying subscription remains. Past-due stays eligible to match the current payment-recovery grace-period behavior; if no qualifying subscription remains, the effective plan becomes free.
- Unit coverage checks multiple subscriptions, grace-period handling, terminal/paused subscriptions, invalid timestamps, and the no-subscription fallback.
- GitHub Actions run [38232544992](https://github.com/memadanraj/github-strategy-setup/actions/runs/38232544992) passed lint, TypeScript typecheck, unit/component tests (**30 test files, 252 tests**), and production build for code commit `cc4fcc900aac486eded29715823e73b0d320a7ad`. Lint still reports inherited warnings, but no lint errors.
- This remains mocked/unit-level verification. Paddle event ordering and the real subscription lifecycle still require sandbox testing.


## Update — audio completion confirmation (October 13, 2026)

- Audio success responses now require a follow-up read proving `generation_jobs.status = complete`; a void completion RPC returning without an error is no longer treated as proof that the job transitioned.
- Regression coverage includes a verified complete job, an already-failed job whose completion RPC is a guarded no-op, an unreadable/missing terminal state, and a completion RPC error.
- No migration was added. The implementation still relies on the existing `generation_jobs` state and checked failure-settlement RPC.
- CI run [38404696357](https://github.com/memadanraj/github-strategy-setup/actions/runs/38404696357) passed lint, TypeScript type-check, all **30 test files / 254 tests**, and the production build on code commit `45c95f7f4efe4f5cdc2e469d4b9a5d5396596562`.
- The run still reports inherited warning-level lint findings and existing empty-link warnings. Live provider/storage/database fault-injection and audio playback verification remain part of the staging release gate.


## Update — visual completion confirmation (October 13, 2026)

- Image and clip generation no longer treat a no-error `complete_generation_job` response as proof of success; both confirm `generation_jobs.status = complete` before returning success.
- The shared completion helper is now used by audio and visual job paths, keeping their success criteria consistent. Failed or unreadable states flow through the existing checked failure-settlement logic.
- Added regression tests for successful completion, a no-op RPC on an already-failed job, missing/nonterminal state, and RPC errors.
- No migration was added. Real provider/storage behavior and MP4 playback remain staging gates.


- CI run [38405640071](https://github.com/memadanraj/github-strategy-setup/actions/runs/38405640071) passed lint, TypeScript type-check, all **31 test files / 258 tests**, and production build on code commit `be9c9c8c7d45778d4607c178e7ed1a6762189fbb`. Existing warning-level lint findings and empty-link warnings remain. Live provider, storage, database and playable-media checks remain staging-only release gates.


## Update — YouTube project ownership guard (October 13, 2026)

- YouTube publishing previously used the admin client to load a private export and create a publication record based only on caller-supplied project/export IDs. The handler now first verifies the project through the caller's authenticated Supabase client and explicitly matches both project ID and user ID.
- Missing projects, cross-user IDs, database errors, and thrown lookup failures are denied before token refresh, export access, or YouTube upload begins.
- Added unit coverage for allowed owner lookup, absent project, lookup error/throw, mismatched IDs, and missing identity. No database migration was added.
- Staging verification with two separate users and YouTube sandbox/test channels remains required.
