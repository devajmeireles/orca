import { FLOATING_TERMINAL_WORKTREE_ID } from '../../../shared/constants'
import type { Repo, WorkspaceSessionState } from '../../../shared/types'
import { getRepoIdFromWorktreeId } from '../../../shared/worktree-id'

type WorktreeHydrationResult = {
  canHydrateSession: boolean
  repoIdsReadyForSessionHydration: string[]
}

type SessionHydrationDeferInput = {
  repos: Repo[]
  session: WorkspaceSessionState
  worktreeHydration: WorktreeHydrationResult
}

function addRecordKeys(ids: Set<string>, record: Record<string, unknown> | undefined): void {
  if (!record) {
    return
  }
  for (const id of Object.keys(record)) {
    ids.add(id)
  }
}

function collectSessionWorktreeIds(session: WorkspaceSessionState): Set<string> {
  const ids = new Set<string>()
  if (session.activeWorktreeId) {
    ids.add(session.activeWorktreeId)
  }
  addRecordKeys(ids, session.tabsByWorktree)
  addRecordKeys(ids, session.openFilesByWorktree)
  addRecordKeys(ids, session.activeFileIdByWorktree)
  addRecordKeys(ids, session.browserTabsByWorktree)
  addRecordKeys(ids, session.activeBrowserTabIdByWorktree)
  addRecordKeys(ids, session.activeTabTypeByWorktree)
  addRecordKeys(ids, session.activeTabIdByWorktree)
  addRecordKeys(ids, session.unifiedTabs)
  addRecordKeys(ids, session.tabGroups)
  addRecordKeys(ids, session.tabGroupLayouts)
  addRecordKeys(ids, session.activeGroupIdByWorktree)
  return ids
}

export function shouldDeferSessionHydrationUntilWorktreesLoaded({
  repos,
  session,
  worktreeHydration
}: SessionHydrationDeferInput): boolean {
  if (worktreeHydration.canHydrateSession) {
    return false
  }

  const sshRepoIds = new Set(repos.filter((repo) => repo.connectionId).map((repo) => repo.id))
  const repoIdsReadyForSessionHydration = new Set(worktreeHydration.repoIdsReadyForSessionHydration)
  for (const worktreeId of collectSessionWorktreeIds(session)) {
    if (worktreeId === FLOATING_TERMINAL_WORKTREE_ID) {
      continue
    }
    const repoId = getRepoIdFromWorktreeId(worktreeId)
    if (sshRepoIds.has(repoId)) {
      continue
    }
    // Why: local workspaces are validated from the fetched worktree list. If
    // that repo's list is degraded, hydrating would classify saved workspaces
    // as gone. Unrelated empty repos must not block a valid saved workspace.
    if (!repoIdsReadyForSessionHydration.has(repoId)) {
      return true
    }
  }
  return false
}
