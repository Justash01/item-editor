import { CustomCommandRegistry, StartupEvent, system } from '@minecraft/server';
import { Log } from '../util/Log';
import { describeError } from '../util/Result';
import { EditorCommand } from './EditorCommand';

const log = Log.get('CommandRegistry');

export class CommandRegistry {
    private constructor() {}

    static install(commands: readonly EditorCommand[]): void {
        system.beforeEvents.startup.subscribe((event: StartupEvent) => {
            const registry = event.customCommandRegistry;
            // Enums first, params can't reference an unregistered enum.
            CommandRegistry.registerEnums(registry, commands);
            CommandRegistry.registerCommands(registry, commands);
        });
    }

    private static registerEnums(
        registry: CustomCommandRegistry,
        commands: readonly EditorCommand[]
    ): void {
        const seen = new Set<string>();

        for (const command of commands) {
            for (const definition of command.enums()) {
                if (seen.has(definition.name)) {
                    continue;
                }
                seen.add(definition.name);

                try {
                    registry.registerEnum(definition.name, [
                        ...definition.values,
                    ]);
                } catch (error) {
                    log.error(
                        `Failed to register enum ${definition.name}: ${describeError(error)}`
                    );
                }
            }
        }
    }

    private static registerCommands(
        registry: CustomCommandRegistry,
        commands: readonly EditorCommand[]
    ): void {
        for (const command of commands) {
            const { definition } = command;
            try {
                registry.registerCommand(definition, (origin, ...args) =>
                    command.execute(origin, args)
                );
            } catch (error) {
                log.error(
                    `Failed to register /${definition.name}: ${describeError(error)}`
                );
            }
        }
    }
}
