import { ItemComponentTypes, ItemStack } from '@minecraft/server';
import { idToName, levelText } from '../util/text';
import { itemRef } from '../util/names';
import { readAbilities } from '../abilities/Ability';
import { visibleLore } from '../abilities/storage';

export class ItemSummary {
    private constructor(
        readonly title: string,
        readonly properties: string,
        readonly lore: string,
        readonly enchantments: string,
        readonly canDestroy: string,
        readonly canPlaceOn: string,
        readonly abilities: string
    ) {}

    static of(item: ItemStack): ItemSummary {
        return new ItemSummary(
            item.nameTag ?? itemRef(item),
            describeProperties(item),
            describeLore(item),
            describeEnchantments(item),
            describeBlockList(item.getCanDestroy()),
            describeBlockList(item.getCanPlaceOn()),
            describeAbilities(item)
        );
    }
}

function describeProperties(item: ItemStack): string {
    const parts: string[] = [];

    if (item.nameTag) {
        parts.push('renamed');
    }
    if (item.isStackable) {
        parts.push(`${item.amount} of ${item.maxAmount}`);
    }

    const durability = item.getComponent(ItemComponentTypes.Durability);
    if (durability) {
        parts.push(
            durability.unbreakable
                ? 'unbreakable'
                : `${durability.maxDurability - durability.damage} durability`
        );
    }

    return parts.length > 0 ? parts.join(', ') : 'Name, flags, and more';
}

function describeLore(item: ItemStack): string {
    const lore = visibleLore(item);
    if (lore.length === 0) {
        return 'No lines yet';
    }
    return `${lore.length} line${lore.length === 1 ? '' : 's'}`;
}

function describeBlockList(blocks: string[]): string {
    if (blocks.length === 0) {
        return 'No blocks yet';
    }
    return `${blocks.length} block${blocks.length === 1 ? '' : 's'}`;
}

function describeAbilities(item: ItemStack): string {
    const count = readAbilities(item).length;
    if (count === 0) {
        return 'None yet';
    }
    return `${count} ${count === 1 ? 'ability' : 'abilities'}`;
}

function describeEnchantments(item: ItemStack): string {
    const enchantments =
        item.getComponent(ItemComponentTypes.Enchantable)?.getEnchantments() ??
        [];

    if (enchantments.length === 0) {
        return 'None applied';
    }
    if (enchantments.length <= 2) {
        return enchantments
            .map(
                (entry) =>
                    `${idToName(entry.type.id)} ${levelText(entry.level)}`
            )
            .join(', ');
    }
    return `${enchantments.length} applied`;
}
