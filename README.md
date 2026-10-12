# DCXORA

DCXORA is an AI-assisted video production studio for creating projects, writing scripts, building scenes, generating visuals and voice, arranging a timeline, rendering MP4 exports, and managing usage and billing.

## Project status

This repository contains an existing application and integrations at different maturity levels. The master plan is the roadmap, not a claim that every item is already production-ready. Provider-backed flows require credentials and must pass end-to-end tests before production use.

See:
- [Current state and known gaps](./CURRENT_STATE.md)
- [Integration and local setup](./INTEGRATION_SETUP.md)
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
