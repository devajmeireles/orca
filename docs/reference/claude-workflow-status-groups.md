# Claude Workflow Status Groups

## Problem

Claude Code dynamic workflows spawn many subagents from one Claude turn, but Orca currently shows agent activity as independent pane rows. The shared status model carries one pane entry at a time (`src/shared/agent-status-types.ts:67`) and only has orchestration metadata for Orca-dispatched workers (`src/shared/agent-status-types.ts:58`). Worktree agent rows are built by indexing live entries by tab/pane (`src/renderer/src/components/sidebar/useWorktreeAgentRows.ts:89`) and then rendering parent/child lineage only when `entry.orchestration.parentPaneKey` exists (`src/renderer/src/components/sidebar/WorktreeCardAgents.tsx:55`). Claude workflow subagents are invisible to that lineage because they run inside Claude's own workflow files, not Orca's orchestration dispatch.

## Goal

Surface a Claude dynamic workflow as one compact workflow group under the parent Claude row, with its phase/subagent children visible in the same WorktreeCard agent-status list and dashboard data model. The user should understand "this Claude turn spawned 4 workflow agents, 3 done, 1 working" without opening Claude's transcript.

## Non-goals

- Do not reimplement Claude's `Workflow` tool or execute workflow JS.
- Do not add a new Orca orchestration skill or modify the existing orchestration skill.
- Do not create separate real terminals for Claude workflow subagents in this slice.
- Do not add resume/actions/detail panels; those belong to the sibling implementations.

## Design

1. Add workflow-specific shared types in a concrete file such as `src/shared/claude-workflow-status.ts`.
   - Model `ClaudeWorkflowRun`, `ClaudeWorkflowAgent`, `ClaudeWorkflowPhase`, and `ClaudeWorkflowState`.
   - Keep fields small: stable id, parent pane key, parent tab id when known, worktree id, connection id, run id, script path/transcript dir only when local, state, started/updated timestamps, label, last message, token count when available.
   - Add explicit wire/snapshot types. Renderer payloads must contain summaries only, never raw transcript bodies or untrusted filesystem paths for remote runs.
   - Use `.ts`, not `.d.ts`.

2. Add a workflow detector/index beside the hook server.
   - Tap the raw parsed Claude hook body in `src/main/agent-hooks/server.ts` before `normalizeHookPayload(...)`. The normalized `AgentStatusPayload` only preserves prompt/tool/message previews, so `scriptPath`, `runId`, `transcriptDir`, and raw `Workflow` tool result fields cannot be recovered later.
   - Detect `Workflow` tool events/results only from Claude raw payloads when `tool_name`/result metadata and `scriptPath`, `runId`, or `transcriptDir` are present. Treat missing identifiers as "no workflow evidence", not as a best-guess scan.
   - Scan only the discovered workflow directory and cache by `connectionId + parentPaneKey + scriptPath + runId`; do not crawl all of `~/.claude`.
   - Parse JSON/JSONL defensively. Missing files, partial writes, and invalid JSON produce a degraded run with an error note, not an exception.
   - Debounce file reads per run, cap bytes/lines read from JSONL previews, and reuse unchanged run objects so one JSONL append does not invalidate every worktree card.
   - Use Node `path` APIs for path parsing/normalization. Do not split paths on `/`; Claude can run on Windows and SSH remotes.

3. Expose workflow status through IPC beside agent status.
   - Add preload API `claudeWorkflows.getSnapshot()` and `claudeWorkflows.onDidUpdate(...)`.
   - Main sends snapshots after each successful index update and on startup replay, mirroring the existing `agentStatus:getSnapshot` pattern (`src/main/ipc/agent-hooks.ts:70`), but broadcast to all live renderer windows rather than retaining one stale `webContents`.
   - Add a fire-and-forget `claudeWorkflows:drop` IPC. Renderer-only dismissal will be resurrected by the next main snapshot unless the main index records the drop.
   - Local filesystem indexing is allowed only for `connectionId === null`. For SSH, either extend the relay to run the same detector/index remotely and forward summary payloads, or explicitly no-op/degrade remote workflow detection for this slice. Never interpret a remote `scriptPath` as a local path.

