import {
    CommandPermissionLevel,
    CustomCommand,
    CustomCommandParamType,
    EnchantmentTypes,
    ItemComponentTypes,
    ItemStack,
} from '@minecraft/server';
import { CommandEnumId, CommandId } from '../Meta';
import { ENCHANTMENT_IDS } from '../util/enchantmentIds';
import { ResolvedSelection } from '../core/Selection';
import { SlotHandle } from '../core/SlotHandle';
import { EnchantmentService } from '../item/EnchantmentService';
import { ItemEditorService } from '../item/ItemEditorService';
import { Result, attempt, fail } from '../util/Result';
import { idToName } from '../util/text';
import { CommandEnumDefinition } from './EditorCommand';
import { SelectionCommand } from './SelectionCommand';
import { numberArg, stringArg } from './args';
import { itemRef } from '../util/names';

const ALL = 'all';

export class EnchantCommand extends SelectionCommand {
    constructor() {
        super('EnchantCommand');
    }

    readonly definition: CustomCommand = {
        name: CommandId.Enchant,
        description:
            'Enchant the selected items. "all" adds everything compatible, level 0 removes.',
        permissionLevel: CommandPermissionLevel.GameDirectors,
        cheatsRequired: true,
        mandatoryParameters: [
            {
                name: CommandEnumId.Enchantment,
                type: CustomCommandParamType.Enum,
            },
        ],
        optionalParameters: [
            { name: 'level', type: CustomCommandParamType.Integer },
        ],
    };

    override enums(): readonly CommandEnumDefinition[] {
        return [
            {
                name: CommandEnumId.Enchantment,
                // Not EnchantmentTypes, registries can be empty at startup.
                values: [ALL, ...ENCHANTMENT_IDS],
            },
        ];
    }

    protected override undoLabel(args: readonly unknown[]): string {
        const name = stringArg(args, 0);
        if (name === ALL) {
            const level = numberArg(args, 1);
            return level === undefined
                ? 'maxing enchantments'
                : level === 0
                  ? 'removing all enchantments'
                  : `setting all enchantments to level ${level}`;
        }
        return name ? `enchanting with ${idToName(name)}` : 'enchanting';
    }

    protected override appliesTo(item: ItemStack): boolean {
        return EnchantmentService.supports(item);
    }

    protected runOn(
        _selection: ResolvedSelection,
        slot: SlotHandle,
        args: readonly unknown[]
    ): Result<string> {
        const enchantmentId = stringArg(args, 0);
        if (enchantmentId === undefined) {
            return fail('Needs an enchantment.');
        }

        const level = numberArg(args, 1);
        if (level !== undefined && level < 0) {
            return fail("Level can't be negative.");
        }

        if (enchantmentId === ALL) {
            return level === 0
                ? EnchantmentService.removeAll(slot)
                : EnchantmentService.fill(slot, level);
        }

        return this.apply(slot, enchantmentId, level ?? 1);
    }

    private apply(
        slot: SlotHandle,
        enchantmentId: string,
        level: number
    ): Result<string> {
        const current = ItemEditorService.require(slot);
        if (!current.ok) {
            return current;
        }

        const item = current.value;
        const enchantable = item.getComponent(ItemComponentTypes.Enchantable);
        if (!enchantable) {
            return fail(`${itemRef(item)} cannot be enchanted.`);
        }

        const name = idToName(enchantmentId);
        const itemName = itemRef(item);

        if (level === 0) {
            return attempt(() => {
                enchantable.removeEnchantment(enchantmentId);
                slot.write(item);
                return `Removed ${name} from ${itemName}.`;
            }, `Failed to remove ${name}`);
        }

        const type = EnchantmentTypes.get(enchantmentId);
        if (!type) {
            return fail(`"${enchantmentId}" is not an enchantment.`);
        }
        if (level > type.maxLevel) {
            return fail(`${name} only goes up to level ${type.maxLevel}.`);
        }

        return attempt(() => {
            // Otherwise re-running with a new level fails as a duplicate.
            enchantable.removeEnchantment(type);

            const enchantment = { type, level };
            if (!enchantable.canAddEnchantment(enchantment)) {
                throw new Error(
                    `it cannot be applied to ${itemRef(item)}, or conflicts with an enchantment already on it`
                );
            }

            enchantable.addEnchantment(enchantment);
            slot.write(item);
            return `Set ${name} ${level} on ${itemName}.`;
        }, `Failed to apply ${name}`);
    }
}
