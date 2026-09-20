import {
    CommandPermissionLevel,
    CustomCommand,
    CustomCommandParamType,
    ItemStack,
} from '@minecraft/server';
import { CommandEnumId, CommandId } from '../Meta';
import { ResolvedSelection } from '../core/Selection';
import { SlotHandle } from '../core/SlotHandle';
import { ItemEditorService } from '../item/ItemEditorService';
import { ItemPropertyRegistry } from '../item/ItemPropertyRegistry';
import { Result, fail } from '../util/Result';
import { CommandEnumDefinition } from './EditorCommand';
import { SelectionCommand } from './SelectionCommand';
import { stringArg } from './args';

export class SetCommand extends SelectionCommand {
    constructor() {
        super('SetCommand');
    }

    readonly definition: CustomCommand = {
        name: CommandId.Set,
        description: 'Set one property on the selected item.',
        permissionLevel: CommandPermissionLevel.GameDirectors,
        cheatsRequired: true,
        mandatoryParameters: [
            { name: CommandEnumId.Property, type: CustomCommandParamType.Enum },
        ],
        optionalParameters: [
            { name: 'value', type: CustomCommandParamType.String },
        ],
    };

    override enums(): readonly CommandEnumDefinition[] {
        return [
            {
                name: CommandEnumId.Property,
                values: ItemPropertyRegistry.ids(),
            },
        ];
    }

    protected override undoLabel(args: readonly unknown[]): string {
        return `setting ${stringArg(args, 0) ?? 'a property'}`;
    }

    protected override appliesTo(
        item: ItemStack,
        args: readonly unknown[]
    ): boolean {
        const property = ItemPropertyRegistry.get(stringArg(args, 0) ?? '');
        return !property.ok || property.value.supports(item);
    }

    protected runOn(
        _selection: ResolvedSelection,
        slot: SlotHandle,
        args: readonly unknown[]
    ): Result<string> {
        const propertyId = stringArg(args, 0);
        if (propertyId === undefined) {
            return fail(
                `Pick a property: ${ItemPropertyRegistry.ids().join(', ')}.`
            );
        }

        const property = ItemPropertyRegistry.get(propertyId);
        if (!property.ok) {
            return property;
        }

        const value = stringArg(args, 1);
        if (value === undefined) {
            return ItemEditorService.resetProperty(slot, property.value);
        }

        return ItemEditorService.setProperty(slot, property.value, value);
    }
}
