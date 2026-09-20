import {
    EnchantmentTypes,
    ItemComponentTypes,
    Player,
} from '@minecraft/server';
import { CustomForm } from '@minecraft/server-ui';
import { SlotHandle } from '../core/SlotHandle';
import {
    EnchantmentChoice,
    EnchantmentService,
} from '../item/EnchantmentService';
import { ItemEditorService } from '../item/ItemEditorService';
import { Result, fail, ok } from '../util/Result';
import { idToName, sameId, levelText } from '../util/text';
import { Menu, confirmDestructive } from './Menu';
import { clamp, scriptNumber, writableNumber } from './observables';
import { ExitSignal } from './ExitSignal';
import { open } from './screens';
import { notify } from './feedback';
import { itemRef } from '../util/names';

type Choice = EnchantmentChoice;

interface Applied {
    readonly id: string;
    readonly level: number;
}

export class EnchantmentEditor {
    constructor(
        private readonly viewer: Player,
        private readonly slot: SlotHandle
    ) {}

    static supports(slot: SlotHandle): boolean {
        const item = ItemEditorService.require(slot);
        return (
            item.ok && item.value.hasComponent(ItemComponentTypes.Enchantable)
        );
    }

    async browse(): Promise<Result<void>> {
        for (;;) {
            if (ExitSignal.isRequested(this.viewer)) {
                return ok(undefined);
            }

            const applied = this.read();
            if (!applied.ok) {
                return applied;
            }

            let acted = false;
            const menu = new Menu(this.viewer, 'Enchantments')
                .withBack()
                .body(
                    applied.value.length === 0
                        ? 'None applied.'
                        : `${applied.value.length} applied.`
                );

            for (const entry of applied.value) {
                menu.option(
                    `${idToName(entry.id)} ${levelText(entry.level)}`,
                    async () => {
                        acted = true;
                        await this.edit(entry);
                    },
                    'Change the level or remove it'
                );
            }

            const available = this.available(applied.value);
            if (available.length > 0) {
                menu.section('Add').option(
                    'New enchantment',
                    async () => {
                        acted = true;
                        await this.edit(undefined);
                    },
                    `${available.length} available for this item`
                );
            }

            menu.section('Bulk').option(
                'Max all enchantments',
                async () => {
                    acted = true;
                    await this.maxAll();
                },
                'Add every compatible enchantment at its highest level, leaving out curses'
            );

            if (applied.value.length > 0) {
                menu.option(
                    'Remove all enchantments',
                    async () => {
                        acted = true;
                        await this.removeAll();
                    },
                    'Take every enchantment off this item'
                );
            }

            const shown = await menu.show();
            if (!shown.ok) {
                return shown;
            }
            if (!acted) {
                return ok(undefined);
            }
        }
    }

    private async edit(existing: Applied | undefined): Promise<void> {
        const applied = this.read();
        if (!applied.ok) {
            return;
        }

        const choices = existing
            ? this.choicesFor(existing.id)
            : this.available(applied.value);
        if (choices.length === 0) {
            return;
        }

        const startIndex = existing
            ? Math.max(
                  choices.findIndex((choice) => sameId(choice.id, existing.id)),
                  0
              )
            : 0;
        const start = choices[startIndex]!;

        const form = new CustomForm(
            this.viewer,
            existing ? idToName(existing.id) : 'Add enchantment'
        );

        const choice = writableNumber(startIndex);
        const maximum = scriptNumber(start.maxLevel);
        const level = writableNumber(
            clamp(existing?.level ?? 1, 1, start.maxLevel)
        );

        choice.subscribe((selected) => {
            const picked = choices[Math.round(selected)];
            if (!picked) {
                return;
            }
            maximum.setData(picked.maxLevel);
            if (level.getData() > picked.maxLevel) {
                level.setData(picked.maxLevel);
            }
        });

        form.dropdown(
            'Enchantment',
            choice,
            choices.map((entry, index) => ({
                label: entry.label,
                value: index,
                description: `Up to level ${entry.maxLevel}`,
            })),
            { disabled: existing !== undefined }
        );
        form.slider('Level', level, 1, maximum, {
            step: 1,
            description: 'Capped by the enchantment itself',
        });

        let action: 'save' | 'remove' | undefined;
        form.divider();
        form.button('Save', () => {
            action = 'save';
            form.close();
        });

        if (existing) {
            form.button(
                'Remove enchantment',
                () => {
                    action = 'remove';
                    form.close();
                },
                { tooltip: 'Take this enchantment off the item' }
            );
        }

        form.closeButton();

        const shown = await open(form, this.viewer);
        if (!shown.ok || !action) {
            return;
        }

        const picked = choices[Math.round(choice.getData())] ?? start;
        const next = new Map(
            applied.value.map((entry) => [entry.id, entry.level] as const)
        );

        if (action === 'remove' && existing) {
            next.delete(existing.id);
        } else {
            next.set(picked.id, Math.round(level.getData()));
        }

        this.report(this.write(next));
    }

    private async maxAll(): Promise<void> {
        const item = ItemEditorService.require(this.slot);
        if (!item.ok) {
            return;
        }

        const levels = EnchantmentService.plan(item.value);
        this.report(levels.ok ? this.write(levels.value) : levels);
    }

    private async removeAll(): Promise<void> {
        const confirmed = await confirmDestructive(
            this.viewer,
            'Remove all enchantments',
            'Remove every enchantment currently on this item?',
            'Remove all'
        );
        if (!confirmed) {
            return;
        }

        this.report(this.write(new Map()));
    }

    private read(): Result<Applied[]> {
        const item = ItemEditorService.require(this.slot);
        if (!item.ok) {
            return item;
        }

        const enchantable = item.value.getComponent(
            ItemComponentTypes.Enchantable
        );
        if (!enchantable) {
            return fail(`${itemRef(item.value)} cannot be enchanted.`);
        }

        return ok(
            enchantable
                .getEnchantments()
                .map((entry) => ({ id: entry.type.id, level: entry.level }))
        );
    }

    private write(levels: ReadonlyMap<string, number>): Result<string> {
        return EnchantmentService.write(this.slot, levels);
    }

    private available(applied: readonly Applied[]): Choice[] {
        const item = ItemEditorService.require(this.slot);
        if (!item.ok) {
            return [];
        }

        const scratch = item.value.clone();
        const enchantable = scratch.getComponent(
            ItemComponentTypes.Enchantable
        );
        if (!enchantable) {
            return [];
        }

        const taken = new Set(applied.map((entry) => entry.id));

        return this.allChoices().filter((choice) => {
            if (taken.has(choice.id)) {
                return false;
            }

            const type = EnchantmentTypes.get(choice.id);
            if (!type) {
                return false;
            }

            // Can throw instead of returning false, e.g. LevelOutOfBounds when
            // vanilla-data doesn't match the game version.
            try {
                return enchantable.canAddEnchantment({ type, level: 1 });
            } catch {
                return false;
            }
        });
    }

    private choicesFor(id: string): Choice[] {
        return this.allChoices().filter((choice) => sameId(choice.id, id));
    }

    private allChoices(): Choice[] {
        return EnchantmentService.choices();
    }

    private report(outcome: Result<string>): void {
        notify(this.viewer, outcome);
    }
}
