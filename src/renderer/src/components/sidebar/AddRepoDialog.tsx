import React, { useCallback, useState } from 'react'
import { useAppStore } from '@/store'
import { useRemoteRepo } from './AddRepoSteps'
import { useCreateRepo } from './useCreateRepo'
import { buildNestedRepoScanTelemetry } from '../../../../shared/nested-repo-telemetry'
import type { AddRepoExistingWorkspaceSource } from '../../../../shared/telemetry-events'
import { AddRepoStepIndicator } from './AddRepoStepIndicator'
import { AddRepoDialogStepContent } from './AddRepoDialogStepContent'
import type { AddRepoDialogStep } from './add-repo-dialog-types'
import { useAddRepoNestedReviewState } from './useAddRepoNestedReviewState'
import { useAddRepoCloneFlow } from './useAddRepoCloneFlow'
import { useAddRepoLocalFolderFlow } from './useAddRepoLocalFolderFlow'
import { useAddRepoServerPathFlow } from './useAddRepoServerPathFlow'
import { useAddRepoNestedImportFlow } from './useAddRepoNestedImportFlow'
import { buildAddRepoExistingWorkspacesDetectedEvent } from './add-repo-existing-workspaces-telemetry'
import { finishProjectAddWithDefaultCheckout } from './project-added-default-checkout'
import { useCreateProjectDefaults } from './useCreateProjectDefaults'

