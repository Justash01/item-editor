import { Entity, ItemStack, ItemType } from '@minecraft/server';
import { InventorySource } from '../core/InventorySource';
import { SlotHandle } from '../core/SlotHandle';
import { Result, attempt, fail, ok } from '../util/Result';
import { ItemData } from './ItemData';
import { JsonValue, parseRelaxedJson } from '../util/json';
import { itemWithData } from './StorageEntity';
import { ItemMutation, ItemProperty } from './ItemProperty';
import { itemRef } from '../util/names';

export interface PropertyEdit {
    readonly property: ItemProperty;
    readonly stage: (item: ItemStack) => Result<ItemMutation>;
}

export function textEdit(property: ItemProperty, raw: string): PropertyEdit {
    return { property, stage: (item) => property.parse(raw, item) };
}

export function jsonEdit(
    property: ItemProperty,
    value: JsonValue
): PropertyEdit {
    return { property, stage: (item) => property.fromJson(value, item) };
}

export class ItemEditorService {
    private constructor() {}

    static require(slot: SlotHandle): Result<ItemStack> {
        if (!slot.isValid) {
            return fail(`${slot.label} is no longer loaded.`);
        }
        const item = slot.read();
        return item ? ok(item) : fail(`${slot.label} is empty.`);
    }

    static setProperty(
        slot: SlotHandle,
        property: ItemProperty,
        raw: string
    ): Result<string> {
        return ItemEditorService.applyAll(slot, [textEdit(property, raw)]);
    }

    static applyAll(slot: SlotHandle, edits: PropertyEdit[]): Result<string> {
        const current = ItemEditorService.require(slot);
        if (!current.ok) {
            return current;
        }

        const item = current.value;
        const mutations: ItemMutation[] = [];
        const applied: string[] = [];

        for (const { property, stage } of edits) {
            if (!property.supports(item)) {
                return fail(
                    `${itemRef(item)} has no ${property.label.toLowerCase()} to edit.`
                );
            }

            const staged = stage(item);
            if (!staged.ok) {
                return fail(`${property.label}: ${staged.error}`);
            }

            mutations.push(staged.value);
            applied.push(property.label.toLowerCase());
        }

        return attempt(() => {
            for (const mutate of mutations) {
                mutate(item);
            }
            slot.write(item);
            return `Updated ${applied.join(', ')} on ${itemRef(item)} in ${slot.label}.`;
        }, 'Failed to write the item');
    }

    static applyDocument(
        slot: SlotHandle,
        document: JsonValue
    ): Result<string> {
        const current = ItemEditorService.require(slot);
        if (!current.ok) {
            return current;
        }

        const item = current.value;
        const planned = ItemData.planValue(document, item);
        if (!planned.ok) {
            return planned;
        }

        return attempt(() => {
            for (const mutate of planned.value) {
                mutate(item);
            }
            slot.write(item);
            return `Applied ${planned.value.length} field(s) to ${itemRef(item)} in ${slot.label}.`;
        }, 'Failed to write the item');
    }

    static applyData(slot: SlotHandle, text: string): Result<string> {
        const current = ItemEditorService.require(slot);
        if (!current.ok) {
            return current;
        }

        const item = current.value;
        const planned = ItemData.plan(text, item);
        if (!planned.ok) {
            return planned;
        }

        return attempt(() => {
            for (const mutate of planned.value) {
                mutate(item);
            }
            slot.write(item);
            return `Applied ${planned.value.length} field(s) to ${itemRef(item)} in ${slot.label}.`;
        }, 'Failed to write the item');
    }

    static resetProperty(
        slot: SlotHandle,
        property: ItemProperty
    ): Result<string> {
        const current = ItemEditorService.require(slot);
        if (!current.ok) {
            return current;
        }

        const item = current.value;
        if (!property.supports(item)) {
            return fail(
                `${itemRef(item)} has no ${property.label.toLowerCase()} to reset.`
            );
        }

        return attempt(() => {
            property.reset(item);
            slot.write(item);
            return `Reset ${property.label.toLowerCase()} on ${itemRef(item)} in ${slot.label}.`;
        }, 'Failed to write the item');
    }

