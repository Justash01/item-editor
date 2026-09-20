import { ItemStack } from '@minecraft/server';
import { Result, ok } from '../../util/Result';
import {
    BaseItemProperty,
    ItemMutation,
    ItemPropertyControl,
    ItemValueKind,
} from '../ItemProperty';

export class NameProperty extends BaseItemProperty {
    readonly id = 'name';
    readonly label = 'Name';
    readonly description = 'Custom display name. Supports § formatting codes.';
    readonly syntax = 'any text, or empty to clear the name';
    readonly valueKind: ItemValueKind = 'text';

    control(): ItemPropertyControl {
        return {
            kind: 'text',
            placeholder: 'Leave empty for the default name',
        };
    }

    toInput(item: ItemStack): string {
        return item.nameTag ?? '';
    }

    format(item: ItemStack): string | undefined {
        return item.nameTag;
    }

    parse(raw: string): Result<ItemMutation> {
        const name = raw.length === 0 ? undefined : raw;
        return ok((item) => {
            item.nameTag = name;
        });
    }

    reset(item: ItemStack): void {
        item.nameTag = undefined;
    }
}
