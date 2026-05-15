# GitHub List Search

## What the code does today

- `TaskPage` has GitHub Items search input with Enter-to-apply and X-to-clear; it does not claim Cmd/Ctrl+F.
- `ProjectViewWrapper` has a local input (`ProjectSearchInput`) with Enter/blur apply and Esc restore+blur.
- Project X button is **reset to saved view filter**, not clear-to-empty.
- `queryOverride` semantics are:
  - `undefined`: use `selectedView.filter`
  - `''`: explicit empty filter for this fetch
  - any other string: override filter for this fetch
- Shared type docs currently claim `''` and `undefined` are equivalent; that is incorrect.

## Critical corrections

1. Shortcut behavior is missing, not partially implemented.
- Add explicit Cmd/Ctrl+F capture in both GitHub Items and Projects modes.
- Use platform check (`navigator.userAgent.includes('Mac') ? metaKey : ctrlKey`) and never hardcode `metaKey`.
- Do not capture while dialogs/modals or editable overlays are active.

2. Project clear behavior in this doc was wrong.
- Current code resets to saved filter; GitHub-like clear should apply `queryOverride: ''`.
- Keep Esc as the “revert to last applied” interaction.

3. `queryOverride` contract in shared types is wrong.
- Update `GetProjectViewTableArgs.queryOverride` docs to match main-process behavior and cache key behavior.

## Edge cases this must explicitly handle

- IME composition: keep Enter suppression for composing text in GitHub Items and Projects.
- Repeated Cmd/Ctrl+F: always focus the active search box and select all text.
- Mode gating: never steal find when task source is not GitHub, or GitHub mode is not the visible mode.
- View switch race: do not let late responses overwrite the visible search state for a newer view.
- External mutations and multi-window drift: local optimistic edits and per-window cache are non-authoritative; refresh must remain available and predictable.

## Consistency and concurrency notes

- Renderer cache TTL for project tables is 60s; user-initiated apply already forces fetch (`force: true`), which is correct.
- Inflight dedupe is per-renderer process only. Separate windows can race and show temporarily different snapshots.
- No push invalidation exists for GitHub-side external changes; consistency is pull-based (refresh/fetch).
- `queryOverride` is part of cache keys; this is required so saved-filter and empty-filter results do not clobber each other.

## Feasibility check

- “One call” claims are not valid for most flows:
  - `getProjectViewTable` can require multiple GraphQL pages for views, fields, and items.
  - Discovery and view resolution are paginated.
- “Free” claims are not valid:
  - Every apply/refresh consumes GitHub API budget; forced fetch intentionally bypasses fresh cache.

## Required doc-aligned implementation outcomes

1. Cmd/Ctrl+F focuses/selects GitHub Items search when GitHub Items mode is visible.
2. Cmd/Ctrl+F focuses/selects Project search when Project view mode is visible.
3. Project clear button applies empty override (`''`) immediately.
4. Esc in Project search restores last applied query and blurs.
5. Shared type comment for `queryOverride` matches runtime semantics.
