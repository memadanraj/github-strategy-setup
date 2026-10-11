# DCXORA — Current State (updated October 11, 2026)

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

The latest code head verified by GitHub Actions is `1097f0e682c580e4fd9f08fac2006923fc902c53`. CI passed:

- locked Bun dependency installation
- lint (inherited formatting/explicit-`any` findings remain warnings)
- TypeScript typecheck
- unit/component tests (**18 test files passed**)
- production build

Added or improved on this branch: environment-file ignore rules; secure remote-media handling; normalized async video job contracts; AI task completion/refund error handling; create-project/writing failure paths; a persisted production plan; atomic scene replacement/version restore/reorder/create/delete; asset validation/cleanup; secure public export sharing; Paddle webhook and credit-ledger tests.

These changes live on `hardening/phase-0-security-and-ci` and are **not merged into `main`**.

## Database and deployment warning

The SQL migration history is inconsistent: there are duplicate numeric prefixes (including `0010_*` and `0011_*`), several SQL files are not represented in Drizzle's journal, and the Drizzle schema/snapshot files are not authoritative. Do not blindly run all SQL files by filename order or run schema generation against production.

Migrations `0015` through `0020` contain new functions/tables needed by the implemented branch. They have not been applied/verified against a staging database from this environment. Take a backup, inspect the actual migration ledger and current schema, apply only missing migrations in dependency order in staging, and test RLS/ownership before any deployment.

A tracked `.env` was removed from the branch tip, but deleting it does not erase the value from Git history. Rotate any real credentials ever committed. This document does not assert which secrets are currently configured.

## Release gate still open

Do not call the app production-ready until a staging user can sign in, create/edit/restore a project, generate and store scenes/media, produce voice/captions, assemble the timeline, render/download/play a valid MP4, share/revoke an export, and complete Paddle sandbox checkout/refund flows. Repeat with timeouts, malformed provider output, duplicate/out-of-order events, storage failures, concurrent edits, and unauthorized cross-user requests.
