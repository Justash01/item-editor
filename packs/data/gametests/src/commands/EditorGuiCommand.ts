import {
    CommandPermissionLevel,
    CustomCommand,
    CustomCommandOrigin,
    CustomCommandParamType,
    CustomCommandResult,
    system,
} from '@minecraft/server';
import { CommandEnumId, CommandId } from '../Meta';
import { SLOT_ENUM_VALUES } from '../core/slotReferences';
import { EDITOR_PANELS, EditorPanel, EditorSession } from '../ui/EditorSession';
import {
    CommandEnumDefinition,
    CommandFeedback,
    EditorCommand,
} from './EditorCommand';
import { playersArg, stringArg } from './args';

export class EditorGuiCommand extends EditorCommand {
    constructor() {
        super('EditorGuiCommand');
    }

    readonly definition: CustomCommand = {
        name: CommandId.Editor,
        description:
            "Open the editor, a player's inventory, or one panel for one item.",
        permissionLevel: CommandPermissionLevel.GameDirectors,
        cheatsRequired: true,
        optionalParameters: [
            { name: 'target', type: CustomCommandParamType.PlayerSelector },
            { name: CommandEnumId.Slot, type: CustomCommandParamType.Enum },
            { name: CommandEnumId.Panel, type: CustomCommandParamType.Enum },
        ],
    };

    override enums(): readonly CommandEnumDefinition[] {
        return [
            { name: CommandEnumId.Slot, values: SLOT_ENUM_VALUES },
            { name: CommandEnumId.Panel, values: EDITOR_PANELS },
        ];
    }

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
        const owner = targets[0];
        const slot = stringArg(args, 1);
        const panel = stringArg(args, 2);

        // Chat is still open this tick, forms won't show until the next one.
        system.run(() => {
            if (!viewer.isValid) {
                return;
            }
            if (slot === undefined) {
                EditorSession.open(viewer, owner);
                return;
            }
            const opened = EditorSession.openPanel(
                viewer,
                (panel ?? 'item') as EditorPanel,
                owner ?? viewer,
                slot
            );
            if (!opened.ok) {
                CommandFeedback.error(origin, opened.error);
            }
        });

        return undefined;
    }
}
