import { ItemStack, Player } from '@minecraft/server';
import { CustomForm, ObservableBoolean } from '@minecraft/server-ui';
import { SlotHandle } from '../core/SlotHandle';
import {
    ItemEditorService,
    PropertyEdit,
    textEdit,
} from '../item/ItemEditorService';
import { ItemProperty } from '../item/ItemProperty';
import { ItemPropertyRegistry } from '../item/ItemPropertyRegistry';
import { Result, ok } from '../util/Result';
import { itemName } from '../util/rawText';
import {
    clamp,
    scriptBoolean,
    scriptString,
    writableBoolean,
    writableNumber,
    writableString,
} from './observables';
import { open } from './screens';

interface Bound {
    readonly property: ItemProperty;
    readonly original: string;
    readonly read: () => string;
}

export class ItemPropertiesForm {
    private constructor(
        private readonly item: ItemStack,
        private readonly properties: readonly ItemProperty[]
    ) {}

    static forItem(item: ItemStack): ItemPropertiesForm {
        const properties = ItemPropertyRegistry.supportedBy(item).filter(
            (property) =>
                property.valueKind !== 'composite' &&
                isRenderable(property, item)
        );
        return new ItemPropertiesForm(item, properties);
    }

    get isEmpty(): boolean {
        return this.properties.length === 0;
    }

    async prompt(viewer: Player, slot: SlotHandle): Promise<Result<string>> {
        const form = new CustomForm(viewer, itemName(this.item));
        form.label(slot.label);
        form.spacer();

        const rejected = new Set<string>();
        const saveDisabled = scriptBoolean(false);

        const bound = this.properties.map((property) =>
            this.bind(form, property, rejected, saveDisabled)
        );

        let save = false;
        form.divider();
        form.button(
            'Save changes',
            () => {
                save = true;
                form.close();
            },
            { tooltip: this.item.typeId, disabled: saveDisabled }
        );
        form.closeButton();

        const shown = await open(form, viewer);
        if (!shown.ok) {
            return shown;
        }
        if (!save) {
            return ok('');
        }

        const edits = bound
            .filter((entry) => entry.read() !== entry.original)
            .map<PropertyEdit>((entry) =>
                textEdit(entry.property, entry.read())
            );

        return edits.length === 0
            ? ok('')
            : ItemEditorService.applyAll(slot, edits);
    }

    private bind(
        form: CustomForm,
        property: ItemProperty,
        rejected: Set<string>,
        saveDisabled: ObservableBoolean
    ): Bound {
        const control = property.control(this.item);
        const original = property.toInput(this.item);

        const description = scriptString(property.description);
        const options = { description };

        const validate = (raw: string): void => {
            const parsed = property.parse(raw, this.item);
            if (parsed.ok) {
                rejected.delete(property.id);
                description.setData(property.description);
            } else {
                rejected.add(property.id);
                description.setData(parsed.error);
            }
            saveDisabled.setData(rejected.size > 0);
        };

        switch (control.kind) {
            case 'text': {
                const value = writableString(original);
                value.subscribe((raw) => validate(raw));
                form.textField(property.label, value, options);
                return { property, original, read: () => value.getData() };
            }

            case 'toggle': {
                const value = writableBoolean(original === 'true');
                form.toggle(property.label, value, options);
                return {
                    property,
                    original,
                    read: () => String(value.getData()),
                };
            }

            case 'slider': {
                const value = writableNumber(
                    clamp(
                        Number.parseInt(original, 10),
                        control.min,
                        control.max
                    )
                );
                value.subscribe((raw) => validate(String(Math.round(raw))));
                form.slider(property.label, value, control.min, control.max, {
                    ...options,
                    step: control.step,
                });
                return {
                    property,
                    original,
                    read: () => String(Math.round(value.getData())),
                };
            }

            case 'dropdown': {
                const choices = control.options;
                const value = writableNumber(
                    Math.max(choices.indexOf(original), 0)
                );
                form.dropdown(
                    property.label,
                    value,
                    choices.map((label, index) => ({ label, value: index })),
                    options
                );
                return {
                    property,
                    original,
                    read: () => choices[value.getData()] ?? original,
                };
            }
        }
    }
}

function isRenderable(property: ItemProperty, item: ItemStack): boolean {
    const control = property.control(item);
    return control.kind !== 'slider' || control.max > control.min;
}
