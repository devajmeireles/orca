import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const HOOK_SOURCE = readFileSync(join(__dirname, 'useComposerState.ts'), 'utf8')

function sourceBetween(source: string, startPattern: string, endPattern: string): string {
  const start = source.indexOf(startPattern)
  expect(start).toBeGreaterThanOrEqual(0)
  const end = source.indexOf(endPattern, start + startPattern.length)
  expect(end).toBeGreaterThan(start)
  return source.slice(start, end)
}

describe('useComposerState worktree base pin precedence', () => {
  it('resolves the create base through the pin-aware helper only when no base was picked', () => {
    const section = sourceBetween(
      HOOK_SOURCE,
      'const submitBaseBranch =',
      'const createDisplayName'
    )

    expect(section).toContain(
      'resolveWorktreeCreateBaseDefault(selectedRepo, selectedRepoSettings, repoId)'
    )
    expect(section).toContain('selectedRepoIsGit && !baseBranch')
    // Regression guard: an explicit base pick must still win over the pin/primary.
    expect(section).toContain(': baseBranch')
  })

  it('does not pre-resolve the git primary as args.baseBranch in the create flow', () => {
    // The bug was the renderer resolving the git primary itself and sending it
    // as args.baseBranch, which overrode the backend's worktreeBaseRef pin.
    expect(HOOK_SOURCE).not.toContain('getRuntimeRepoBaseRefDefault')
  })
})
