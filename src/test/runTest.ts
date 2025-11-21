import * as path from "path";
import { runTests } from "@vscode/test-electron";

async function main() {
	const workspace = process.cwd();
	const extensionDevelopmentPath = workspace;
	const extensionTestsPath = path.resolve(workspace, "./out/test/suite/index");

	try {
		await runTests({
			extensionDevelopmentPath,
			extensionTestsPath,
		});
	} catch (err) {
		console.error("Failed to run tests", err);
		process.exit(1);
	}
}

main();
