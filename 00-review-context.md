# Review Context

## Branch Info

- Base: origin/main (merge-base: 20f950de3d5e0ab43c6b251f6f9198d33c8cf4f2)
- Current: brennanb2025/agent-panes-reporting

## Changed Files Summary

| File | Type |
| ---- | ---- |
| src/main/agent-hooks/agent-status-pane-liveness.test.ts | A |
| src/main/agent-hooks/agent-status-pane-liveness.ts | A |
| src/main/agent-hooks/server.ts | M |
| src/main/index.ts | M |
| src/renderer/src/App.tsx | M |
| src/renderer/src/components/dashboard/useDashboardData.ts | M |
| src/renderer/src/components/sidebar/CacheTimer.tsx | M |
| src/renderer/src/components/sidebar/WorktreeCardAgents.tsx | M |
| src/renderer/src/components/sidebar/smart-sort.ts | M |
| src/renderer/src/components/status-bar/ResourceUsageStatusSegment.tsx | M |
| src/renderer/src/components/status-bar/mergeSnapshotAndSessions.test.ts | M |
| src/renderer/src/components/status-bar/mergeSnapshotAndSessions.ts | M |
| src/renderer/src/components/terminal-pane/TerminalPane.tsx | M |
| src/renderer/src/components/terminal-pane/focus-terminal-pane-event.test.ts | A |
| src/renderer/src/components/terminal-pane/focus-terminal-pane-event.ts | A |
| src/renderer/src/components/terminal-pane/layout-serialization.test.ts | M |
| src/renderer/src/components/terminal-pane/layout-serialization.ts | M |
| src/renderer/src/components/terminal-pane/layout-stable-pane-id.test.ts | A |
| src/renderer/src/components/terminal-pane/pty-connection.test.ts | M |
| src/renderer/src/components/terminal-pane/pty-connection.ts | M |
| src/renderer/src/components/terminal-pane/stale-agent-row.ts | A |
| src/renderer/src/components/terminal-pane/use-terminal-pane-global-effects.ts | M |
| src/renderer/src/components/terminal-pane/use-terminal-pane-lifecycle.ts | M |
| src/renderer/src/constants/terminal.ts | M |
| src/renderer/src/hooks/useAutoAckViewedAgent.test.ts | M |
| src/renderer/src/hooks/useAutoAckViewedAgent.ts | M |
| src/renderer/src/hooks/useIpcEvents.ts | M |
| src/renderer/src/lib/activate-tab-and-focus-pane.ts | M |
| src/renderer/src/lib/agent-status-count.test.ts | M |
| src/renderer/src/lib/agent-status.ts | M |
| src/renderer/src/lib/pane-manager/mint-stable-pane-id.ts | A |
| src/renderer/src/lib/pane-manager/mobile-fit-overrides.ts | M |
| src/renderer/src/lib/pane-manager/pane-fit-resize-observer.test.ts | M |
| src/renderer/src/lib/pane-manager/pane-lifecycle.test.ts | M |
| src/renderer/src/lib/pane-manager/pane-lifecycle.ts | M |
| src/renderer/src/lib/pane-manager/pane-manager-types.ts | M |
| src/renderer/src/lib/pane-manager/pane-manager.test.ts | A |
| src/renderer/src/lib/pane-manager/pane-manager.ts | M |
| src/renderer/src/lib/pane-manager/pane-public-view.ts | M |
| src/renderer/src/lib/pane-manager/pane-terminal-gpu-acceleration.test.ts | M |
| src/renderer/src/lib/pane-manager/pane-tree-ops.test.ts | M |
| src/renderer/src/store/slices/agent-status.ts | M |
| src/renderer/src/store/slices/terminal-pane-key-mirror.test.ts | A |
| src/renderer/src/store/slices/terminals.ts | M |
| src/shared/agent-status-types.ts | M |
| src/shared/stable-pane-id.test.ts | A |
| src/shared/stable-pane-id.ts | A |
| src/shared/types.ts | M |

## Changed Line Ranges (PR Scope)

<!-- In scope: issues on these lines OR caused by these changes. Out of scope: unrelated pre-existing issues -->

