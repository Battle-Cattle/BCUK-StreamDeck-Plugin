import { toAdvancedCommands, type AdvancedCommand } from "../advancedCommands";
import { InspectorCatalog } from "../inspectorCatalog";

/**
 * Builds the dropdown catalog shared in shape by Trigger Command and Toggle Command (each action
 * keeps its own instance, like every other action).
 * @returns A new catalog that fetches `/advanced-commands` and fills the inspector's `commands` list.
 */
export function createAdvancedCommandCatalog(): InspectorCatalog<AdvancedCommand> {
	return new InspectorCatalog<AdvancedCommand>({
		label: "advanced commands",
		path: "/advanced-commands",
		parse: (body) => (Array.isArray(body.commands) ? toAdvancedCommands(body.commands) : null),
		key: (command) => String(command.id),
		loadedEvent: "commandsLoaded",
		errorEvent: "commandsError",
		listKey: "commands",
	});
}
