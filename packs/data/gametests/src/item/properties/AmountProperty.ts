import { ItemStack } from '@minecraft/server';
import { Result, fail, ok } from '../../util/Result';
import {
    BaseItemProperty,
    ItemMutation,
    ItemPropertyControl,
    ItemValueKind,
} from '../ItemProperty';
import { itemRef } from '../../util/names';

export class AmountProperty extends BaseItemProperty {
    readonly id = 'amount';
    readonly label = 'Amount';
    readonly description = 'Number of items in the stack.';
    readonly syntax = 'a whole number within the stack limit';
    readonly valueKind: ItemValueKind = 'number';

    override supports(item: ItemStack): boolean {
        return item.maxAmount > 1;
    }

    override isDefault(item: ItemStack): boolean {
        return item.amount <= 1;
    }

    control(item: ItemStack): ItemPropertyControl {
        return { kind: 'slider', min: 1, max: item.maxAmount, step: 1 };
    }

    toInput(item: ItemStack): string {
        return item.amount.toString();
    }

    format(item: ItemStack): string | undefined {
        return item.isStackable
            ? `${item.amount} / ${item.maxAmount}`
            : undefined;
    }

    parse(raw: string, item: ItemStack): Result<ItemMutation> {
        if (!/^\d+$/.test(raw.trim())) {
            return fail(`"${raw}" is not a whole number.`);
        }

        const amount = Number.parseInt(raw.trim(), 10);
        if (amount < 1 || amount > item.maxAmount) {
            return fail(
                `Amount must be between 1 and ${item.maxAmount} for ${itemRef(item)}.`
            );
        }

        return ok((target) => {
            target.amount = amount;
        });
    }

    reset(item: ItemStack): void {
        item.amount = 1;
    }
}
