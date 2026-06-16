import type { GlobalSettings, Repo } from '../../../shared/types'
import { getRuntimeRepoBaseRefDefault } from './runtime-repo-client'

// Why: worktree creation must prefer the per-repo pinned base over the git
// primary. The PR-base flow deliberately does NOT use this (it wants the git
// primary), so this lives outside the shared getBaseRefDefault handler.
export async function resolveWorktreeCreateBaseDefault(
  repo: Pick<Repo, 'id' | 'worktreeBaseRef'> | undefined,
  settings: Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null | undefined,
  repoId: string
): Promise<string | undefined> {
  const pinned = repo?.worktreeBaseRef?.trim()
  if (pinned) {
    return pinned
  }

  const resolved = await getRuntimeRepoBaseRefDefault(settings, repoId).catch(() => null)

  return resolved?.defaultBaseRef ?? undefined
}
