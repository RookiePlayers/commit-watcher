/** Jest config in JS to avoid ts-node requirement when parsing. */
/** @type {import('jest').Config} */
module.exports = {
	preset: "ts-jest",
	testEnvironment: "node",
	roots: ["<rootDir>/__tests__"],
	moduleNameMapper: {
		"^vscode$": "<rootDir>/__tests__/mocks/vscode.ts",
	},
	setupFilesAfterEnv: [],
	testPathIgnorePatterns: [
		"<rootDir>/__tests__/mocks/",
		"<rootDir>/__tests__/runTest.ts",
		"<rootDir>/__tests__/runTest.js"
	],
	clearMocks: true,
	resetMocks: true,
	restoreMocks: true,
	testMatch: ["**/__tests__/**/*.test.ts", "**/__tests__/**/**.test.ts"],
};