4. Add a renderer store slice for workflow runs.
   - Keep a `claudeWorkflowRunsById` map plus an epoch.
   - Add drop/dismiss APIs per workflow id and per worktree, matching the live/retained agent-status cleanup shape in `src/renderer/src/store/slices/agent-status.ts:1`.
   - Do not store transcript bodies in the renderer; keep only previews needed for list rows.
   - Integrate the slice into `src/renderer/src/store/index.ts` and `src/renderer/src/store/types.ts`; wire startup snapshot/update listeners in `useIpcEvents.ts` after `workspaceSessionReady`, using the same unknown-pane retry/snapshot discipline as agent status.

5. Convert workflow runs into virtual dashboard rows.
   - Extend `DashboardAgentRow` with a discriminant: `kind: 'agent' | 'workflow' | 'workflow-agent'`. Do not cast workflow rows to `AgentStatusEntry`.
   - `workflow` row is the group parent; `workflow-agent` rows are children.
   - Use stable synthetic row ids prefixed with `claude-workflow:` so they cannot collide with real `${tabId}:${leafId}` pane keys.
   - Keep row identity separate from activation. Existing click handling parses `paneKey` and would reject synthetic ids, so workflow rows need `activationPaneKey`/`activationTabId` pointing at the parent Claude pane, plus `dismissId` for workflow drops.
   - If the parent pane no longer resolves, render the row as non-routable with no focus attempt; do not guess another Claude tab in the worktree.
   - Add workflow-by-worktree indexes to `useWorktreeAgentRows` and `useDashboardData`; preserve stable arrays for unchanged worktrees.
   - Update `applyAgentRowLineage` and the sidebar lineage model to read a row-level `parentRowId` instead of `entry.orchestration` only. The existing visual depth cap can remain, but the logical tree must support Claude row -> workflow row -> workflow-agent rows.

6. Render the group in `WorktreeCardAgents`.
   - Reuse existing `DashboardAgentRow` styling, leading state dot, chevron, compact timestamp, and child disclosure (`src/renderer/src/components/sidebar/WorktreeCardAgents.tsx:224`), but update the component props/helpers for the row union instead of reading `agent.entry.*` unconditionally.
   - Parent label: workflow title or script filename. Secondary text: phase summary such as `planning -> parallel review -> synthesis`.
   - Children: one row per Claude workflow subagent with label, state, last preview, and elapsed/updated time.
   - Keep the group expanded while any child is working, waiting, or blocked; collapse by default once all children are done unless the user manually toggled that workflow id in this session.

## Data flow

```text
Claude hook payload
  -> agentHookServer receives raw body
  -> normal agent-status normalization/fanout continues unchanged
  -> Claude workflow detector sees raw Claude Workflow tool result
  -> reads discovered workflow run files/subagent JSONL previews
  -> main IPC snapshot/update
  -> renderer workflow slice
  -> useWorktreeAgentRows/useDashboardData virtual rows
  -> WorktreeCardAgents/DashboardAgentRow
```

## Edge cases

- Claude writes run JSON before all subagent JSONL files exist.
- A workflow is resumed and reuses the same `runId`.
- The parent Claude pane exits but the workflow files keep changing briefly.
- Two Claude panes in the same worktree create workflows at the same time.
- `scriptPath` points outside the local machine on SSH.
- Workflow rows outlive their real parent tab after a crash/relaunch.
- A malformed workflow run forms a cycle-like child relationship; render flat rather than hiding rows.
- Large runs with 100+ subagents must not re-render every worktree card on every JSONL append.
- User dismisses a workflow while the underlying run files are still changing; main must suppress that run until a new stable run identity appears.
- Startup snapshot arrives before tabs/worktrees hydrate; renderer must retry or wait rather than permanently dropping routable rows.
- Claude changes its private workflow file shape; parser must return a degraded summary from whatever identifiers/previews are still available.

## Test plan

