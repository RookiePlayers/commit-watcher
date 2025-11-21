import * as assert from "assert";
import * as vscode from "vscode";

suite("Commit Watcher", () => {
	test("commands are registered and extension activates", async () => {
		const cmds = await vscode.commands.getCommands(true);
		assert.ok(cmds.includes("commitWatcher.partitionChanges"), "partitionChanges command missing");
		assert.ok(cmds.includes("commitWatcher.checkNow"), "checkNow command missing");

		// Trigger activation
		await vscode.commands.executeCommand("commitWatcher.checkNow").then(
			() => assert.ok(true),
			(err) => assert.fail(`Activation failed: ${err}`)
		);
	});
});