    static resetItem(slot: SlotHandle): Result<string> {
        const current = ItemEditorService.require(slot);
        if (!current.ok) {
            return current;
        }

        const item = current.value;
        return attempt(() => {
            slot.write(new ItemStack(item.typeId, item.amount));
            return `Reset ${itemRef(item)} in ${slot.label} to its default data.`;
        }, 'Failed to reset the item');
    }

    static clearSlot(slot: SlotHandle): Result<string> {
        const current = ItemEditorService.require(slot);
        if (!current.ok) {
            return current;
        }

        const removed = itemRef(current.value);
        return attempt(() => {
            slot.write(undefined);
            return `Removed ${removed} from ${slot.label}.`;
        }, 'Failed to clear the slot');
    }

    static duplicate(
        source: InventorySource,
        slot: SlotHandle
    ): Result<string> {
        const current = ItemEditorService.require(slot);
        if (!current.ok) {
            return current;
        }

        const item = current.value;
        return attempt(() => {
            const leftover = source.addItem(item.clone());
            return leftover
                ? `Copied ${itemRef(item)}, but ${leftover.amount} did not fit and were dropped from the copy.`
                : `Copied ${itemRef(item)} into ${source.displayName}.`;
        }, 'Failed to duplicate the item');
    }

    static give(
        holder: Entity,
        source: InventorySource,
        itemType: ItemType,
        amount: number,
        data?: string
    ): Result<string> {
        const document = readGrantDocument(data);
        if (!document.ok) {
            return document;
        }
        const { fields, dataValue } = document.value;

        const built = attempt(
            () => {
                const plain = new ItemStack(itemType, amount);
                return dataValue === undefined
                    ? plain
                    : itemWithData(
                          holder.dimension,
                          holder.location,
                          itemType.id,
                          plain.amount,
                          dataValue
                      );
            },
            `Failed to create ${amount} x ${itemRef(itemType.id)}`
        );
        if (!built.ok) {
            return built;
        }

        const item = built.value;
        if (fields !== undefined) {
            const planned = ItemData.planValue(fields, item);
            if (!planned.ok) {
                return planned;
            }
            const applied = attempt(() => {
                for (const mutate of planned.value) {
                    mutate(item);
                }
            }, 'Failed to build the item');
            if (!applied.ok) {
                return applied;
            }
        }

        return attempt(() => {
            const leftover = source.addItem(item);
            if (!leftover) {
                return `Gave ${amount} x ${itemRef(itemType.id)} to ${source.displayName}.`;
            }
            holder.dimension.spawnItem(leftover, holder.location);
            return `Gave ${amount - leftover.amount} x ${itemRef(itemType.id)} to ${source.displayName}; ${leftover.amount} didn't fit and were dropped at their feet.`;
        }, 'Failed to give the item');
    }
}

const MAX_DATA_VALUE = 32767;

// datavalue has to be known before the item exists, so it's taken out here and
// never reaches the property list.
function readGrantDocument(
    text: string | undefined
): Result<{ fields?: JsonValue; dataValue?: number }> {
    if (text === undefined || text.trim().length === 0) {
        return ok({});
    }
    const parsed = parseRelaxedJson(text);
    if (!parsed.ok) {
        return fail(`Invalid item data: ${parsed.error}`);
    }
    const value = parsed.value;
    if (
        value === null ||
        typeof value !== 'object' ||
        Array.isArray(value) ||
        value.datavalue === undefined
    ) {
        return ok({ fields: value });
    }

    const { datavalue, ...rest } = value;
    if (
        typeof datavalue !== 'number' ||
        !Number.isInteger(datavalue) ||
        datavalue < 0 ||
        datavalue > MAX_DATA_VALUE
    ) {
        return fail(
            `Field "datavalue": expected a whole number from 0 to ${MAX_DATA_VALUE}.`
        );
    }
    return ok({
        fields: Object.keys(rest).length > 0 ? rest : undefined,
        dataValue: datavalue,
    });
}