const AddRepoDialog = React.memo(function AddRepoDialog() {
  const activeModal = useAppStore((s) => s.activeModal)
  const modalData = useAppStore((s) => s.modalData)
  const closeModal = useAppStore((s) => s.closeModal)
  const addRepoPath = useAppStore((s) => s.addRepoPath)
  const scanNestedRepos = useAppStore((s) => s.scanNestedRepos)
  const cancelNestedRepoScan = useAppStore((s) => s.cancelNestedRepoScan)
  const importNestedRepos = useAppStore((s) => s.importNestedRepos)
  const repos = useAppStore((s) => s.repos)
  const fetchWorktrees = useAppStore((s) => s.fetchWorktrees)
  const openSettingsPage = useAppStore((s) => s.openSettingsPage)
  const openSettingsTarget = useAppStore((s) => s.openSettingsTarget)
  const setHideDefaultBranchWorkspace = useAppStore((s) => s.setHideDefaultBranchWorkspace)
  const settings = useAppStore((s) => s.settings)
  const completeGitRepoAdd = useCompleteGitRepoAdd({
    closeModal,
    setHideDefaultBranchWorkspace
  })

  const [step, setStep] = useState<AddRepoDialogStep>('add')
  const [isAdding, setIsAdding] = useState(false)
  const [addProjectBusyLabel, setAddProjectBusyLabel] = useState<string | null>(null)
  const {
    nestedScan,
    nestedSelectedPaths,
    nestedGroupName,
    nestedConnectionId,
    nestedAttemptId,
    nestedRuntimeKind,
    nestedScanInProgress,
    nestedScanId,
    nestedImportScanId,
    setNestedSelectedPaths,
    setNestedGroupName,
    setNestedScanInProgress,
    getNestedRepoRuntimeKind,
    showNestedRepoReview,
    setActiveNestedScanId,
    handleStopNestedScan,
    resetNestedRepoReviewState
  } = useAddRepoNestedReviewState({
    activeRuntimeEnvironmentId: settings?.activeRuntimeEnvironmentId,
    cancelNestedRepoScan,
    setStep
  })

  const completeGitRepoAdd = useCallback(
    async (repoId: string, source: AddRepoExistingWorkspaceSource): Promise<void> => {
      const worktrees = useAppStore.getState().worktreesByRepo[repoId] ?? []
      const existingWorkspaceTelemetry = buildAddRepoExistingWorkspacesDetectedEvent(
        source,
        worktrees
      )
      if (existingWorkspaceTelemetry && !detectedTelemetryTrackedRef.current.has(repoId)) {
        detectedTelemetryTrackedRef.current.add(repoId)
        track('add_repo_existing_workspaces_detected', existingWorkspaceTelemetry)
      }
      await finishProjectAddWithDefaultCheckout({
        repoId,
        source,
        closeModal,
        setHideDefaultBranchWorkspace
      })
    },
    [closeModal, setHideDefaultBranchWorkspace]
  )

  const {
    sshTargets,
    selectedTargetId,
    remotePath,
    remoteError,
    isAddingRemote,
    isScanningNested: isScanningRemoteNested,
    setSelectedTargetId,
    setRemotePath,
    setRemoteError,
    resetRemoteState,
    handleOpenRemoteStep,
    handleAddRemoteRepo,
    handleConnectTarget,
    stopRemoteNestedScan
  } = useRemoteRepo(
    fetchWorktrees,
    setStep,
    closeModal,
    (repoId) => completeGitRepoAdd(repoId, 'ssh_remote_path'),
    scanNestedRepos,
    showRemoteNestedRepoReview,
    trackRemoteNestedScanResult
  )

  const {
    createName,
    createParent,
    createError,
    isCreating,
    setCreateName,
    setCreateParent,
    setCreateError,
    resetCreateState,
    handlePickParent,
    handleCreate
  } = useCreateRepo(
    fetchWorktrees,
    closeModal,
    (repoId) => completeGitRepoAdd(repoId, 'create_project'),
    {
      hostId: hostSelection.selectedHostId,
      runtimeEnvironmentId: selectedRuntimeEnvironmentId,
      sshTargetId: hostSelection.selectedSshTargetId
    }
  )

  const {
    createDefaultParent,
    createGitAvailability,
    createRuntimeParentStatus,
    createParentDefaultPending,
    resetCreateDefaultState,
    markCreateParentTouched
  } = useCreateProjectDefaults({
    step,
    activeRuntimeEnvironmentId: settings?.activeRuntimeEnvironmentId,
    createParent,
    setCreateParent
  })

  const {
    cloneUrl,
    cloneDestination,
    cloneError,
    cloneProgress,
    isCloning,
    setCloneUrl,
    setCloneDestination,
    setCloneError,
    resetCloneFlow,
    handlePickDestination,
    handleClone
  } = useAddRepoCloneFlow({
    step,
    activeRuntimeEnvironmentId: selectedRuntimeEnvironmentId,
    sshTargetId: hostSelection.selectedSshTargetId,
    workspaceDir: settings?.workspaceDir,
    fetchWorktrees,
    onGitRepoReady: completeGitRepoAdd
  })

  const isOpen = activeModal === 'add-repo'
  const droppedLocalPath =
    typeof modalData.droppedLocalPath === 'string' ? modalData.droppedLocalPath : ''
  const isRuntimeEnvironmentActive = Boolean(selectedRuntimeEnvironmentId)
  const { handleBrowse, resetLocalFolderFlow } = useAddRepoLocalFolderFlow({
    isOpen,
    droppedLocalPath,
    activeRuntimeEnvironmentId: selectedRuntimeEnvironmentId,
    addRepoPath,
    closeModal,
    fetchWorktrees,
    scanNestedRepos,
    setActiveNestedScanId,
    setNestedScanInProgress,
    showNestedRepoReview,
    onGitRepoReady: completeGitRepoAdd,
    setIsAdding,
    setAddProjectBusyLabel
  })
  const {
    serverPath,
    isAddingServerPath,
    setServerPath,
    resetServerPathFlow,
    handleAddServerPath
  } = useAddRepoServerPathFlow({
    addRepoPath,
    closeModal,
    fetchWorktrees,
    getNestedRepoRuntimeKind,
    scanNestedRepos,
    setActiveNestedScanId,
    setNestedScanInProgress,
    showNestedRepoReview,
    onGitRepoReady: completeGitRepoAdd,
    setAddProjectBusyLabel
  })
  const { handleImportNestedRepos, resetNestedImportFlow, trackNestedBackAction } =
    useAddRepoNestedImportFlow({
      nestedAttemptId,
      nestedScan,
      nestedSelectedPaths,
      nestedRuntimeKind,
      nestedConnectionId,
      nestedGroupName,
      nestedImportScanId,
      activeRuntimeEnvironmentId: selectedRuntimeEnvironmentId,
      fetchWorktrees,
      importNestedRepos,
      getNestedRepoRuntimeKind,
      onGitRepoReady: completeGitRepoAdd,
      setIsAdding
    })

  const resetState = useCallback(() => {
    // Why: kill the git clone process if one is running, so backing out
    // or closing the dialog doesn't leave a clone running on disk.
    void window.api.repos.cloneAbort()
    resetLocalFolderFlow()
    setStep('add')
    setIsAdding(false)
    setAddProjectBusyLabel(null)
    resetServerPathFlow()
    resetCloneFlow()
    resetNestedImportFlow()
    resetNestedRepoReviewState()
    resetCreateDefaultState()
    resetCreateState()
    resetRemoteState()
  }, [
    resetCloneFlow,
    resetLocalFolderFlow,
    resetNestedRepoReviewState,
    resetCreateDefaultState,
    resetServerPathFlow,
    resetNestedImportFlow,
    resetRemoteState,
    resetCreateState
  ])

  const resetHostScopedState = useCallback(() => {
    setIsAdding(false)
    setAddProjectBusyLabel(null)
    resetServerPathFlow()
    resetCloneFlow()
    resetCreateDefaultState()
    resetCreateState()
    resetRemoteState()
  }, [
    resetCloneFlow,
    resetCreateDefaultState,
    resetCreateState,
    resetRemoteState,
    resetServerPathFlow
  ])

  useAddRepoHostChangeReset({
    isOpen,
    selectedHostId: hostSelection.selectedHostId,
    onResetClosed: resetState,
    onResetHostScopedState: resetHostScopedState
  })

  const handleBack = useCallback(() => {
    if (step === 'nested') {
      trackNestedBackAction()
    }
    resetState()
  }, [resetState, step, trackNestedBackAction])

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        if (step === 'nested' && !isAdding) {
          trackNestedBackAction()
        }
        closeModal()
        resetState()
      }
    },
    [closeModal, isAdding, resetState, step, trackNestedBackAction]
  )

  return (
    <AddRepoDialogChrome
      isOpen={isOpen}
      step={step}
      isAdding={isAdding}
      onBack={handleBack}
      onOpenChange={handleOpenChange}
    >
      <DialogContent
        className={`min-w-0 overflow-hidden sm:max-w-lg [&>*]:min-w-0 ${
          step === 'nested' ? 'max-h-[calc(100vh-2rem)] grid-rows-[auto_auto_minmax(0,1fr)]' : ''
        }`}
      >
        <AddRepoStepIndicator step={step} isAdding={isAdding} onBack={handleBack} />
        <AddRepoDialogStepContent
          step={step}
          isRuntimeEnvironmentActive={isRuntimeEnvironmentActive}
          activeRuntimeEnvironmentId={settings?.activeRuntimeEnvironmentId}
          isSshLikely={isSshLikely}
          repoCount={repos.length}
          isAdding={isAdding}
          addProjectBusyLabel={addProjectBusyLabel}
          nestedScanInProgress={nestedScanInProgress}
          nestedScanId={nestedScanId}
          serverPath={serverPath}
          isAddingServerPath={isAddingServerPath}
          cloneUrl={cloneUrl}
          cloneDestination={cloneDestination}
          cloneError={cloneError}
          cloneProgress={cloneProgress}
          isCloning={isCloning}
          sshTargets={sshTargets}
          selectedTargetId={selectedTargetId}
          remotePath={remotePath}
          remoteError={remoteError}
          isAddingRemote={isAddingRemote}
          isScanningRemoteNested={isScanningRemoteNested}
          nestedScan={nestedScan}
          nestedSelectedPaths={nestedSelectedPaths}
          nestedGroupName={nestedGroupName}
          createName={createName}
          createParent={createParent}
          createError={createError}
          isCreating={isCreating}
          createDefaultParent={createDefaultParent}
          createGitAvailability={createGitAvailability}
          createRuntimeParentStatus={createRuntimeParentStatus}
          createParentDefaultPending={createParentDefaultPending}
          onBrowse={handleBrowse}
          onOpenCloneStep={() => {
            setCloneError(null)
            setStep('clone')
          }}
          onOpenCreateStep={() => {
            setCreateError(null)
            setStep('create')
          }}
          onOpenRemoteStep={handleOpenRemoteStep}
          onStopNestedScan={handleStopNestedScan}
          onServerPathChange={setServerPath}
          onAddServerPath={(kind) => void handleAddServerPath(kind)}
          onSelectTarget={(id) => {
            setSelectedTargetId(id)
            setRemoteError(null)
          }}
          onRemotePathChange={(value) => {
            setRemotePath(value)
            setRemoteError(null)
          }}
          onAddRemoteRepo={handleAddRemoteRepo}
          onOpenSshSettings={() => {
            closeModal()
            openSettingsTarget({ pane: 'ssh', repoId: null, sectionId: 'ssh' })
            openSettingsPage()
          }}
          onConnectTarget={handleConnectTarget}
          onStopRemoteNestedScan={stopRemoteNestedScan}
          onCloneUrlChange={(value) => {
            setCloneUrl(value)
            setCloneError(null)
          }}
          onCloneDestinationChange={(value) => {
            setCloneDestination(value)
            setCloneError(null)
          }}
          onPickCloneDestination={handlePickDestination}
          onClone={handleClone}
          onNestedGroupNameChange={setNestedGroupName}
          onNestedSelectedPathsChange={setNestedSelectedPaths}
          onImportNestedRepos={(mode) => void handleImportNestedRepos(mode)}
          onCreateNameChange={(value) => {
            setCreateName(value)
            setCreateError(null)
          }}
          onCreateParentChange={(value) => {
            markCreateParentTouched(value)
            setCreateParent(value)
            setCreateError(null)
          }}
          onPickCreateParent={() => {
            void handlePickParent().then((dir) => {
              if (dir) {
                markCreateParentTouched(dir)
              }
            })
          }}
          onCreate={handleCreate}
        />
      </DialogContent>
    </Dialog>
  )
})

export default AddRepoDialog
