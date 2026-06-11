# Tasks PR Upstream Source

## Problem

- [src/main/github/client.ts](/Users/jinjingliang/Documents/projects/orca/tasks-pr-upstream-source-still-queries-origin-2/src/main/github/client.ts:1202) resolves issues with `resolveIssueSource(repoPath, preference, connectionId)` but resolves PRs through origin-only `getOwnerRepo(repoPath, connectionId)`.
- [src/main/github/client.ts](/Users/jinjingliang/Documents/projects/orca/tasks-pr-upstream-source-still-queries-origin-2/src/main/github/client.ts:1215) sends that origin repo into both recent PR fetches and queried PR fetches.
- [src/main/github/client.ts](/Users/jinjingliang/Documents/projects/orca/tasks-pr-upstream-source-still-queries-origin-2/src/main/github/client.ts:1355) repeats the origin-only PR repo for count queries, so the PR list and pagination totals ignore explicit Upstream selection.
- [src/renderer/src/components/TaskPage.tsx](/Users/jinjingliang/Documents/projects/orca/tasks-pr-upstream-source-still-queries-origin-2/src/renderer/src/components/TaskPage.tsx:7089) currently passes `sources.prs` as the selector's `origin` prop. If `sources.prs` becomes the effective upstream PR source without adding a separate origin slug, the selector can disappear or lose the ability to switch back to Origin.

## Root Cause

The Tasks work-item API has one repo preference, `issueSourcePreference`. The issue side honors it. The PR side kept the historical origin behavior by calling `getOwnerRepo`, so `preference='upstream'` changes selector state and issue routing but not PR list/count routing.

`auto` is intentionally asymmetric today: issues auto-resolve to upstream when present via `getIssueOwnerRepo`, while PRs stay on origin. This change must affect explicit `upstream` only; changing `auto` would alter fork workflows and is out of scope.

## Non-Goals

- Do not change typed PR detail lookups, PR review/check APIs, branch PR detection, create-PR behavior, hosted-review submit behavior, or GitLab behavior.
- Do not add a new persisted repo setting; the existing source selector preference is the contract for the Tasks work-item surface.
- Do not change the visual design of TaskPage.
- Do not make remote-topology changes instant. Existing owner/repo resolution is cached for 30s, work-item list cache for 60s, and GitHub API calls often use `--cache 120s`.

## Design

1. Add a focused GitHub PR work-item source resolver near `listWorkItems`/`countWorkItems`.
   - `preference='upstream'`: use `getOwnerRepoForRemote(repoPath, 'upstream', connectionId)` when present, otherwise fall back to `getOwnerRepo(repoPath, connectionId)`.
   - `preference='origin'`: use `getOwnerRepo(repoPath, connectionId)`.
   - `preference='auto'` or undefined: keep current PR behavior by using origin.
   - Return the effective PR repo, the raw origin repo, and the raw upstream repo. Do not infer raw origin from `sources.prs` after this change; `sources.prs` becomes effective PR routing metadata.
2. Replace only the Tasks work-item PR source in `listWorkItems` and `countWorkItems`.
   - Recent PRs use `gh api repos/{owner}/{repo}/pulls?...`.
   - Queried PRs use `gh pr list --repo owner/repo`.
   - Counts use `gh api search/issues?q=repo:owner/repo ... --jq .total_count`.
3. Preserve source metadata semantics for the renderer.
   - `sources.prs` must be the effective PR source used for the call.
   - Add required-nullable `sources.originCandidate` to `ListWorkItemsResult`, `WorkItemsCacheSources`, and test fixtures. Keep `sources.upstreamCandidate` as the raw upstream remote.
   - Update TaskPage selector render gates and selector props to compare/pass raw candidates: `originCandidate` versus `upstreamCandidate`. Do not gate selector rendering on `sources.prs` versus `upstreamCandidate`; explicit Upstream would make both point at upstream and hide the selector.
   - Update both selector call sites: the Tasks header selector and the new-issue composer selector. Pass `origin={sources.originCandidate}` and `upstream={sources.upstreamCandidate}` when both exist and differ.
   - `IssueSourceIndicator` can continue comparing `sources.issues` and effective `sources.prs`.
4. Keep SSH behavior behind existing resolver calls.
   - Pass `connectionId` to every remote lookup.
   - Preserve `assertSshRepoHasResolvedGitHubSource` so unresolved SSH repos do not run unscoped `gh` commands.
