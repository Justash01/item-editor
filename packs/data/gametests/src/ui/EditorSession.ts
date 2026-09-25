import { Block, Entity, ItemStack, Player, world } from '@minecraft/server';
import { BlockEditorService } from '../block/BlockEditorService';
import { BlockInspector } from '../block/BlockInspector';
import { InventorySource } from '../core/InventorySource';
import { Settings } from '../core/Settings';
import { SlotHandle } from '../core/SlotHandle';
import { ItemEditorService } from '../item/ItemEditorService';
import { ItemClipboard } from '../item/ItemClipboard';
import { ItemHistory } from '../item/ItemHistory';
import { ItemInspector } from '../item/ItemInspector';
import { Log } from '../util/Log';
import { blockRef, chatMessage, itemRef } from '../util/names';
import { Result, describeError, fail, ok } from '../util/Result';
import { Color } from '../util/colors';
import {
    blockName,
    entityName,
    itemName,
    itemNameWithAmount,
} from '../util/rawText';
import { AbilityEditor } from './AbilityEditor';
import { BlockListEditor } from './BlockListEditor';
import { BlockStateForm } from './BlockStateForm';
import { BookEditor } from './BookEditor';
import { BulkEditor } from './BulkEditor';
import { EnchantmentEditor } from './EnchantmentEditor';
import { ItemPropertiesForm } from './ItemPropertiesForm';
import { ItemSummary } from './ItemSummary';
import { LoreEditor } from './LoreEditor';
import { EditorWand } from './EditorWand';
import { ExitSignal } from './ExitSignal';
import { Dialog, Menu, confirmDestructive } from './Menu';
import { SignEditor } from './SignEditor';
import {
    chat,
    failWith,
    notify,
    playFailure,
    playSuccess,
    succeed,
} from './feedback';

const log = Log.get('EditorSession');

export const EDITOR_PANELS = [
    'item',
    'properties',
    'lore',
    'enchantments',
    'abilities',
    'book',
    'candestroy',
    'canplaceon',
] as const;

export type EditorPanel = (typeof EDITOR_PANELS)[number];

export class EditorSession {
    private constructor(private readonly viewer: Player) {}

    static open(viewer: Player, preselected?: Entity): void {
        ExitSignal.begin(viewer);

        const session = new EditorSession(viewer);
        const journey = preselected
            ? session.browse(preselected)
            : session.chooseSource();

        journey
            .finally(() => ExitSignal.end(viewer))
            .catch((error: unknown) => {
                log.error(error);
                failWith(viewer, `The editor crashed: ${describeError(error)}`);
            });
    }

    // Everything is checked before a screen opens, so a wrong slot or an item
    // without that panel comes back as a command error instead of a dialog.
    static openPanel(
        viewer: Player,
        panel: EditorPanel,
        owner: Entity,
        slotReference: string | undefined
    ): Result<void> {
        const source = InventorySource.of(owner);
        if (!source.ok) {
            return source;
        }
        const handle =
            slotReference === undefined
                ? source.value.defaultSlot()
                : source.value.resolve(slotReference);
        if (!handle.ok) {
            return handle;
        }
        const item = ItemEditorService.require(handle.value);
        if (!item.ok) {
            return item;
        }
        const refused = EditorSession.refusal(panel, handle.value, item.value);
        if (refused) {
            return fail(refused);
        }

        ExitSignal.begin(viewer);
        new EditorSession(viewer)
            .showPanel(panel, source.value, handle.value)
            .finally(() => ExitSignal.end(viewer))
            .catch((error: unknown) => {
                log.error(error);
                failWith(viewer, `The editor crashed: ${describeError(error)}`);
            });
        return ok(undefined);
    }

    private static refusal(
        panel: EditorPanel,
        handle: SlotHandle,
        item: ItemStack
    ): string | undefined {
        switch (panel) {
            case 'enchantments':
                return EnchantmentEditor.supports(handle)
                    ? undefined
                    : `${itemRef(item)} can't be enchanted.`;
            case 'book':
                return BookEditor.supports(handle)
                    ? undefined
                    : `${itemRef(item)} isn't a writable book.`;
            case 'abilities':
                return AbilityEditor.supports(handle)
                    ? undefined
                    : 'Abilities on stackable items are turned off in /jstash:settings.';
            default:
                return undefined;
        }
    }

    private async showPanel(
        panel: EditorPanel,
        source: InventorySource,
        handle: SlotHandle
    ): Promise<void> {
        switch (panel) {
            case 'item':
                return this.openSlot(source, handle);
            case 'properties':
                return this.editProperties(
                    handle,
                    this.historyKey(source, handle)
                );
            case 'lore':
                return this.report(
                    await new LoreEditor(this.viewer, handle).browse()
                );
            case 'enchantments':
                return this.report(
                    await new EnchantmentEditor(this.viewer, handle).browse()
                );
            case 'abilities':
                return this.report(
                    await new AbilityEditor(this.viewer, handle).browse()
                );
            case 'book':
                return this.report(
                    await new BookEditor(this.viewer, handle).browse()
                );
            case 'candestroy':
            case 'canplaceon':
                return this.report(
                    await new BlockListEditor(
                        this.viewer,
                        handle,
                        panel
                    ).browse()
                );
        }
    }

