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

        for (const [key, value] of Object.entries(document)) {
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
