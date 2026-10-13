# Roadmap

The repository contains baseline implementations for authentication, dashboard, projects/scenes/assets, AI writing/visuals/audio, timeline/captions, rendering/exports, thumbnails, YouTube, Paddle billing, and admin. **Presence in the codebase is not proof of production readiness.** See [IMPLEMENTATION_STATUS.md](./IMPLEMENTATION_STATUS.md) for the evidence-based verification gates.

## DCXORA Master Fix & Improve Plan

- [x] Phase 0 — repository audit and baseline inventory
- [ ] Phase 1 — foundation: auth, ownership, persistence, error recovery (partial; CI and persistence-failure tests exist; staging auth/RLS verification remains)
- [ ] Phase 2 — projects/scenes/assets CRUD and recovery tests (transactional scene replacement, version recovery, reordering/create/delete, asset validation, and checked image/clip/audio settlement implemented; SQL/RLS staging integration tests remain)
- [ ] Phase 3 — central jobs: atomic reservation, async provider lifecycle, idempotent completion/refund (checked visual and synchronous AI settlement paths added; 27 test files pass in CI; staging concurrency/migration tests remain)
- [ ] Phase 4 — provider contracts, retries, timeouts, and structured errors (partial; visual image/video calls and metadata responses are bounded; shared adapters for all providers and staging verification remain)
- [ ] Phase 5 — creation wizard and persisted production plan (implemented on branch; staging migration verification remains)
- [ ] Phase 6 — script/research/hook generation acceptance tests
- [ ] Phase 7 — image/video generation and safe media persistence (checked asset/scene/job writes, compensating cleanup, bounded provider calls and failure-state tests added; staging verification remains)
- [ ] Phase 8 — voice/music/SFX and captions acceptance tests
- [ ] Phase 9 — timeline/editor persistence and interaction tests (24-hour DB/client bounds; explicit-save caption/clip draft forms and failure-preservation tests added; migration 0024 needs staging audit/constraint validation; drag/trim/split/undo/redo tests remain)
- [ ] Phase 10 — rendering, export integrity, and playback validation (bounded output plus MP4 container/type/box validation implemented and CI-tested; live renderer, codec/decode, playback and staging race tests remain)
- [ ] Phase 11 — private/unlisted/password/expiry/revocable share links (token-hashed public export links, optional password, expiration and revocation implemented on branch; staging tests remain)
- [ ] Phase 12 — credit ledger concurrency, refunds, reconciliation
- [ ] Phase 13 — Paddle checkout and webhook lifecycle in sandbox (signature, price mapping and delivery retry unit tests added; sandbox checkout/subscription/refund verification remains)
- [ ] Phase 14 — admin authorization and audit trails
- [ ] Phase 15 — monitoring, logs, deployment and recovery runbooks
- [ ] Phase 16 — research/templates/brand kits/AI Director/advanced editor
- [ ] Final gate — full end-to-end MVP tests and staging sign-off

Do not mark a phase complete until its code, persistence, authorization, failure paths, and relevant tests pass. External-provider and staging-only checks must be marked separately rather than implied to pass in CI.


### Audio and media consistency update (October 12, 2026)

Audio routes now check completion/settlement RPC errors and avoid asserting a refund without confirmation. Voiceover, preview and music persistence include compensating cleanup paths; voice cloning surfaces possible provider-side orphan state. Unit tests cover the checked settlement wrapper, but live provider and storage interactions remain a staging release gate.


### Timeline guardrails (October 12, 2026)

Client validation and migration `0024_timeline_timing_bounds.sql` now cap clip/caption timing at 24 hours, transition values at 80 characters, and caption text at 5,000 characters. CI passes for the code commit; existing staging rows and interaction behavior still require release checks.


### Timeline editor interaction (October 12, 2026)

The caption editor and clip inspector now stage field changes locally and persist one combined patch on explicit save. Unit/component tests verify persistence is not triggered on each keystroke and failed saves keep the user's draft. Undo/redo and drag/trim/split acceptance tests remain to be implemented.


### Render/export integrity update (October 12, 2026)

Before a rendered file is uploaded and registered as a ready export, the app now checks the content type, 512 MiB maximum size, top-level MP4 box boundaries, and presence of `ftyp`, `moov`, and non-empty `mdat` boxes. Invalid containers are marked as render failures. CI passed lint, typecheck, 29 test files and build for code commit `611893c00bc9826d24d31581e58552a592d8d664`. Live rendering, full decode and playback remain open.
