import {
    Container,
    Entity,
    EntityComponentTypes,
    ItemStack,
    StructureSaveMode,
    Vector3,
    world,
} from '@minecraft/server';
import { namespaced } from '../Meta';
import { InventorySource } from '../core/InventorySource';
import { Result, attempt, fail, ok } from '../util/Result';
import { JsonObject, JsonValue, parseRelaxedJson } from '../util/json';
import { ItemData } from './ItemData';
import { itemRef } from '../util/names';

const PREFIX = `${namespaced('kit')}.`;

const COUNTER = namespaced('kit_counter');

const STORAGE_ENTITY = namespaced('kit_storage');

const MAX_ENTRIES = 54;

// Moving to using structures with storage entities for kits,
// this way all the item data is preserved and we don't have to try and rebuild it using API.
interface StructureKit {
    readonly kind: 'structure';
    readonly structure: string;
    readonly slots: readonly string[];
}

// 3.0 kits were JSON and still give the old way until they're saved again
interface LegacyKit {
    readonly kind: 'legacy';
    readonly entries: readonly LegacyEntry[];
}

interface LegacyEntry {
    readonly item: string;
    readonly amount: number;
    readonly data: JsonObject;
}

type StoredKit = StructureKit | LegacyKit;

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

    static save(
        name: string,
        holder: Entity,
        source: InventorySource
    ): Result<string> {
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

        const previous = KitStore.read(clean.value);
        const structure = KitStore.nextStructureId();
        const corner = blockOf(holder.location);
        const slots: string[] = [];

        const saved = attempt(() => {
            const storage = holder.dimension.spawnEntity(
                STORAGE_ENTITY,
                centreOf(corner)
            );
            try {
                const container = storageContainer(storage);
                for (const handle of occupied) {
                    const item = handle.read();
                    if (item) {
                        container.setItem(slots.length, item);
                        slots.push(handle.reference);
                    }
                }
                world.structureManager.createFromWorld(
                    structure,
                    holder.dimension,
                    corner,
                    corner,
                    {
                        includeBlocks: false,
                        includeEntities: true,
                        saveMode: StructureSaveMode.World,
                    }
                );
            } finally {
                discard(storage);
            }
        }, `Failed to save kit "${clean.value}"`);
        if (!saved.ok) {
            return saved;
        }

        const kit: Omit<StructureKit, 'kind'> = { structure, slots };
        const stored = attempt(() => {
            world.setDynamicProperty(
                KitStore.key(clean.value),
                JSON.stringify(kit)
            );
        }, `Failed to save kit "${clean.value}"`);
        if (!stored.ok) {
            deleteStructure(structure);
            return stored;
        }

        // Only dropped once the new one is safely saved.
        if (previous.ok && previous.value.kind === 'structure') {
            deleteStructure(previous.value.structure);
        }

        return ok(`Saved ${slots.length} item(s) as kit "${clean.value}".`);
    }

    static give(
        name: string,
        holder: Entity,
        source: InventorySource
    ): Result<string> {
        const kit = KitStore.read(name);
        if (!kit.ok) {
            return kit;
        }

        const given =
            kit.value.kind === 'structure'
                ? KitStore.giveStructure(kit.value, holder, source)
                : KitStore.giveLegacy(kit.value, holder, source);
        if (!given.ok) {
            return given;
        }

        const { placed, dropped } = given.value;
        return ok(
            dropped === 0
                ? `Gave ${placed} item(s) from kit "${name}" to ${source.displayName}.`
                : `Gave ${placed} item(s) from kit "${name}" to ${source.displayName}; ${dropped} didn't fit and have been dropped outside.`
        );
    }

    static remove(name: string): Result<string> {
        const kit = KitStore.read(name);
        if (!KitStore.has(name)) {
            return fail(`There is no kit called "${name}".`);
        }

        return attempt(() => {
            world.setDynamicProperty(KitStore.key(name), undefined);
            if (kit.ok && kit.value.kind === 'structure') {
                deleteStructure(kit.value.structure);
            }
            return `Deleted kit "${name}".`;
        }, `Failed to delete kit "${name}"`);
    }

    static describe(name: string): string {
        const kit = KitStore.read(name);
        if (!kit.ok) {
            return 'unreadable';
        }
        const count =
            kit.value.kind === 'structure'
                ? kit.value.slots.length
                : kit.value.entries.length;
        return `${count} item(s)`;
    }

    // Items go back to the slot they were saved from when it's free, so armor
    // is worn again, and anywhere there's room otherwise
    private static giveStructure(
        kit: StructureKit,
        holder: Entity,
        source: InventorySource
    ): Result<GiveCount> {
        const structure = world.structureManager.get(kit.structure);
        if (!structure) {
            return fail("The kit's saved items are missing. Save it again.");
        }

        const corner = blockOf(holder.location);
        return attempt(() => {
            world.structureManager.place(structure, holder.dimension, corner, {
                includeBlocks: false,
                includeEntities: true,
            });
            const [storage] = holder.dimension.getEntities({
                type: STORAGE_ENTITY,
                location: centreOf(corner),
                maxDistance: 1,
            });
            if (!storage) {
                throw new Error('the stored items did not load');
            }

            const count: GiveCount = { placed: 0, dropped: 0 };
            try {
                const container = storageContainer(storage);
                for (let index = 0; index < container.size; index++) {
                    const item = container.getItem(index);
                    if (!item) {
                        continue;
                    }
                    const reference = kit.slots[index];
                    const slot =
                        reference === undefined
                            ? undefined
                            : source.resolve(reference);
                    if (slot?.ok && !slot.value.hasItem()) {
                        slot.value.write(item);
                        count.placed++;
                    } else {
                        deliver(item, holder, source, count);
                    }
                }
            } finally {
                discard(storage);
            }
            return count;
        }, `Failed to give kit`);
    }

    private static giveLegacy(
        kit: LegacyKit,
        holder: Entity,
        source: InventorySource
    ): Result<GiveCount> {
        const count: GiveCount = { placed: 0, dropped: 0 };
        for (const entry of kit.entries) {
            const built = KitStore.build(entry);
            if (!built.ok) {
                return built;
            }
            deliver(built.value, holder, source, count);
        }
        return ok(count);
    }

    private static build(entry: LegacyEntry): Result<ItemStack> {
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

    private static read(name: string): Result<StoredKit> {
        const stored = world.getDynamicProperty(KitStore.key(name));
        if (typeof stored !== 'string') {
            return fail(
                `No kit called "${name}". Run "list" to see what's saved.`
            );
        }

        const parsed = parseRelaxedJson(stored);
        if (!parsed.ok) {
            return fail(`Kit "${name}" is unreadable. Save it again.`);
        }

        const value = parsed.value;
        if (Array.isArray(value)) {
            const entries: LegacyEntry[] = [];
            for (const raw of value) {
                const entry = KitStore.toEntry(raw);
                if (!entry.ok) {
                    return fail(`Kit "${name}" is unreadable: ${entry.error}`);
                }
                entries.push(entry.value);
            }
            return ok({ kind: 'legacy', entries });
        }

        if (
            value !== null &&
            typeof value === 'object' &&
            typeof value.structure === 'string' &&
            Array.isArray(value.slots)
        ) {
            return ok({
                kind: 'structure',
                structure: value.structure,
                slots: value.slots.map(String),
            });
        }

        return fail(`Kit "${name}" is unreadable. Save it again.`);
    }

    private static toEntry(raw: JsonValue): Result<LegacyEntry> {
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

    // Kit names allow spaces and structure ids don't, so structures get a
    // number instead and the kit record points at it.
    private static nextStructureId(): string {
        const stored = world.getDynamicProperty(COUNTER);
        const next = typeof stored === 'number' ? stored + 1 : 1;
        world.setDynamicProperty(COUNTER, next);
        return namespaced(`kit_${next}`);
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

interface GiveCount {
    placed: number;
    dropped: number;
}

// A stack can half fit, so only the leftover goes on the ground.
function deliver(
    item: ItemStack,
    holder: Entity,
    source: InventorySource,
    count: GiveCount
): void {
    const leftover = source.addItem(item);
    if (leftover) {
        holder.dimension.spawnItem(leftover, holder.location);
        count.dropped++;
    } else {
        count.placed++;
    }
}

function blockOf(location: Vector3): Vector3 {
    return {
        x: Math.floor(location.x),
        y: Math.floor(location.y),
        z: Math.floor(location.z),
    };
}

function centreOf(corner: Vector3): Vector3 {
    return { x: corner.x + 0.5, y: corner.y, z: corner.z + 0.5 };
}

function storageContainer(storage: Entity): Container {
    const container = storage.getComponent(
        EntityComponentTypes.Inventory
    )?.container;
    if (!container) {
        throw new Error('the kit storage entity has no inventory');
    }
    return container;
}

// Emptied first so nothing can drop even if removal goes wrong.
function discard(storage: Entity): void {
    if (!storage.isValid) {
        return;
    }
    storage.getComponent(EntityComponentTypes.Inventory)?.container?.clearAll();
    storage.remove();
}

function deleteStructure(id: string): void {
    try {
        world.structureManager.delete(id);
    } catch {
        // Already gone, nothing to clean up
    }
}
