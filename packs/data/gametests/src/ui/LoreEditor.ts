import { Player } from '@minecraft/server';
import { CustomForm } from '@minecraft/server-ui';
import { SlotHandle } from '../core/SlotHandle';
import { ItemEditorService, jsonEdit } from '../item/ItemEditorService';
import { ItemPropertyRegistry } from '../item/ItemPropertyRegistry';
import { Result, fail, ok } from '../util/Result';
import { Menu } from './Menu';
import { writableString } from './observables';
import { ExitSignal } from './ExitSignal';
import { open } from './screens';
import { notify } from './feedback';

const PREVIEW_LENGTH = 30;

export class LoreEditor {
    constructor(
        private readonly viewer: Player,
        private readonly slot: SlotHandle
    ) {}

    async browse(): Promise<Result<void>> {
        for (;;) {
            if (ExitSignal.isRequested(this.viewer)) {
                return ok(undefined);
            }

            const lines = this.read();
            if (!lines.ok) {
                return lines;
            }

            let acted = false;
            const menu = new Menu(this.viewer, 'Lore')
                .withBack()
                .body(
                    lines.value.length === 0
                        ? 'No lore yet.'
                        : `${lines.value.length} line${lines.value.length === 1 ? '' : 's'}.`
                );

            lines.value.forEach((line, index) => {
                menu.option(
                    `${index + 1}. ${preview(line)}`,
                    async () => {
                        acted = true;
                        await this.editLine(index, line);
                    },
                    'Edit or remove this line'
                );
            });

            menu.section('Add').option(
                'New line',
                async () => {
                    acted = true;
                    await this.editLine(lines.value.length, '');
                },
                'Append a line to the end'
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

    private async editLine(index: number, current: string): Promise<void> {
        const exists = current.length > 0;
        const form = new CustomForm(
            this.viewer,
            exists ? `Line ${index + 1}` : 'New line'
        );

        const text = writableString(current);
        form.textField('Text', text, {
            description: 'Supports § formatting codes',
        });

        let action: 'save' | 'remove' | undefined;
        form.divider();
        form.button('Save', () => {
            action = 'save';
            form.close();
        });

        if (exists) {
            form.button(
                'Remove line',
                () => {
                    action = 'remove';
                    form.close();
                },
                { tooltip: 'Delete this line' }
            );
        }

        form.closeButton();

        const shown = await open(form, this.viewer);
        if (!shown.ok || !action) {
            return;
        }

        const lines = this.read();
        if (!lines.ok) {
            return;
        }

        const updated = [...lines.value];
        if (action === 'remove') {
            updated.splice(index, 1);
        } else {
            const value = text.getData().trim();
            if (value.length === 0) {
                updated.splice(index, 1);
            } else {
                updated[index] = value;
            }
        }

        this.report(this.write(updated));
    }

    private read(): Result<string[]> {
        const item = ItemEditorService.require(this.slot);
        return item.ok ? ok(item.value.getLore()) : item;
    }

    private write(lines: string[]): Result<string> {
        const property = ItemPropertyRegistry.get('lore');
        if (!property.ok) {
            return fail("Can't edit lore.");
        }
        return ItemEditorService.applyAll(this.slot, [
            jsonEdit(property.value, lines),
        ]);
    }

    private report(outcome: Result<string>): void {
        notify(this.viewer, outcome);
    }
}

function preview(line: string): string {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
        return '(empty)';
    }
    return trimmed.length > PREVIEW_LENGTH
        ? `${trimmed.slice(0, PREVIEW_LENGTH - 1)}…`
        : trimmed;
}
