import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { exec } from "child_process";
import { log } from "console";

interface DiffStats {
	files: number;
	lines: number;
}

type StatusBarMode = "text" | "progress" | "both";

interface ExtensionConfig {
	maxFiles: number;
	maxLines: number;
	pollInterval: number;
	autoCheckOnSave: boolean;
	warnRatio: number;
	statusBarType: StatusBarMode;
}

interface ChangedFile {
	path: string; // absolute path
	relativePath: string; // repo-relative path
	status: string; // two-character porcelain status (can include spaces)
	originalPath?: string; // absolute original path (for renames)
	originalRelativePath?: string; // repo-relative original path
}

const CONFIG_ROOT = "commitWatcher";
const AI_COMMIT_COMMANDS = [
	"github.copilot.git.generateCommitMessage",
	"github.copilot.git.generateCommitMessageFromSources",
	"github.copilot.generateCommitMessage",
	"github.copilot.generateCommitMessageFromSources",
];

function runGit(cwd: string, command: string): Promise<string> {
	return new Promise((resolve, reject) => {
		exec(command, { cwd }, (err, stdout) => {
			if (err) { return reject(err); }
			resolve(stdout.trim());
		});
	});
}

function loadConfig(): ExtensionConfig {
	const config = vscode.workspace.getConfiguration(CONFIG_ROOT);
	const warnRatio = Math.max(
		0,
		Math.min(1, config.get<number>("warnRatio", 0.7))
	);

	const rawStatusType = config.get<string>("statusBarType", "progress");
	const normalizedStatus =
		rawStatusType === "bar"
			? "progress"
			: rawStatusType === "both" || rawStatusType === "text" || rawStatusType === "progress"
				? (rawStatusType as StatusBarMode)
				: "progress";

	return {
		maxFiles: config.get<number>("maxFiles", 10),
		maxLines: config.get<number>("maxLines", 1000),
		pollInterval: config.get<number>("pollInterval", 5),
		autoCheckOnSave: config.get<boolean>("autoCheckOnSave", true),
		warnRatio,
		statusBarType: normalizedStatus,
	};
}

function quoteArg(value: string) {
	return `"${value.replace(/(["\\\\`$])/g, "\\$1")}"`;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function getDiffStats(cwd: string): Promise<DiffStats> {
	const entries = await getChangedFilesDetailed(cwd);
	let files = entries.length;
	let lines = 0;

	const parseNumstat = (output: string) => {
		for (const line of output.split("\n")) {
			if (!line) { continue; }
			const [add, del] = line.split("\t");
			lines += (parseInt(add) || 0) + (parseInt(del) || 0);
		}
	};

	for (const entry of entries) {
		const rel = entry.relativePath;
		const isUntracked = entry.status.startsWith("?");
		const absolute = entry.path;

		const cmd = isUntracked
			? `git diff --no-index --numstat /dev/null -- ${quoteArg(absolute)} || true`
			: `git diff --numstat -- ${quoteArg(rel)} || true`;

		try {
			const output = await runGit(cwd, cmd);
			if (output) { parseNumstat(output); }
		} catch {
			// ignore failures for individual files
		}
	}

	return { files, lines };
}

async function getChangedFilesDetailed(cwd: string): Promise<ChangedFile[]> {
	const status = await runGit(cwd, "git status --porcelain=v1 -z");
	if (!status) { return []; }

	const entries: ChangedFile[] = [];
	const tokens = status.split("\0").filter(Boolean);

	for (let i = 0; i < tokens.length; i++) {
		const item = tokens[i];
		log(`[CMTWATCHER]Processing status item: ${item}`);
		const statusCode = item.slice(0, 2);
		const restStart = item[2] === " " ? 3 : 2;
		const relativePath = item.slice(restStart);
		log(`[CMTWATCHER]Parsed file: ${relativePath} with status: ${statusCode.trim()}`);

		let originalPath: string | undefined;
		let originalRelativePath: string | undefined;
		// Renames provide an extra path token
		if (statusCode.includes("R") && i + 1 < tokens.length) {
			originalRelativePath = tokens[++i];
			originalPath = path.join(cwd, originalRelativePath);
		}

		const absolutePath = path.join(cwd, relativePath);
		log(`[CMTWATCHER]Found changed file: ${relativePath} (${statusCode.trim()})`);

			entries.push({
				path: absolutePath,
				relativePath,
				status: statusCode,
				originalPath,
				originalRelativePath,
			});
	}

	return entries;
}

function makeProgressBar(pct: number, length = 10): string {
	// clamp between 0 and 1
	const clamped = Math.max(0, Math.min(1, pct || 0));
	const filled = Math.round(clamped * length);
	const empty = length - filled;
	return `[${"█".repeat(filled)}${"░".repeat(empty)}]`;
}

function formatStatus(status: string) {
	const value = status ?? "";
	return value.replace(/ /g, "·") || "·";
}

