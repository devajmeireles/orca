// Why: extracted from worktrees.ts to keep the main IPC module under the
// max-lines threshold. Hooks IPC handlers (check, readIssueCommand,
// writeIssueCommand) are self-contained and don't interact with worktree
// creation or removal state.

import { ipcMain } from 'electron'
import type { Store } from '../persistence'
import { isFolderRepo } from '../../shared/repo-kind'
import { getSshFilesystemProvider } from '../providers/ssh-filesystem-dispatch'
import { isENOENT } from './filesystem-auth'
import { joinWorktreeRelativePath } from '../runtime/runtime-relative-paths'
import {
  hasHooksFile,
  hasUnrecognizedOrcaYamlKeys,
  loadHooks,
  parseOrcaYaml,
  readIssueCommand,
  writeIssueCommand
} from '../hooks'

export function registerHooksHandlers(store: Store): void {
  ipcMain.removeHandler('hooks:check')
  ipcMain.removeHandler('hooks:readIssueCommand')
  ipcMain.removeHandler('hooks:writeIssueCommand')

  ipcMain.handle('hooks:check', async (_event, args: { repoId: string }) => {
    const repo = store.getRepo(args.repoId)
    if (!repo || isFolderRepo(repo)) {
      return { status: 'ok', hasHooks: false, hooks: null, mayNeedUpdate: false }
    }

    // Why: remote repos read orca.yaml via the SSH filesystem provider.
    // Parsing happens in the main process since it's CPU-cheap and avoids
    // adding YAML parsing to the relay.
    if (repo.connectionId) {
      const fsProvider = getSshFilesystemProvider(repo.connectionId)
      if (!fsProvider) {
        return { status: 'error', hasHooks: false, hooks: null, mayNeedUpdate: false }
      }
      try {
        const result = await fsProvider.readFile(joinWorktreeRelativePath(repo.path, 'orca.yaml'))
        if (result.isBinary) {
          return { status: 'ok', hasHooks: false, hooks: null, mayNeedUpdate: false }
        }
        const { parse } = await import('yaml')
        const parsed = parse(result.content)
        return { status: 'ok', hasHooks: true, hooks: parsed, mayNeedUpdate: false }
      } catch (error) {
        return {
          status: isENOENT(error) ? 'ok' : 'error',
          hasHooks: false,
          hooks: null,
          mayNeedUpdate: false
        }
      }
    }

    const has = hasHooksFile(repo.path)
    const hooks = has ? loadHooks(repo.path) : null
    // Why: when a newer Orca version adds a top-level key to `orca.yaml`, older
    // versions that don't recognise it return null and show "could not be parsed".
    // Detecting well-formed but unrecognised keys lets the UI suggest updating
    // instead of implying the file is broken.
    const mayNeedUpdate = has && !hooks && hasUnrecognizedOrcaYamlKeys(repo.path)
    return {
      status: 'ok',
      hasHooks: has,
      hooks,
      mayNeedUpdate
    }
  })

  ipcMain.handle('hooks:readIssueCommand', async (_event, args: { repoId: string }) => {
    const repo = store.getRepo(args.repoId)
    if (!repo || isFolderRepo(repo)) {
      return {
        status: 'ok',
        localContent: null,
        sharedContent: null,
        effectiveContent: null,
        localFilePath: '',
        source: 'none' as const
      }
    }

    if (repo.connectionId) {
      const fsProvider = getSshFilesystemProvider(repo.connectionId)
      const localFilePath = joinWorktreeRelativePath(repo.path, '.orca/issue-command')
      if (!fsProvider) {
        return {
          status: 'error',
          localContent: null,
          sharedContent: null,
          effectiveContent: null,
          localFilePath,
          source: 'none' as const
        }
      }
      let status: 'ok' | 'error' = 'ok'
      let localContent: string | null = null
      let sharedContent: string | null = null
      try {
        const result = await fsProvider.readFile(localFilePath)
        localContent = result.isBinary ? null : result.content.trim() || null
      } catch (error) {
        if (!isENOENT(error)) {
          status = 'error'
        }
      }
      try {
        const result = await fsProvider.readFile(joinWorktreeRelativePath(repo.path, 'orca.yaml'))
        sharedContent = result.isBinary
          ? null
          : parseOrcaYaml(result.content)?.issueCommand?.trim() || null
      } catch (error) {
        if (!isENOENT(error)) {
          status = 'error'
        }
      }
      const effectiveContent = localContent ?? sharedContent
      return {
        status: localContent ? 'ok' : status,
        localContent,
        sharedContent,
        effectiveContent,
        localFilePath,
        source: localContent
          ? ('local' as const)
          : sharedContent
            ? ('shared' as const)
            : ('none' as const)
      }
    }

    return readIssueCommand(repo.path)
  })

  ipcMain.handle(
    'hooks:writeIssueCommand',
    async (_event, args: { repoId: string; content: string }) => {
      const repo = store.getRepo(args.repoId)
      if (!repo || isFolderRepo(repo)) {
        return
      }

      if (repo.connectionId) {
        const fsProvider = getSshFilesystemProvider(repo.connectionId)
        if (!fsProvider) {
          throw new Error(
            'Remote filesystem unavailable. Reconnect the SSH target before retrying.'
          )
        }
        const issueCommandPath = joinWorktreeRelativePath(repo.path, '.orca/issue-command')
        const trimmed = args.content.trim()
        if (!trimmed) {
          await fsProvider.deletePath(issueCommandPath, false).catch((error: unknown) => {
            if (!isENOENT(error)) {
              throw error
            }
          })
          return
        }
        await fsProvider.createDir(joinWorktreeRelativePath(repo.path, '.orca'))
        const gitignorePath = joinWorktreeRelativePath(repo.path, '.gitignore')
        try {
          const result = await fsProvider.readFile(gitignorePath)
          if (!result.isBinary && !/^\.orca\/?$/m.test(result.content)) {
            const separator = result.content.endsWith('\n') ? '' : '\n'
            await fsProvider.writeFile(gitignorePath, `${result.content}${separator}.orca\n`)
          }
        } catch (error) {
          if (!isENOENT(error)) {
            throw error
          }
          await fsProvider.writeFile(gitignorePath, '.orca\n')
        }
        await fsProvider.writeFile(issueCommandPath, `${trimmed}\n`)
        return
      }

      writeIssueCommand(repo.path, args.content)
    }
  )
}
