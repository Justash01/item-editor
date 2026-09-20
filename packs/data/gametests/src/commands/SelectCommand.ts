import {
    CommandPermissionLevel,
    CustomCommand,
    CustomCommandOrigin,
    CustomCommandParamType,
    CustomCommandResult,
    Entity,
    Player,
} from '@minecraft/server';
import { CommandEnumId, CommandId } from '../Meta';
import { InventorySource } from '../core/InventorySource';
import { Selection } from '../core/Selection';
import { SLOT_ENUM_VALUES, slotGroupFromAlias } from '../core/slotReferences';
import { Result, ok } from '../util/Result';
import {
    CommandEnumDefinition,
    CommandFeedback,
    EditorCommand,
} from './EditorCommand';
import { entitiesArg, stringArg } from './args';

export class SelectCommand extends EditorCommand {
    constructor() {
        super('SelectCommand');
    }

    readonly definition: CustomCommand = {
        name: CommandId.Select,
        description: 'Pick the item or group the editing commands work on.',
        permissionLevel: CommandPermissionLevel.GameDirectors,
        cheatsRequired: true,
        optionalParameters: [
            { name: 'target', type: CustomCommandParamType.EntitySelector },
            { name: CommandEnumId.Slot, type: CustomCommandParamType.Enum },
        ],
    };

    override enums(): readonly CommandEnumDefinition[] {
        return [{ name: CommandEnumId.Slot, values: SLOT_ENUM_VALUES }];
    }

    execute(
        origin: CustomCommandOrigin,
        args: readonly unknown[]
    ): CustomCommandResult | undefined {
        const viewer = CommandFeedback.viewer(origin);
        if (!viewer) {
            return this.failure('Only players have a selection.');
        }

        const targets = entitiesArg(args, 0);
        if (args[0] !== undefined && targets.length === 0) {
            return this.failure('Nothing matched.');
        }

        const slotReference = stringArg(args, 1);

        return this.defer(origin, () => {
            const target = targets[0] ?? viewer;
            const extra = targets.length > 1 ? targets.length - 1 : 0;

            const chosen = this.choose(
                target,
                slotReference,
                viewer,
                args[0] !== undefined
            );
            if (!chosen.ok) {
                return chosen;
            }

            return ok(
                extra === 0
                    ? chosen.value
                    : `${chosen.value} (${extra} other match(es) ignored)`
            );
        });
    }

    private choose(
        target: Entity,
        slotReference: string | undefined,
        viewer: Player,
        explicitTarget: boolean
    ): Result<string> {
        if (
            !explicitTarget &&
            slotReference === undefined &&
            Selection.has(viewer)
        ) {
            return SelectCommand.report(viewer);
        }

        const source = InventorySource.of(target);
        if (!source.ok) {
            return source;
        }

        if (slotReference === undefined) {
            const slot = source.value.defaultSlot();
            if (!slot.ok) {
                return slot;
            }
            Selection.set(viewer, target, slot.value.reference);
            return SelectCommand.report(viewer);
        }

        // Groups are stored by name and re-expanded on every command.
        const group = slotGroupFromAlias(slotReference);
        const slots = source.value.resolveMany(slotReference);
        if (!slots.ok) {
            return slots;
        }

        Selection.set(viewer, target, group ?? slots.value[0]!.reference);
        return SelectCommand.report(viewer);
    }

    private static report(viewer: Player): Result<string> {
        const resolved = Selection.resolve(viewer);
        return resolved.ok
            ? ok(`Editing ${Selection.describe(resolved.value)}`)
            : resolved;
    }
}
