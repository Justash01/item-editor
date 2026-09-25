import { ItemStack, world } from '@minecraft/server';
import { namespaced } from '../Meta';
import { Settings } from '../core/Settings';

const PROPERTY = namespaced('abilities');
const RECORD = `${PROPERTY}.`;
const MAX_RECORDS = 512;
const MAX_LORE = 20;

// Stackable items can't hold dynamic properties, so their abilities go on the
// world and the item gets a lore line of nothing but color codes pointing at
// them. It renders as an empty line at the bottom of the tooltip.
const MARKER = /^§j§s((?:§[0-9a-f]){8})$/;

export function allowsAbilities(item: ItemStack): boolean {
    return !item.isStackable || Settings.get().stackableAbilities;
}

export function storedAbilities(item: ItemStack): string | undefined {
    const stored = item.isStackable
        ? recordFor(item)
        : item.getDynamicProperty(PROPERTY);
    return typeof stored === 'string' && stored.length > 0 ? stored : undefined;
}

export function storeAbilities(item: ItemStack, raw: string | undefined): void {
    if (!item.isStackable) {
        item.setDynamicProperty(PROPERTY, raw);
        return;
    }

    const visible = visibleLore(item);
    if (raw === undefined) {
        item.setLore(visible);
        return;
    }
    if (!Settings.get().stackableAbilities) {
        throw new Error(
            'abilities on stackable items are turned off in the settings.'
        );
    }
    if (visible.length >= MAX_LORE) {
        throw new Error('the lore is full, abilities need one spare line.');
    }

    const token = tokenFor(raw);
    world.setDynamicProperty(RECORD + token, raw);
    item.setLore([...visible, markerLine(token)]);
}

export function visibleLore(item: ItemStack): string[] {
    return item.getLore().filter((line) => !MARKER.test(line));
}

export function setVisibleLore(item: ItemStack, lines: string[]): void {
    const marker = item.getLore().find((line) => MARKER.test(line));
    if (marker && lines.length >= MAX_LORE) {
        throw new Error(
            `lore holds ${MAX_LORE - 1} lines on this item, its abilities take the last one.`
        );
    }
    item.setLore(marker ? [...lines, marker] : lines);
}

function recordFor(item: ItemStack): unknown {
    const marker = item
        .getLore()
        .map((line) => MARKER.exec(line))
        .find((match) => match !== null);
    if (!marker || !Settings.get().stackableAbilities) {
        return undefined;
    }
    return world.getDynamicProperty(RECORD + marker[1]!.replace(/§/g, ''));
}

function markerLine(token: string): string {
    return `§j§s${[...token].map((digit) => `§${digit}`).join('')}`;
}

// Keyed by content, so granting the same kit a hundred times shares one record
// and editing one item never changes another. Old versions are left behind
// since there's no telling which items in chests still point at them.
function tokenFor(raw: string): string {
    for (let salt = 0; ; salt++) {
        const token = hash(salt === 0 ? raw : `${raw}#${salt}`);
        const existing = world.getDynamicProperty(RECORD + token);
        if (existing === raw) {
            return token;
        }
        if (existing === undefined) {
            const count = world
                .getDynamicPropertyIds()
                .filter((id) => id.startsWith(RECORD)).length;
            if (count >= MAX_RECORDS) {
                throw new Error(
                    `the world already holds ${MAX_RECORDS} sets of stackable abilities.`
                );
            }
            return token;
        }
    }
}

function hash(text: string): string {
    let value = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
        value ^= text.charCodeAt(i);
        value = Math.imul(value, 0x01000193);
    }
    return (value >>> 0).toString(16).padStart(8, '0');
}
