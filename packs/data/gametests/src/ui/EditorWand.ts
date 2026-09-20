import { ItemStack, Player, system, world } from '@minecraft/server';
import { namespaced } from '../Meta';
import { Selection } from '../core/Selection';
import { Settings } from '../core/Settings';
import { InventorySource } from '../core/InventorySource';
import { Log } from '../util/Log';
import { EditorSession } from './EditorSession';
import { failWith } from './feedback';

const log = Log.get('EditorWand');

const MARKER = namespaced('wand');

export class EditorWand {
    private constructor() {}

    static toggle(viewer: Player): 'bound' | 'released' | undefined {
        const source = InventorySource.of(viewer);
        if (!source.ok) {
            return undefined;
        }

        const slot = source.value.resolve('mainhand');
        if (!slot.ok) {
            return undefined;
        }

        const item = slot.value.read();
        if (!item) {
            return undefined;
        }

        const wasWand = item.getDynamicProperty(MARKER) === true;
        item.setDynamicProperty(MARKER, wasWand ? undefined : true);
        slot.value.write(item);

        return wasWand ? 'released' : 'bound';
    }

    static isHeld(viewer: Player): boolean {
        const source = InventorySource.of(viewer);
        if (!source.ok) {
            return false;
        }

        const slot = source.value.resolve('mainhand');
        return (
            slot.ok && slot.value.read()?.getDynamicProperty(MARKER) === true
        );
    }

    static install(): void {
        world.beforeEvents.playerInteractWithBlock.subscribe((event) => {
            // Fires repeatedly while use is held.
            if (
                !event.isFirstEvent ||
                !EditorWand.armed(event.player, event.itemStack)
            ) {
                return;
            }

            event.cancel = true;

            const { player, block } = event;
            EditorWand.openOn(player, () =>
                EditorSession.openBlock(player, block)
            );
        });

        world.beforeEvents.playerInteractWithEntity.subscribe((event) => {
            if (!EditorWand.armed(event.player, event.itemStack)) {
                return;
            }

            event.cancel = true;

            const { player, target } = event;
            EditorWand.openOn(player, () => {
                const source = InventorySource.of(target);
                if (source.ok) {
                    const slot = source.value.defaultSlot();
                    if (slot.ok) {
                        Selection.set(player, target, slot.value.reference);
                    }
                }
                EditorSession.open(player, target);
            });
        });
    }

    private static armed(viewer: Player, used: ItemStack | undefined): boolean {
        if (!viewer.isValid || used?.getDynamicProperty(MARKER) !== true) {
            return false;
        }
        // Not sneaking leaves the interaction alone, so the item still works.
        return !Settings.get().wandNeedsSneak || viewer.isSneaking;
    }

    private static openOn(viewer: Player, open: () => void): void {
        system.run(() => {
            try {
                open();
            } catch (error) {
                log.error(error);
                failWith(viewer, "Couldn't open the editor there.");
            }
        });
    }
}
