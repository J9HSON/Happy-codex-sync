# Happy Codex Sync

`happy-codex-sync` mirrors local `Codex` threads into `Happy`-managed sessions so the same thread history can be continued from both your desktop `Codex` workflow and the `Happy` app.

This project exists for one specific gap:

- you already have active local `Codex` threads
- `Happy` cannot see those threads by default
- you want `Happy` to reopen those same threads without copying the `Happy` project or patching its source

The sync unit is a `Codex thread`, not a GUI process.

## What It Does

- Scans local `Codex` thread metadata from `~/.codex`
- Resolves each thread's original working directory
- Starts `happy codex --resume <thread-id>` in that original project directory
- Tracks mirrored Happy sessions locally
- Keeps recent threads mirrored on a schedule
- Installs a `launchd` watcher on macOS for background sync

## What It Does Not Do

- It does not attach to an already-open desktop `Codex` window
- It does not mirror live GUI state
- It does not modify `Happy`
- It does not resolve concurrent editing conflicts if you actively type into the same thread from multiple clients at once

## Requirements

- Node.js `20+`
- `happy` installed and runnable
- `codex` installed and at least `0.100.0`

Recommended global installs:

```bash
npm install -g happy
npm install -g @openai/codex
```

## Installation

This repository has no third-party runtime dependencies. If someone clones it, install it directly:

```bash
git clone https://github.com/J9HSON/Happy-codex-sync.git
cd Happy-codex-sync
npm install -g .
```

That exposes:

```bash
happy-codex-sync
```

If you prefer a tarball:

```bash
npm pack
npm install -g happy-codex-sync-*.tgz
```

## Quick Start

### 1. Verify the environment

```bash
happy-codex-sync doctor
```

`doctor` checks:

- Node version
- `happy` binary
- `codex` binary
- `codex` version
- local `~/.codex` session index
- discoverable local threads

### 2. Set it up

On macOS:

```bash
happy-codex-sync setup --recent 20 --interval 30
```

This will:

1. run environment checks
2. save user config
3. install and start a `launchd` background watcher

On non-macOS platforms:

```bash
happy-codex-sync setup
happy-codex-sync watch --recent 20 --interval 30
```

Non-macOS currently does not install a background service automatically.

## Common Commands

```bash
happy-codex-sync doctor
happy-codex-sync setup --recent 20 --interval 30
happy-codex-sync list-local --limit 20
happy-codex-sync list-managed
happy-codex-sync publish <thread-id>
happy-codex-sync publish-last
happy-codex-sync publish-recent 5
happy-codex-sync sync --recent 10
happy-codex-sync watch --recent 20 --interval 30
happy-codex-sync stop <thread-id>
happy-codex-sync stop all
happy-codex-sync service status
happy-codex-sync service install --recent 20 --interval 30
happy-codex-sync service uninstall
```

## How It Works

### 1. Discover local threads

The bridge reads:

- `~/.codex/session_index.jsonl`
- `~/.codex/sessions/**/*.jsonl`

It then builds a normalized local view containing:

- `threadId`
- `threadName`
- `updatedAt`
- `cwd`

Threads without a valid existing `cwd` are skipped.

### 2. Reopen the thread through Happy

For each thread to mirror, the bridge launches:

```bash
happy codex --resume <thread-id>
```

It does that inside the thread's original project directory so the resumed Happy session points at the correct workspace.

### 3. Persist bridge state

State is stored in user directories, not in the repository:

- Config: `~/.config/happy-codex-sync/config.json`
- State: `~/.local/state/happy-codex-sync/managed-sessions.json`
- Logs: `~/.local/state/happy-codex-sync/logs/`

Legacy project-local state is migrated automatically if present.

### 4. Prefer the right Codex binary

Some machines have multiple `codex` binaries, for example:

- `~/.local/bin/codex`
- `/usr/local/bin/codex`

The bridge resolves executables carefully and prefers the current PATH plus user-local installs so `Happy` does not accidentally boot an old CLI.

## Project Layout

```text
Happy-codex-sync/
  bin/
    happy-codex-sync.mjs
  src/
    cli.mjs
    config.mjs
    codex-sessions.mjs
    doctor.mjs
    happy-manager.mjs
    runtime.mjs
    service.mjs
    shell.mjs
    state.mjs
    user-config.mjs
  LICENSE
  README.md
  package.json
```

## Current Capabilities

- Discover local `Codex` threads automatically
- Resolve the original working directory for each thread
- Publish threads into `Happy`
- Record `happySessionId` and runtime metadata
- Avoid republishing already-managed live threads
- Run continuously on macOS via `launchd`
- Store configuration and runtime state outside the repo
- Degrade safely when a machine has no local `~/.codex` history

## Limits

This tool is useful if you want:

- the same `Codex` thread history visible in desktop `Codex` and mobile `Happy`
- a way to continue those threads from `Happy` without rebuilding your workflow

This tool is not the right choice if you need:

- live remote control of an already-open desktop `Codex` window
- a true GUI mirror
- conflict resolution for simultaneous heavy editing on the same thread

## License

MIT
