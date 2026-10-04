<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- Build follows the phased roadmap in roadmap.md (source spec: uploaded mastermind.md); finish one phase before the next — keeps scope reviewable.
- Subscription plans and limits live in the `plans` table, never hard-coded in frontend — spec requires DB-driven pricing.
- Roles live only in `user_roles` with `has_role()`; profile plan/credit fields are trigger-protected from user edits — prevents privilege/credit escalation.
- Styling uses semantic tokens in src/styles.css and Button variants (`signal`, `panel`); no raw color classes in components — keeps theming consistent.
- AI calls run in server functions; credits are reserved via `start_generation_job` and settled only server-side via `complete_generation_job`/`fail_generation_job` (auto-refund) — users can never mint or refund credits themselves.
