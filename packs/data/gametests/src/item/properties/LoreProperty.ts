import { ItemStack } from '@minecraft/server';
import { Result, fail, ok } from '../../util/Result';
import { JsonValue, describeJsonType } from '../../util/json';
import { bulletList } from '../../util/text';
import {
    BaseItemProperty,
    ItemMutation,
    ItemPropertyControl,
    ItemValueKind,
} from '../ItemProperty';

// <b> is the old separator, still accepted.
const LINE_BREAK = /\s*(?:\||<b>)\s*/;

export class LoreProperty extends BaseItemProperty {
    readonly id = 'lore';
    readonly label = 'Lore';
    readonly description = 'The lines under the item name.';
    readonly syntax = 'lines separated by | , or empty to clear the lore';
    readonly valueKind: ItemValueKind = 'composite';

    control(): ItemPropertyControl {
        return { kind: 'text', placeholder: 'First line | Second line' };
    }

    toInput(item: ItemStack): string {
        return item.getLore().join(' | ');
    }

    format(item: ItemStack): string | undefined {
        const lore = item.getLore();
        return lore.length > 0 ? bulletList(lore) : undefined;
    }

    override toJson(item: ItemStack): JsonValue | undefined {
        const lore = item.getLore();
        return lore.length > 0 ? lore : undefined;
    }

    override fromJson(value: JsonValue): Result<ItemMutation> {
        if (typeof value === 'string') {
            return this.parse(value);
        }
        if (!Array.isArray(value)) {
            return fail(
                `expected a list of lines, got ${describeJsonType(value)}.`
            );
        }

        const lines: string[] = [];
        for (const line of value) {
            if (typeof line !== 'string') {
                return fail(
                    `every lore line must be text, got ${describeJsonType(line)}.`
                );
            }
            lines.push(line);
        }

        return ok((target) => {
            target.setLore(lines);
        });
    }

    parse(raw: string): Result<ItemMutation> {
        const lines = raw
            .split(LINE_BREAK)
            .map((line) => line.trim())
            .filter((line) => line.length > 0);

        return ok((item) => {
            item.setLore(lines);
        });
    }

    reset(item: ItemStack): void {
        item.setLore([]);
    }
}
