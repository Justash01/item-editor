import { Entity, Player, world } from '@minecraft/server';
import { Result, fail, ok } from '../util/Result';
import { namespaced } from '../Meta';
import { InventorySource, describeEntity } from './InventorySource';
import { SlotHandle } from './SlotHandle';
import { slotGroupFromAlias, slotGroupLabel } from './slotReferences';
import { itemRef } from '../util/names';

const PROPERTY = namespaced('selection');

const SEPARATOR = ' ';

const NAMES_SHOWN = 4;

export interface ResolvedSelection {
    readonly entity: Entity;
    readonly source: InventorySource;
    readonly reference: string;
    readonly slots: readonly SlotHandle[];
}

export class Selection {
    private constructor() {}

    static set(viewer: Player, entity: Entity, slotReference: string): void {
        viewer.setDynamicProperty(
            PROPERTY,
            `${entity.id}${SEPARATOR}${slotReference}`
        );
    }

    static clear(viewer: Player): void {
        viewer.setDynamicProperty(PROPERTY, undefined);
    }

    static has(viewer: Player): boolean {
        return typeof viewer.getDynamicProperty(PROPERTY) === 'string';
    }

    static resolve(viewer: Player): Result<ResolvedSelection> {
        const stored = viewer.getDynamicProperty(PROPERTY);
        if (typeof stored !== 'string') {
            return fail(
                `Nothing selected. /${namespaced('select')} picks your main hand.`
            );
        }

        // No separator would slice at -1 and cut the id, then it looks like the
        // entity is missing.
        const separator = stored.indexOf(SEPARATOR);
        if (separator <= 0) {
            return fail(
                `Your selection is unreadable. Pick again with /${namespaced('select')}.`
            );
        }

        const entityId = stored.slice(0, separator);
        const slotReference = stored.slice(separator + SEPARATOR.length);

        const entity = world.getEntity(entityId);
        if (!entity) {
            return fail(
                `That selection isn't loaded any more. Pick again with /${namespaced('select')}.`
            );
        }

        const source = InventorySource.of(entity);
        if (!source.ok) {
            return source;
        }

        const slots = source.value.resolveMany(slotReference);
        if (!slots.ok) {
            return slots;
        }

        return ok({
            entity,
            source: source.value,
            reference: slotReference,
            slots: slots.value,
        });
    }

    static describe(selection: ResolvedSelection): string {
        const owner = describeEntity(selection.entity);
        const group = slotGroupFromAlias(selection.reference);

        if (!group) {
            const slot = selection.slots[0];
            const item = slot?.read();
            const held = item ? (item.nameTag ?? itemRef(item)) : 'empty';
            return `${held} (${owner}, ${slot?.label ?? selection.reference})`;
        }

        const names = selection.slots.map((slot) => {
            const item = slot.read();
            return item ? (item.nameTag ?? itemRef(item)) : slot.label;
        });
        const shown = names.slice(0, NAMES_SHOWN).join(', ');
        const more =
            names.length > NAMES_SHOWN
                ? ` and ${names.length - NAMES_SHOWN} more`
                : '';
        const count = `${names.length} item${names.length === 1 ? '' : 's'}`;

        return `${count}: ${shown}${more} (${owner}, ${slotGroupLabel(group).toLowerCase()})`;
    }
}
