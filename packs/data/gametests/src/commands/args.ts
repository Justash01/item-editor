import {
    BlockType,
    Entity,
    ItemType,
    Player,
    Vector3,
} from '@minecraft/server';

export function stringArg(
    args: readonly unknown[],
    index: number
): string | undefined {
    const value = args[index];
    return typeof value === 'string' ? value : undefined;
}

export function numberArg(
    args: readonly unknown[],
    index: number
): number | undefined {
    const value = args[index];
    return typeof value === 'number' ? value : undefined;
}

export function entitiesArg(args: readonly unknown[], index: number): Entity[] {
    const value = args[index];
    return Array.isArray(value)
        ? value.filter((entry): entry is Entity => entry instanceof Entity)
        : [];
}

export function playersArg(args: readonly unknown[], index: number): Player[] {
    const value = args[index];
    return Array.isArray(value)
        ? value.filter((entry): entry is Player => entry instanceof Player)
        : [];
}

export function itemTypeArg(
    args: readonly unknown[],
    index: number
): ItemType | undefined {
    const value = args[index];
    return isNamedType(value) ? (value as ItemType) : undefined;
}

export function blockTypeArg(
    args: readonly unknown[],
    index: number
): BlockType | undefined {
    const value = args[index];
    return isNamedType(value) ? (value as BlockType) : undefined;
}

export function vectorArg(
    args: readonly unknown[],
    index: number
): Vector3 | undefined {
    const value = args[index];
    return isVector3(value) ? value : undefined;
}

// Item/block type args come through as plain objects with an id.
function isNamedType(value: unknown): value is { id: string } {
    return (
        typeof value === 'object' &&
        value !== null &&
        typeof (value as { id?: unknown }).id === 'string'
    );
}

function isVector3(value: unknown): value is Vector3 {
    if (typeof value !== 'object' || value === null) {
        return false;
    }
    const candidate = value as Vector3;
    return (
        typeof candidate.x === 'number' &&
        typeof candidate.y === 'number' &&
        typeof candidate.z === 'number'
    );
}
