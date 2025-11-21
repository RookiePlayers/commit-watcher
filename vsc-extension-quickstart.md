# Commit Watcher

Keep commits small and intentional. Commit Watcher watches your working tree, warns when you exceed your limits, and helps you partition changes into bite‑sized commits right inside VS Code.

## Features
- **Status bar meter**: changed files/lines vs limits; choose `progress`, `text`, or `both`.
- **Commit Buckets view**: checkboxes, status badges, and paths; click a path to open the diff/file; “Select up to N” to grab a bucket quickly.
- **One-click partition & push**: stage, commit, and push the selected bucket (auto sets upstream on first push).
- **AI commit messages**: Copilot-based generation drops directly into the Commit Buckets message box.
- **Reliable diffs**: handles new/deleted/renamed files safely when opening Working Tree ↔ HEAD.

## Requirements
- VS Code `^1.106.0`
- Node.js 20+ and Git installed
- (Optional) GitHub Copilot extension for AI commit messages

## Commands
- `Commit Watcher: Partition Changes` (`commitWatcher.partitionChanges`) – open Commit Buckets.
- `Commit Watcher: Check Now` (`commitWatcher.checkNow`) – refresh counts.

## Extension settings (prefix: `commitWatcher`)
- `maxFiles` (number, default `10`): file limit.
- `maxLines` (number, default `1000`): line (add+del) limit.
- `warnRatio` (number, default `0.7`): warning threshold fraction.
- `autoCheckOnSave` (boolean, default `true`): refresh after save.
- `pollInterval` (number, default `5`): seconds between checks (0 disables).
- `statusBarType` (string, `text` | `progress` | `both`, default `progress`): status bar display.

## How to use
1) Open the Source Control sidebar, select **Commit Buckets** (or click the status bar entry).  
2) Select files (or use **Select up to N**); click a path to inspect the diff.  
3) (Optional) Click **AI** to generate a commit message; edit as needed.  
4) Click **Commit bucket** to stage, commit, and push the selection.

## Build from source
```bash
npm install
npm run compile
npx @vscode/vsce package   # produces commit-watcher.vsix
```
CI workflow `.github/workflows/build.yml` packages and uploads the VSIX artifact.
