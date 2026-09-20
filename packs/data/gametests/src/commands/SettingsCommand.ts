import {
    CommandPermissionLevel,
    CustomCommand,
    CustomCommandOrigin,
    CustomCommandResult,
    system,
} from '@minecraft/server';
import { CommandId } from '../Meta';
import { SettingsForm } from '../ui/SettingsForm';
import { CommandFeedback, EditorCommand } from './EditorCommand';

export class SettingsCommand extends EditorCommand {
    constructor() {
        super('SettingsCommand');
    }

    readonly definition: CustomCommand = {
        name: CommandId.Settings,
        description: 'Open the settings.',
        permissionLevel: CommandPermissionLevel.GameDirectors,
        cheatsRequired: true,
    };

    execute(origin: CustomCommandOrigin): CustomCommandResult | undefined {
        const viewer = CommandFeedback.viewer(origin);
        if (!viewer) {
            return this.failure('Run this as a player.');
        }

        system.run(() => {
            if (viewer.isValid) {
                SettingsForm.open(viewer).catch((error: unknown) =>
                    this.log.error(error)
                );
            }
        });

        return undefined;
    }
}
