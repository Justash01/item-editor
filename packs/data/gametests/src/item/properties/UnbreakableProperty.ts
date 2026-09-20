import { ItemComponentTypes, ItemStack } from '@minecraft/server';
import { Result, fail, ok } from '../../util/Result';
import { parseBoolean } from '../../util/parse';
import {
    BaseItemProperty,
    ItemMutation,
    ItemPropertyControl,
    ItemValueKind,
} from '../ItemProperty';
import { itemRef } from '../../util/names';

export class UnbreakableProperty extends BaseItemProperty {
    readonly id = 'unbreakable';
    readonly label = 'Unbreakable';
    readonly description = 'Stops the item wearing down.';
    readonly syntax = 'true or false';
    readonly valueKind: ItemValueKind = 'flag';

    override supports(item: ItemStack): boolean {
        return item.hasComponent(ItemComponentTypes.Durability);
    }

    control(): ItemPropertyControl {
        return { kind: 'toggle' };
    }

    toInput(item: ItemStack): string {
        return String(
            item.getComponent(ItemComponentTypes.Durability)?.unbreakable ??
                false
        );
    }

    format(item: ItemStack): string | undefined {
        const durability = item.getComponent(ItemComponentTypes.Durability);
        if (!durability || !durability.unbreakable) {
            return undefined;
        }
        return 'true';
    }

    parse(raw: string, item: ItemStack): Result<ItemMutation> {
        if (!this.supports(item)) {
            return fail(`${itemRef(item)} has no durability to protect.`);
        }

        const parsed = parseBoolean(raw);
        if (!parsed.ok) {
            return parsed;
        }

        return ok((target) => {
            const durability = target.getComponent(
                ItemComponentTypes.Durability
            );
            if (durability) {
                durability.unbreakable = parsed.value;
            }
        });
    }

    reset(item: ItemStack): void {
        const durability = item.getComponent(ItemComponentTypes.Durability);
        if (durability) {
            durability.unbreakable = false;
        }
    }
}
