import { ItemStack, Player } from '@minecraft/server';
import { CustomForm, DataDrivenScreenClosedReason } from '@minecraft/server-ui';
import { InventorySource } from '../core/InventorySource';
import { SlotHandle } from '../core/SlotHandle';
import { SLOT_GROUPS } from '../core/slotReferences';
import { EnchantmentService } from '../item/EnchantmentService';
import { ItemClipboard } from '../item/ItemClipboard';
import { ItemEditorService } from '../item/ItemEditorService';
import { HistoryTarget, ItemHistory } from '../item/ItemHistory';
import { ItemProperty } from '../item/ItemProperty';
import { ItemPropertyRegistry } from '../item/ItemPropertyRegistry';
import { Result, ok } from '../util/Result';
import { Color } from '../util/colors';
import { itemName, itemNameWithAmount, join, text } from '../util/rawText';
import { ExitSignal } from './ExitSignal';
import { Dialog, Label, Menu, confirmDestructive } from './Menu';
import { scriptBoolean, writableBoolean } from './observables';
import { open } from './screens';
import { chat, failWith, notify, playFailure, playSuccess } from './feedback';
import { itemRef } from '../util/names';

const NAMES_SHOWN = 3;

interface BulkAction {
    readonly label: string;
    readonly detail: string;
    readonly undoLabel: string;
    readonly done: (items: string) => string;
    readonly supports: (item: ItemStack) => boolean;
    // Finishes "Skipped 2 items that ..."
    readonly unsupported: string;
    readonly run: (slot: SlotHandle) => Result<string>;
    readonly confirm?: string;
}

export class BulkEditor {
    constructor(
        private readonly viewer: Player,
        private readonly source: InventorySource
    ) {}

    async browse(): Promise<Result<void>> {
        for (;;) {
            if (ExitSignal.isRequested(this.viewer)) {
                return ok(undefined);
            }

            let acted = false;
            const menu = new Menu(this.viewer, 'Edit several items')
                .withBack()
                .body('Pick the items to change together.');

            for (const group of this.groups()) {
                menu.option(
                    group.label,
                    async () => {
                        acted = true;
                        await this.edit(group.slots);
                    },
                    `${group.description}: ${BulkEditor.count(group.slots.length)}`
                );
            }

            menu.section('Custom').option(
                'Choose items',
                async () => {
                    acted = true;
                    const picked = await this.pick();
                    if (picked) {
                        await this.edit(picked);
                    }
                },
                'Tick exactly the items you want'
            );

            const shown = await menu.show();
            if (!shown.ok) {
                return shown;
            }
            if (!acted) {
                return ok(undefined);
            }
        }
    }

    private groups(): {
        label: string;
        description: string;
        slots: SlotHandle[];
    }[] {
        const seen = new Set<string>();
        const groups = [];

        for (const group of SLOT_GROUPS) {
            const slots = this.source.resolveMany(group.id);
            if (!slots.ok) {
                continue;
            }

            const signature = slots.value
                .map((slot) => this.historyKey(slot))
                .join('|');
            if (seen.has(signature)) {
                continue;
            }
            seen.add(signature);

            groups.push({ ...group, slots: slots.value });
        }

        return groups;
    }

    private async pick(): Promise<SlotHandle[] | undefined> {
        const form = new CustomForm(this.viewer, 'Choose items');
        form.label('Turn on every item to edit together.');
        form.spacer();

        const continueDisabled = scriptBoolean(true);
        const toggles = this.source.listOccupied().flatMap((slot) => {
            const item = slot.read();
            if (!item) {
                return [];
            }

            const chosen = writableBoolean(false);
            chosen.subscribe(() => {
                continueDisabled.setData(
                    !toggles.some((entry) => entry.chosen.getData())
                );
            });
            form.toggle(itemNameWithAmount(item), chosen, {
                description: slot.label,
            });
            return [{ slot, chosen }];
        });

        let confirmed = false;
        let wentBack = false;
        form.divider();
        form.button(
            'Continue',
            () => {
                confirmed = true;
                form.close();
            },
            { disabled: continueDisabled }
        );
        form.button(
            'Back',
            () => {
                wentBack = true;
                form.close();
            },
            { tooltip: 'Return to the previous screen' }
        );
        form.closeButton();

        const shown = await open(form, this.viewer);
        if (!shown.ok) {
            failWith(this.viewer, shown.error);
            return undefined;
        }

        if (
            !confirmed &&
            !wentBack &&
            shown.value === DataDrivenScreenClosedReason.ClientClosed
        ) {
            ExitSignal.request(this.viewer);
        }

        if (!confirmed) {
            return undefined;
        }
        const picked = toggles
            .filter((entry) => entry.chosen.getData())
            .map((entry) => entry.slot);
        return picked.length > 0 ? picked : undefined;
    }

