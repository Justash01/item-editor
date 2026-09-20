import { ItemStack } from '@minecraft/server';
import { Result, ok } from '../../util/Result';
import { parseBoolean } from '../../util/parse';
import {
    BaseItemProperty,
    ItemMutation,
    ItemPropertyControl,
    ItemValueKind,
} from '../ItemProperty';

export class KeepOnDeathProperty extends BaseItemProperty {
    readonly id = 'keepondeath';
    readonly label = 'Keep on death';
    readonly description =
        'Keeps the item in the inventory when the holder dies.';
    readonly syntax = 'true or false';
    readonly valueKind: ItemValueKind = 'flag';

    control(): ItemPropertyControl {
        return { kind: 'toggle' };
    }

    toInput(item: ItemStack): string {
        return String(item.keepOnDeath);
    }

    format(item: ItemStack): string | undefined {
        return item.keepOnDeath ? 'true' : undefined;
    }

    parse(raw: string): Result<ItemMutation> {
        const parsed = parseBoolean(raw);
        if (!parsed.ok) {
            return parsed;
        }

        return ok((item) => {
            item.keepOnDeath = parsed.value;
        });
    }

    reset(item: ItemStack): void {
        item.keepOnDeath = false;
    }
}
