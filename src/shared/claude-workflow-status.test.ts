import { describe, expect, it } from 'vitest'
import {
  extractClaudeWorkflowDetectorInput,
  normalizeClaudeWorkflowState,
  rollupClaudeWorkflowState,
  type ClaudeWorkflowAgentSummary
} from './claude-workflow-status'

describe('Claude workflow status parser', () => {
  it('extracts Workflow tool evidence from a raw Claude hook payload before normalization', () => {
    const input = extractClaudeWorkflowDetectorInput({
      paneKey: 'tab-1:550e8400-e29b-41d4-a716-446655440000',
      tabId: 'tab-1',
      worktreeId: 'wt-1',
      payload: JSON.stringify({
        hook_event_name: 'PostToolUse',
        tool_name: 'Workflow',
        tool_input: { scriptPath: '/tmp/workflows/review.js' },
        tool_response: {
          runId: 'run-123',
          transcriptDir: '/tmp/workflows/run-123'
        }
      })
    })

    expect(input).toMatchObject({
      paneKey: 'tab-1:550e8400-e29b-41d4-a716-446655440000',
      tabId: 'tab-1',
      worktreeId: 'wt-1',
      evidence: {
        scriptPath: '/tmp/workflows/review.js',
        runId: 'run-123',
        transcriptDir: '/tmp/workflows/run-123'
      }
    })
  })

  it('ignores non-Workflow Claude tool events even when path-like fields are present', () => {
    expect(
      extractClaudeWorkflowDetectorInput({
        paneKey: 'tab-1:550e8400-e29b-41d4-a716-446655440000',
        payload: {
          tool_name: 'Read',
          scriptPath: '/tmp/workflows/review.js',
          runId: 'run-123'
        }
      })
    ).toBeNull()
  })

  it('requires at least one stable workflow identifier', () => {
    expect(
      extractClaudeWorkflowDetectorInput({
        paneKey: 'tab-1:550e8400-e29b-41d4-a716-446655440000',
        payload: { tool_name: 'Workflow', label: 'Review' }
      })
    ).toBeNull()
  })

  it('rolls child states up to the most actionable workflow state', () => {
    const base = {
      id: 'a',
      label: 'agent',
      startedAt: 1,
      updatedAt: 1
    } satisfies Omit<ClaudeWorkflowAgentSummary, 'state'>

    expect(
      rollupClaudeWorkflowState([
        { ...base, id: 'done', state: 'done' },
        { ...base, id: 'waiting', state: 'waiting' }
      ]).state
    ).toBe('waiting')
    expect(
      rollupClaudeWorkflowState([
        { ...base, id: 'working', state: 'working' },
        { ...base, id: 'blocked', state: 'blocked' }
      ]).state
    ).toBe('blocked')
    expect(normalizeClaudeWorkflowState('failed')).toBe('error')
  })
})
