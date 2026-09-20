import { ItemComponentTypes, ItemStack } from '@minecraft/server';
import { Result, fail, ok } from '../../util/Result';
import {
    BaseItemProperty,
    ItemMutation,
    ItemPropertyControl,
    ItemValueKind,
} from '../ItemProperty';
import { itemRef } from '../../util/names';

export class DamageProperty extends BaseItemProperty {
    readonly id = 'damage';
    readonly label = 'Damage';
    readonly description = 'Durability used up. 0 is undamaged.';
    readonly syntax = 'a whole number from 0 to the item maximum durability';
    readonly valueKind: ItemValueKind = 'number';

    override supports(item: ItemStack): boolean {
        return item.hasComponent(ItemComponentTypes.Durability);
    }

    override isDefault(item: ItemStack): boolean {
        const durability = item.getComponent(ItemComponentTypes.Durability);
        return (durability?.damage ?? 0) === 0;
    }

    control(item: ItemStack): ItemPropertyControl {
        const durability = item.getComponent(ItemComponentTypes.Durability);
        return {
            kind: 'slider',
            min: 0,
            max: durability?.maxDurability ?? 0,
            step: 1,
        };
    }

    toInput(item: ItemStack): string {
        return (
            item.getComponent(ItemComponentTypes.Durability)?.damage ?? 0
        ).toString();
    }

    format(item: ItemStack): string | undefined {
        const durability = item.getComponent(ItemComponentTypes.Durability);
        if (!durability) {
            return undefined;
        }
        const remaining = durability.maxDurability - durability.damage;
        return `${durability.damage} used, ${remaining} / ${durability.maxDurability} left`;
    }

    parse(raw: string, item: ItemStack): Result<ItemMutation> {
        const durability = item.getComponent(ItemComponentTypes.Durability);
        if (!durability) {
            return fail(`${itemRef(item)} has no durability.`);
        }

        if (!/^\d+$/.test(raw.trim())) {
            return fail(`"${raw}" is not a whole number.`);
        }

        const damage = Number.parseInt(raw.trim(), 10);
        if (damage > durability.maxDurability) {
            return fail(
                `Damage must be between 0 and ${durability.maxDurability} for ${itemRef(item)}.`
            );
        }

        return ok((target) => {
            const component = target.getComponent(
                ItemComponentTypes.Durability
            );
            if (component) {
                component.damage = damage;
            }
        });
    }

    reset(item: ItemStack): void {
        const durability = item.getComponent(ItemComponentTypes.Durability);
        if (durability) {
            durability.damage = 0;
        }
    }
}
