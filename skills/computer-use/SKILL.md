---
name: computer-use
description: Use Orca's computer-use CLI to inspect and operate local desktop app windows through accessibility trees, screenshots, and safe UI actions. Use for desktop app interaction: listing apps/windows, reading visible UI, clicking controls, setting field values, typing, pressing keys, scrolling, dragging, or verifying an app's on-screen state. Also use for browser windows, webviews, or desktop app UI outside Orca's built-in browser. Trigger phrases include "computer use", "orca computer", "control this app", "click in the app", "read the screen", "get app state", "desktop app", and "visible UI".
---

# Computer Use

Use this skill when the task should operate through Orca's desktop computer-use surface rather than native Codex computer tools, raw AppleScript, ad hoc screenshots, or direct app internals.

Use Orca CLI browser commands only for the browser embedded inside the Orca app. Use Computer Use for browser windows, webviews, and app UI outside that built-in browser.

## Preconditions

- Prefer the public `orca computer ...` command.
- In this Orca worktree, use `./config/scripts/orca-dev computer ...` when testing the local dev runtime.
- Prefer `--json` for agent-driven calls. Screenshot image bytes are omitted from JSON and written to `screenshot.path` when present.
- Do not push, submit forms, send messages, buy items, delete data, or change account settings unless the user explicitly asked for that specific action.
- If an app contains sensitive content, read only what the user requested and avoid unnecessary screenshots or logs.
- Do not act on an element until it comes from the latest `get-app-state` result.
- If this turn already checked Orca runtime status, reuse that result and proceed to computer capabilities.

Check runtime availability first:

```bash
orca status --json
orca computer capabilities --json
```

For local development against this worktree:

```bash
./config/scripts/orca-dev status --json
```

## Core Workflow

Use a snapshot-act-snapshot loop:

1. Discover apps:

```bash
orca computer list-apps --json
```

2. Get a fresh state for the target app:

```bash
orca computer get-app-state --app <app> --json
```

3. Choose an element from that state.

4. Perform one action:

Use the matching action command from the reference below, such as `click`, `set-value`, or `press-key`.

5. Inspect the action result before deciding whether to act again. Actions return a fresh state; use that state for any next element index.

Element indexes are scoped to the current app state. They can go stale after navigation, focus changes, scrolling, window changes, or app re-rendering. Never carry indexes across unrelated steps without refreshing state.

## App Selectors

Prefer bundle IDs returned by `list-apps`:

```bash
orca computer get-app-state --app <bundle-id> --json
```

Names are acceptable when unambiguous:

```bash
orca computer get-app-state --app <app-name> --json
```

Use `pid:<number>` only when bundle ID or name matching is ambiguous:

```bash
orca computer get-app-state --app pid:12345 --json
```

## Commands

```bash
orca computer permissions --json
orca computer capabilities --json
orca computer list-apps --json
orca computer list-windows --app <app> --json
orca computer get-app-state --app <app> --json
orca computer click --app <app> --element-index <index> --json
orca computer perform-secondary-action --app <app> --element-index <index> --action <name> --json
orca computer set-value --app <app> --element-index <index> --value "text" --json
orca computer type-text --app <app> --text "text" --json
orca computer press-key --app <app> --key Return --json
orca computer hotkey --app <app> --key CmdOrCtrl+A --json
orca computer paste-text --app <app> --text "text" --json
orca computer scroll --app <app> (--element-index <index> | --x <x> --y <y>) --direction down --json
orca computer drag --app <app> --from-x 100 --from-y 100 --to-x 300 --to-y 300 --json
```

Use `--no-screenshot` only when pixels are not needed. Screenshots are often the only useful signal for Electron, WebView, or canvas-heavy apps with shallow accessibility trees.

Coordinates are window-local. Use coordinates from the latest screenshot/state for the same target window.

Use `--text-stdin` or `--value-stdin` for sensitive text so payloads do not land in shell history.
On Linux and Windows, action payloads still pass through a short-lived local operation file.

```bash
printf '%s' "$TEXT" | orca computer set-value --app <app> --element-index <index> --value-stdin --json
```

## Choosing Actions

Prefer semantic actions over raw keyboard input:

- Use `set-value` for known editable fields.
- Use `click` for buttons, tabs, menu items, checkboxes, and other direct controls.
- Use `perform-secondary-action` only when the state lists a concrete action name and the user intent matches it.
- Use `type-text` after focusing a field and confirming the app has a focused text receiver.
- Use `press-key` for navigation keys, Return, Escape, shortcuts, or submitting a field after the state confirms the right target is active.

Why: keyboard input is process-targeted on macOS, but it still depends on the target app having a valid focused receiver. `set-value` targets the accessibility element directly and is more reliable when supported.

## Foreground And Background

Some actions work while the app is in the background. Treat this as app-dependent:

- `set-value` can work in the background when the app exposes a writable accessibility value.
- `click` and accessibility actions may work in the background for some native controls.
- `type-text` and `press-key` are targeted to the app process on macOS, but the app may ignore them unless it owns focus or already has an active text receiver.

If an action returns success but the UI did not change, do not repeat the same action blindly. Run `get-app-state` again, inspect the screenshot/tree, then switch to a more semantic action or bring/focus the target if needed.

## Screenshots

`get-app-state` returns an accessibility tree and, by default, a screenshot. Use both:

- Trust the tree for element indexes, names, roles, values, and actions.
- Trust the screenshot for visual confirmation, especially in Electron and WebView apps.
- If the tree is shallow, use screenshot evidence before deciding whether any action is safe.
- If screenshot capture fails or returns no image, the app may be hidden, minimized, off-screen, or have no visible window.

Use restore only when appropriate for the task:

```bash
orca computer get-app-state --app <app> --restore-window --json
```

## Desktop Browser Note

For Edge, Chrome, and similar browsers, prefer setting the address/search field directly:

```bash
orca computer get-app-state --app com.microsoft.edgemac --json
orca computer set-value --app com.microsoft.edgemac --element-index <addressBarIndex> --value "test123" --json
orca computer press-key --app com.microsoft.edgemac --key Return --json
orca computer get-app-state --app com.microsoft.edgemac --json
```

Do not assume raw typing went to the address bar. Confirm the field or page changed after pressing Return.

## Error Handling

- `app_not_found`: run `list-apps` and retry with the bundle ID.
- `element_not_found`: the index is stale; run `get-app-state` again.
- `action_failed`: inspect the element role/actions and try a more semantic action.
- Empty tree or no screenshot: the app may have no visible window, be minimized, or be blocked by permissions.
- Permission errors: the user needs to grant Accessibility or Screen Recording to `Orca Computer Use`. Run `orca computer permissions --json`, use the setup UI, then retry `orca computer get-app-state --app <bundle> --json`.

## Safety Checks

Before acting, classify the action:

- Safe: read state, list apps, inspect screenshot, focus a search box, scroll, open a harmless tab.
- Needs care: typing into a focused field, pressing Return, clicking a primary button.
- Requires explicit user permission: sending messages, posting, purchasing, deleting, submitting forms, changing settings, signing in, or exposing secrets.

When uncertain, stop after `get-app-state` and report what is visible instead of acting.

## Next Action

Confirm Orca status unless already checked this turn, run `orca computer capabilities --json`, then get the target app state with `orca computer get-app-state --app <app> --json`.
