import {
    Container,
    Dimension,
    Entity,
    EntityComponentTypes,
    ItemStack,
    Vector3,
} from '@minecraft/server';
import { namespaced } from '../Meta';

// An invisible entity with an inventory. Kits save one in a structure,
// and data values go through one since only commands can set them.
export const STORAGE_ENTITY = namespaced('kit_storage');

export function blockOf(location: Vector3): Vector3 {
    return {
        x: Math.floor(location.x),
        y: Math.floor(location.y),
        z: Math.floor(location.z),
    };
}

export function centreOf(corner: Vector3): Vector3 {
    return { x: corner.x + 0.5, y: corner.y, z: corner.z + 0.5 };
}

export function spawnStorage(dimension: Dimension, corner: Vector3): Entity {
    return dimension.spawnEntity(STORAGE_ENTITY, centreOf(corner));
}

export function storageContainer(storage: Entity): Container {
    const container = storage.getComponent(
        EntityComponentTypes.Inventory
    )?.container;
    if (!container) {
        throw new Error('the storage entity has no inventory');
    }
    return container;
}

// Emptied first so nothing can drop even if removal goes wrong.
export function discardStorage(storage: Entity): void {
    if (!storage.isValid) {
        return;
    }
    storage.getComponent(EntityComponentTypes.Inventory)?.container?.clearAll();
    storage.remove();
}

// new ItemStack has no data value, but /replaceitem does, and a copy taken
// out of the slot keeps it.
export function itemWithData(
    dimension: Dimension,
    location: Vector3,
    id: string,
    amount: number,
    data: number
): ItemStack {
    const storage = spawnStorage(dimension, blockOf(location));
    try {
        const result = storage.runCommand(
            `replaceitem entity @s slot.inventory 0 ${id} ${amount} ${data}`
        );
        const item =
            result.successCount > 0
                ? storageContainer(storage).getItem(0)
                : undefined;
        if (!item) {
            throw new Error(`${id} doesn't take data value ${data}`);
        }
        return item;
    } finally {
        discardStorage(storage);
    }
}
