import { describe, expect, it } from 'vitest'
import {
  buildSetupScriptGenerationWorkspaceRequest,
  buildSetupScriptGenerationPrompt,
  canStartSetupScriptGeneration,
  getSetupScriptGenerationDetectedAgents,
  getSetupScriptGenerationStartupPlatform,
  getSetupScriptGenerationUnavailableCopy,
  resolveConfiguredSetupPromptDefaultAgent,
  resolveSetupPromptDefaultAgent
} from './setup-script-generation'

describe('setup script generation helpers', () => {
  it('requires an explicit default agent without auto-picking a detected fallback', () => {
    expect(
      resolveSetupPromptDefaultAgent({ defaultTuiAgent: null, disabledTuiAgents: [] }, [
        'codex',
        'claude'
      ])
    ).toEqual({ status: 'unset' })
  })

  it('rejects a disabled default agent even when another agent is detected', () => {
    expect(
      resolveSetupPromptDefaultAgent({ defaultTuiAgent: 'codex', disabledTuiAgents: ['codex'] }, [
        'codex',
        'claude'
      ])
    ).toEqual({ status: 'disabled', agent: 'codex' })
  })

  it('rejects an undetected default agent without falling back', () => {
    expect(
      resolveSetupPromptDefaultAgent({ defaultTuiAgent: 'claude', disabledTuiAgents: [] }, [
        'codex'
      ])
    ).toEqual({ status: 'undetected', agent: 'claude' })
  })

  it('accepts a detected enabled default agent', () => {
    expect(
      resolveSetupPromptDefaultAgent({ defaultTuiAgent: 'codex', disabledTuiAgents: [] }, ['codex'])
    ).toEqual({ status: 'ready', agent: 'codex' })
  })

  it('resolves configured runtime agents without client-side detection', () => {
    expect(
      resolveConfiguredSetupPromptDefaultAgent({
        defaultTuiAgent: 'codex',
        disabledTuiAgents: []
      })
    ).toEqual({ status: 'ready', agent: 'codex' })
  })

  it('uses remote agent detection for SSH repos before resolving the default agent', () => {
    expect(
      getSetupScriptGenerationDetectedAgents({
        repo: { connectionId: 'ssh-1' },
        localDetectedAgents: ['claude'],
        remoteDetectedAgentsByConnection: { 'ssh-1': ['codex'] }
      })
    ).toEqual(['codex'])
  })

  it('uses local agent detection for local repos', () => {
    expect(
      getSetupScriptGenerationDetectedAgents({
        repo: { connectionId: null },
        localDetectedAgents: ['claude'],
        remoteDetectedAgentsByConnection: { 'ssh-1': ['codex'] }
      })
    ).toEqual(['claude'])
  })

  it('uses POSIX startup quoting for SSH setup generation', () => {
    expect(
      getSetupScriptGenerationStartupPlatform({ connectionId: 'ssh-1', path: '/repo' }, 'win32')
    ).toBe('linux')
    expect(
      getSetupScriptGenerationStartupPlatform({ connectionId: 'ssh-1', path: 'C:\\repo' }, 'linux')
    ).toBe('win32')
    expect(
      getSetupScriptGenerationStartupPlatform({ connectionId: null, path: '/repo' }, 'win32')
    ).toBe('win32')
  })

  it('uses local startup quoting for local setup generation', () => {
    expect(
      getSetupScriptGenerationStartupPlatform({ connectionId: null, path: '/repo' }, 'linux')
    ).toBe('linux')
  })

  it('disables duplicate generation while an agent workspace is being created', () => {
    expect(
      canStartSetupScriptGeneration({
        agentResolution: { status: 'ready', agent: 'codex' },
        isGenerating: true,
        isImporting: false
      })
    ).toBe(false)
  })

  it('keeps the generate action disabled until the default agent is ready', () => {
    expect(
      canStartSetupScriptGeneration({
        agentResolution: { status: 'unset' },
        isGenerating: false,
        isImporting: false
      })
    ).toBe(false)
  })

  it('builds inline guidance for unavailable default-agent states', () => {
    expect(getSetupScriptGenerationUnavailableCopy({ reason: 'unset' })).toContain(
      'Choose a default agent'
    )
    expect(
      getSetupScriptGenerationUnavailableCopy({ reason: 'disabled', agentLabel: 'Codex' })
    ).toContain('Codex is disabled')
    expect(
      getSetupScriptGenerationUnavailableCopy({ reason: 'undetected', agentLabel: 'Codex' })
    ).toContain('Codex was not detected for this repo')
  })

  it('builds the exact workspace create request for generated setup workspaces', () => {
    expect(
      buildSetupScriptGenerationWorkspaceRequest({
        repo: { id: 'repo-1', worktreeBaseRef: 'origin/main' },
        agent: 'codex'
      })
    ).toEqual({
      repoId: 'repo-1',
      name: 'add-orca-yaml-setup',
      baseBranch: 'origin/main',
      setupDecision: 'skip',
      telemetrySource: 'sidebar',
      displayName: 'Add orca.yaml setup script',
      createdWithAgent: 'codex'
    })
  })

  it('builds a constrained repo-specific setup prompt', () => {
    const prompt = buildSetupScriptGenerationPrompt({ displayName: 'Example Repo' })

    expect(prompt).toContain('Inspect the Example Repo repository')
    expect(prompt).toContain('add or update only orca.yaml')
    expect(prompt).toContain('scripts.setup')
    expect(prompt).toContain('pnpm install')
    expect(prompt).toContain('Do not commit, push')
    expect(prompt).toContain('cross-platform and SSH-safe')
  })
})