5. Harden renderer cache writes against stale pre-flip responses.
   - `setIssueSourcePreference` clears the in-flight dedupe map, but that does not cancel already-running promises.
   - A pre-flip `fetchWorkItems` response must not repopulate `workItemsCache` after the preference invalidation nonce changes. Capture a generation/nonce at dispatch and skip the cache write if it no longer matches before writing the envelope.
   - TaskPage's effect cancellation is sufficient for local page/count state, but not for the shared store cache write.
   - Guard `fetchWorkItemsNextPage` results in TaskPage as well. Next-page requests are not cached, but an older origin-scoped pagination request can still append rows to `pages` after a preference flip reloads page 0 from upstream.

## Data Flow

- Renderer Tasks source selector persists `repo.issueSourcePreference`.
- IPC/runtime already forwards that preference into `listWorkItems` and `countWorkItems`.
- GitHub client resolves:
  - issues: `resolveIssueSource(...)`;
  - PRs: the new PR work-item resolver;
  - selector metadata: raw origin and raw upstream remotes.
- PR list/count commands receive the effective PR repo through existing `--repo`, REST pull-list, and `repo:<owner>/<repo>` search paths.
- Renderer cache entries must store any new source metadata field; preference changes already clear repo-scoped work-item cache entries and in-flight dedupe entries in the initiating window.
- Renderer cache writes must be guarded by the preference/cache invalidation generation so an older origin-scoped response cannot overwrite a newer upstream-scoped entry after the dedupe map was cleared.
- TaskPage pagination writes must be guarded by the same selected-source generation or an equivalent dispatch token so an older next-page response cannot append stale-source rows after a source preference change.

## Edge Cases

- Explicit upstream with no upstream remote falls back to origin for PRs, matching issue fallback behavior. The existing `issueSourceFellBack` toast is still issue-named but is sufficient because `listWorkItems` resolves issues even for PR-only list calls.
- If neither upstream nor origin resolves for an SSH repo, list calls must reject before any `gh` command. Count calls currently return `0` when no owner/repo resolves; keep that behavior unless the count API is redesigned to surface errors.
- `origin` and `upstream` that differ only by case should remain de-duplicated by `sameOwnerRepo`.
- Mixed issue/PR queries with explicit upstream may query the same upstream repo for both sides. The existing same-repo count optimization should collapse count to one search call; list fan-out remains two calls because issue and PR list APIs are separate.
- PR-only filters (`is:merged`, `is:draft`, `review-requested`, `reviewed-by`) continue to skip issue fetches, but source resolution still happens before query-shape routing.
- External git remote changes can be stale for up to the owner/repo cache TTL, and visible work-item results can be stale until the renderer cache is evicted, expires, or the user refreshes. Do not claim immediate consistency.
- Multi-window consistency depends on the existing `repos:update`/`repos:changed` path. The window that changes the preference clears its own work-item cache immediately after persistence; other windows may show old cached results until their repo state refresh triggers a fetch or the cache expires.
- A list response from an older request must not overwrite the store cache after a preference flip. Clearing `inflightWorkItemsRequests` is necessary for the next fetch to start, but insufficient on its own because the old promise can still settle.
- A count response from an older request must not overwrite a newer preference's count. TaskPage's effect cancellation should cover this because counts are not cached; add/keep a regression if edits touch that effect.
- A next-page response from an older request must not append stale rows after a preference flip or query/source generation change. `handleLoadNextPage` updates local `pages` directly and does not benefit from `fetchWorkItems` cache-write guards.
- Source metadata may be absent until the first work-item fetch for a repo/query completes. Selector UI should continue to render nothing in that state rather than inventing a source from repo display names.
- Raw origin/upstream candidates can be null independently. Render the selector only when both candidates exist and differ; fall back to the indicator only for effective issue/PR divergence.

## Test Plan

- Unit: `client-issue-source.test.ts`
  - Queried PR list with `preference='upstream'` uses `--repo upstream-owner/repo`.
  - Recent PR list with `preference='upstream'` uses `repos/upstream-owner/repo/pulls`.
  - Count query with `preference='upstream'` builds a PR search against `repo:upstream-owner/repo`.
  - Fallback when upstream is missing uses origin for PRs and reports effective `sources.prs` as origin.
  - Source envelope includes `originCandidate` and `upstreamCandidate` when both exist; selector metadata does not collapse when effective `sources.prs` is upstream.
- Unit: `client-work-items.test.ts`
  - Existing PR filters, SSH unresolved behavior, count fan-out, closed-vs-merged behavior, and merge-method hydration remain green.
  - Same-repo issue/PR count still performs one search when explicit upstream makes both sides the same repo.
