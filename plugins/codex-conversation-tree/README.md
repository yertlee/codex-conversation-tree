# Conversation Tree for Codex

Version 0.3.3 provides conversation controls in a separate, full-page Codex plugin view. It does not replace Codex's built-in chat page.

## Tree view

- One card represents one completed Turn, with the user question and assistant answer summarized on the card.
- The main conversation runs downward. Forked conversations branch to the right, including nested branches.
- Click a card to read its full messages and a short list of tool actions in the detail pane.
- Expand branches individually, collapse or expand all, pan, zoom, and fit the tree to the viewport.
- Browse local Codex conversations from the sidebar. The last selected conversation is restored when the page opens again.
- Select a real conversation and send a new message from the page composer. The message is sent to the selected existing thread ID.
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

This is a beta release. The bundled MCP resource and automated tests pass, but a live model Turn could not be completed during development because local app-server sampling timed out. Continuation and approval flows still need an in-app end-to-end check when the service is reachable.
