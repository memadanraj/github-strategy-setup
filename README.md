# DCXORA

DCXORA is an AI-assisted video production studio for creating projects, writing scripts, building scenes, generating visuals and voice, arranging a timeline, rendering MP4 exports, and managing usage and billing.

## Project status

This repository contains an existing application and integrations at different maturity levels. The master plan is the roadmap, not a claim that every item is already production-ready. Provider-backed flows require credentials and must pass end-to-end tests before production use.

See:
- [Current state and known gaps](./CURRENT_STATE.md)
- [Integration and local setup](./INTEGRATION_SETUP.md)
- [Staging end-to-end release checklist](./STAGING_E2E_CHECKLIST.md)
- [Implementation roadmap](./roadmap.md)

## Requirements

- Bun (use the version supported by the repository's lockfile)
- A Supabase/Postgres project for authentication, database, and private media storage
- Optional provider credentials for AI, voice, rendering, billing, and YouTube

## Local setup

```bash
git clone https://github.com/memadanraj/github-strategy-setup.git
cd github-strategy-setup
bun install --frozen-lockfile
cp .env.example .env
```

Fill in required environment variables in `.env`. Never commit `.env`; only commit placeholder templates such as `.env.example`.

Run the development server:

```bash
bun run dev
```

The app is usually available at `http://localhost:3000`; use the port reported by Vite if it chooses a different one.

## Quality checks

```bash
bun run lint
bun run typecheck
bun run test
bun run build
```

AI provider calls are not automatically exercised by unit tests. Run provider and full-flow tests in a staging project using non-production credentials before enabling paid usage.

## Security notes

- Server secrets must never be exposed through `VITE_*` variables.
- Use a separate staging database and media bucket for migrations and provider tests.
- Rotate credentials if they were ever committed to Git history.
- Keep production changes behind reviewed pull requests and passing CI checks.


## Latest hardening update — audio completion confirmation

Audio generation now verifies that the persisted generation job status is `complete` before reporting success. This closes the guarded-RPC no-op case where a job could already be failed or otherwise terminal even though the completion call returned without a database error. CI coverage does not replace staging tests with real providers and Supabase.


## Latest hardening update — visual completion confirmation

Image and clip generation now share the checked completion wrapper used by audio: a successful RPC response is followed by a persisted state read, and success is reported only when the job is confirmed `complete`. The existing checked failure-settlement path still decides whether generated media is preserved or compensated after an uncertain result.


## Latest hardening update — YouTube project ownership

YouTube publishing now confirms project ownership through the authenticated Supabase session before it creates privileged publication records or accesses a private export. A missing, mismatched, or unreadable project lookup fails closed. The admin client is used only after that ownership check.


## Latest hardening update — YouTube partial-success handling

After YouTube returns a confirmed video ID, a later thumbnail or local database failure no longer blindly turns the publication into `failed`. The app preserves the YouTube video ID/URL, attempts a checked local reconciliation, and warns users not to re-upload when the remote upload outcome is uncertain.


## Latest hardening update — bounded Paddle webhooks

The public Paddle webhook enforces a 1 MiB maximum raw request body while streaming the request, before signature verification, JSON parsing, or database access. The implementation treats `Content-Length` as an early-rejection hint and still counts actual streamed bytes.


## Sharing hardening

Share-link management explicitly confirms project ownership through the authenticated request-scoped client before using the service-role client. Password success is not accepted until resetting the failed-attempt lockout state is confirmed in the database.


## Credit-ledger confirmation

Paddle credit grants now require the atomic ledger RPC to return a valid non-negative integer balance as well as a no-error result. Missing or malformed RPC output is treated as an uncertain settlement, not a successful grant.
