import { describe, expect, it } from 'vitest'
import {
  buildActiveOpenFileSignature,
  buildActiveOpenRowKeys
} from './source-control-active-open-file-keys'

describe('buildActiveOpenFileSignature', () => {
  it('encodes the diff source and relative path', () => {
    expect(buildActiveOpenFileSignature('staged', 'src/file.ts')).toBe('staged::src/file.ts')
    expect(buildActiveOpenFileSignature('unstaged', 'src/file.ts')).toBe('unstaged::src/file.ts')
  })

  it('falls back to the edit source when the tab has no diff source', () => {
    expect(buildActiveOpenFileSignature(undefined, 'docs/readme.md')).toBe('edit::docs/readme.md')
  })

  it('keeps separators that appear inside the path intact', () => {
    const signature = buildActiveOpenFileSignature('unstaged', 'src/a::b.ts')
    expect(buildActiveOpenRowKeys(signature)).toEqual(
      new Set(['unstaged::src/a::b.ts', 'untracked::src/a::b.ts'])
    )
  })
})

describe('buildActiveOpenRowKeys', () => {
  it('matches only the staged row for a staged diff', () => {
    expect(buildActiveOpenRowKeys('staged::src/file.ts')).toEqual(new Set(['staged::src/file.ts']))
  })

  it('matches the working-tree rows for an unstaged diff', () => {
    expect(buildActiveOpenRowKeys('unstaged::src/file.ts')).toEqual(
      new Set(['unstaged::src/file.ts', 'untracked::src/file.ts'])
    )
  })

  it('treats an untracked file (opened as an unstaged diff) and an edit tab like the working tree', () => {
    expect(buildActiveOpenRowKeys('edit::docs/readme.md')).toEqual(
      new Set(['unstaged::docs/readme.md', 'untracked::docs/readme.md'])
    )
  })

  it('returns an empty set when there is no active open file', () => {
    expect(buildActiveOpenRowKeys(null).size).toBe(0)
  })

  it('returns an empty set for a malformed signature', () => {
    expect(buildActiveOpenRowKeys('no-separator').size).toBe(0)
    expect(buildActiveOpenRowKeys('staged::').size).toBe(0)
  })
})