function getNonce() {
	const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
	return Array.from({ length: 32 }, () =>
		possible.charAt(Math.floor(Math.random() * possible.length))
	).join("");
}

function buildSidePanelHtml(
	webview: vscode.Webview,
	data: { files: ChangedFile[]; maxFiles: number; aiAvailable: boolean }
): string {
	const nonce = getNonce();
	const csp = [
		"default-src 'none';",
		`script-src 'nonce-${nonce}';`,
		"style-src 'unsafe-inline';",
		"img-src data: https:;",
	].join(" ");

	const fileRows = data.files
		.map(
			(file) => `<label class="file" data-file="${file.path}" data-rel="${file.relativePath}" data-original-rel="${file.originalRelativePath ?? ""}" data-status="${file.status}" data-original="${file.originalPath ?? ""}">
				<input type="checkbox" data-file="${file.path}" data-rel="${file.relativePath}" data-original-rel="${file.originalRelativePath ?? ""}" data-status="${file.status}" data-original="${file.originalPath ?? ""}" />
				<span class="name">${path.basename(file.relativePath)}</span>
				<span class="path" style="text-align: right"  title="${file.path}">${file.relativePath}</span>
				<span class="status-code">${formatStatus(file.status)}</span>
			</label>`
		)
		.join("");

	return /* html */ `
		<!DOCTYPE html>
		<html lang="en">
		<head>
			<meta charset="UTF-8">
			<meta http-equiv="Content-Security-Policy" content="${csp}">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			<style>
				:root { color-scheme: light dark; }
				body {
					margin: 0;
					padding: 0;
					font-size: 12px;
					color: var(--vscode-foreground);
					background: var(--vscode-sideBar-background);
					overflow: auto;
				}
				.app {
					display: flex;
					flex-direction: column;
					gap: 8px;
					padding-bottom: 10px;
				}
				header {
					display: flex;
					align-items: center;
					gap: 6px;
					padding: 8px 10px 4px;
					flex-shrink: 0;
				}
				.refresh {
					background: transparent;
					border: 1px solid var(--vscode-button-border, transparent);
					color: var(--vscode-button-foreground);
					background-color: var(--vscode-button-secondaryBackground, transparent);
					padding: 4px 8px;
					border-radius: 4px;
					cursor: pointer;
				}
				.counter {
					font-weight: 600;
					color: var(--vscode-descriptionForeground);
				}
				.select-all {
					display: inline-flex;
					align-items: center;
					gap: 4px;
					color: var(--vscode-descriptionForeground);
					font-size: 11px;
					user-select: none;
				}
				.panel {
					padding: 0 10px;
					display: flex;
					flex-direction: column;
					gap: 6px;
				}
				.message {
					width: 100%;
					min-height: 24px;
					color: var(--vscode-input-foreground);
					background: var(--vscode-input-background);
					border: 1px solid var(--vscode-input-border);
					border-radius: 4px;
					padding: 6px;
					font: inherit;
					line-height: 1.4;
					overflow: hidden;
					white-space: pre-wrap;
					word-break: break-word;
				}
				.message.empty::before {
					content: attr(data-placeholder);
					color: var(--vscode-descriptionForeground);
				}
				.actions {
					display: flex;
					gap: 8px;
					justify-content: flex-end;
					align-items: center;
				}
				.actions button {
					border: none;
					padding: 6px 12px;
					border-radius: 4px;
					cursor: pointer;
				}
				.actions .ai {
					background: var(--vscode-button-secondaryBackground);
					color: var(--vscode-button-secondaryForeground);
				}
				.actions .commit {
					background: var(--vscode-button-background);
					color: var(--vscode-button-foreground);
				}
				.actions button:disabled {
					filter: opacity(0.6);
					cursor: not-allowed;
				}
				.notice {
					color: var(--vscode-descriptionForeground);
					font-size: 11px;
				}
				.files {
					padding: 0 10px 10px;
					display: flex;
					flex-direction: column;
					gap: 6px;
				}
				.file {
					display: grid;
					grid-template-columns: auto 1fr 1fr auto;
					align-items: center;
					gap: 6px;
					padding: 6px;
					border: 1px solid var(--vscode-editorWidget-border, transparent);
					border-radius: 4px;
					background: var(--vscode-editor-background, transparent);
				}
				.file .name {
					min-width: 0;
					overflow: hidden;
					text-overflow: ellipsis;
					white-space: nowrap;
				}
				.file .status-code {
					font-family: var(--vscode-editor-font-family);
					justify-self: end;
					font-size: 11px;
					color: var(--vscode-descriptionForeground);
					border: 1px solid var(--vscode-toolbar-hoverBackground);
					border-radius: 4px;
					padding: 2px 6px;
					background: var(--vscode-toolbar-hoverBackground, transparent);
					white-space: nowrap;
				}
				.file .path {
					min-width: 0;
					font-family: var(--vscode-editor-font-family);
					color: var(--vscode-descriptionForeground);
					font-size: 11px;
					overflow: hidden;
					text-overflow: ellipsis;
					white-space: nowrap;
					cursor: pointer;
				}
			</style>
		</head>
		<body>
			<div class="app">
				<header>
					<div class="title">Bucket files</div>
					<label class="select-all">
						<input type="checkbox" id="selectAll" />
						<span>Select up to ${data.maxFiles}</span>
					</label>
					<div class="counter" id="counter">0 / ${data.maxFiles}</div>
					<button class="refresh" id="refresh">Refresh</button>
				</header>
				<div class="panel">
					<div class="notice">Commit message (applies to selected files below)</div>
					<div id="message" class="message empty" contenteditable="true" data-placeholder="Commit message"></div>
					<div class="actions">
						<button class="ai" id="ai" ${data.aiAvailable ? "" : "disabled"} title="${data.aiAvailable ? "Generate message with AI" : "AI generator not available"}">✦ AI</button>
						<button class="commit" id="commit" disabled>Commit + Push Bucket Content</button>
					</div>
				</div>
				<div class="files" id="files">${fileRows || "<div class='notice'>No changes</div>"}</div>
			</div>
			<script nonce="${nonce}">
				const vscode = acquireVsCodeApi();
				const selected = new Set();
				let maxFiles = ${data.maxFiles};
				const filesContainer = document.getElementById('files');
				const counter = document.getElementById('counter');
				const commitBtn = document.getElementById('commit');
				const msg = document.getElementById('message');
				const aiBtn = document.getElementById('ai');
				const selectAll = document.getElementById('selectAll');

				const getMessage = () => msg.textContent?.trim() || "";

				const autosize = () => {
					if (!(msg instanceof HTMLElement)) { return; }
					msg.style.height = "auto";
					msg.style.height = msg.scrollHeight + "px";
					if (!getMessage()) {
						msg.classList.add('empty');
					} else {
						msg.classList.remove('empty');
					}
				};

				const updateCounter = () => {
					counter.textContent = \`\${selected.size} / \${maxFiles}\`;
					commitBtn.disabled = selected.size === 0 || !getMessage() || selected.size > maxFiles;
					autosize();
				};

				const applySelectAll = () => {
					if (!(selectAll instanceof HTMLInputElement)) { return; }
					const inputs = Array.from(filesContainer.querySelectorAll('input[type="checkbox"]'));

					if (selectAll.checked) {
						selected.clear();
						for (const input of inputs) {
							if (!(input instanceof HTMLInputElement)) { continue; }
							if (selected.size >= maxFiles) {
								input.checked = false;
								continue;
							}
							input.checked = true;
							if (input.dataset.file) {
								selected.add(input.dataset.file);
							}
						}
					} else {
						for (const input of inputs) {
							if (!(input instanceof HTMLInputElement)) { continue; }
							input.checked = false;
						}
						selected.clear();
					}
					updateCounter();
				};

				filesContainer.addEventListener('change', (event) => {
					const target = event.target;
					if (target.tagName === 'INPUT' && target.type === 'checkbox') {
						const file = target.dataset.file;
						if (!file) { return; }
						if (target.checked) {
							selected.add(file);
							if (selected.size > maxFiles) {
								target.checked = false;
								selected.delete(file);
								vscode.postMessage({ type: 'notify', message: 'Bucket limit reached' });
							}
						} else {
							selected.delete(file);
						}
						updateCounter();
					}
				});

				selectAll?.addEventListener('change', applySelectAll);

					filesContainer.addEventListener('click', (event) => {
						// Only open when clicking the path text
						const target = event.target;
						if (!(target instanceof HTMLElement)) { return; }
						if (!target.classList.contains('path')) { return; }

						const label = target.closest('label.file');
						if (!label) { return; }
						const file = label.dataset.file;
						const status = label.dataset.status;
						const originalPath = label.dataset.original;
						const originalRel = label.dataset.originalRel;
						if (!file) { return; }
						vscode.postMessage({
							type: 'preview',
							files: [{ path: file, status, originalPath, originalRelativePath: originalRel }],
						});
					});

				document.getElementById('refresh').addEventListener('click', () => {
					vscode.postMessage({ type: 'refresh' });
				});

				commitBtn.addEventListener('click', () => {
					const message = getMessage();
					if (!message) {
						commitBtn.disabled = true;
						return;
					}
					vscode.postMessage({ type: 'commit', files: Array.from(selected), message });
				});

				msg.addEventListener('input', updateCounter);
				msg.addEventListener('keyup', autosize);
				msg.addEventListener('paste', () => setTimeout(updateCounter, 0));

				aiBtn?.addEventListener('click', () => {
					if (aiBtn.disabled) { return; }
					aiBtn.disabled = true;
					aiBtn.textContent = "Generating...";
					vscode.postMessage({
							type: 'generateMessage',
							files: Array.from(selected).map((path) => ({
								path,
								status: document.querySelector(\`input[data-file="\${path}"]\`)?.dataset.status,
								originalPath: document.querySelector(\`input[data-file="\${path}"]\`)?.dataset.original,
								originalRelativePath: document.querySelector(\`input[data-file="\${path}"]\`)?.dataset.originalRel,
							})),
						});
					});

				window.addEventListener('message', (event) => {
					const msgData = event.data || {};
					if (msgData.type === 'notify') {
						return;
					}
					if (msgData.type === 'messageGenerated') {
						if (msgData.content) {
							msg.textContent = msgData.content;
							updateCounter();
						}
						if (aiBtn) {
							aiBtn.disabled = !msgData.available;
							aiBtn.textContent = msgData.available ? "✧ AI" : "AI unavailable";
						}
					}
				if (msgData.type === 'committed') {
					selected.clear();
					document
						.querySelectorAll('input[type="checkbox"]')
						.forEach((input) => (input.checked = false));
					if (selectAll instanceof HTMLInputElement) {
						selectAll.checked = false;
					}
					msg.textContent = '';
					updateCounter();
				}
				if (msgData.type === 'data') {
					maxFiles = msgData.maxFiles ?? maxFiles;
					if (aiBtn) {
						aiBtn.disabled = !msgData.aiAvailable;
						aiBtn.textContent = msgData.aiAvailable ? "✧ AI" : "AI unavailable";
					}
					if (selectAll instanceof HTMLInputElement) {
						selectAll.checked = false;
					}
					filesContainer.innerHTML =
							msgData.files.length === 0
								? "<div class='notice'>No changes</div>"
									: msgData.files
											.map(
												(file) => \`<label class="file" data-file="\${file.path}" data-rel="\${file.relativePath}" data-original-rel="\${file.originalRelativePath ?? ""}" data-status="\${file.status}" data-original="\${file.originalPath ?? ""}">
													<input type="checkbox" data-file="\${file.path}" data-rel="\${file.relativePath}" data-original-rel="\${file.originalRelativePath ?? ""}" data-status="\${file.status}" data-original="\${file.originalPath ?? ""}" \${selected.has(file.path) ? "checked" : ""}/>
													<span class="name">\${file.name ?? file.relativePath.split('/').pop()}</span>
													<span class="path" style="text-align: right" title="\${file.path}">\${file.relativePath}</span>
													<span class="status-code">\${formatStatus(file.status)}</span>
												</label>\`
											)
											.join('');
						updateCounter();
					}
				});

				vscode.postMessage({ type: 'ready' });
				updateCounter();
			</script>
		</body>
		</html>
	`;
}

