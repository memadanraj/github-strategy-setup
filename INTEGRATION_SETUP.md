# DCXORA — Local and Provider Setup

This file describes the configuration the current code expects. A variable being documented does not mean the corresponding integration has credentials configured or has passed a live end-to-end test.

## 1. Install and run locally

```bash
bun install --frozen-lockfile
cp .env.example .env
bun run dev
```

Set the required auth/database variables before opening authenticated studio routes. Do not put server secrets in `VITE_*` variables.

## 2. Supabase / Postgres / Storage

Configure these values:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server only; never expose to the browser)
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Create the private `project-assets` storage bucket with policies appropriate for user-owned project media. The service-role client bypasses row-level security, so use it only from server-only modules and always enforce project/job ownership before privileged storage or database changes.

### Migration caution

The SQL files are the migration history for this project, but the repository currently includes duplicate numeric prefixes (`0010_*`, `0011_*`) and several SQL files not listed in Drizzle's migration journal. The Drizzle schema/snapshot files are intentionally empty, so do not run schema generation against production or assume `drizzle-kit migrate` will apply every SQL file.

Before applying a SQL migration to an existing database:
1. Take a database backup.
2. Inspect whether the migration's tables, columns, functions, policies, and indexes already exist.
3. Apply only migrations not already applied, in dependency order, in staging first.
4. Verify auth, RLS, storage, credit reserve/refund, render, and billing behavior before promoting.

The `0012_fix_ai_media_models.sql` migration aligns stored media model identifiers for existing installations and must be applied where the older identifiers are still present.

The `0013_job_pipeline_hardening.sql` migration adds generation-job event history, an atomic download claim to prevent duplicate clip persistence, duplicate-active-clip protection, and idempotent job completion/failure/refund functions. The current AI task wrapper retries a failed completion RPC once and reports refund uncertainty if the failure/refund RPC cannot be confirmed. **Apply and verify this migration in staging before deploying application code that calls `claim_generation_job_download`.** The repository's Drizzle journal does not currently list all existing SQL files, so do not assume a generic Drizzle migration command will apply the complete history. Confirm the managed migration process used by your database, check its applied-migration records, back up the database, then apply only missing migrations in staging.

The hardening branch adds two migrations that must be reviewed and applied in staging before deploying the corresponding code:
- `0015_atomic_scene_replacement.sql` adds an authenticated transactional RPC for replacing scenes, so a failed insert rolls back the preceding delete.
- `0016_project_production_settings.sql` adds the non-null `projects.settings` JSONB column used by the creation wizard's production brief and plan.

These files are not guaranteed to be auto-applied by Drizzle; follow the migration caution above and verify each change in the managed database before deploying the branch.

Additional hardening migrations introduced on this branch:
- `0017_atomic_project_versions.sql` adds owner-checked transactional version snapshot/restore RPCs.
- `0018_project_share_links.sql` adds hashed-token share records, password lockout tracking, and server-role-only table access.
- `0019_atomic_scene_reordering.sql` adds an owner-checked transactional scene-reorder RPC.
- `0020_atomic_scene_crud.sql` adds owner-checked transactional scene creation and deletion, with position normalization after deletion.

Review and apply `0015` through `0019` in order where they have not already been applied, but only after a database backup and staging schema check. The repository has historical duplicate migration prefixes and an incomplete Drizzle journal, so do not assume numeric file order alone means a generic migration command will apply them correctly. Verify the actual database migration records first.



## 3. AI Gateway

Set the server-only secret:

- `LOVABLE_API_KEY`

The current implementation calls the Lovable AI Gateway for structured text, image generation, and video clips. The key must only exist on the server. AI jobs may incur provider costs; keep credit reservations, completion, and refunds server-authoritative.

## 4. Voice generation

Set:

- `ELEVENLABS_API_KEY`

Voiceover and music generation cannot be considered live until this key is valid, account permissions are correct, and a staging job verifies that the audio bytes persist as an asset and appear on the scene/timeline.

## 5. Rendering and exports

For Shotstack, set:

- `SHOTSTACK_API_KEY`
- `SHOTSTACK_ENV=stage` for testing, or `production` when intentionally using production

Alternatively, configure a compatible external renderer:

- `RENDERER_URL`
- `RENDERER_API_KEY` (if the renderer expects bearer-token authentication)

The current render UI expects a renderer to be configured. If no provider exists, rendering should report a configuration error rather than leaving a job spinning indefinitely.

Supported initial output target is MP4. Validate the resulting file by downloading and playing it, not only by checking that the render provider returned a successful status.

## 6. Paddle billing

Set:

- `PADDLE_API_KEY`
- `PADDLE_CLIENT_TOKEN`
- `PADDLE_WEBHOOK_SECRET`
- `PADDLE_ENVIRONMENT=sandbox` until sandbox checkout/webhooks pass

Create Paddle products/prices for the active plan and credit packs, then populate `plans.paddle_price_id` and `credit_packs.paddle_price_id`. Configure the webhook to:

`https://YOUR-DOMAIN/api/public/paddle/webhook`

Test duplicate event delivery, invalid signature rejection, completed checkout, subscription activation/renewal/cancellation, and credit ledger reconciliation in sandbox. Do not configure live prices until these tests pass.

## 7. YouTube publishing

Enable YouTube Data API v3 and YouTube Analytics API in Google Cloud and set:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `YOUTUBE_OAUTH_REDIRECT_URI=https://YOUR-DOMAIN/youtube/callback`
- `YOUTUBE_TOKEN_ENCRYPTION_KEY` (base64-encoded 32 random bytes)

Register the exact callback URL in the OAuth client. Use a separate test channel and ensure token refresh/expiration behavior is tested before production.

## 8. Observability

Optional variables:

- `SENTRY_DSN`
- `APP_NAME=DCXORA`

Do not log bearer tokens, provider secrets, signed media URLs, or payment data. Log job IDs, provider stage, error code, and a redacted reason.

## 9. Staging and production

Keep development, staging, and production databases and credentials separate. Do not test destructive schema changes on production. Back up database metadata independently of media storage, and validate restores periodically.


## 11. What CI does and does not prove

The automated workflow runs the static checks, unit/component tests, and production build on every branch update. It uses placeholder configuration values; it does not make external provider requests or connect to the application's staging database. Current unit coverage includes Paddle signature validation, price/credit calculation, webhook delivery retry decisions, and project-share token/password helpers. These tests do not replace the staging checklist in the sections above.