    private async edit(slots: readonly SlotHandle[]): Promise<void> {
        for (;;) {
            if (ExitSignal.isRequested(this.viewer)) {
                return;
            }

            const targets = slots
                .filter((slot) => slot.hasItem())
                .map<HistoryTarget>((slot) => ({
                    key: this.historyKey(slot),
                    slot,
                }));
            if (targets.length === 0) {
                await Dialog.alert(
                    this.viewer,
                    'Item Editor',
                    'Those items are gone.'
                );
                return;
            }

            const items = targets.flatMap((target) => {
                const item = target.slot.read();
                return item ? [item] : [];
            });

            let acted = false;
            const menu = new Menu(this.viewer, BulkEditor.count(targets.length))
                .withBack()
                .body(BulkEditor.names(items));

            const add = (action: BulkAction): void => {
                const supported = items.filter(action.supports).length;
                if (supported === 0) {
                    return;
                }
                const reach =
                    supported === items.length
                        ? ''
                        : ` (${supported} of ${items.length})`;
                menu.option(
                    action.label,
                    async () => {
                        acted = true;
                        await this.apply(action, targets);
                    },
                    `${action.detail}${reach}`
                );
            };

            menu.section('Enchantments');
            this.enchantmentActions().forEach(add);

            menu.section('Durability');
            this.durabilityActions().forEach(add);

            menu.section('Other');
            this.otherActions().forEach(add);

            const pending = ItemHistory.pending(targets);
            if (pending) {
                menu.section('History').option(
                    'Undo last change',
                    () => {
                        acted = true;
                        this.report(ItemHistory.undoLatest(targets));
                    },
                    `Take back ${pending.label} on ${BulkEditor.count(pending.count)}`
                );
            }

            const shown = await menu.show();
            if (!shown.ok) {
                this.report(shown);
                return;
            }
            if (!acted) {
                return;
            }
        }
    }

    private enchantmentActions(): BulkAction[] {
        return [
            {
                label: 'Max all enchantments',
                detail: 'Every compatible enchantment at its highest level, leaving out curses',
                undoLabel: 'maxing enchantments',
                done: (items) => `Maxed enchantments on ${items}.`,
                supports: EnchantmentService.supports,
                unsupported: "can't be enchanted",
                run: (slot) => EnchantmentService.fill(slot),
            },
            {
                label: 'Remove all enchantments',
                detail: 'Take every enchantment off',
                undoLabel: 'removing enchantments',
                done: (items) => `Removed enchantments from ${items}.`,
                supports: EnchantmentService.supports,
                unsupported: "can't be enchanted",
                run: (slot) => EnchantmentService.removeAll(slot),
                confirm: 'Remove every enchantment from these items?',
            },
        ];
    }

    private durabilityActions(): BulkAction[] {
        const damage = BulkEditor.property('damage');
        const unbreakable = BulkEditor.property('unbreakable');
        const actions: BulkAction[] = [];

        if (damage) {
            actions.push({
                label: 'Repair',
                detail: 'Restore full durability',
                undoLabel: 'the repair',
                done: (items) => `Repaired ${items}.`,
                supports: (item) => damage.supports(item),
                unsupported: "can't take damage",
                run: (slot) => ItemEditorService.resetProperty(slot, damage),
            });
        }

        if (unbreakable) {
            actions.push(
                {
                    label: 'Make unbreakable',
                    detail: 'Stop them taking durability damage',
                    undoLabel: 'making them unbreakable',
                    done: (items) => `Made ${items} unbreakable.`,
                    supports: (item) => unbreakable.supports(item),
                    unsupported: "can't take damage",
                    run: (slot) =>
                        ItemEditorService.setProperty(
                            slot,
                            unbreakable,
                            'true'
                        ),
                },
                {
                    label: 'Make breakable',
                    detail: 'Let them wear down normally again',
                    undoLabel: 'making them breakable',
                    done: (items) => `Made ${items} breakable again.`,
                    supports: (item) => unbreakable.supports(item),
                    unsupported: "can't take damage",
                    run: (slot) =>
                        ItemEditorService.setProperty(
                            slot,
                            unbreakable,
                            'false'
                        ),
                }
            );
        }

        return actions;
    }