| File | Changed Lines |
| ---- | ------------- |
| src/main/agent-hooks/agent-status-pane-liveness.test.ts | 1-30 (new) |
| src/main/agent-hooks/agent-status-pane-liveness.ts | 1-17 (new) |
| src/main/agent-hooks/server.ts | 1096 |
| src/main/index.ts | 45, 281-290 |
| src/renderer/src/App.tsx | 5-12, 85, 104, 182-191, 196, 200, 892, 896 |
| src/renderer/src/components/dashboard/useDashboardData.ts | 104 |
| src/renderer/src/components/sidebar/CacheTimer.tsx | 35 |
| src/renderer/src/components/sidebar/WorktreeCardAgents.tsx | 11-12, 56, 90-115, 97-101, 100, 111-116, 119 |
| src/renderer/src/components/sidebar/smart-sort.ts | 65 |
| src/renderer/src/components/status-bar/ResourceUsageStatusSegment.tsx | 41, 653, 743, 755, 852-864 |
| src/renderer/src/components/status-bar/mergeSnapshotAndSessions.test.ts | 1-2, 5, 57, 167-328 |
| src/renderer/src/components/status-bar/mergeSnapshotAndSessions.ts | 25, 84-92, 146-191 |
| src/renderer/src/components/terminal-pane/TerminalPane.tsx | 39, 302-307, 413-430, 555-561, 891-896 |
| src/renderer/src/components/terminal-pane/focus-terminal-pane-event.test.ts | 1-72 (new) |
| src/renderer/src/components/terminal-pane/focus-terminal-pane-event.ts | 1-40 (new) |
| src/renderer/src/components/terminal-pane/layout-serialization.test.ts | 264-298 |
| src/renderer/src/components/terminal-pane/layout-serialization.ts | 204-205, 210, 215-250, 329-345, 357, 359-360, 372-385 |
| src/renderer/src/components/terminal-pane/layout-stable-pane-id.test.ts | 1-178 (new) |
| src/renderer/src/components/terminal-pane/pty-connection.test.ts | 4, 148-151, 1162-1165 |
| src/renderer/src/components/terminal-pane/pty-connection.ts | 23, 115-123, 289-294 |
| src/renderer/src/components/terminal-pane/stale-agent-row.ts | 1-32 (new) |
| src/renderer/src/components/terminal-pane/use-terminal-pane-global-effects.ts | 12-14, 114-119 |
| src/renderer/src/components/terminal-pane/use-terminal-pane-lifecycle.ts | 20, 529, 583-586, 694-716 |
| src/renderer/src/constants/terminal.ts | 26-36 |
| src/renderer/src/hooks/useAutoAckViewedAgent.test.ts | 2, 21-26, 36, 82, 90, 111, 118, 123, 144, 151, 175, 182-215 |
| src/renderer/src/hooks/useAutoAckViewedAgent.ts | 5-31, 38-52, 60-61, 63-66, 68-70, 74-75, 78-80, 82, 97-100, 105-108, 138-144, 150, 159-160, 186, 199-200, 211 |
| src/renderer/src/hooks/useIpcEvents.ts | 23, 841-853, 913-916, 919-924, 929-930, 933, 938-940 |
| src/renderer/src/lib/activate-tab-and-focus-pane.ts | 4-20, 22, 28-32, 34 |
| src/renderer/src/lib/agent-status-count.test.ts | 3, 149-197, 215-223 |
| src/renderer/src/lib/agent-status.ts | 31-35, 43-45, 47-50, 60, 66-82, 100, 105-106, 114-120 |
| src/renderer/src/lib/pane-manager/mint-stable-pane-id.ts | 1-23 (new) |
| src/renderer/src/lib/pane-manager/mobile-fit-overrides.ts | 15-20, 77, 94, 107, 109, 116 |
| src/renderer/src/lib/pane-manager/pane-fit-resize-observer.test.ts | 38 |
| src/renderer/src/lib/pane-manager/pane-lifecycle.test.ts | 26, 235 |
| src/renderer/src/lib/pane-manager/pane-lifecycle.ts | 53, 120 |
| src/renderer/src/lib/pane-manager/pane-manager-types.ts | 26-28, 39-55, 76-81 |
| src/renderer/src/lib/pane-manager/pane-manager.test.ts | 1-362 (new) |
| src/renderer/src/lib/pane-manager/pane-manager.ts | 1, 44-45, 58-63, 74-78, 101, 106, 111-114, 163-171, 173-186, 200, 307, 311-312, 315-319, 322, 324-335, 338, 355-357, 361-417 |
| src/renderer/src/lib/pane-manager/pane-public-view.ts | 6 |
| src/renderer/src/lib/pane-manager/pane-terminal-gpu-acceleration.test.ts | 8 |
| src/renderer/src/lib/pane-manager/pane-tree-ops.test.ts | 47 |
| src/renderer/src/store/slices/agent-status.ts | 33 |
| src/renderer/src/store/slices/terminal-pane-key-mirror.test.ts | 1-76 (new) |
| src/renderer/src/store/slices/terminals.ts | 11, 67-74, 158-165, 222-224, 251, 277, 497, 504-512, 571, 792-816 |
| src/shared/agent-status-types.ts | 63-66 |
| src/shared/stable-pane-id.test.ts | 1-72 (new) |
| src/shared/stable-pane-id.ts | 1-51 (new) |
| src/shared/types.ts | 368-372 |

