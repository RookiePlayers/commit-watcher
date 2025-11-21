export const commands = {
	commandsList: ["commitWatcher.partitionChanges", "commitWatcher.checkNow"],
	getCommands: async () => commands.commandsList,
	executeCommand: async (_command: string) => undefined,
};

export const window = {
	showInformationMessage: async (_msg: string) => undefined,
};