    static openBlock(viewer: Player, block: Block): void {
        ExitSignal.begin(viewer);

        const session = new EditorSession(viewer);
        session
            .openBlock(block)
            .finally(() => ExitSignal.end(viewer))
            .catch((error: unknown) => {
                log.error(error);
                failWith(viewer, `The editor crashed: ${describeError(error)}`);
            });
    }

    private async chooseSource(): Promise<void> {
        for (;;) {
            if (ExitSignal.isRequested(this.viewer)) {
                return;
            }

            let picked = false;

            const menu = new Menu(this.viewer, 'Item Editor')
                .body('Choose what to edit.')
                .option(
                    'My inventory',
                    async () => {
                        picked = true;
                        await this.browse(this.viewer);
                    },
                    'Edit the items you are carrying'
                )
                .option(
                    'Another player',
                    async () => {
                        picked = true;
                        await this.choosePlayer();
                    },
                    'Pick from the players online'
                )
                .option(
                    'Entity in view',
                    async () => {
                        picked = true;
                        await this.browseTargetedEntity();
                    },
                    `Edit whatever you are looking at, within ${Settings.get().reach} blocks`
                )
                .option(
                    'Block in view',
                    async () => {
                        picked = true;
                        await this.browseTargetedBlock();
                    },
                    `Edit the block you are looking at, within ${Settings.get().reach} blocks`
                );

            const holdingWand = EditorWand.isHeld(this.viewer);
            menu.section('Tools').option(
                holdingWand
                    ? 'Stop using held item as a wand'
                    : 'Make held item a wand',
                () => {
                    picked = true;
                    this.reportWand(EditorWand.toggle(this.viewer));
                },
                holdingWand
                    ? 'Give the item its normal behavior back'
                    : 'Use that item on a block or entity to edit it directly'
            );

            const shown = await menu.show();
            if (!shown.ok) {
                this.report(shown);
                return;
            }
            if (!picked) {
                return;
            }
        }
    }

    private async choosePlayer(): Promise<void> {
        const players = world.getAllPlayers();
        const menu = new Menu(this.viewer, 'Choose a player')
            .withBack()
            .body(`${players.length} online.`);

        for (const player of players) {
            menu.option(entityName(player), () => this.browse(player));
        }

        this.report(await menu.show());
    }

    private async browseTargetedEntity(): Promise<void> {
        const reach = Settings.get().reach;
        const [hit] = this.viewer.getEntitiesFromViewDirection({
            maxDistance: reach,
        });
        if (!hit) {
            await this.alert(`No entity within ${reach} blocks.`);
            return;
        }
        await this.browse(hit.entity);
    }

    private async browseTargetedBlock(): Promise<void> {
        const reach = Settings.get().reach;
        const hit = this.viewer.getBlockFromViewDirection({
            maxDistance: reach,
        });
        if (!hit) {
            await this.alert(`No block within ${reach} blocks.`);
            return;
        }
        await this.openBlock(hit.block);
    }

    private async browse(target: Entity | Block): Promise<void> {
        const source = InventorySource.of(target);
        if (!source.ok) {
            await this.alert(source.error);
            return;
        }
        await this.browseSlots(source.value);
    }

    private async browseSlots(source: InventorySource): Promise<void> {
        for (;;) {
            if (ExitSignal.isRequested(this.viewer)) {
                return;
            }

            const slots = source.listOccupied();
            let picked = false;

            const menu = new Menu(this.viewer, source.displayName)
                .withBack()
                .body(
                    slots.length === 0
                        ? 'Nothing to edit here.'
                        : `Carrying ${slots.length} item${slots.length === 1 ? '' : 's'}.`
                );

            for (const handle of slots) {
                const item = handle.read();
                if (!item) {
                    continue;
                }

                menu.option(
                    itemNameWithAmount(item),
                    async () => {
                        picked = true;
                        await this.openSlot(source, handle);
                    },
                    `${handle.label}: ${item.typeId}`
                );
            }

            if (slots.length > 1) {
                menu.section('Several items').option(
                    'Edit several at once',
                    async () => {
                        picked = true;
                        this.report(
                            await new BulkEditor(this.viewer, source).browse()
                        );
                    },
                    'Max out, repair, or paste onto a whole set of gear'
                );
            }

            const shown = await menu.show();
            if (!shown.ok) {
                this.report(shown);
                return;
            }
            if (!picked) {
                return;
            }
        }
    }

