import { ItemStack, world } from '@minecraft/server';
import { namespaced } from '../Meta';
import { InventorySource } from '../core/InventorySource';
import { Result, attempt, fail, ok } from '../util/Result';
import { JsonObject, JsonValue, parseRelaxedJson } from '../util/json';
import { ItemData } from './ItemData';
import { itemRef } from '../util/names';

const PREFIX = `${namespaced('kit')}.`;

const MAX_ENTRIES = 54;

interface KitEntry {
    readonly item: string;
    readonly amount: number;
    readonly data: JsonObject;
}

export class KitStore {
    private constructor() {}

    static names(): string[] {
        return world
            .getDynamicPropertyIds()
            .filter((id) => id.startsWith(PREFIX))
            .map((id) => id.slice(PREFIX.length))
            .sort();
    }

    static has(name: string): boolean {
        return typeof world.getDynamicProperty(KitStore.key(name)) === 'string';
    }

    static save(name: string, source: InventorySource): Result<string> {
        const clean = KitStore.normalise(name);
        if (!clean.ok) {
            return clean;
        }

        const occupied = source.listOccupied();
        if (occupied.length === 0) {
            return fail(`${source.displayName} is carrying nothing to save.`);
        }
        if (occupied.length > MAX_ENTRIES) {
            return fail(
                `Too much for one kit: ${occupied.length} items, ${MAX_ENTRIES} is the limit.`
            );
        }

        const entries: KitEntry[] = [];
        for (const handle of occupied) {
            const item = handle.read();
            if (item) {
                entries.push({
                    item: item.typeId,
                    amount: item.amount,
                    data: ItemData.from(item),
                });
            }
        }

        return attempt(() => {
            world.setDynamicProperty(
                KitStore.key(clean.value),
                JSON.stringify(entries)
            );
            return `Saved ${entries.length} item(s) as kit "${clean.value}".`;
        }, `Failed to save kit "${clean.value}"`);
    }

    static give(name: string, source: InventorySource): Result<string> {
        const entries = KitStore.read(name);
        if (!entries.ok) {
            return entries;
        }

        let given = 0;
        let leftOut = 0;

        for (const entry of entries.value) {
            const built = KitStore.build(entry);
            if (!built.ok) {
                return built;
            }

            const leftover = source.addItem(built.value);
            if (leftover) {
                leftOut++;
            } else {
                given++;
            }
        }

        return ok(
            leftOut === 0
                ? `Gave ${given} item(s) from kit "${name}" to ${source.displayName}.`
                : `Gave ${given} item(s) from kit "${name}" to ${source.displayName}; ${leftOut} did not fit.`
        );
    }

    static remove(name: string): Result<string> {
        if (!KitStore.has(name)) {
            return fail(`There is no kit called "${name}".`);
        }

        return attempt(() => {
            world.setDynamicProperty(KitStore.key(name), undefined);
            return `Deleted kit "${name}".`;
        }, `Failed to delete kit "${name}"`);
    }

    static describe(name: string): string {
        const entries = KitStore.read(name);
        if (!entries.ok) {
            return 'unreadable';
        }
        return `${entries.value.length} item(s)`;
    }

    private static build(entry: KitEntry): Result<ItemStack> {
        const created = attempt(
            () => new ItemStack(entry.item, entry.amount),
            `Failed to recreate ${itemRef(entry.item)}`
        );
        if (!created.ok) {
            return created;
        }

        const item = created.value;
        const planned = ItemData.planValue(entry.data, item);
        if (!planned.ok) {
            return fail(`${itemRef(entry.item)}: ${planned.error}`);
        }

        return attempt(
            () => {
                for (const mutate of planned.value) {
                    mutate(item);
                }
                return item;
            },
            `Failed to rebuild ${itemRef(entry.item)}`
        );
    }

    private static read(name: string): Result<KitEntry[]> {
        const stored = world.getDynamicProperty(KitStore.key(name));
        if (typeof stored !== 'string') {
            return fail(
                `No kit called "${name}". Run "list" to see what's saved.`
            );
        }

        const parsed = parseRelaxedJson(stored);
        if (!parsed.ok || !Array.isArray(parsed.value)) {
            return fail(`Kit "${name}" is unreadable. Save it again.`);
        }

        const entries: KitEntry[] = [];
        for (const raw of parsed.value) {
            const entry = KitStore.toEntry(raw);
            if (!entry.ok) {
                return fail(`Kit "${name}" is unreadable: ${entry.error}`);
            }
            entries.push(entry.value);
        }

        return ok(entries);
    }

    private static toEntry(raw: JsonValue): Result<KitEntry> {
        if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
            return fail('an entry was not an object.');
        }

        const { item, amount, data } = raw;
        if (typeof item !== 'string') {
            return fail('an entry was missing its item identifier.');
        }

        return ok({
            item,
            amount: typeof amount === 'number' ? amount : 1,
            data:
                data !== null &&
                typeof data === 'object' &&
                !Array.isArray(data)
                    ? data
                    : {},
        });
    }

    private static key(name: string): string {
        return PREFIX + KitStore.clean(name);
    }

    private static clean(name: string): string {
        return name.trim().replace(/\s+/g, ' ').toLowerCase();
    }

    private static normalise(name: string): Result<string> {
        const clean = KitStore.clean(name);

        if (clean.length === 0) {
            return fail('Needs a name.');
        }
        if (!/^[a-z0-9 _-]{1,32}$/.test(clean)) {
            return fail(
                `"${name}" won't work as a kit name. Letters, digits, spaces, - and _, up to 32.`
            );
        }

        return ok(clean);
    }
}
