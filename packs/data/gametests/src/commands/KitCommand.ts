import {
    CommandPermissionLevel,
    CustomCommand,
    CustomCommandOrigin,
    CustomCommandParamType,
    CustomCommandResult,
} from '@minecraft/server';
import { CommandEnumId, CommandId } from '../Meta';
import { InventorySource } from '../core/InventorySource';
import { KitStore } from '../item/KitStore';
import { Result, fail, ok } from '../util/Result';
import { accent, bulletList, heading } from '../util/text';
import {
    CommandEnumDefinition,
    CommandFeedback,
    EditorCommand,
} from './EditorCommand';
import { playersArg, stringArg } from './args';

const OPERATIONS = ['list', 'save', 'give', 'delete'] as const;

type Operation = (typeof OPERATIONS)[number];

export class KitCommand extends EditorCommand {
    constructor() {
        super('KitCommand');
    }

    readonly definition: CustomCommand = {
        name: CommandId.Kit,
        description: 'Save inventories as kits and hand them out.',
        permissionLevel: CommandPermissionLevel.GameDirectors,
        cheatsRequired: true,
        mandatoryParameters: [
            {
                name: CommandEnumId.KitOperation,
                type: CustomCommandParamType.Enum,
            },
        ],
        optionalParameters: [
            { name: 'name', type: CustomCommandParamType.String },
            { name: 'target', type: CustomCommandParamType.PlayerSelector },
        ],
    };

    override enums(): readonly CommandEnumDefinition[] {
        return [{ name: CommandEnumId.KitOperation, values: OPERATIONS }];
    }

    execute(
        origin: CustomCommandOrigin,
        args: readonly unknown[]
    ): CustomCommandResult | undefined {
        const operation = stringArg(args, 0) as Operation | undefined;
        if (!operation || !OPERATIONS.includes(operation)) {
            return this.failure(
                `Unknown operation. Try: ${OPERATIONS.join(', ')}.`
            );
        }

        const name = stringArg(args, 1);
        const targets = playersArg(args, 2);

        return this.defer(origin, () => {
            if (operation === 'list') {
                return this.list(origin);
            }

            if (name === undefined) {
                return fail(
                    `Needs a name: /${CommandId.Kit} ${operation} <name>.`
                );
            }
            if (operation === 'delete') {
                return KitStore.remove(name);
            }

            const viewer = CommandFeedback.viewer(origin);
            const chosen =
                targets.length > 0 ? targets : viewer ? [viewer] : [];
            if (chosen.length === 0) {
                return fail('No players matched.');
            }

            return chosen.map((player) => {
                const source = InventorySource.of(player);
                if (!source.ok) {
                    return source;
                }
                return operation === 'save'
                    ? KitStore.save(name, source.value)
                    : KitStore.give(name, source.value);
            });
        });
    }

    private list(origin: CustomCommandOrigin): Result<string> {
        const names = KitStore.names();
        if (names.length === 0) {
            return ok(
                `No kits saved yet. Run /${CommandId.Kit} save <name> to make one.`
            );
        }

        CommandFeedback.raw(
            origin,
            heading('Saved kits') +
                bulletList(
                    names.map(
                        (name) => `${accent(name)}: ${KitStore.describe(name)}`
                    )
                )
        );
        return ok(`Listed ${names.length} kit(s).`);
    }
}
