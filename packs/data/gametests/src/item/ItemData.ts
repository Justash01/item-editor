import { ItemStack } from '@minecraft/server';
import { Result, fail, ok } from '../util/Result';
import {
    JsonObject,
    JsonValue,
    describeJsonType,
    parseRelaxedJson,
    stringifyRelaxedJson,
} from '../util/json';
import { ItemMutation } from './ItemProperty';
import { ItemPropertyRegistry } from './ItemPropertyRegistry';
import { itemRef } from '../util/names';

export class ItemData {
    private constructor() {}

    static from(item: ItemStack): JsonObject {
        const document: JsonObject = {};

        for (const property of ItemPropertyRegistry.supportedBy(item)) {
            const value = property.toJson(item);
            if (value !== undefined) {
                document[property.id] = value;
            }
        }

        return document;
    }

    static stringify(item: ItemStack): string {
        return stringifyRelaxedJson(ItemData.from(item));
    }

    // The document goes inside double quotes, so any in the text need a
    // backslash, and so does the backslash itself.
    static grantCommand(item: ItemStack): string {
        const base = `/jstash:grant @s ${item.typeId} ${item.amount}`;
        const document = ItemData.from(item);
        delete document.amount;
        if (Object.keys(document).length === 0) {
            return base;
        }
        const quoted = stringifyRelaxedJson(document)
            .replace(/\\/g, '\\\\')
            .replace(/"/g, '\\"');
        return `${base} "${quoted}"`;
    }

    static plan(text: string, item: ItemStack): Result<ItemMutation[]> {
        const parsed = parseRelaxedJson(text);
        if (!parsed.ok) {
            return fail(`Invalid item data: ${parsed.error}`);
        }
        return ItemData.planValue(parsed.value, item);
    }

    static planValue(
        document: JsonValue,
        item: ItemStack
    ): Result<ItemMutation[]> {
        if (
            document === null ||
            typeof document !== 'object' ||
            Array.isArray(document)
        ) {
            return fail(
                `Item data must be an object such as {name:'Sword'}, got ${describeJsonType(document)}.`
            );
        }

        const mutations: ItemMutation[] = [];
        // Registry order, not document order: lore has to land before stats and
        // abilities, or it wipes the lines they write.
        const order = ItemPropertyRegistry.ids();
        const rank = (key: string): number => {
            const at = order.indexOf(key.trim().toLowerCase());
            return at < 0 ? -1 : at;
        };
        const entries = Object.entries(document).sort(
            ([a], [b]) => rank(a) - rank(b)
        );

        for (const [key, value] of entries) {
            if (key === 'datavalue') {
                return fail('datavalue only works with /jstash:grant.');
            }
            const property = ItemPropertyRegistry.get(key);
            if (!property.ok) {
                return fail(
                    `Unknown item data field "${key}". Valid fields: ${ItemPropertyRegistry.ids().join(', ')}.`
                );
            }

            if (!property.value.supports(item)) {
                return fail(
                    `${itemRef(item)} has no ${property.value.label.toLowerCase()} to set.`
                );
            }

            const staged = property.value.fromJson(value, item);
            if (!staged.ok) {
                return fail(`Field "${key}": ${staged.error}`);
            }

            mutations.push(staged.value);
        }

        return ok(mutations);
    }
}
