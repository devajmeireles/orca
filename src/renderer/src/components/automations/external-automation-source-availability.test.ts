import { describe, expect, it } from 'vitest'
import type { ExternalAutomationManager } from '../../../../shared/automations-types'
import { getExternalAutomationSourceAvailability } from './external-automation-source-availability'

function manager(overrides: Partial<ExternalAutomationManager> = {}): ExternalAutomationManager {
  return {
    id: 'hermes-local',
    provider: 'hermes',
    label: 'Hermes',
    targetLabel: 'Local Mac',
    target: { type: 'local' },
    status: 'unavailable',
    error: null,
    canManage: false,
    jobs: [],
    ...overrides
  }
}

describe('external automation source availability', () => {
  it('uses local repair copy for unavailable local sources', () => {
    expect(
      getExternalAutomationSourceAvailability({
        manager: manager(),
        providerLabel: 'Hermes',
        targetKindLabel: 'Local'
      })
    ).toMatchObject({
      statusLabel: 'Source unavailable',
      summary: 'Hermes source unavailable on local.',
      detail: 'Install or repair the local automation source, then retry to load jobs.',
      canConnectSsh: false,
      isConnecting: false
    })
  })

  it('asks users to connect disconnected SSH sources before checking jobs', () => {
    expect(
      getExternalAutomationSourceAvailability({
        manager: manager({
          id: 'hermes-devbox',
          targetLabel: 'Devbox',
          target: { type: 'ssh', connectionId: 'devbox' }
        }),
        providerLabel: 'Hermes',
        targetKindLabel: 'SSH host',
        sshStatus: 'disconnected'
      })
    ).toMatchObject({
      statusLabel: 'Connect SSH',
      summary: 'Hermes source unavailable until ssh host connects.',
      detail: 'Connect this SSH host to check for remote automation jobs.',
      canConnectSsh: true,
      isConnecting: false
    })
  })

  it('distinguishes connected SSH hosts with missing remote automation tooling', () => {
    expect(
      getExternalAutomationSourceAvailability({
        manager: manager({
          id: 'hermes-devbox',
          targetLabel: 'Devbox',
          target: { type: 'ssh', connectionId: 'devbox' }
        }),
        providerLabel: 'Hermes',
        targetKindLabel: 'SSH host',
        sshStatus: 'connected'
      })
    ).toMatchObject({
      statusLabel: 'Source unavailable',
      summary: 'Hermes source unavailable on this ssh host.',
      detail: 'Install or repair the remote automation source, then retry to load jobs.',
      canConnectSsh: true,
      isConnecting: false
    })
  })

  it('preserves manager errors while still reporting a connecting SSH state', () => {
    expect(
      getExternalAutomationSourceAvailability({
        manager: manager({
          error: 'Hermes binary was not found.',
          target: { type: 'ssh', connectionId: 'devbox' }
        }),
        providerLabel: 'Hermes',
        targetKindLabel: 'SSH host',
        sshStatus: 'connected',
        isConnectingOverride: true
      })
    ).toMatchObject({
      statusLabel: 'Connecting...',
      summary: 'Hermes binary was not found.',
      detail: 'Waiting for this SSH host before checking the remote automation source.',
      canConnectSsh: true,
      isConnecting: true
    })
  })
})
