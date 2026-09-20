import { ItemLockMode, ItemStack } from '@minecraft/server';
import { Result, ok } from '../../util/Result';
import { parseChoice } from '../../util/parse';
import {
    BaseItemProperty,
    ItemMutation,
    ItemPropertyControl,
    ItemValueKind,
} from '../ItemProperty';

const MODES: readonly ItemLockMode[] = [
    ItemLockMode.none,
    ItemLockMode.inventory,
    ItemLockMode.slot,
];

export class LockModeProperty extends BaseItemProperty {
    readonly id = 'lockmode';
    readonly label = 'Lock mode';
    readonly description = 'How firmly the item is stuck in place.';
    readonly syntax = MODES.join(', ');
    readonly valueKind: ItemValueKind = 'choice';

    override choices(): readonly string[] {
        return MODES;
    }

    control(): ItemPropertyControl {
        return { kind: 'dropdown', options: MODES };
    }

    toInput(item: ItemStack): string {
        return item.lockMode;
    }

    format(item: ItemStack): string | undefined {
        return item.lockMode === ItemLockMode.none ? undefined : item.lockMode;
    }

    parse(raw: string): Result<ItemMutation> {
        const parsed = parseChoice(raw, MODES);
        if (!parsed.ok) {
            return parsed;
        }

        return ok((item) => {
            item.lockMode = parsed.value;
        });
    }

    reset(item: ItemStack): void {
        item.lockMode = ItemLockMode.none;
    }
}