- Renderer store/component coverage:
  - `WorkItemsCacheSources` stores `originCandidate` and preserves it through `fetchWorkItems`, `getWorkItemsSourcesAndError`, `getWorkItemsAnySourcesForRepo`, runtime RPC, and persisted/test fixtures.
  - TaskPage passes the raw origin slug, not effective `sources.prs`, to `IssueSourceSelector` in both the Tasks header and new-issue composer.
  - With `preference='upstream'` and distinct origin/upstream remotes, the selector still renders and can switch back to Origin.
  - A stale pre-flip `fetchWorkItems` response that settles after `workItemsInvalidationNonce` changes does not write `workItemsCache`.
  - An older count promise settling after a newer preference-triggered effect does not update `totalItemCount`.
  - An older next-page promise settling after a preference/source-generation change does not append stale rows to `pages`.
- Type/lint: run focused tests, then `pnpm typecheck` and `pnpm lint`.
- Electron/manual: validate Tasks PRs tab in a forked repo with distinguishable origin/upstream PR results for Upstream, repeat/refresh, and Origin.

## UI Quality Bar

No layout or visual component changes. Good enough means the existing Tasks PR tab and source selector remain visually unchanged, the selector does not disappear after choosing Upstream, and list/count contents match the selected source without stale empty states after the refresh completes.

## Review Screenshots

1. Tasks page, PRs tab, source selector set to Upstream, PR-only query showing upstream PR results.
2. Same view after repeating/refreshing the query, still showing upstream results.
3. Tasks page, PRs tab, source selector set to Origin, same query showing origin-scoped empty/results state.
4. Adjacent smoke: Issues tab/source selector still renders and returns issue results or a handled empty state.

## Rollout

1. Add the PR work-item resolver and raw origin metadata.
2. Wire the resolver into `listWorkItems` recent and queried paths.
3. Wire the resolver into `countWorkItems`.
4. Update renderer source types/selectors to keep `origin` and effective PR source distinct.
5. Add regression tests for list/count/fallback/source-metadata behavior.
6. Run focused tests, then typecheck and lint.

## Lightweight Eng Review

- Scope: GitHub Tasks work-item PR source resolution, source metadata needed by the existing selector, and tests. No new preference, new UI, GitLab, PR-detail, PR-check, branch-detection, or hosted-review behavior.
- Architecture/data flow: source preference remains stored on the repo, forwarded by existing IPC/runtime paths, and resolved in the main GitHub client before command construction. Renderer cache stores the returned source envelope. SSH stays covered by existing remote-provider abstractions because all lookups pass `connectionId`.
- Failure modes covered:
  - explicit Upstream still querying origin for PR list/count;
  - selector disappearing after effective PR source becomes upstream;
  - stale origin-scoped list response repopulating cache after a preference flip;
  - upstream remote removed by falling back to origin;
  - unresolved SSH list calls running unscoped `gh` commands;
  - count/list mismatch by sharing resolver semantics;
  - provider mismatch by leaving GitLab untouched.
- Tests required:
  - upstream PR list routing for recent and queried paths;
  - upstream PR count routing;
  - missing-upstream fallback to origin;
  - raw origin/upstream source metadata in the envelope and renderer cache;
  - renderer selector receives raw origin while `sources.prs` remains effective PR source;
  - stale pre-flip list and count responses cannot win after a preference change;
  - existing PR filters, SSH unresolved behavior, and count fan-out remain green.
- Performance/blast radius: remote resolution is a local or SSH `git remote get-url` call, cached for 30s and in-flight coalesced. This is cheap relative to `gh` network calls but not free. Count still uses GitHub search and can require two API calls when issues and PRs resolve to different repos; it is one call only when `sameOwnerRepo(issueOwnerRepo, prOwnerRepo)` is true.
- UI quality bar: existing Tasks PR tab/source selector visuals unchanged; verify the selected source, visible results, and counts do not look stale or contradictory after refresh.
- Required review screenshots:
  1. PRs tab with Upstream selected and matching upstream PR results.
  2. Repeat/refresh of the same Upstream query.
  3. PRs tab with Origin selected for comparison.
  4. Issues tab adjacent smoke.
- Residual risks: validation needs a forked repo with distinguishable origin/upstream PR query results. External remote edits and multi-window propagation are eventually consistent under existing caches; do not block the fix on making those paths instant.
