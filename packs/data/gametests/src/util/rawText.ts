import { Block, Entity, ItemStack } from '@minecraft/server';
import { UIRawMessage } from '@minecraft/server-ui';
import { blockRef, entityRef, itemRef, nameParts } from './names';

// Formatting codes don't work in data-driven screens. Use localizationKey over
// idToName, guessed names are wrong for add-on items and non-English clients.

export function text(value: string): UIRawMessage {
    return { text: value };
}

export function join(...parts: UIRawMessage[]): UIRawMessage {
    return { rawtext: parts };
}

export function uiText(message: string): UIRawMessage {
    const parts = nameParts(message);
    return parts.length === 1 ? parts[0]! : { rawtext: parts };
}

export function itemName(item: ItemStack): UIRawMessage {
    return item.nameTag ? text(item.nameTag) : uiText(itemRef(item));
}

export function itemNameWithAmount(item: ItemStack): UIRawMessage {
    return item.amount > 1
        ? join(itemName(item), text(` x${item.amount}`))
        : itemName(item);
}

export function blockName(block: Block): UIRawMessage {
    return uiText(blockRef(block));
}

export function blockTypeName(id: string): UIRawMessage {
    return uiText(blockRef(id));
}

export function entityName(entity: Entity): UIRawMessage {
    return uiText(entityRef(entity));
}
