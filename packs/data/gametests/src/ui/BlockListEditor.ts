import { Player } from '@minecraft/server';
import { CustomForm } from '@minecraft/server-ui';
import { SlotHandle } from '../core/SlotHandle';
import { ItemEditorService, textEdit } from '../item/ItemEditorService';
import { ItemProperty } from '../item/ItemProperty';
import { ItemPropertyRegistry } from '../item/ItemPropertyRegistry';
import { Result, ok } from '../util/Result';
import { blockTypeName } from '../util/rawText';
import { splitList } from '../util/text';
import { ExitSignal } from './ExitSignal';
import { Menu } from './Menu';
import { writableString } from './observables';
import { open } from './screens';
import { notify } from './feedback';

export class BlockListEditor {
    constructor(
        private readonly viewer: Player,
        private readonly slot: SlotHandle,
        private readonly propertyId: 'candestroy' | 'canplaceon'
    ) {}

    async browse(): Promise<Result<void>> {
        for (;;) {
            if (ExitSignal.isRequested(this.viewer)) {
                return ok(undefined);
            }

            const property = ItemPropertyRegistry.get(this.propertyId);
            if (!property.ok) {
                return property;
            }

            const blocks = this.read(property.value);
            if (!blocks.ok) {
                return blocks;
            }

            let acted = false;
            const menu = new Menu(this.viewer, property.value.label)
                .withBack()
                .body(
                    blocks.value.length === 0
                        ? 'No blocks yet.'
                        : `${blocks.value.length} block${blocks.value.length === 1 ? '' : 's'}.`
                );

            blocks.value.forEach((block, index) => {
                menu.option(
                    blockTypeName(block),
                    async () => {
                        acted = true;
                        await this.editBlock(property.value, index, block);
                    },
                    block
                );
            });

            menu.section('Add').option(
                'New block',
                async () => {
                    acted = true;
                    await this.editBlock(
                        property.value,
                        blocks.value.length,
                        ''
                    );
                },
                'Append a block identifier'
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

    private async editBlock(
        property: ItemProperty,
        index: number,
        current: string
    ): Promise<void> {
        const exists = current.length > 0;
        const form = new CustomForm(
            this.viewer,
            exists ? `Block ${index + 1}` : 'New block'
        );

        const text = writableString(current);
        form.textField('Block identifier', text, {
            description: 'e.g. minecraft:stone',
        });

        let action: 'save' | 'remove' | undefined;
        form.divider();
        form.button('Save', () => {
            action = 'save';
            form.close();
        });

        if (exists) {
            form.button(
                'Remove block',
                () => {
                    action = 'remove';
                    form.close();
                },
                { tooltip: 'Delete this block' }
            );
        }

        form.closeButton();

        const shown = await open(form, this.viewer);
        if (!shown.ok || !action) {
            return;
        }

        const blocks = this.read(property);
        if (!blocks.ok) {
            return;
        }

        const updated = [...blocks.value];
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

        this.report(this.write(property, updated));
    }

    private read(property: ItemProperty): Result<string[]> {
        const item = ItemEditorService.require(this.slot);
        return item.ok ? ok(splitList(property.toInput(item.value))) : item;
    }

    private write(property: ItemProperty, blocks: string[]): Result<string> {
        return ItemEditorService.applyAll(this.slot, [
            textEdit(property, blocks.join(', ')),
        ]);
    }

    private report(outcome: Result<string>): void {
        notify(this.viewer, outcome);
    }
}
