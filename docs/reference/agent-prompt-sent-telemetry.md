# Agent Prompt Sent Telemetry

This change adds `agent_prompt_sent` so onboarding and retention analysis can tell the difference between an agent being started and Orca initiating or completing a covered prompt submission to that agent.

## Why this exists

`agent_started` only proves Orca launched an agent-backed PTY with telemetry attached. It does not prove the user reached the product value moment of asking the agent to do work.

For onboarding completion, that distinction matters. A user who creates a workspace and starts an agent may still drop before sending a prompt. `agent_prompt_sent` gives us a cleaner signal for "workspace plus real agent intent." It is not proof that the model processed the prompt; folded argv/flag prompts are recorded after local startup is queued, while post-ready terminal input is recorded only after the write path accepts it.

## Event contract

Event: `agent_prompt_sent`

Allowed properties:

| Property | Meaning |
| --- | --- |
| `agent_kind` | Bounded agent family, using the same mapping as `agent_started`. |
| `launch_source` | Bounded source for where the agent prompt flow came from, such as onboarding or quick launch. |
| `request_kind` | Whether this is a new request or a supported bounded request type. |
| `nth_repo_added` | Optional repo-onboarding cohort marker when available. |

The event does not include prompt text, file paths, repository names, branch names, raw command text, or raw error details.

## When it fires

The event records only non-empty, non-draft prompt/message paths that Orca submits or queues for local agent startup:

- A prompt folded into an agent launch command after local startup is queued.
- A prompt sent after the agent is ready through the workspace startup path and verified terminal input accepts it.
- A post-ready pasted prompt that Orca submits on behalf of the user after verified terminal input accepts it.

The implementation covers renderer paths that launch an agent and submit the user's first prompt through Orca's launch/startup helpers:

- `src/renderer/src/hooks/useComposerState.ts`
- `src/renderer/src/lib/launch-agent-in-new-tab.ts`
- `src/renderer/src/lib/new-workspace.ts`

That includes onboarding/new workspace launches, tab-bar quick launch, and other `launchAgentInNewTab` submit-after-ready surfaces such as notes send, conflict resolution, source-control recovery, and task pages.

For local PTYs, "accepted" means main accepted the write through `pty:writeAccepted`. For remote web runtime PTYs, it means the runtime `terminal.send` RPC returned `accepted: true`. SSH relay PTYs cannot acknowledge writes yet, so these paths still attempt the prompt write but intentionally do not emit `agent_prompt_sent` when acceptance cannot be known.

## When it does not fire

The event intentionally does not fire for:

- Bare agent starts with no user prompt.
- Draft-prefill flows where Orca places text in the composer but does not submit it.
- Empty or whitespace-only prompts.
- Incidental terminal input outside the agent prompt submission paths.

## How to use it

For onboarding retention, prefer splitting users like this:

| Segment | Interpretation |
| --- | --- |
| `workspace_created`, no `agent_started` | Workspace created, but no agent launched. |
| `agent_started`, no `agent_prompt_sent` | Agent process launched, but no clear user message. |
| `agent_prompt_sent` | User submitted a real agent request. Stronger activation signal. |

This should make the "workspace/setup action only" and "agent started only" buckets less ambiguous. It also gives us a better way to identify users who technically completed onboarding but never reached a meaningful agent interaction.

## Validation

The worker validated the change with:

- `pnpm test src/shared/telemetry-events.test.ts src/main/telemetry/validator.test.ts src/renderer/src/lib/agent-prompt-sent-telemetry.test.ts src/renderer/src/lib/agent-paste-draft.test.ts src/renderer/src/lib/launch-agent-in-new-tab.test.ts src/renderer/src/lib/new-workspace.test.ts src/renderer/src/runtime/runtime-terminal-inspection.test.ts`
- `pnpm run typecheck:web`
- `pnpm run typecheck:node`
- `git diff --check`

PostHog first-seen validation remains release-dependent. After this ships, update `docs/reference/telemetry-availability.md` with the first observed production timestamp for `agent_prompt_sent`.