    private async openSlot(
        source: InventorySource,
        handle: SlotHandle
    ): Promise<void> {
        for (;;) {
            if (ExitSignal.isRequested(this.viewer)) {
                return;
            }

            const item = ItemEditorService.require(handle);
            if (!item.ok) {
                await this.alert(item.error);
                return;
            }

            const summary = ItemSummary.of(item.value);
            const historyKey = this.historyKey(source, handle);
            let acted = false;
            let removed = false;

            const menu = new Menu(this.viewer, itemName(item.value))
                .withBack()
                .body(handle.label)
                .section('Edit')
                .option(
                    'Properties',
                    async () => {
                        acted = true;
                        await this.editProperties(handle, historyKey);
                    },
                    summary.properties
                )
                .option(
                    'Lore',
                    async () => {
                        acted = true;
                        this.report(
                            await new LoreEditor(this.viewer, handle).browse()
                        );
                    },
                    summary.lore
                );

            if (EnchantmentEditor.supports(handle)) {
                menu.option(
                    'Enchantments',
                    async () => {
                        acted = true;
                        this.report(
                            await new EnchantmentEditor(
                                this.viewer,
                                handle
                            ).browse()
                        );
                    },
                    summary.enchantments
                );
            }

            if (BookEditor.supports(handle)) {
                menu.option(
                    'Book',
                    async () => {
                        acted = true;
                        this.report(
                            await new BookEditor(this.viewer, handle).browse()
                        );
                    },
                    'Pages, title, and author'
                );
            }

            if (AbilityEditor.supports(handle)) {
                menu.option(
                    'Abilities',
                    async () => {
                        acted = true;
                        this.report(
                            await new AbilityEditor(
                                this.viewer,
                                handle
                            ).browse()
                        );
                    },
                    summary.abilities
                );
            }

            menu.option(
                'Can destroy',
                async () => {
                    acted = true;
                    this.report(
                        await new BlockListEditor(
                            this.viewer,
                            handle,
                            'candestroy'
                        ).browse()
                    );
                },
                summary.canDestroy
            ).option(
                'Can place on',
                async () => {
                    acted = true;
                    this.report(
                        await new BlockListEditor(
                            this.viewer,
                            handle,
                            'canplaceon'
                        ).browse()
                    );
                },
                summary.canPlaceOn
            );

            menu.section('Clipboard')
                .option(
                    'Copy data',
                    () => {
                        acted = true;
                        this.report(ItemClipboard.copy(this.viewer, handle));
                    },
                    "Remember this item's data"
                )
                .option(
                    'Paste data',
                    () => {
                        acted = true;
                        this.report(
                            ItemHistory.around(
                                historyKey,
                                handle,
                                'pasting item data',
                                () => ItemClipboard.paste(this.viewer, handle)
                            )
                        );
                    },
                    ItemClipboard.has(this.viewer)
                        ? `Apply the data copied from ${ItemClipboard.label(this.viewer)}`
                        : 'Nothing copied yet'
                );

            menu.section('Actions').option(
                'Show full data',
                () => {
                    acted = true;
                    this.viewer.sendMessage(
                        chatMessage(
                            ItemInspector.describe(
                                item.value,
                                handle,
                                source.displayName
                            )
                        )
                    );
                },
                'Print the data report to chat'
            );

            if (ItemHistory.has(historyKey)) {
                menu.option(
                    'Undo last change',
                    () => {
                        acted = true;
                        this.report(ItemHistory.undo(historyKey, handle));
                    },
                    `Take back ${ItemHistory.peek(historyKey)}`
                );
            }

            menu.option(
                'Duplicate',
                () => {
                    acted = true;
                    this.report(ItemEditorService.duplicate(source, handle));
                },
                'Copy into the first free slot'
            )
                .option(
                    'Reset to default',
                    async () => {
                        acted = true;
                        if (
                            await this.confirm(
                                'Reset item',
                                `Discard all custom data on ${summary.title}?`,
                                'Reset'
                            )
                        ) {
                            this.report(
                                ItemHistory.around(
                                    historyKey,
                                    handle,
                                    'the reset',
                                    () => ItemEditorService.resetItem(handle)
                                )
                            );
                        }
                    },
                    'Keep the item, discard its data'
                )
                .option(
                    'Remove from slot',
                    async () => {
                        if (
                            await this.confirm(
                                'Remove item',
                                `Delete ${summary.title} from ${handle.label}?`,
                                'Remove'
                            )
                        ) {
                            this.report(
                                ItemHistory.around(
                                    historyKey,
                                    handle,
                                    'the removal',
                                    () => ItemEditorService.clearSlot(handle)
                                )
                            );
                            removed = true;
                        } else {
                            acted = true;
                        }
                    },
                    'Delete the item entirely'
                );

            const shown = await menu.show();
            if (!shown.ok) {
                this.report(shown);
                return;
            }
            if (removed || !acted) {
                return;
            }
        }
    }

