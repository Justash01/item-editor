import { Player } from '@minecraft/server';
import { namespaced } from '../Meta';
import { SlotHandle } from '../core/SlotHandle';
import { Result, fail, ok } from '../util/Result';
import { JsonObject, parseRelaxedJson } from '../util/json';
import { ItemData } from './ItemData';
import { ItemEditorService } from './ItemEditorService';
import { itemRef } from '../util/names';

const CLIPBOARD = namespaced('clipboard');
const CLIPBOARD_SOURCE = namespaced('clipboard_from');

export class ItemClipboard {
    private constructor() {}

    static copy(viewer: Player, slot: SlotHandle): Result<string> {
        const item = ItemEditorService.require(slot);
        if (!item.ok) {
            return item;
        }

        const document = ItemData.from(item.value);
        viewer.setDynamicProperty(CLIPBOARD, JSON.stringify(document));
        viewer.setDynamicProperty(
            CLIPBOARD_SOURCE,
            item.value.nameTag ?? itemRef(item.value)
        );

        const fields = Object.keys(document).length;
        return ok(
            fields === 0
                ? 'Copied, but that item has nothing custom on it.'
                : `Copied ${fields} field(s) from ${ItemClipboard.label(viewer)}.`
        );
    }

    static paste(viewer: Player, slot: SlotHandle): Result<string> {
        const document = ItemClipboard.read(viewer);
        if (!document.ok) {
            return document;
        }

        return ItemEditorService.applyDocument(slot, document.value);
    }

    static has(viewer: Player): boolean {
        return typeof viewer.getDynamicProperty(CLIPBOARD) === 'string';
    }

    static label(viewer: Player): string {
        const source = viewer.getDynamicProperty(CLIPBOARD_SOURCE);
        return typeof source === 'string' ? source : 'nothing';
    }

    private static read(viewer: Player): Result<JsonObject> {
        const stored = viewer.getDynamicProperty(CLIPBOARD);
        if (typeof stored !== 'string') {
            return fail('Nothing copied yet.');
        }

        const parsed = parseRelaxedJson(stored);
        if (!parsed.ok) {
            return fail(`The clipboard is unreadable: ${parsed.error}`);
        }
        if (
            parsed.value === null ||
            typeof parsed.value !== 'object' ||
            Array.isArray(parsed.value)
        ) {
            return fail('The clipboard is unreadable.');
        }

        return ok(parsed.value);
    }
}
