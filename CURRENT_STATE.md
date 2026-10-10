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
