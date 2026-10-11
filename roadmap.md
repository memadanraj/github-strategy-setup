# Roadmap

The repository contains baseline implementations for authentication, dashboard, projects/scenes/assets, AI writing/visuals/audio, timeline/captions, rendering/exports, thumbnails, YouTube, Paddle billing, and admin. **Presence in the codebase is not proof of production readiness.** See [IMPLEMENTATION_STATUS.md](./IMPLEMENTATION_STATUS.md) for the evidence-based verification gates.

## DCXORA Master Fix & Improve Plan

- [x] Phase 0 — repository audit and baseline inventory
- [ ] Phase 1 — foundation: auth, ownership, persistence, error recovery (partial; CI and persistence-failure tests exist; staging auth/RLS verification remains)
- [ ] Phase 2 — projects/scenes/assets CRUD and recovery tests
- [ ] Phase 3 — central jobs: atomic reservation, async provider lifecycle, idempotent completion/refund (partial; staging concurrency/migration tests remain)
- [ ] Phase 4 — provider contracts, retries, timeouts, and structured errors
- [ ] Phase 5 — creation wizard and persisted production plan
- [ ] Phase 6 — script/research/hook generation acceptance tests
- [ ] Phase 7 — image/video generation and safe media persistence
- [ ] Phase 8 — voice/music/SFX and captions acceptance tests
- [ ] Phase 9 — timeline/editor persistence and interaction tests
- [ ] Phase 10 — rendering, export integrity, and playback validation
- [ ] Phase 11 — private/unlisted/password/expiry/revocable share links
- [ ] Phase 12 — credit ledger concurrency, refunds, reconciliation
- [ ] Phase 13 — Paddle checkout and webhook lifecycle in sandbox
- [ ] Phase 14 — admin authorization and audit trails
- [ ] Phase 15 — monitoring, logs, deployment and recovery runbooks
- [ ] Phase 16 — research/templates/brand kits/AI Director/advanced editor
- [ ] Final gate — full end-to-end MVP tests and staging sign-off

Do not mark a phase complete until its code, persistence, authorization, failure paths, and relevant tests pass. External-provider and staging-only checks must be marked separately rather than implied to pass in CI.