export function activate(context: vscode.ExtensionContext) {
	let currentConfig = loadConfig();
	let isChecking = false;
	let saveSubscription: vscode.Disposable | undefined;
	let pollDisposable: vscode.Disposable | undefined;

	const statusBar = vscode.window.createStatusBarItem(
		vscode.StatusBarAlignment.Left,
		100
	);
	statusBar.command = "commitWatcher.bucketView.focus";
	statusBar.show();
	context.subscriptions.push(statusBar);

	const resolveWorkspaceFolder = (uri?: vscode.Uri) => {
		if (uri) {
			const folder = vscode.workspace.getWorkspaceFolder(uri);
			if (folder) { return folder.uri.fsPath; }
		}
		return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
	};

		const normalizePathForGit = (folder: string, file: string) => {
			const rel = path.isAbsolute(file) ? path.relative(folder, file) : file;
			const cleaned = rel.startsWith("./") ? rel.slice(2) : rel;
			const abs = path.isAbsolute(file) ? file : path.join(folder, cleaned);
			if (fs.existsSync(abs) || cleaned === "/") { return cleaned; }

		const parts = cleaned.split("/");
		if (parts.length > 0 && !parts[0].startsWith(".")) {
			const dottedHead = `.${parts[0]}`;
			const candidateWithDot = [dottedHead, ...parts.slice(1)].join("/");
			if (fs.existsSync(path.join(folder, candidateWithDot))) {
				return candidateWithDot;
			}
		}

		if (!cleaned.startsWith(".")) {
			const maybe = `.${cleaned.startsWith("/") ? cleaned : `/${cleaned}`}`;
			if (fs.existsSync(path.join(folder, maybe))) {
				return maybe;
			}
		}

		return cleaned;
	};

	const getCurrentBranch = async (folder: string) => {
		return runGit(folder, "git rev-parse --abbrev-ref HEAD");
	};

	const hasUpstream = async (folder: string) => {
		try {
			await runGit(folder, "git rev-parse --abbrev-ref --symbolic-full-name @{u}");
			return true;
		} catch {
			return false;
		}
	};

	const pushWithUpstream = async (folder: string) => {
		const branch = await getCurrentBranch(folder);
		if (!(await hasUpstream(folder))) {
			await runGit(folder, `git push --set-upstream origin ${quoteArg(branch)}`);
			return;
		}
		await runGit(folder, "git push");
	};

	const hasHeadVersion = async (
		folder: string,
		file: string,
		headPathOverride?: string
	) => {
		try {
			const target = headPathOverride ?? file;
			const relativeTarget = path.isAbsolute(target)
				? path.relative(folder, target)
				: target;
			const result = await runGit(
				folder,
				`git ls-tree --name-only HEAD -- ${quoteArg(relativeTarget)}`
			);
			return Boolean(result.trim());
		} catch {
			return false;
		}
	};

	const toGitPath = (folder: string, targetPath: string) =>
		path.relative(folder, targetPath).split(path.sep).join("/");

	const gitUriForRef = (fileUri: vscode.Uri, gitPath: string, ref: string) =>
		fileUri.with({
			scheme: "git",
			// Git extension expects JSON query with path + ref (path relative to repo root)
			query: JSON.stringify({ path: gitPath, ref }),
		});

	const showDiffPreview = async (
		folder: string,
		file: string,
		status?: string,
		originalPath?: string
	) => {
		const absPath = path.isAbsolute(file) ? file : path.join(folder, file);
		const fileUri = vscode.Uri.file(absPath);
		const title = `${file} (Working Tree ↔️ HEAD)`;

		const normalizedStatus = (status ?? "").trim();
		const isNew =
			normalizedStatus.startsWith("?") || normalizedStatus.startsWith("A");
		const isDeleted = normalizedStatus.startsWith("D");
		const headPath = originalPath ?? file;
		const existsInHead = isNew
			? false
			: await hasHeadVersion(folder, file, headPath);

		const emptyUri = vscode.Uri.parse("untitled:commit-watcher-empty");
		const left = existsInHead
			? gitUriForRef(
					fileUri,
					toGitPath(
						folder,
						path.isAbsolute(headPath) ? headPath : path.join(folder, headPath)
					),
					"HEAD"
				)
			: emptyUri;
		const right = isDeleted ? emptyUri : fileUri;

		try {
			await vscode.commands.executeCommand("vscode.diff", left, right, title, {
				preview: false,
			});
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Unable to open diff; opening file instead.";
			vscode.window.showWarningMessage(`Commit watcher: ${message}`);
			await vscode.commands.executeCommand("vscode.open", fileUri);
		}
	};

	const getAvailableAiCommand = async (
		forceActivate = true
	): Promise<string | undefined> => {
		const findCommand = async () => {
			const commands = await vscode.commands.getCommands(true);
			return AI_COMMIT_COMMANDS.find((cmd) => commands.includes(cmd));
		};

		try {
			const found = await findCommand();
			if (found || !forceActivate) { return found; }

			const copilotExt =
				vscode.extensions.getExtension("github.copilot") ??
				vscode.extensions.getExtension("github.copilot-chat");
			if (copilotExt && !copilotExt.isActive) {
				try {
					await copilotExt.activate();
				} catch {
					// ignore activation failures
				}
			}

			return await findCommand();
		} catch {
			return undefined;
		}
	};

	const isAiAvailable = async () => {
		const found = await getAvailableAiCommand(false);
		if (found) { return true; }
		const copilotExt =
			vscode.extensions.getExtension("github.copilot") ??
			vscode.extensions.getExtension("github.copilot-chat");
		return Boolean(copilotExt);
	};

	const generateAiCommitMessage = async (
		folder: string,
		files: string[]
	): Promise<string | undefined> => {
		const commandId = await getAvailableAiCommand();
		if (!commandId) { return undefined; }

		const relFiles = files.map((f) =>
			path.isAbsolute(f) ? path.relative(folder, f) : f
		);

		let diff = "";
		if (relFiles.length) {
			try {
				diff = await runGit(
					folder,
					`git diff --no-color -- ${relFiles.map((f) => quoteArg(f)).join(" ")}`
				);
			} catch {
				diff = "";
			}
		}

		try {
			const result = await vscode.commands.executeCommand<string>(commandId, {
				diff,
				files: relFiles,
			});
			if (typeof result === "string" && result.trim()) {
				return result.trim();
			}
		} catch {
			// swallow and fall back to SCM input check
		}

		// Some AI providers populate the SCM input instead of returning a string; poll briefly.
		for (let attempt = 0; attempt < 3; attempt++) {
			const scmValue = vscode.scm.inputBox?.value;
			if (scmValue && scmValue.trim()) {
				return scmValue.trim();
			}
			await sleep(150);
		}

		return undefined;
	};

	const solicitCommitMessage = async (
		bucketSize: number,
		folder: string,
		files: string[]
	): Promise<string | undefined> => {
		const aiEnabled = await isAiAvailable();
		const aiCommand = aiEnabled ? await getAvailableAiCommand() : undefined;
		const input = vscode.window.createInputBox();
		input.title = `Commit message for ${bucketSize} file(s)`;
		input.placeholder = "Describe the bucket";
		input.prompt = "Press Enter to accept, or use AI if available.";
		input.ignoreFocusOut = true;
		input.value = "";

		if (aiEnabled) {
			input.buttons = [
				{
					iconPath: new vscode.ThemeIcon("sparkle"),
					tooltip: "Generate with AI",
				},
			];
		}

		return new Promise((resolve) => {
			const finish = (message?: string) => {
				resolve(message?.trim() || undefined);
				input.dispose();
			};

			input.onDidAccept(() => {
				const value = input.value.trim();
				if (!value) {
					input.validationMessage = "Commit message is required.";
					return;
				}
				finish(value);
			});

			input.onDidTriggerButton(async () => {
				input.busy = true;
				try {
					const generated = await generateAiCommitMessage(folder, files);
					if (generated) {
						input.value = generated;
						input.validationMessage = undefined;
					} else {
						vscode.window.showWarningMessage(
							"Commit watcher: AI returned no commit message."
						);
					}
				} catch (err) {
					const message =
						err instanceof Error ? err.message : "AI commit generation failed.";
					vscode.window.showWarningMessage(`Commit watcher: ${message}`);
				} finally {
					input.busy = false;
				}
			});

			input.onDidHide(() => finish());

			input.show();
		});
	};

	const pickBucketFiles = async (
		files: ChangedFile[],
		maxFiles: number
	): Promise<ChangedFile[] | undefined> => {
			const quickPick = vscode.window.createQuickPick();
			quickPick.canSelectMany = true;
			quickPick.matchOnDescription = true;
			quickPick.items = files.map((file) => ({
				label: path.basename(file.relativePath),
				description: file.relativePath,
				detail: formatStatus(file.status),
				file,
			}));
			quickPick.ignoreFocusOut = true;

		const updateTitles = () => {
			quickPick.title = `Select files for this bucket (${quickPick.selectedItems.length}/${maxFiles})`;
			quickPick.placeholder = `Choose up to ${maxFiles} files to commit in this bucket`;
		};

		return new Promise((resolve) => {
			quickPick.onDidChangeSelection((selection) => {
				if (selection.length > maxFiles) {
					vscode.window.showWarningMessage(
						`Bucket limit is ${maxFiles} files; trimming selection.`
					);
					quickPick.selectedItems = selection.slice(0, maxFiles);
				}
				updateTitles();
			});

				quickPick.onDidAccept(() => {
					const selected = quickPick.selectedItems
						.map((item) => (item as any).file as ChangedFile | undefined)
						.filter(Boolean) as ChangedFile[];
					resolve(selected);
					quickPick.hide();
				});

			quickPick.onDidChangeActive(async (activeItems) => {
				if (!activeItems.length) { return; }
				updateTitles();
			});

			quickPick.onDidHide(() => {
				resolve(undefined);
				quickPick.dispose();
			});

			updateTitles();
			quickPick.show();
		});
	};

	const stageCommitAndPush = async (
		folder: string,
		files: string[],
		message: string
	) => {
		const failed: string[] = [];

		const statusEntries = await getChangedFilesDetailed(folder).catch(() => []);
		const statusPaths = new Set(
			statusEntries.map((f) => f.relativePath).concat(statusEntries.map((f) => f.path))
		);

		for (const file of files) {
			const rel = path.isAbsolute(file) ? path.relative(folder, file) : file;
			const normalized = normalizePathForGit(folder, rel);
			const candidates = new Set<string>([
				normalized,
				statusPaths.has(rel) ? rel : "",
				statusPaths.has(`.${rel}`) ? `.${rel}` : "",
			]);
			if (!normalized.startsWith(".") && !normalized.startsWith("/")) {
				candidates.add(`.${normalized.startsWith("/") ? normalized : `/${normalized}`}`);
			}
			if (!normalized.startsWith("./")) {
				candidates.add(`./${normalized}`);
			}

			let added = false;
			for (const candidate of candidates) {
				if (!candidate) { continue; }
				try {
					await runGit(folder, `git add -- ${quoteArg(candidate)}`);
					added = true;
					break;
				} catch {
					// try next candidate
				}
			}

			if (!added) {
				failed.push(file);
			}
		}

		if (failed.length) {
			throw new Error(
				`Could not stage: ${failed.join(", ")}. Check that paths exist in the workspace.`
			);
		}

		await runGit(folder, `git commit -m ${quoteArg(message)}`);
		await pushWithUpstream(folder);
	};

	const getPanelData = async () => {
		const folder = resolveWorkspaceFolder();
		const files = folder ? await getChangedFilesDetailed(folder).catch(() => []) : [];
		const aiAvailable = await isAiAvailable();
		return { folder, files, aiAvailable };
	};

	const bucketViewProvider = new (class implements vscode.WebviewViewProvider {
		private view?: vscode.WebviewView;

		async resolveWebviewView(webviewView: vscode.WebviewView) {
			this.view = webviewView;
			webviewView.webview.options = {
				enableScripts: true,
			};

			const data = await getPanelData();
			webviewView.webview.html = buildSidePanelHtml(webviewView.webview, {
				files: data.files,
				maxFiles: currentConfig.maxFiles,
				aiAvailable: data.aiAvailable,
			});

			webviewView.webview.onDidReceiveMessage(async (message) => {
				if (!message) { return; }

				if (message.type === "ready" || message.type === "refresh") {
					await this.postData();
					return;
				}

					if (message.type === "preview") {
						const folder = resolveWorkspaceFolder();
						if (!folder) { return; }

						const items: { path: string; status?: string; originalPath?: string; originalRelativePath?: string }[] = Array.isArray(
							message.files
						)
							? message.files.map((f: any) =>
									typeof f === "string" ? { path: f } : f
							  )
							: [];

						for (const file of items) {
							await showDiffPreview(
								folder,
								file.path,
								file.status,
								file.originalRelativePath ?? file.originalPath
							);
						}
						return;
					}

				if (message.type === "generateMessage") {
					try {
						const folder = resolveWorkspaceFolder();
						const files: { path: string; status?: string; originalPath?: string }[] =
							Array.isArray(message.files) ? message.files : [];
						const paths = files.map((f) => f.path);
						const content = folder
							? await generateAiCommitMessage(folder, paths)
							: undefined;
						webviewView.webview.postMessage({
							type: "messageGenerated",
							content: content ?? "",
							available: await isAiAvailable(),
						});
					} catch (err) {
						const messageText =
							err instanceof Error ? err.message : "AI commit generation failed.";
						vscode.window.showWarningMessage(`Commit watcher: ${messageText}`);
						webviewView.webview.postMessage({
							type: "messageGenerated",
							content: "",
							available: await isAiAvailable(),
						});
					}
					return;
				}

				if (message.type === "commit") {
					const folder = resolveWorkspaceFolder();
					if (!folder) {
						vscode.window.showWarningMessage(
							"Commit watcher: no workspace to commit from."
						);
						return;
					}

					const files: string[] = Array.isArray(message.files) ? message.files : [];
					const commitMessage: string = (message.message as string | undefined)?.trim() || "";

					if (!files.length) {
						vscode.window.showWarningMessage("Commit watcher: select files to commit.");
						return;
					}

					if (files.length > currentConfig.maxFiles) {
						vscode.window.showWarningMessage(
							`Commit watcher: limit is ${currentConfig.maxFiles} files.`
						);
						return;
					}

					if (!commitMessage) {
						vscode.window.showWarningMessage("Commit watcher: commit message required.");
						return;
					}

					try {
						await vscode.window.withProgress(
							{
								location: vscode.ProgressLocation.Notification,
								title: `Committing ${files.length} file(s)`,
							},
							async (progress) => {
								progress.report({ message: "Staging files..." });
								await stageCommitAndPush(folder, files, commitMessage);
								progress.report({ message: "Pushed changes" });
							}
						);

						vscode.window.showInformationMessage(
							`Committed and pushed ${files.length} file(s).`
						);
						await this.postData();
						webviewView.webview.postMessage({ type: "committed" });
						updateIndicator(false);
					} catch (err) {
						const messageText =
							err instanceof Error ? err.message : "Failed to commit and push bucket.";
						vscode.window.showErrorMessage(`Commit watcher: ${messageText}`);
					}
					return;
				}
			});
		}

		async postData() {
			if (!this.view) { return; }
			const data = await getPanelData();
			this.view.webview.postMessage({
				type: "data",
				files: data.files,
				maxFiles: currentConfig.maxFiles,
				aiAvailable: data.aiAvailable,
			});
		}
	})();

	const openPartitionPanel = async () => {
		const folder = resolveWorkspaceFolder();
		if (!folder) {
			vscode.window.showInformationMessage(
				"Commit watcher: no workspace folder found."
			);
			return;
		}

		const changedFiles = await getChangedFilesDetailed(folder).catch(() => []);
		if (!changedFiles.length) {
			vscode.window.showInformationMessage("Commit watcher: no changes to partition.");
			return;
		}

			const bucketFiles = await pickBucketFiles(
				changedFiles,
				currentConfig.maxFiles
			);
			if (!bucketFiles || bucketFiles.length === 0) { return; }

			const commitMessage = await solicitCommitMessage(
				bucketFiles.length,
				folder,
				bucketFiles.map((f) => f.relativePath)
			);
			if (!commitMessage) { return; }

		try {
			await vscode.window.withProgress(
				{
					location: vscode.ProgressLocation.Notification,
						title: `Committing ${bucketFiles.length} file(s)`,
					},
					async (progress) => {
						progress.report({ message: "Staging files..." });
						await stageCommitAndPush(
							folder,
							bucketFiles.map((f) => f.path),
							commitMessage
						);
							progress.report({ message: "Pushed changes" });
						}
					);

			vscode.window.showInformationMessage(
				`Committed and pushed ${bucketFiles.length} file(s).`
			);
			updateIndicator(false);
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Failed to commit and push bucket.";
			vscode.window.showErrorMessage(`Commit watcher: ${message}`);
		}
	};

	async function updateIndicator(showAlert = false, uri?: vscode.Uri) {
		if (isChecking) { return; }

		const folder = resolveWorkspaceFolder(uri);

		if (!folder || !currentConfig.maxFiles || !currentConfig.maxLines) {
			statusBar.text = "🔘 Bloat: n/a";
			statusBar.tooltip = "commit watcher: no workspace or limits configured";
			return;
		}

		try {
			isChecking = true;
			const stats = await getDiffStats(folder);

			const filePct = stats.files / currentConfig.maxFiles;
			const linePct = stats.lines / currentConfig.maxLines;
			const danger = Math.max(filePct, linePct);

			let icon = "🟢";
			let color: vscode.ThemeColor | string | undefined = undefined;

			if (danger >= 1) {
				icon = "🔴";
				color = new vscode.ThemeColor("errorForeground");
			} else if (danger >= currentConfig.warnRatio) {
				icon = "🟡";
				color = new vscode.ThemeColor("editorWarning.foreground");
			} else {
				icon = "🟢";
				color = new vscode.ThemeColor("editorInfo.textForeground");
			}

			const bar = makeProgressBar(danger);
			const countsShort = `${stats.files}/${currentConfig.maxFiles} f | ${stats.lines}/${currentConfig.maxLines} l`;
			const percent = Math.round(Math.min(1, Math.max(0, danger)) * 100);

			if (currentConfig.statusBarType === "progress") {
				statusBar.text = `$(git-commit) ${icon} ${bar} ${percent}%`;
			} else if (currentConfig.statusBarType === "both") {
				statusBar.text = `$(git-commit) ${icon} ${bar} ${percent}% · ${countsShort}`;
			} else {
				statusBar.text = `$(git-commit) ${icon} ${countsShort}`;
			}
			statusBar.color = color;
			statusBar.tooltip = `Commit watcher
Files changed: ${stats.files} / ${currentConfig.maxFiles}
Lines changed: ${stats.lines} / ${currentConfig.maxLines}
Click to open Commit Buckets in the Source Control sidebar.`;

			if (showAlert && danger >= 1) {
				vscode.window.showWarningMessage(
					`Commit size exceeded! ${stats.files} files changed, ${stats.lines} lines. Consider committing or splitting your changes.`
				);
			}
		} catch {
			// ignore non-git repos or git errors
			statusBar.text = "🔘 Bloat: n/a";
			statusBar.tooltip = "commit watcher: not a Git repository?";
		} finally {
			isChecking = false;
		}
	}

	context.subscriptions.push(
		vscode.commands.registerCommand(`${CONFIG_ROOT}.checkNow`, () => {
			updateIndicator(true);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			`${CONFIG_ROOT}.partitionChanges`,
			async () => {
				try {
					await openPartitionPanel();
				} catch (err) {
					const message =
						err instanceof Error ? err.message : "Unknown error running partition panel";
					vscode.window.showErrorMessage(`Commit watcher: ${message}`);
				}
			}
		)
	);

	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(
			"commitWatcher.bucketView",
			bucketViewProvider
		)
	);

	const applyAutoCheckOnSave = () => {
		saveSubscription?.dispose();
		saveSubscription = undefined;

		if (currentConfig.autoCheckOnSave) {
			saveSubscription = vscode.workspace.onDidSaveTextDocument((doc) =>
				updateIndicator(false, doc.uri)
			);
			context.subscriptions.push(saveSubscription);
		}
	};

	const applyPolling = () => {
		pollDisposable?.dispose();
		pollDisposable = undefined;

		if (currentConfig.pollInterval > 0) {
			const handle = setInterval(
				() => updateIndicator(false),
				currentConfig.pollInterval * 1000
			);
			pollDisposable = { dispose: () => clearInterval(handle) };
			context.subscriptions.push(pollDisposable);
		}
	};

	applyAutoCheckOnSave();
	applyPolling();

	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration((event) => {
			if (!event.affectsConfiguration(CONFIG_ROOT)) { return; }
			currentConfig = loadConfig();
			applyAutoCheckOnSave();
			applyPolling();
			updateIndicator(false);
			bucketViewProvider.postData();
		})
	);

	updateIndicator(false);
}

export function deactivate() {
	// all cleanup handled by context.subscriptions
}