    private historyKey(source: InventorySource, handle: SlotHandle): string {
        return ItemHistory.keyFor(source.id, handle);
    }

    private async editProperties(
        handle: SlotHandle,
        historyKey: string
    ): Promise<void> {
        const item = ItemEditorService.require(handle);
        if (!item.ok) {
            await this.alert(item.error);
            return;
        }

        const form = ItemPropertiesForm.forItem(item.value);
        if (form.isEmpty) {
            await this.alert('This item has no editable properties.');
            return;
        }

        // Empty success = nothing changed, no undo entry.
        const outcome = await ItemHistory.aroundAsync(
            historyKey,
            handle,
            'the property changes',
            () => form.prompt(this.viewer, handle)
        );

        if (!outcome.ok) {
            await this.alert(outcome.error);
            return;
        }
        this.report(outcome);
    }

    private async openBlock(block: Block): Promise<void> {
        for (;;) {
            if (ExitSignal.isRequested(this.viewer)) {
                return;
            }

            if (!block.isValid) {
                await this.alert('That block is no longer loaded.');
                return;
            }

            const container = InventorySource.of(block);
            let stay = false;

            const menu = new Menu(this.viewer, blockName(block))
                .withBack()
                .body(`${block.x} ${block.y} ${block.z}`)
                .option(
                    'Edit block states',
                    async () => {
                        stay = true;
                        await this.editBlockStates(block);
                    },
                    'Change this block variant'
                )
                .option(
                    'Show full data',
                    () => {
                        stay = true;
                        this.viewer.sendMessage(
                            chatMessage(BlockInspector.describe(block))
                        );
                    },
                    'Print the data report to chat'
                )
                .option(
                    'Reset block states',
                    async () => {
                        stay = true;
                        if (
                            await this.confirm(
                                'Reset block',
                                `Restore ${blockRef(block)} to its default states?`,
                                'Reset'
                            )
                        ) {
                            this.report(BlockEditorService.resetStates(block));
                        }
                    },
                    'Back to the default variant'
                );

            if (SignEditor.supports(block)) {
                menu.option(
                    'Sign text',
                    async () => {
                        stay = true;
                        this.report(
                            await new SignEditor(this.viewer, block).browse()
                        );
                    },
                    'Front and back text, color, and wax'
                );
            }

            if (container.ok) {
                menu.section('Contents').option(
                    'Edit items inside',
                    async () => {
                        stay = true;
                        await this.browseSlots(container.value);
                    },
                    'Open this container'
                );
            }

            const shown = await menu.show();
            if (!shown.ok) {
                this.report(shown);
                return;
            }
            if (!stay) {
                return;
            }
        }
    }

    private async editBlockStates(block: Block): Promise<void> {
        const form = BlockStateForm.forBlock(block);
        if (form.isEmpty) {
            await this.alert(`${blockRef(block)} has no block states to edit.`);
            return;
        }

        const shown = await form.prompt(this.viewer);
        if (!shown.ok) {
            await this.alert(shown.error);
            return;
        }
        if (shown.value.length === 0) {
            chat(this.viewer, `${Color.Gray}No changes were made.`);
            return;
        }

        for (const outcome of shown.value) {
            this.message(outcome);
        }
        if (shown.value.every((outcome) => outcome.ok)) {
            playSuccess(this.viewer);
        } else {
            playFailure(this.viewer);
        }
    }

    private reportWand(
        outcome: 'bound' | 'released' | 'stackable' | undefined
    ): void {
        if (outcome === undefined) {
            failWith(this.viewer, 'Hold an item to turn it into a wand.');
            return;
        }
        if (outcome === 'stackable') {
            failWith(
                this.viewer,
                "Wands need an item that doesn't stack, like a tool or a carrot on a stick."
            );
            return;
        }

        succeed(
            this.viewer,
            outcome === 'bound'
                ? 'Wand bound. Use it on a block or entity to edit that thing.'
                : 'Wand released. That item behaves normally again.'
        );
    }

    private alert(message: string): Promise<void> {
        return Dialog.alert(this.viewer, 'Item Editor', message);
    }

    private confirm(
        title: string,
        message: string,
        confirmLabel: string
    ): Promise<boolean> {
        return confirmDestructive(this.viewer, title, message, confirmLabel);
    }

    private report(outcome: Result<unknown>): void {
        notify(this.viewer, outcome);
    }

    private message(outcome: Result<string>): void {
        chat(
            this.viewer,
            outcome.ok
                ? `${Color.Green}${outcome.value}`
                : `${Color.Red}${outcome.error}`,
            outcome.ok ? 'success' : 'failure'
        );
    }
}
