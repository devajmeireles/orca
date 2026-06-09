# Floating Workspace Restart Purge

## Problem

After restarting Orca, floating workspace tabs can disappear even though the session hydrators restored them. The destructive path is the one-shot hydration purge in `fetchAllWorktrees()`: it builds a valid-id set from authoritative repo worktree scans, classifies `tabsByWorktree` keys outside that set as stale, and calls `purgeWorktreeTerminalState(stale)` in [worktrees.ts](../src/renderer/src/store/slices/worktrees.ts#L886). That purge is broader than its name: `buildWorktreePurgeState()` removes terminal, browser, editor, unified tab, group, layout, git cache, and active-selection state for each input id in [worktrees.ts](../src/renderer/src/store/slices/worktrees.ts#L582).

## Root Cause

`FLOATING_TERMINAL_WORKTREE_ID` is a synthetic workspace, not a repo worktree. Hydrators know this and explicitly add the sentinel to valid restore sets: terminal hydration at [terminals.ts](../src/renderer/src/store/slices/terminals.ts#L1970), tab hydration at [tabs.ts](../src/renderer/src/store/slices/tabs.ts#L1820), editor hydration at [editor.ts](../src/renderer/src/store/slices/editor.ts#L3771), and browser hydration at [browser.ts](../src/renderer/src/store/slices/browser.ts#L1441).

The hydration-time purge in `fetchAllWorktrees()` builds `validIds` only from authoritative `detectedWorktreesByRepo` entries, then treats every `tabsByWorktree` key outside that set as stale. `global-floating-terminal` is intentionally absent from repo scans, so if the first successful purge runs after floating terminal tabs are hydrated, the sentinel enters `stale` and the purge deletes all floating workspace state associated with that id.

`getHydratedSessionWorktreeIdsForRepo()` and `getRemovedWorktreeIdsAfterAuthoritativeScan()` are related purge helpers, but they do not protect this path. The floating sentinel has no `::` separator, so `getRepoIdFromWorktreeId(FLOATING_TERMINAL_WORKTREE_ID)` returns the sentinel itself; no normal repo scan owns it, and the one-shot `fetchAllWorktrees()` stale computation does not call `getHydratedSessionWorktreeIdsForRepo()` anyway.

Existing purge tests cover stale repo worktrees and degraded scans, but not the synthetic floating workspace.

## Non-Goals

- Do not change floating workspace creation, close, or visible UI behavior.
- Do not change deleted real-worktree cleanup semantics.
- Do not add a second persistence model for floating tabs.
- Do not change SSH placeholder hydration or remote worktree detection.

## Design

1. Keep the floating workspace sentinel in the purge-valid set.
   Import `FLOATING_TERMINAL_WORKTREE_ID` into `worktrees.ts` and add it to the `validIds` set before computing `stale` in `fetchAllWorktrees()`. Add a brief comment explaining why the synthetic id is valid for persistence pruning but not repo discovery. Do not add a fake `DetectedWorktreeListResult`, do not put the sentinel in `worktreesByRepo`, and do not make `getKnownWorktreeById()` treat it as a real repo worktree.

2. Defensively skip the sentinel in direct purge calls.
   Filter `FLOATING_TERMINAL_WORKTREE_ID` out before `buildWorktreePurgeState()` runs in `purgeWorktreeTerminalState()`, then no-op if nothing remains. Keep the guard inside the action rather than only at call sites, because current callers include both the hydration-time purge and the external/diff-based `worktreesChanged` purge in [useIpcEvents.ts](../src/renderer/src/hooks/useIpcEvents.ts#L732). This protects future explicit purge callers and any path that already computed stale ids before the sentinel was made valid.

3. Add a regression test for the restart shape.
   Extend the hydration-time purge tests in [worktrees.test.ts](../src/renderer/src/store/slices/worktrees.test.ts#L2956) with a case where all repo scans are authoritative, a real stale worktree is purged, `hasHydratedWorktreePurge` flips to true, and floating terminal/browser/editor/unified state remains. Import and use `FLOATING_TERMINAL_WORKTREE_ID` in the test rather than repeating the literal sentinel string.

4. Add a direct purge guard test.
   Extend the direct purge tests near [worktrees.test.ts](../src/renderer/src/store/slices/worktrees.test.ts#L3108) to prove explicit purge input containing both a real worktree id and the floating sentinel purges only the real worktree. Include floating browser/editor/unified-only state so the test would fail if the broad purge builder ever receives the sentinel, and assert a sentinel-only call leaves existing state object identities unchanged where the current empty-input no-op test already checks that contract.

## Data Flow

- Startup/load hydrates floating terminal tabs in `tabsByWorktree[global-floating-terminal]` when they exist, and hydrates sibling floating browser/editor/unified maps from `WorkspaceSessionState`.
- `fetchAllWorktrees()` eventually receives authoritative real repo worktree ids.
- The one-shot stale purge compares terminal `tabsByWorktree` keys against valid ids after all repos in that call return authoritative results and at least one detected worktree exists.
- With the fix, the floating sentinel is valid in that comparison and does not enter the destructive purge list.
- Direct purge still filters the sentinel because `buildWorktreePurgeState()` deletes browser/editor/unified maps even when `tabsByWorktree` has no floating terminal tab.
- External worktree deletions from other windows or CLI/RPC events flow through `handleWorktreesChanged()` in `useIpcEvents.ts`, which diffs real detected worktree ids and then calls `purgeWorktreeTerminalState(removed)`. The sentinel should not appear in those before/after sets, and the action-level guard is the backstop if a future caller passes it anyway.

## Edge Cases

- No repos or no authoritative worktree scan: existing deferral remains unchanged.
- Empty authoritative results for every repo: existing empty-sibling safety still defers the one-shot purge.
- Authoritative scan with real stale worktree ids: real stale worktree state is still purged.
- Floating workspace with only browser or markdown tabs: `fetchAllWorktrees()` may not consider the sentinel because the stale candidates come from terminal `tabsByWorktree`; the direct purge guard is the protection against explicit or future broader purge callers.
- Floating workspace mixed with a real stale id in one purge call: filter only the sentinel and still purge the real stale id.
- Per-repo `fetchWorktrees()` removed-id purge: no behavior change expected because the sentinel does not belong to any repo id, but the direct purge guard keeps this true if future callers pass the sentinel explicitly.
- `worktreesChanged` external-mutation purge: current before/after sets are built from `detectedWorktreesByRepo` or `worktreesByRepo`, neither of which should contain the sentinel. Do not rely on that handler for floating classification; keep sentinel filtering in `purgeWorktreeTerminalState()`.
- SSH worktrees: no change to SSH placeholder/preserved-session logic.
- Remote runtimes: `listDetectedWorktreesForRepo()` may call `worktree.detectedList` or fall back to `worktree.list`; both return repo worktrees only, so the sentinel must be added in renderer purge classification, not expected from the runtime.
- Multi-window/external mutation: no new coordination is added. If another window or external git operation creates/deletes real worktrees while the async scan is in flight, existing authoritative-scan semantics still decide real-worktree cleanup; the sentinel remains protected independently.
- Windows/Linux/macOS: sentinel comparison is string-based and path-independent.

## Test Plan

- Unit: `src/renderer/src/store/slices/worktrees.test.ts`
  - Add fetch-all regression preserving `FLOATING_TERMINAL_WORKTREE_ID` while purging a real stale worktree and setting `hasHydratedWorktreePurge`.
  - Add direct purge regression ignoring the floating sentinel while still purging a real id in the same call.
  - Add sentinel-only direct purge coverage so the filtered-empty path remains a true no-op.
  - Assert representative maps survive for floating state: `tabsByWorktree`, `browserTabsByWorktree`, `openFiles`/`activeFileIdByWorktree`, `unifiedTabsByWorktree`, `groupsByWorktree`, and `layoutByWorktree`.
- Existing focused tests:
  - `pnpm vitest run --config config/vitest.config.ts src/renderer/src/store/slices/worktrees.test.ts`
- Broader validation:
  - `pnpm typecheck`
  - `pnpm lint`
  - Note existing unrelated broad-suite failure in `src/main/daemon/daemon-pty-adapter.test.ts` if it persists.

## UI Quality Bar

Not UI-visible. This preserves existing floating workspace tab state; it does not change layout, copy, styling, controls, or interaction affordances.

## Review Screenshots

Electron validation should capture:

1. Floating workspace open after simulated/restarted session with tabs still visible.
2. Adjacent real worktree surface after stale purge still behaves normally.

If direct restart automation cannot safely mutate the user's live session, capture the nearest reachable floating workspace state and document the skipped destructive setup.

## Rollout

1. Add failing worktree purge regression tests.
2. Add the floating sentinel to hydration-time purge validity.
3. Add direct purge sentinel guard before `buildWorktreePurgeState()`.
4. Run focused worktree tests, typecheck, and lint.
5. Validate in Electron with screenshots if the app can be launched against a disposable/dev profile.

## Lightweight Eng Review

- Scope: reduced to stale-worktree purge classification; no persistence or UI rewrite.
- Architecture/data flow: keep ownership in `worktrees.ts`; floating remains a synthetic id shared through `FLOATING_TERMINAL_WORKTREE_ID`, not a detected worktree.
- Failure modes covered:
  - Authoritative repo scan after session hydration no longer purges floating state.
  - Explicit purge calls cannot remove floating state accidentally.
  - Real deleted worktrees remain purgeable.
  - Browser/editor/unified-only floating state is protected from the broad purge builder.
- Test coverage required:
  - Unit in `worktrees.test.ts` for fetch-all purge preserving floating state while purging a real stale id.
  - Unit in `worktrees.test.ts` for direct purge guard with mixed real plus floating ids.
  - Electron screenshot for restored/open floating workspace if feasible.
- Performance/blast radius: low; one set insertion in the one-shot startup purge and one small filter on explicit purge calls. No extra IPC/RPC calls and no additional repo scans.
- UI quality bar: not UI-visible.
- Required review screenshots:
  1. Floating workspace open with restored tabs visible.
  2. Main workspace surface after purge smoke check.
- Residual risks:
  - Electron restart validation may need a disposable profile to avoid mutating live user session.
  - Existing multi-window/external-git races for real worktree deletion remain out of scope; this fix only prevents the synthetic floating id from being purged.
