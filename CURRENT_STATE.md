# DCXORA — Current State (Phase 0 audit, Oct 2026)

Statuses follow the master plan: EXISTING / BROKEN / PARTIAL / MISSING / REFACTOR / TEST.

## Stack
- Frontend + server: TanStack Start (React 19, Vite), server functions in `src/lib/*.functions.ts`, server-only helpers in `*.server.ts`.
- Database/auth/storage: Lovable Cloud (Postgres + RLS, private `project-assets` bucket).
- AI: Lovable AI Gateway (text via Responses API, images, Veo clips). Voice: ElevenLabs. Render: Shotstack (or generic `RENDERER_URL`). Billing: custom Paddle.
- Deploy target: Cloudflare Workers (edge).

## Routes
| Route | Purpose | Status |
|---|---|---|
| `/` | Landing | EXISTING |
| `/auth`, `/reset-password` | Email + Google sign-in, reset | EXISTING (TEST) |
| `/dashboard` | Overview | PARTIAL — no active jobs, usage, search |
| `/projects`, `/projects/$projectId` | Project list + studio tabs | EXISTING (TEST) |
| `/settings` | Profile + Paddle billing | PARTIAL — no price IDs linked |
| `/admin` | Users, plans, credits, job logs | EXISTING (TEST) |
| `/youtube/callback` | YouTube OAuth | PARTIAL — Google keys missing |
| `/api/public/paddle/webhook` | Paddle webhook (signed) | TEST |

## Database tables
profiles, user_roles, plans, credit_transactions, credit_packs, projects, project_versions, project_writing, scenes, assets, characters, ai_tasks, generation_jobs, voices, voice_clones, voiceovers, scene_audio, music_tracks, captions, caption_styles, timeline_tracks, timeline_clips, timeline_settings, render_presets, render_jobs, exports, paddle_customers, paddle_subscriptions, paddle_events.

## Feature status
| Area | Status | Notes |
|---|---|---|
| Auth / sessions | EXISTING | Managed auth; rate limiting via in-process limiter |
| Authorization | EXISTING | RLS + `has_role`; plan/credit fields trigger-protected |
| Projects / scenes / assets | EXISTING | No duplicate/archive/search yet |
| Credits ledger | EXISTING | Reserve → complete/fail with auto-refund |
| Central job system | REFACTOR | `generation_jobs` exists, but work runs inside one long request |
| Script / research | EXISTING (TEST) | Research is AI-only, no real web sources/citations |
| Image generation | TEST | |
| Clip generation | REFACTOR | Polls the video job synchronously inside a server function — must become create → poll from client |
| Voice | BROKEN until key | `ELEVENLABS_API_KEY` missing |
| Captions / timeline | EXISTING (TEST) | |
| Rendering / export | BROKEN until key | `SHOTSTACK_API_KEY` missing |
| Share links | MISSING | |
| YouTube publish | BROKEN until keys | Google OAuth keys missing |
| Billing (Paddle) | PARTIAL | Keys set; plans/packs have no Paddle price IDs |
| Admin | EXISTING (TEST) | |
| Monitoring | PARTIAL | Sentry optional, DSN not set |
| Tests | MISSING | Only a routing test exists |

## Configured secrets
Set: LOVABLE_API_KEY, PADDLE_API_KEY, PADDLE_CLIENT_TOKEN, PADDLE_WEBHOOK_SECRET.
Missing: ELEVENLABS_API_KEY, SHOTSTACK_API_KEY, GOOGLE_CLIENT_ID/SECRET, YOUTUBE_TOKEN_ENCRYPTION_KEY, SENTRY_DSN.

## Cleanup notes
- Two migrations share prefix `0010_` (paddle + youtube); harmless but confusing.
- `INTEGRATION_SETUP.md` and `.env.example` still describe Stripe — outdated.
- Testing mode: every user defaults to Creator plan (revert before launch).

## Next (master order)
1. Phase 1 foundation checks (auth, ownership, persistence) with tests.
2. Phase 3 central jobs: move clip generation to async create/poll.
3. Wizard (video type, duration, tone, audience, language) → production plan.

## Update — Phase hardening branch (Oct 11, 2026)

These are branch changes only; they have not been merged to `main`.

- Removed the tracked root `.env` file on the hardening branch and added local env-file ignore rules. This does not purge Git history; rotate any real values that were committed.
- Replaced the old starter README and Stripe-oriented setup guide with DCXORA setup guidance matching the current Paddle integration.
- Added GitHub Actions checks for locked Bun install, lint, TypeScript typecheck, Vitest, and production build. The first lint run showed approximately 2,700 inherited findings (mostly formatting and explicit `any`); these are now warnings so functional linting can expose non-formatting issues while debt is addressed incrementally.
- Added a bounded HTTPS media downloader with redirect validation, private/reserved address checks, size/timeout/content-type enforcement, and tests for unsafe URLs and download failures. DNS-resolved private-address blocking still depends on hosting/runtime network policy; URLs should be restricted to expected provider hosts where feasible.
- AI media downloads no longer send Lovable Gateway credentials to arbitrary provider/CDN URLs. Credentials are sent only to the gateway origin.
- Added duplicate-active clip handling, one-time download claiming, asset/scene/job relationship checks, and cleanup for failed clip persistence in application code.
- Added `0013_job_pipeline_hardening.sql` for generation-job event history, duplicate active clip protection, download claiming, and idempotent terminal transitions. It is not yet confirmed applied to any database; follow the staging migration steps in `INTEGRATION_SETUP.md`.
- Render requests now fail explicitly when no render provider is configured instead of leaving a queued job polling indefinitely. Completed exports use bounded media download and checked asset/export writes.
- Added render-provider manifest/status tests and remote-media security tests; CI must finish on the latest branch head before these can be called passing.

### Still not verified / not production-ready

- Live sign-up/login/password reset, cross-user ownership denials, database persistence, credit reservation/refund under concurrency, live video/voice generation, captions/timeline behavior, real rendering/playback, Paddle sandbox webhooks/renewals/cancellation, and YouTube OAuth/publishing.
- The repository migration history is inconsistent: duplicate numeric prefixes exist, several SQL files are missing from `drizzle/migrations/meta/_journal.json`, and the Drizzle schema/snapshots are blank. Do not apply migrations blindly to production.
- The project-wide lint backlog, extensive untyped database/provider payloads, distributed rate limiting, public/private share links, AI Director, and several advanced features remain open.
