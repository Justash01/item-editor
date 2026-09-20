import {
    CommandPermissionLevel,
    CustomCommand,
    CustomCommandOrigin,
    CustomCommandParamType,
    CustomCommandResult,
} from '@minecraft/server';
import { CommandId } from '../Meta';
import { InventorySource } from '../core/InventorySource';
import { ItemEditorService } from '../item/ItemEditorService';
import { EditorCommand } from './EditorCommand';
import { itemTypeArg, numberArg, playersArg, stringArg } from './args';

export class GrantCommand extends EditorCommand {
    constructor() {
        super('GrantCommand');
    }

    readonly definition: CustomCommand = {
        name: CommandId.Grant,
        description: 'Give an item, optionally built from a data document.',
        permissionLevel: CommandPermissionLevel.GameDirectors,
        cheatsRequired: true,
        mandatoryParameters: [
            { name: 'target', type: CustomCommandParamType.PlayerSelector },
            { name: 'item', type: CustomCommandParamType.ItemType },
        ],
        optionalParameters: [
            { name: 'amount', type: CustomCommandParamType.Integer },
            { name: 'data', type: CustomCommandParamType.String },
        ],
    };

    execute(
        origin: CustomCommandOrigin,
        args: readonly unknown[]
    ): CustomCommandResult | undefined {
        const targets = playersArg(args, 0);
        if (targets.length === 0) {
            return this.failure('No players matched.');
        }

        const itemType = itemTypeArg(args, 1);
        if (!itemType) {
            return this.failure("That item doesn't exist.");
        }

        const amount = numberArg(args, 2) ?? 1;
        if (amount < 1) {
            return this.failure('Amount has to be 1 or more.');
        }

        const data = stringArg(args, 3);

        return this.defer(origin, () =>
            targets.map((target) => {
                const source = InventorySource.of(target);
                return source.ok
                    ? ItemEditorService.give(
                          source.value,
                          itemType,
                          amount,
                          data
                      )
                    : source;
            })
        );
    }
}
