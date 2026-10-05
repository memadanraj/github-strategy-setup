# Reelforge — Integration Setup

The application roadmap is implemented through Phase 15 at the code level. External providers still require their own credentials and, for Stripe, real Price IDs. Phase 07 AI-media generation also requires the migration below.

## 1. Apply database migrations

Apply the new migrations in order after the existing 0009_thumbnail_tasks.sql:

- drizzle/migrations/0010_youtube.sql
- drizzle/migrations/0011_billing.sql
- drizzle/migrations/0012_fix_ai_media_models.sql

Use the same Postgres/Lovable migration workflow already used for this repository.

## 2. AI visual generation

The visual pipeline uses the Lovable AI Gateway with `google/veo-3.1-lite` for scene clips and `openai/gpt-image-2` for scene images. Existing databases must apply `0012_fix_ai_media_models.sql` so stored `ai_tasks.model` values use supported media models.

Clip generation is asynchronous: create the job, poll its status, obtain the MP4 URL (or gateway content endpoint), then store the bytes in Supabase Storage. The server now handles direct media URLs and falls back to the gateway video-content endpoint when a direct download URL cannot be fetched.

## 3. Rendering

Set:
- SHOTSTACK_API_KEY
- SHOTSTACK_ENV=stage for testing or production for production

Phase 10 now signs private Supabase Storage assets before sending the render manifest to Shotstack.

## 4. YouTube

Enable YouTube Data API v3 and YouTube Analytics API in Google Cloud.

Set:
- GOOGLE_CLIENT_ID
- GOOGLE_CLIENT_SECRET
- YOUTUBE_OAUTH_REDIRECT_URI=https://YOUR-DOMAIN/youtube/callback
- YOUTUBE_TOKEN_ENCRYPTION_KEY

The encryption key must be base64-encoded 32 random bytes.

Register the exact redirect URI in the Google OAuth client. The app requests youtube.upload, youtube.readonly, and yt-analytics.readonly.

The refresh token is encrypted at rest and never returned to the browser.

## 5. Stripe

Set:
- STRIPE_SECRET_KEY
- STRIPE_WEBHOOK_SECRET

Create recurring Stripe Prices for the Starter/Creator/Pro/Agency plans, then save their Price IDs:

    update public.plans set stripe_price_id = 'price_...' where slug = 'starter';
    update public.plans set stripe_price_id = 'price_...' where slug = 'creator';
    update public.plans set stripe_price_id = 'price_...' where slug = 'pro';
    update public.plans set stripe_price_id = 'price_...' where slug = 'agency';

Create one-time Stripe Prices for the seeded credit packs and save them:

    update public.credit_packs set stripe_price_id = 'price_...' where slug = 'credits-500';
    update public.credit_packs set stripe_price_id = 'price_...' where slug = 'credits-1500';
    update public.credit_packs set stripe_price_id = 'price_...' where slug = 'credits-5000';

Create a Stripe webhook pointing to https://YOUR-DOMAIN/api/stripe/webhook.

The handler verifies the Stripe signature and is idempotent by Stripe event ID.

Existing subscribers change plans by updating the current Stripe subscription item; new subscribers use hosted Checkout.

## 6. Optional Sentry monitoring

Set:
- SENTRY_DSN
- APP_NAME=Reelforge

The server reports unhandled errors to Sentry when a DSN is configured. Existing Lovable/client error reporting remains enabled.

## 7. Production rate limiting

Server functions have a 120 requests/minute per-IP/path in-process limiter.

This is intentionally dependency-free. If the application is deployed across multiple instances/regions, replace the in-process bucket with a shared KV/Redis/Durable Object implementation.

## 8. Security

Do not commit real provider secrets. Use .env.example as the configuration template.

If the tracked .env file ever contained real secret credentials, rotate those credentials before production deployment.