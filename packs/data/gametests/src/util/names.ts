import {
    Block,
    BlockTypes,
    Entity,
    ItemStack,
    Player,
    RawMessage,
} from '@minecraft/server';
import { Settings } from '../core/Settings';
import { idToName } from './text';

// Names stay as markers inside plain strings until the message is sent, that's
// where the localized names setting picks a translate component or the raw id.
const OPEN = '';
const SPLIT = '';
const CLOSE = '';
const MARKER = /([^]*)([^]*)/g;

export interface NamePart {
    readonly text?: string;
    readonly translate?: string;
}

function marker(key: string, id: string): string {
    return `${OPEN}${key}${SPLIT}${id}${CLOSE}`;
}

export function itemRef(item: ItemStack | string): string {
    if (typeof item !== 'string') {
        return marker(item.localizationKey, item.typeId);
    }
    try {
        return marker(new ItemStack(item).localizationKey, item);
    } catch {
        return marker('', item);
    }
}

export function blockRef(block: Block | string): string {
    return typeof block === 'string'
        ? marker(BlockTypes.get(block)?.localizationKey ?? '', block)
        : marker(block.localizationKey, block.typeId);
}

export function entityRef(entity: Entity): string {
    if (entity instanceof Player) {
        return entity.name;
    }
    if (entity.nameTag && entity.nameTag.length > 0) {
        return entity.nameTag;
    }
    return marker(entity.localizationKey, entity.typeId);
}

export function nameParts(message: string): NamePart[] {
    const localized = Settings.get().localizedNames;
    const parts: NamePart[] = [];
    let last = 0;

    for (const match of message.matchAll(MARKER)) {
        if (match.index > last) {
            parts.push({ text: message.slice(last, match.index) });
        }
        const [, key, id] = match;
        if (!localized) {
            parts.push({ text: id });
        } else if (key) {
            parts.push({ translate: key });
        } else {
            parts.push({ text: idToName(id!) });
        }
        last = match.index + match[0].length;
    }

    if (last < message.length) {
        parts.push({ text: message.slice(last) });
    }
    return parts;
}

export function chatMessage(message: string): RawMessage | string {
    if (!message.includes(OPEN)) {
        return message;
    }
    return { rawtext: nameParts(message) };
}

export function plainText(message: string): string {
    return message.replace(MARKER, (_, _key: string, id: string) => id);
}