- Unit: parser tests for workflow tool-result extraction, run JSON parsing, partial JSONL handling, and state rollup.
- Unit: store reducer tests for insert/update/drop/prune and stable selector references.
- Unit: IPC/drop tests proving renderer dismissal updates main state and does not resurrect on snapshot.
- Unit: `buildWorktreeAgentRows`/dashboard data tests for virtual group ordering, collapse defaults, stale parent pane fallback, no pane-key collision, and stable unchanged-worktree selectors.
- Unit: SSH/remote tests proving local index ignores remote paths, or relay summary ingestion works when remote support is included.
- Component: `WorktreeCardAgents` renders one workflow group with children, focuses the parent pane on click, renders non-routable stale-parent rows without focusing, and dismisses virtual rows without dropping real agent rows.
- Electron: start a Claude workflow fixture or mocked IPC snapshot; verify the worktree card shows group, expanded working state, completed collapsed state, and adjacent normal agent rows.

## UI quality bar

- The group must read as one workflow, not as a noisy pile of unrelated agents.
- Child rows must preserve the existing agent-status visual rhythm: leading state column, Claude identity, concise prompt, passive timestamp.
- No new colors beyond existing state dots and sidebar/accent tokens.
- Rows cannot overlap, jump width, or clip labels on narrow sidebar widths.
- A normal single-agent worktree should look unchanged.

## Review screenshots

1. Sidebar worktree card with a running Claude workflow group expanded and mixed child states.
2. Sidebar worktree card with a completed workflow group collapsed.
3. Dashboard/worktree overview with workflow rows and normal agent rows together.
4. Narrow sidebar width with long workflow and child labels.
5. Adjacent smoke: normal Claude/Codex agent row still renders and activates unchanged.

## Rollout

1. Add shared workflow types and parser/index tests.
2. Add main-process workflow index and IPC snapshot/update surface.
3. Add renderer store slice and virtual-row derivation.
4. Update `DashboardAgentRow`/`WorktreeCardAgents` rendering for virtual groups.
5. Add tests and Electron validation screenshots.

## Lightweight Eng Review

- Scope: Kept to detection plus virtual status rows. Removed terminal creation, resume, and detail inspection from this branch so it does one visible job.
- Architecture/data flow: Workflow status is a sibling IPC/store slice to agent status, then joins at the row-derivation layer. This avoids bloating `AgentStatusEntry` with Claude-only fields while preserving the existing card renderer.
- Technical correction: detection must use raw Claude hook bodies before normalization; `AgentStatusEntry` is intentionally too small to carry workflow file pointers.
- Failure modes covered:
  - Partial or malformed Claude workflow files degrade to an error/unknown run row.
  - SSH paths are either indexed on the relay and forwarded as summaries, or ignored/degraded locally; local main never opens them.
  - Parent pane missing focuses nothing and shows a non-routable row rather than guessing.
  - Duplicate/resumed run ids merge by `scriptPath + runId + parentPaneKey`.
  - Large JSONL appends are summarized in main before IPC.
  - Dismissed runs are suppressed in main so updates/snapshots do not resurrect them.
- Test coverage required:
  - Parser/index unit tests for partial writes and resumed runs.
  - Store/selector unit tests for stable references and pruning.
  - Component tests for grouped rows, child disclosure, dismiss, and activation.
  - Electron screenshots for running, completed, narrow, and adjacent-agent states.
- Performance/blast radius: Watch only discovered workflow directories. Renderer stores summaries, not transcript bodies. Existing indexed worktree selectors must stay O(changed workflow worktrees), not O(cards x runs).
- UI quality bar: Quiet list-row integration using existing agent row components, no new decorative cards, no color expansion, no layout jitter.
- Required review screenshots:
  1. Running expanded group.
  2. Completed collapsed group.
  3. Dashboard mixed rows.
  4. Narrow sidebar labels.
  5. Normal agent row smoke.
- Residual risks: Claude's private workflow file shape may change. The parser must be version-tolerant and fixture-backed from observed real runs rather than assuming a stable public API.
