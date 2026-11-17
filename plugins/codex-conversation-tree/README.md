# Conversation Tree for Codex

Version 0.3.9 provides conversation controls in a separate, full-page Codex plugin view. It does not replace Codex's built-in chat page.

## Tree view

- One card represents one completed Turn, with the user question and assistant answer summarized on the card.
- The main conversation runs downward. Forked conversations branch to the right, including nested branches.
- Click a card to read its user message and final assistant answer in the detail pane. Common Markdown formatting, code blocks, tables, and safe links are rendered for reading.
- Intermediate progress messages and tool output are omitted from the conversation body. Attachments and some advanced Markdown syntax are not rendered yet.
- Expand branches individually, collapse or expand all, pan, zoom, and fit the tree to the viewport.
- Browse local Codex conversations from the sidebar. The last selected conversation and each tree's view position and expanded branches are restored when the page opens again.
- Search the current tree's questions and answers, reveal the matching branch, and jump between matches.
- Select a real conversation and send a new message from the page composer. Selecting a historical Turn only opens its detail; use **Continue this conversation** in the detail pane to change the composer target explicitly. A new message always appends to that conversation's latest Turn.
- Choose a model and reasoning effort for the next Turn, or leave the model set to **Follow conversation model**. Available choices come from Codex's `model/list` response. The choice is saved on this device.
- While a message is running, the new Turn is selected in the tree and its streamed answer is reflected in the detail pane.
- Streamed answer updates are checked about every 350 ms. This reduces display lag; model generation time still depends on the selected model and task.
- Fork a real conversation from a completed Turn. The plugin stores the child thread's source Turn in the user's Codex data directory.
- Forks stay attached to the original tree even when Codex lists them as separate root sessions. Empty forks appear immediately at their source Turn, and an active Turn appears before its answer finishes.
- Watch the active Turn and respond to command, file-change, or permission requests in the page. The page also provides a stop control.
- The included example tree supports creating mock branches for UI exploration. These branches are only in the current page and are not Codex conversations.

If a fork's parent Turn cannot be verified from the loaded history, the conversation remains accessible in the sidebar but is not drawn at an invented position in the tree. The UI loads up to 100 recent conversations and up to 400 completed Turns per conversation. Older forks may lack precise source Turn metadata. Unsupported approval types are shown but require stopping the Turn rather than silently approving them.

Merge and session-to-session communication are outside this version.

## Install from GitHub

Requires Codex desktop, Node.js, and the `codex` CLI on `PATH`. Add the GitHub marketplace and install the plugin:

```powershell
codex plugin marketplace add yertlee/codex-conversation-tree
codex plugin add codex-conversation-tree@codex-conversation-tree
```

Restart Codex desktop after installation. The packaged server is bundled; no `npm install` is needed for the installed copy. The plugin reads local Codex conversations through `codex app-server --stdio`. Fork anchor records are stored in the user's Codex data directory at `~/.codex/conversation-tree/branches.json`.

## Development

The source lives under `plugins/codex-conversation-tree/` in the [GitHub repository](https://github.com/yertlee/codex-conversation-tree). Run `npm ci`, `npm run build`, and `npm test` in that directory. Automated tests do not create a persistent fork.

This is a beta release. The bundled MCP resource and automated tests pass, but the full sequence of nested fork, return to a parent branch, continue, and restore after restart still needs an in-app end-to-end check. The local browser's file URL policy also prevented a visual preview of this release.
