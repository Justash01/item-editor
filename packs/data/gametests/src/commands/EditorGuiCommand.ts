import {
    CommandPermissionLevel,
    CustomCommand,
    CustomCommandOrigin,
    CustomCommandParamType,
    CustomCommandResult,
    system,
} from '@minecraft/server';
import { CommandId } from '../Meta';
import { EditorSession } from '../ui/EditorSession';
import { CommandFeedback, EditorCommand } from './EditorCommand';
import { playersArg } from './args';

export class EditorGuiCommand extends EditorCommand {
    constructor() {
        super('EditorGuiCommand');
    }

    readonly definition: CustomCommand = {
        name: CommandId.Editor,
        description: 'Open the editor, optionally on another player.',
        permissionLevel: CommandPermissionLevel.GameDirectors,
        cheatsRequired: true,
        optionalParameters: [
            { name: 'target', type: CustomCommandParamType.PlayerSelector },
        ],
    };

    execute(
        origin: CustomCommandOrigin,
        args: readonly unknown[]
    ): CustomCommandResult | undefined {
        const viewer = CommandFeedback.viewer(origin);
        if (!viewer) {
            return this.failure('Run this as a player.');
        }

        const targets = playersArg(args, 0);
        if (args[0] !== undefined && targets.length === 0) {
            return this.failure('No players matched.');
        }

        const preselected = targets[0];

        // Chat is still open this tick, forms won't show until the next one.
        system.run(() => {
            if (viewer.isValid) {
                EditorSession.open(viewer, preselected);
            }
        });

        return undefined;
    }
}
