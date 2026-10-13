import { ItemComponentTypes, ItemStack } from '@minecraft/server';
import { Result, fail, ok } from '../../util/Result';
import {
    BaseItemProperty,
    ItemMutation,
    ItemPropertyControl,
    ItemValueKind,
} from '../ItemProperty';

// Write-only: it never shows up in an export or a copied document, it just
// takes damage off whatever the item has now.
export class RepairProperty extends BaseItemProperty {
    readonly id = 'repair';
    readonly label = 'Repair';
    readonly description =
        'Durability to give back, on top of what is left. Stops at fully repaired.';
    readonly syntax = 'a whole number of durability points';
    readonly valueKind: ItemValueKind = 'number';

    override supports(item: ItemStack): boolean {
        return item.hasComponent(ItemComponentTypes.Durability);
    }

    override isDefault(): boolean {
        return true;
    }

    control(item: ItemStack): ItemPropertyControl {
        const durability = item.getComponent(ItemComponentTypes.Durability);
        return {
            kind: 'slider',
            min: 0,
            max: durability?.damage ?? 0,
            step: 1,
        };
    }

    toInput(): string {
        return '0';
    }

    format(): string | undefined {
        return undefined;
    }

    parse(raw: string): Result<ItemMutation> {
        if (!/^\d+$/.test(raw.trim())) {
            return fail(`"${raw}" is not a whole number.`);
        }
        const amount = Number.parseInt(raw.trim(), 10);
        return ok((item) => {
            const durability = item.getComponent(ItemComponentTypes.Durability);
            if (durability) {
                durability.damage = Math.max(0, durability.damage - amount);
            }
        });
    }

    reset(): void {}
}
