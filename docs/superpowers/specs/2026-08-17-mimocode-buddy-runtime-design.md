# ZT.buddy MiMoCode Runtime Design

## Goal

Replace the current hand-built task runner with a pinned MiMoCode runtime so ZT.buddy uses a mature coding-agent engine for planning, tool use, sessions, Skills, Git and context management. Keep the ZT.AI desktop experience, account approval, local-device permission boundary and usage audit as the product shell.

## Chosen architecture

MiMoCode is the only primary Agent engine. It is obtained from the official `XiaomiMiMo/MiMo-Code` source under its MIT license, pinned to a recorded commit and kept as an unmodified runtime dependency. ZT.AI must not copy or fork MiMoCode UI code simply to repaint it.

The Electron application starts a local ZT.buddy bridge with the selected workspace. The bridge starts the pinned MiMoCode runtime and translates its structured lifecycle into a stable ZT.AI event contract: `session.started`, `plan.ready`, `tool.started`, `tool.completed`, `approval.required`, `result.delta`, `session.completed`, and `session.failed`.

The existing Gateway remains the only place that holds model credentials and account approval state. The renderer never receives an API key. The bridge receives an approved account token and a short-lived local capability grant before it can pass a write, command or network action to the runtime.

## Runtime acceptance gate

Before replacement work is connected to the desktop UI, the isolated MiMoCode checkout must pass all of these on Windows:

1. Install or build from its documented official route and start successfully.
2. Configure a disposable OpenAI-compatible provider without exposing a real key in browser code.
3. Start a session in an isolated test workspace.
4. Read a file and enumerate a workspace through the runtime.
5. Verify a write or command action is held until a ZT.AI local confirmation is supplied.
6. Preserve a session/checkpoint across a restart.

If the runtime does not expose a stable machine-readable local interface, ZT.buddy will adapt its official CLI/server output through a child-process bridge. It will not fall back to expanding the old `AgentTaskManager` into another custom Agent engine.

## User interactions

### Account feedback

Submitting login or registration immediately switches the primary button to a spinner and explicit status text. Inputs and the mode toggle are disabled while the request is in flight. Failure, pending approval, timeout and successful entry have separate human-readable states; technical upstream error text stays out of the card.

### Composer

Enter sends the message. Shift+Enter inserts a newline. The handler ignores Enter while an IME composition is active and while an earlier request is running. The send button remains an equivalent accessible action.

### Execution result

While a task runs, the current plan and completed tool steps remain visible in the ZT.buddy result bubble. Once a task finishes, blocks, or fails, the detail list is collapsed into an accessible drawer below the concise result. Its closed label includes the final status, elapsed time and step count; expanding it reveals the individual tools, approvals and warnings without overwhelming the conversation.

## Data and security boundaries

Each desktop user session stays tied to the account token already approved by the existing Gateway. The MiMoCode runtime receives only the selected workspace, model profile and a scoped local capability grant. Runtime logs and checkpoints remain local to the Windows account; telemetry sent to the Gateway continues to use the existing audited events. Source attribution and the MiMoCode MIT notice are included in the packaged product.

## Tests and release gate

Unit tests cover composer key semantics, login state transitions, event normalization, completion-drawer defaults and approval blocking. Integration tests launch a temporary local Gateway, MiMoCode bridge and disposable workspace; they prove ordinary chat does not invoke tools, a read task emits runtime events, and write/command actions halt for approval. The Electron package is built only after all tests and visual desktop/mobile checks pass.
