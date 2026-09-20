import {
    BlockTypes,
    ItemComponentTypes,
    ItemStack,
    Player,
} from '@minecraft/server';
import { SlotHandle } from '../core/SlotHandle';
import { accent, bulletList, field, heading, idToName } from '../util/text';
import { ItemPropertyRegistry } from './ItemPropertyRegistry';
import { itemRef } from '../util/names';

export class ItemInspector {
    private constructor() {}

    static describe(item: ItemStack, slot: SlotHandle, owner: string): string {
        const lines: string[] = [
            heading(`${itemRef(item)} (${owner}, ${slot.label})`),
            field('Identifier', accent(item.typeId)),
            field('Slot reference', accent(slot.reference)),
        ];

        ItemInspector.appendProperties(item, lines);
        ItemInspector.appendComponents(item, lines);
        ItemInspector.appendMetadata(item, lines);

        return lines.join('\n');
    }

    static send(
        viewer: Player,
        item: ItemStack,
        slot: SlotHandle,
        owner: string
    ): void {
        viewer.sendMessage(ItemInspector.describe(item, slot, owner));
    }

    private static appendProperties(item: ItemStack, lines: string[]): void {
        for (const property of ItemPropertyRegistry.supportedBy(item)) {
            const value = property.format(item);
            if (value === undefined) {
                continue;
            }
            // Color codes reset after a line break, multi-line values color
            // each line themselves.
            const isMultiline = value.indexOf('\n') !== -1;
            lines.push(
                field(property.label, isMultiline ? value : accent(value))
            );
        }
    }

    private static appendComponents(item: ItemStack, lines: string[]): void {
        const food = item.getComponent(ItemComponentTypes.Food);
        if (food) {
            lines.push(
                field(
                    'Food',
                    `${accent(food.nutrition)} nutrition, saturation modifier ${accent(food.saturationModifier)}${food.canAlwaysEat ? ', always edible' : ''}`
                )
            );
        }

        const cooldown = item.getComponent(ItemComponentTypes.Cooldown);
        if (cooldown && cooldown.cooldownTicks > 0) {
            lines.push(
                field(
                    'Cooldown',
                    `${accent(cooldown.cooldownTicks)} ticks in category ${accent(cooldown.cooldownCategory)}`
                )
            );
        }

        const potion = item.getComponent(ItemComponentTypes.Potion);
        if (potion) {
            lines.push(
                field(
                    'Potion',
                    `${accent(idToName(potion.potionEffectType.id))} via ${accent(String(potion.potionDeliveryType))}`
                )
            );
        }

        const compostable = item.getComponent(ItemComponentTypes.Compostable);
        if (compostable) {
            lines.push(
                field(
                    'Compostable',
                    `${accent(compostable.compostingChance)}% chance`
                )
            );
        }

        const book = item.getComponent(ItemComponentTypes.Book);
        if (book) {
            const signature = book.isSigned
                ? `"${book.title ?? ''}" by ${book.author ?? 'unknown'}`
                : 'unsigned';
            lines.push(
                field('Book', `${accent(book.pageCount)} pages, ${signature}`)
            );
        }

        const inventory = item.getComponent(ItemComponentTypes.Inventory);
        if (inventory) {
            const container = inventory.container;
            lines.push(
                field(
                    'Container',
                    `${accent(container.size - container.emptySlotsCount)} of ${accent(container.size)} slots used`
                )
            );
        }
    }

    private static appendMetadata(item: ItemStack, lines: string[]): void {
        lines.push(
            field(
                'Stacking',
                item.isStackable
                    ? `stacks to ${accent(item.maxAmount)}`
                    : accent('not stackable')
            )
        );

        if (BlockTypes.get(item.typeId)) {
            lines.push(field('Placeable', accent('yes, this item is a block')));
        }

        const tags = item.getTags();
        if (tags.length > 0) {
            lines.push(field('Tags', accent(tags.join(', '))));
        }

        const dynamicPropertyIds = item.getDynamicPropertyIds();
        if (dynamicPropertyIds.length > 0) {
            const entries = dynamicPropertyIds.map(
                (id) => `${id} = ${accent(formatDynamicProperty(item, id))}`
            );
            lines.push(field('Dynamic properties', bulletList(entries)));
        }
    }
}

function formatDynamicProperty(item: ItemStack, id: string): string {
    const value = item.getDynamicProperty(id);
    if (value !== null && typeof value === 'object') {
        return `${value.x}, ${value.y}, ${value.z}`;
    }
    return String(value);
}
