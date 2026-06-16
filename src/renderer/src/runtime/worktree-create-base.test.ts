import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getRuntimeRepoBaseRefDefault } from './runtime-repo-client'
import { resolveWorktreeCreateBaseDefault } from './worktree-create-base'

vi.mock('./runtime-repo-client', () => ({
  getRuntimeRepoBaseRefDefault: vi.fn()
}))

const resolverMock = vi.mocked(getRuntimeRepoBaseRefDefault)
const settings = null

describe('resolveWorktreeCreateBaseDefault', () => {
  beforeEach(() => {
    resolverMock.mockReset()
  })

  it('prefers the per-repo pinned base and skips the git primary resolver', async () => {
    const result = await resolveWorktreeCreateBaseDefault(
      { id: 'repo-1', worktreeBaseRef: 'dev' },
      settings,
      'repo-1'
    )

    expect(result).toBe('dev')
    expect(resolverMock).not.toHaveBeenCalled()
  })

  it('trims surrounding whitespace from the pinned base', async () => {
    const result = await resolveWorktreeCreateBaseDefault(
      { id: 'repo-1', worktreeBaseRef: '  dev  ' },
      settings,
      'repo-1'
    )

    expect(result).toBe('dev')
    expect(resolverMock).not.toHaveBeenCalled()
  })

  it('falls back to the git primary default when no pin is set', async () => {
    resolverMock.mockResolvedValue({ defaultBaseRef: 'origin/main', remoteCount: 1 })

    const result = await resolveWorktreeCreateBaseDefault(
      { id: 'repo-1', worktreeBaseRef: undefined },
      settings,
      'repo-1'
    )

    expect(result).toBe('origin/main')
    expect(resolverMock).toHaveBeenCalledWith(settings, 'repo-1')
  })

  it('treats a whitespace-only pin as unset and uses the git primary', async () => {
    resolverMock.mockResolvedValue({ defaultBaseRef: 'origin/main', remoteCount: 1 })

    const result = await resolveWorktreeCreateBaseDefault(
      { id: 'repo-1', worktreeBaseRef: '   ' },
      settings,
      'repo-1'
    )

    expect(result).toBe('origin/main')
    expect(resolverMock).toHaveBeenCalledWith(settings, 'repo-1')
  })

  it('returns undefined when the repo is missing and the primary is unresolved', async () => {
    resolverMock.mockResolvedValue({ defaultBaseRef: null, remoteCount: 0 })

    const result = await resolveWorktreeCreateBaseDefault(undefined, settings, 'repo-1')

    expect(result).toBeUndefined()
    expect(resolverMock).toHaveBeenCalledWith(settings, 'repo-1')
  })

  it('returns undefined when the primary resolver rejects', async () => {
    resolverMock.mockRejectedValue(new Error('boom'))

    const result = await resolveWorktreeCreateBaseDefault(
      { id: 'repo-1', worktreeBaseRef: undefined },
      settings,
      'repo-1'
    )

    expect(result).toBeUndefined()
  })
})
