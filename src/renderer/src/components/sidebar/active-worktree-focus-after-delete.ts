import { useAppStore } from '@/store'
import { getWorktreeMapFromState } from '@/store/selectors'
import { activateAndRevealWorktree } from '@/lib/worktree-activation'

type AppStoreState = ReturnType<typeof useAppStore.getState>

// Why: after deleting the workspace the user is currently viewing, dropping them
// on the empty Landing screen loses their place. Pick the next workspace to focus
// so a delete behaves like closing a tab — prefer another non-base/primary
// workspace of the same project (most-recently-visited first), and fall back to
// the project's base/primary workspace when no other workspace remains.
function pickNextWorktreeIdAfterDelete(
  state: AppStoreState,
  repoId: string,
  deletedWorktreeId: string
): string | null {
  const deleteState = state.deleteStateByWorktreeId
  const siblings = (state.worktreesByRepo[repoId] ?? []).filter(
    (worktree) => worktree.id !== deletedWorktreeId && !deleteState[worktree.id]?.isDeleting
  )
  const others = siblings.filter((worktree) => !worktree.isMainWorktree)
  if (others.length > 0) {
    const lastVisited = state.lastVisitedAtByWorktreeId
    const [mostRecent] = [...others].sort(
      (a, b) => (lastVisited[b.id] ?? 0) - (lastVisited[a.id] ?? 0)
    )
    return mostRecent.id
  }
  return siblings.find((worktree) => worktree.isMainWorktree)?.id ?? null
}

function focusNextWorktreeAfterActiveDelete(
  deletedWorktreeId: string,
  repoId: string | null,
  wasActiveBeforeDelete: boolean
): void {
  if (!wasActiveBeforeDelete || !repoId) {
    return
  }
  const state = useAppStore.getState()
  // Why: a concurrent activation may have already moved focus off the empty
  // state between this delete starting and finishing — only reclaim focus when
  // the deletion actually left the user on the Landing screen.
  if (state.activeWorktreeId !== null) {
    return
  }
  const nextWorktreeId = pickNextWorktreeIdAfterDelete(state, repoId, deletedWorktreeId)
  if (nextWorktreeId) {
    activateAndRevealWorktree(nextWorktreeId)
  }
}

/**
 * Capture, before a delete runs, whether the target is the workspace the user is
 * currently viewing. Returns a committer to call after a successful delete: it
 * focuses the next-best workspace only when the deleted one was active, so
 * deleting a background workspace never steals the user's current focus.
 *
 * Captured up front because the worktree record (and its repoId) is gone from the
 * store once the delete resolves.
 */
export function prepareActiveWorktreeFocusAfterDelete(worktreeId: string): () => void {
  const state = useAppStore.getState()
  const wasActive = state.activeWorktreeId === worktreeId
  const repoId = getWorktreeMapFromState(state).get(worktreeId)?.repoId ?? null
  return () => focusNextWorktreeAfterActiveDelete(worktreeId, repoId, wasActive)
}
