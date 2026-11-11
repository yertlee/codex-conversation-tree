# Conversation Tree for Codex

An independent tree view for local Codex chats. Each card is a Turn. You can inspect completed Turns, continue an existing chat, and fork from a Turn. Forks appear under their source Turn in the tree.

This repository is also a [Codex plugin marketplace](https://developers.openai.com/plugins/build/plugins). To install from GitHub, use Codex desktop with Node.js and `codex` on `PATH`:

```powershell
codex plugin marketplace add yertlee/codex-conversation-tree
codex plugin add codex-conversation-tree@codex-conversation-tree
```

Restart the desktop app after installation. See the [plugin README](plugins/codex-conversation-tree/README.md) for features, limitations, and development instructions.

This is a beta release. Merge and session-to-session messaging are planned separately and are not included here.

Licensed under MIT. See [LICENSE](LICENSE).
