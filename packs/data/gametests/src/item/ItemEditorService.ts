import { ItemStack, ItemType } from '@minecraft/server';
import { InventorySource } from '../core/InventorySource';
import { SlotHandle } from '../core/SlotHandle';
import { Result, attempt, fail, ok } from '../util/Result';
import { ItemData } from './ItemData';
import { JsonValue } from '../util/json';
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
        source: InventorySource,
        itemType: ItemType,
        amount: number,
        data?: string
    ): Result<string> {
        const built = attempt(
            () => new ItemStack(itemType, amount),
            `Failed to create ${amount} x ${itemRef(itemType.id)}`
        );
        if (!built.ok) {
            return built;
        }

        const item = built.value;
        if (data !== undefined && data.trim().length > 0) {
            const planned = ItemData.plan(data, item);
            if (!planned.ok) {
                return planned;
            }
            for (const mutate of planned.value) {
                mutate(item);
            }
        }

        return attempt(() => {
            const leftover = source.addItem(item);
            return leftover
                ? `Gave ${amount - leftover.amount} x ${itemRef(itemType.id)} to ${source.displayName}; ${leftover.amount} did not fit.`
                : `Gave ${amount} x ${itemRef(itemType.id)} to ${source.displayName}.`;
        }, 'Failed to give the item');
    }
}