    private otherActions(): BulkAction[] {
        const actions: BulkAction[] = [];

        const keepOnDeath = BulkEditor.property('keepondeath');
        if (keepOnDeath) {
            actions.push({
                label: 'Keep on death',
                detail: 'Stay in the inventory when the holder dies',
                undoLabel: 'turning on keep on death',
                done: (items) => `${items} will now be kept on death.`,
                supports: () => true,
                unsupported: 'cannot be kept',
                run: (slot) =>
                    ItemEditorService.setProperty(slot, keepOnDeath, 'true'),
            });
        }

        if (ItemClipboard.has(this.viewer)) {
            actions.push({
                label: 'Paste data',
                detail: `Apply the data copied from ${ItemClipboard.label(this.viewer)}`,
                undoLabel: 'pasting item data',
                done: (items) => `Pasted data onto ${items}.`,
                supports: () => true,
                unsupported: 'cannot take pasted data',
                run: (slot) => ItemClipboard.paste(this.viewer, slot),
            });
        }

        return actions;
    }

    private async apply(
        action: BulkAction,
        targets: readonly HistoryTarget[]
    ): Promise<void> {
        if (
            action.confirm &&
            !(await confirmDestructive(
                this.viewer,
                action.label,
                action.confirm,
                action.label
            ))
        ) {
            return;
        }

        const batch = ItemHistory.nextBatch();
        const skipped: string[] = [];
        let changed = 0;
        let failed = false;

        for (const { key, slot } of targets) {
            const item = slot.read();
            if (!item) {
                continue;
            }

            const name = item.nameTag ?? itemRef(item);
            if (!action.supports(item)) {
                skipped.push(name);
                continue;
            }

            const outcome = ItemHistory.around(
                key,
                slot,
                action.undoLabel,
                () => action.run(slot),
                batch
            );
            if (outcome.ok) {
                changed++;
            } else {
                failed = true;
                chat(
                    this.viewer,
                    `${Color.Red}${name}: ${outcome.error}`,
                    'failure'
                );
            }
        }

        if (failed || changed === 0) {
            playFailure(this.viewer);
        } else {
            playSuccess(this.viewer);
        }

        if (changed > 0) {
            chat(
                this.viewer,
                `${Color.Green}${action.done(BulkEditor.count(changed))}`,
                'success'
            );
        }
        if (skipped.length > 0) {
            chat(
                this.viewer,
                `${Color.Gray}Skipped ${BulkEditor.count(skipped.length)} that ${action.unsupported}: ${skipped.join(', ')}.`
            );
        }
    }

    // Same keys as the single-item screens or undo won't line up.
    private historyKey(slot: SlotHandle): string {
        return ItemHistory.keyFor(this.source.id, slot);
    }

    private report(outcome: Result<unknown>): void {
        notify(this.viewer, outcome);
    }

    private static property(id: string): ItemProperty | undefined {
        const property = ItemPropertyRegistry.get(id);
        return property.ok ? property.value : undefined;
    }

    private static count(count: number): string {
        return `${count} item${count === 1 ? '' : 's'}`;
    }

    private static names(items: readonly ItemStack[]): Label {
        const parts = items
            .slice(0, NAMES_SHOWN)
            .flatMap((item, index) =>
                index === 0 ? [itemName(item)] : [text(', '), itemName(item)]
            );
        if (items.length > NAMES_SHOWN) {
            parts.push(text(` and ${items.length - NAMES_SHOWN} more`));
        }
        return join(...parts);
    }
}
