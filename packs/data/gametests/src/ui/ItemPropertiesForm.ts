import { ItemStack, Player } from '@minecraft/server';
import { CustomForm, ObservableBoolean } from '@minecraft/server-ui';
import { SlotHandle } from '../core/SlotHandle';
import {
    ItemEditorService,
    PropertyEdit,
    textEdit,
} from '../item/ItemEditorService';
import { ItemMutation, ItemProperty } from '../item/ItemProperty';
import { ItemPropertyRegistry } from '../item/ItemPropertyRegistry';
import { Result, ok } from '../util/Result';
import { itemName } from '../util/rawText';
import {
    clamp,
    scriptBoolean,
    scriptNumber,
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
    readonly refresh?: (draft: ItemStack) => void;
}

export class ItemPropertiesForm {
    private constructor(
        private readonly item: ItemStack,
        private readonly properties: readonly ItemProperty[]
    ) {}

    static forItem(item: ItemStack): ItemPropertiesForm {
        const properties = ItemPropertyRegistry.supportedBy(item).filter(
            (property) => property.valueKind !== 'composite'
        );
        return new ItemPropertiesForm(item, properties);
    }

    get isEmpty(): boolean {
        return !this.properties.some((property) =>
            isRenderable(property, this.item)
        );
    }

    async prompt(viewer: Player, slot: SlotHandle): Promise<Result<string>> {
        const form = new CustomForm(viewer, itemName(this.item));
        form.label(slot.label);
        form.spacer();

        const rejected = new Set<string>();
        const saveDisabled = scriptBoolean(false);

        const bound: Bound[] = [];
        let refreshing = false;
        const changed = (): void => {
            if (!refreshing) {
                refreshing = true;
                this.refresh(bound);
                refreshing = false;
            }
        };
        for (const property of this.properties) {
            bound.push(
                this.bind(form, property, rejected, saveDisabled, changed)
            );
        }

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

    private refresh(bound: readonly Bound[]): void {
        const pending = bound.map((entry) => pendingEdit(entry, this.item));
        bound.forEach((entry, index) => {
            if (!entry.refresh) {
                return;
            }
            const draft = this.item.clone();
            pending.forEach((mutate, at) => {
                if (mutate && at !== index) {
                    mutate(draft);
                }
            });
            entry.refresh(draft);
        });
    }

    private bind(
        form: CustomForm,
        property: ItemProperty,
        rejected: Set<string>,
        saveDisabled: ObservableBoolean,
        changed: () => void
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
                value.subscribe((raw) => {
                    validate(raw);
                    changed();
                });
                form.textField(property.label, value, options);
                return { property, original, read: () => value.getData() };
            }

            case 'toggle': {
                const value = writableBoolean(original === 'true');
                value.subscribe(() => changed());
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
                const min = scriptNumber(control.min);
                const max = scriptNumber(control.max);
                const visible = scriptBoolean(control.max > control.min);
                value.subscribe((raw) => {
                    validate(String(Math.round(raw)));
                    changed();
                });
                form.slider(property.label, value, min, max, {
                    ...options,
                    step: control.step,
                    visible,
                });
                return {
                    property,
                    original,
                    read: () => String(Math.round(value.getData())),
                    refresh: (draft) => {
                        const live = property.control(draft);
                        if (live.kind !== 'slider') {
                            return;
                        }
                        min.setData(live.min);
                        max.setData(live.max);
                        visible.setData(live.max > live.min);
                        const current = value.getData();
                        const fitted = clamp(current, live.min, live.max);
                        if (fitted !== current) {
                            value.setData(fitted);
                        }
                    },
                };
            }

            case 'dropdown': {
                const choices = control.options;
                const value = writableNumber(
                    Math.max(choices.indexOf(original), 0)
                );
                value.subscribe(() => changed());
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

function pendingEdit(entry: Bound, item: ItemStack): ItemMutation | undefined {
    const raw = entry.read();
    if (raw === entry.original) {
        return undefined;
    }
    const parsed = entry.property.parse(raw, item);
    return parsed.ok ? parsed.value : undefined;
}

function isRenderable(property: ItemProperty, item: ItemStack): boolean {
    const control = property.control(item);
    return control.kind !== 'slider' || control.max > control.min;
}