## Review Standards Reference

- Follow /review-code standards
- Focus on: correctness, security, performance, maintainability
- Priority levels: Critical > High > Medium > Low

## File Categories

### Electron/Main (4 files)

- src/main/agent-hooks/agent-status-pane-liveness.test.ts
- src/main/agent-hooks/agent-status-pane-liveness.ts
- src/main/agent-hooks/server.ts
- src/main/index.ts

### Frontend/UI - Pane Manager (10 files)

- src/renderer/src/lib/pane-manager/mint-stable-pane-id.ts
- src/renderer/src/lib/pane-manager/mobile-fit-overrides.ts
- src/renderer/src/lib/pane-manager/pane-fit-resize-observer.test.ts
- src/renderer/src/lib/pane-manager/pane-lifecycle.test.ts
- src/renderer/src/lib/pane-manager/pane-lifecycle.ts
- src/renderer/src/lib/pane-manager/pane-manager-types.ts
- src/renderer/src/lib/pane-manager/pane-manager.test.ts
- src/renderer/src/lib/pane-manager/pane-manager.ts
- src/renderer/src/lib/pane-manager/pane-public-view.ts
- src/renderer/src/lib/pane-manager/pane-terminal-gpu-acceleration.test.ts
- src/renderer/src/lib/pane-manager/pane-tree-ops.test.ts

### Frontend/UI - Terminal Pane (12 files)

- src/renderer/src/components/terminal-pane/TerminalPane.tsx
- src/renderer/src/components/terminal-pane/focus-terminal-pane-event.test.ts
- src/renderer/src/components/terminal-pane/focus-terminal-pane-event.ts
- src/renderer/src/components/terminal-pane/layout-serialization.test.ts
- src/renderer/src/components/terminal-pane/layout-serialization.ts
- src/renderer/src/components/terminal-pane/layout-stable-pane-id.test.ts
- src/renderer/src/components/terminal-pane/pty-connection.test.ts
- src/renderer/src/components/terminal-pane/pty-connection.ts
- src/renderer/src/components/terminal-pane/stale-agent-row.ts
- src/renderer/src/components/terminal-pane/use-terminal-pane-global-effects.ts
- src/renderer/src/components/terminal-pane/use-terminal-pane-lifecycle.ts
- src/renderer/src/constants/terminal.ts
- src/renderer/src/lib/activate-tab-and-focus-pane.ts

### Frontend/UI - Agent Status & Hooks (8 files)

- src/renderer/src/hooks/useAutoAckViewedAgent.test.ts
- src/renderer/src/hooks/useAutoAckViewedAgent.ts
- src/renderer/src/hooks/useIpcEvents.ts
- src/renderer/src/lib/agent-status-count.test.ts
- src/renderer/src/lib/agent-status.ts
- src/renderer/src/store/slices/agent-status.ts
- src/renderer/src/store/slices/terminal-pane-key-mirror.test.ts
- src/renderer/src/store/slices/terminals.ts

### Frontend/UI - App, Sidebar, Status Bar, Dashboard (8 files)

- src/renderer/src/App.tsx
- src/renderer/src/components/dashboard/useDashboardData.ts
- src/renderer/src/components/sidebar/CacheTimer.tsx
- src/renderer/src/components/sidebar/WorktreeCardAgents.tsx
- src/renderer/src/components/sidebar/smart-sort.ts
- src/renderer/src/components/status-bar/ResourceUsageStatusSegment.tsx
- src/renderer/src/components/status-bar/mergeSnapshotAndSessions.test.ts
- src/renderer/src/components/status-bar/mergeSnapshotAndSessions.ts

### Utility/Common - Shared Types (4 files)

- src/shared/agent-status-types.ts
- src/shared/stable-pane-id.test.ts
- src/shared/stable-pane-id.ts
- src/shared/types.ts

## Skipped Issues (Do Not Re-validate)

<!-- Issues validated but deemed not worth fixing. Do not re-validate these in future iterations. -->
<!-- Format: [file:line-range] | [severity] | [reason skipped] | [issue summary] -->

(none yet)

## Iteration State

Current iteration: 1
Last completed phase: Setup
Files fixed this iteration: []
