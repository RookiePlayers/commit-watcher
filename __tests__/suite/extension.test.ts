import { describe, it, expect } from "@jest/globals";
import * as vscode from "vscode";

describe("Commit Watcher", () => {
	it("commands are registered and extension activates", async () => {
		const cmds = await vscode.commands.getCommands(true);
		expect(cmds).toContain("commitWatcher.partitionChanges");
		expect(cmds).toContain("commitWatcher.checkNow");

		// Trigger activation
		await expect(vscode.commands.executeCommand("commitWatcher.checkNow")).resolves.toBeUndefined();
	});
});
