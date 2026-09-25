import { Player, system } from '@minecraft/server';
import { CustomForm, ObservableBoolean } from '@minecraft/server-ui';
import {
    Ability,
    CONDITIONS,
    COSTS,
    MAX_STEPS,
    STEP_DELAY,
    Step,
    TIMING,
    abilityTerms,
    describeStep,
    describeSteps,
    newAbilityId,
    parseAbility,
    parseStep,
    readAbilities,
    serializeAbility,
    serializeStep,
    triggerLabel,
} from '../abilities/Ability';
import { AbilityRuntime } from '../abilities/AbilityRuntime';
import { ACTIONS, actionFor } from '../abilities/actions';
import { ceilingOf, defaultValue, targetOptions } from '../abilities/fields';
import { allowsAbilities } from '../abilities/storage';
import { TEMPLATES, Template } from '../abilities/templates';
import {
    ActionDefinition,
    ChoiceOption,
    FieldSpec,
    FieldValue,
    TRIGGERS,
    Trigger,
    Values,
} from '../abilities/types';
import { Settings } from '../core/Settings';
import { SlotHandle } from '../core/SlotHandle';
import { ItemEditorService, jsonEdit } from '../item/ItemEditorService';
import { ItemPropertyRegistry } from '../item/ItemPropertyRegistry';
import { Result, fail, ok } from '../util/Result';
import { Color } from '../util/colors';
import { ExitSignal } from './ExitSignal';
import { notify } from './feedback';
import { Menu, confirmDestructive } from './Menu';
import {
    clamp,
    scriptBoolean,
    writableBoolean,
    writableNumber,
    writableString,
} from './observables';
import { open } from './screens';

type Outcome = { readonly saved: string } | 'closed' | 'stop';

const LABEL_LENGTH = 40;

interface StepPlace {
    readonly trigger: Trigger;
    readonly abilityId?: string;
    readonly index?: number;
}

interface Bound {
    readonly read: () => FieldValue;
    readonly watch: (listener: (value: FieldValue) => void) => void;
}

export class AbilityEditor {
    constructor(
        private readonly viewer: Player,
        private readonly slot: SlotHandle
    ) {}

    static supports(slot: SlotHandle): boolean {
        const item = ItemEditorService.require(slot);
        return item.ok && allowsAbilities(item.value);
    }

    async browse(): Promise<Result<void>> {
        for (;;) {
            if (ExitSignal.isRequested(this.viewer)) {
                return ok(undefined);
            }

            const abilities = this.read();
            if (!abilities.ok) {
                return abilities;
            }

            let acted = false;
            const count = abilities.value.length;
            const menu = new Menu(this.viewer, 'Abilities')
                .withBack()
                .body(
                    (count === 0
                        ? 'Nothing yet. A template is the quickest way in.'
                        : `${count} on this item.`) + this.stackNote()
                );

            for (const trigger of TRIGGERS) {
                const group = abilities.value.filter(
                    (ability) => ability.trigger === trigger.id
                );
                if (group.length === 0) {
                    continue;
                }
                menu.section(trigger.label);
                for (const ability of group) {
                    menu.option(
                        ability.enabled
                            ? clip(describeSteps(ability))
                            : `${Color.Gray}${clip(describeSteps(ability))}`,
                        async () => {
                            acted = true;
                            await this.hub(ability.id);
                        },
                        abilityTerms(ability) || 'Every time, no cooldown'
                    );
                }
            }

            menu.section('Add')
                .option(
                    'New ability',
                    async () => {
                        acted = true;
                        await this.create();
                    },
                    'Pick when it fires, then what it does'
                )
                .option(
                    'From a template',
                    async () => {
                        acted = true;
                        await this.fromTemplate();
                    },
                    `${TEMPLATES.length} ready to use, change them after`
                );

            if (count > 0) {
                menu.option(
                    'Remove all abilities',
                    async () => {
                        acted = true;
                        await this.removeAll();
                    },
                    'Clear every ability off this item'
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

    private async hub(id: string): Promise<void> {
        for (;;) {
            if (ExitSignal.isRequested(this.viewer)) {
                return;
            }
            const ability = this.find(id);
            if (!ability) {
                return;
            }

            let acted = false;
            const menu = new Menu(this.viewer, triggerLabel(ability.trigger))
                .withBack()
                .body(abilityTerms(ability) || 'Fires every time, no cooldown.')
                .section('Steps');

            ability.steps.forEach((step, index) => {
                menu.option(
                    `${index + 1}. ${clip(describeStep(step))}`,
                    async () => {
                        acted = true;
                        const action = actionFor(step.action);
                        if (action) {
                            await this.editStep(
                                {
                                    trigger: ability.trigger,
                                    abilityId: id,
                                    index,
                                },
                                action
                            );
                        }
                    },
                    'Change or remove this step'
                );
            });
            if (ability.steps.length < MAX_STEPS) {
                menu.option(
                    'Add a step',
                    async () => {
                        acted = true;
                        await this.addStep(ability);
                    },
                    'Runs after the ones above'
                );
            }

            menu.section('Ability')
                .option(
                    'Conditions and costs',
                    async () => {
                        acted = true;
                        await this.editSettings(ability);
                    },
                    'When it fires, how often, and what it takes'
                )
                .option(
                    'Try it',
                    () => {
                        acted = true;
                        this.tryOut(ability);
                    },
                    'Closes the menu and runs it once, mining steps left out'
                )
                .option(
                    ability.enabled ? 'Turn off' : 'Turn on',
                    () => {
                        acted = true;
                        this.report(
                            this.update(id, (current) => ({
                                ...current,
                                enabled: !current.enabled,
                            }))
                        );
                    },
                    ability.enabled
                        ? 'Keep it, but stop it firing'
                        : 'Let it fire again'
                )
                .option(
                    'Duplicate',
                    () => {
                        acted = true;
                        this.report(this.duplicate(ability));
                    },
                    'Add a copy to change'
                )
                .option(
                    'Remove ability',
                    async () => {
                        acted = true;
                        await this.remove(ability);
                    },
                    'Take it off the item'
                );

            const shown = await menu.show();
            if (!shown.ok || !acted) {
                return;
            }
        }
    }

    private async create(): Promise<void> {
        for (;;) {
            const trigger = await this.pickTrigger();
            if (!trigger) {
                return;
            }
            for (;;) {
                const action = await this.pickAction(trigger);
                if (ExitSignal.isRequested(this.viewer)) {
                    return;
                }
                if (!action) {
                    break;
                }
                const outcome = await this.editStep({ trigger }, action);
                if (outcome === 'closed') {
                    continue;
                }
                if (outcome !== 'stop') {
                    await this.hub(outcome.saved);
                }
                return;
            }
        }
    }

    private async addStep(ability: Ability): Promise<void> {
        for (;;) {
            const action = await this.pickAction(ability.trigger);
            if (!action || ExitSignal.isRequested(this.viewer)) {
                return;
            }
            const outcome = await this.editStep(
                { trigger: ability.trigger, abilityId: ability.id },
                action
            );
            if (outcome !== 'closed') {
                return;
            }
        }
    }

    private async fromTemplate(): Promise<void> {
        let picked: Template | undefined;
        const menu = new Menu(this.viewer, 'Templates').withBack();
        for (const trigger of TRIGGERS) {
            const group = TEMPLATES.filter(
                (template) => template.ability.trigger === trigger.id
            );
            if (group.length === 0) {
                continue;
            }
            menu.section(trigger.label);
            for (const template of group) {
                menu.option(
                    template.label,
                    () => {
                        picked = template;
                    },
                    template.detail
                );
            }
        }

        const shown = await menu.show();
        if (!shown.ok || !picked) {
            return;
        }

        const ability = parseAbility(picked.ability);
        const current = this.read();
        if (!ability.ok || !current.ok) {
            this.report(ability.ok ? current : ability);
            return;
        }
        const written = this.write([...current.value, ability.value]);
        this.report(written);
        if (written.ok) {
            await this.hub(ability.value.id);
        }
    }

    private async pickTrigger(): Promise<Trigger | undefined> {
        let trigger: Trigger | undefined;
        const menu = new Menu(this.viewer, 'When does it fire?').withBack();
        for (const entry of TRIGGERS) {
            menu.option(
                entry.label,
                () => {
                    trigger = entry.id;
                },
                entry.detail
            );
        }
        const shown = await menu.show();
        return shown.ok ? trigger : undefined;
    }

    private async pickAction(
        trigger: Trigger
    ): Promise<ActionDefinition | undefined> {
        const groups = new Map<string, ActionDefinition[]>();
        for (const action of ACTIONS) {
            if (!action.triggers || action.triggers.includes(trigger)) {
                groups.set(action.group, [
                    ...(groups.get(action.group) ?? []),
                    action,
                ]);
            }
        }

        let picked: ActionDefinition | undefined;
        const menu = new Menu(this.viewer, triggerLabel(trigger)).withBack();
        for (const [group, actions] of groups) {
            menu.section(group);
            for (const action of actions) {
                menu.option(
                    action.label,
                    () => {
                        picked = action;
                    },
                    action.detail
                );
            }
        }
        const shown = await menu.show();
        return shown.ok ? picked : undefined;
    }

    // Bad input reopens the form with what was typed and the reason on top,
    // rather than throwing it all away.
    private async editStep(
        place: StepPlace,
        action: ActionDefinition
    ): Promise<Outcome> {
        const ability = place.abilityId
            ? this.find(place.abilityId)
            : undefined;
        const existing =
            place.index !== undefined ? ability?.steps[place.index] : undefined;
        let values: Values | undefined = existing && {
            ...existing.values,
            delay: existing.delay,
        };
        let problem: string | undefined;

        for (;;) {
            const form = new CustomForm(
                this.viewer,
                `${triggerLabel(place.trigger)}: ${action.label}`
            );
            if (problem) {
                form.label(`${Color.Red}${problem}`);
                form.spacer();
            }
            const read = this.bindFields(
                form,
                [...action.fields, STEP_DELAY],
                place.trigger,
                values
            );

            let choice: 'save' | 'remove' | undefined;
            form.divider();
            form.button('Save', () => {
                choice = 'save';
                form.close();
            });
            if (existing && ability && ability.steps.length > 1) {
                form.button(
                    'Remove step',
                    () => {
                        choice = 'remove';
                        form.close();
                    },
                    { tooltip: 'Take this step out of the ability' }
                );
            }
            form.closeButton();

            const shown = await open(form, this.viewer);
            if (!shown.ok) {
                return 'stop';
            }
            if (!choice) {
                return 'closed';
            }

            if (choice === 'remove' && ability && place.index !== undefined) {
                const index = place.index;
                return this.saved(
                    ability.id,
                    this.update(ability.id, (current) => ({
                        ...current,
                        steps: current.steps.filter((_, at) => at !== index),
                    }))
                );
            }

            const raw = { action: action.type, ...read() };
            const step = parseStep(raw, place.trigger);
            if (!step.ok) {
                problem = step.error;
                values = raw;
                continue;
            }
            return this.saveStep(place, step.value);
        }
    }

    private saveStep(place: StepPlace, step: Step): Outcome {
        if (!place.abilityId) {
            const ability = parseAbility({
                trigger: place.trigger,
                do: [serializeStep(step)],
            });
            const current = this.read();
            if (!ability.ok || !current.ok) {
                this.report(ability.ok ? current : ability);
                return 'stop';
            }
            return this.saved(
                ability.value.id,
                this.write([...current.value, ability.value])
            );
        }

        const index = place.index;
        return this.saved(
            place.abilityId,
            this.update(place.abilityId, (current) => ({
                ...current,
                steps:
                    index === undefined
                        ? [...current.steps, step]
                        : current.steps.map((entry, at) =>
                              at === index ? step : entry
                          ),
            }))
        );
    }

    private saved(id: string, outcome: Result<string>): Outcome {
        this.report(outcome);
        return outcome.ok ? { saved: id } : 'stop';
    }

    private async editSettings(ability: Ability): Promise<void> {
        let values: Values = ability.settings;
        let problem: string | undefined;

        for (;;) {
            const form = new CustomForm(this.viewer, 'Conditions and costs');
            if (problem) {
                form.label(`${Color.Red}${problem}`);
                form.spacer();
            }
            form.header('Only fires');
            form.spacer();
            const conditions = this.bindFields(
                form,
                CONDITIONS,
                ability.trigger,
                values
            );
            form.divider();
            form.header('How often');
            form.spacer();
            const timing = this.bindFields(
                form,
                TIMING,
                ability.trigger,
                values
            );
            form.divider();
            form.header('Costs');
            form.spacer();
            const costs = this.bindFields(form, COSTS, ability.trigger, values);

            let save = false;
            form.divider();
            form.button('Save', () => {
                save = true;
                form.close();
            });
            form.closeButton();

            const shown = await open(form, this.viewer);
            if (!shown.ok || !save) {
                return;
            }

            const entered = { ...conditions(), ...timing(), ...costs() };
            const parsed = parseAbility({
                ...serializeAbility(ability),
                ...entered,
            });
            if (!parsed.ok) {
                problem = parsed.error;
                values = entered;
                continue;
            }
            this.report(this.update(ability.id, () => parsed.value));
            return;
        }
    }

    private bindFields(
        form: CustomForm,
        fields: readonly FieldSpec[],
        trigger: Trigger,
        current: Values | undefined
    ): () => Record<string, FieldValue> {
        const bound = new Map<string, Bound>();
        for (const field of fields) {
            if (field.triggers && !field.triggers.includes(trigger)) {
                continue;
            }

            let visible: ObservableBoolean | undefined;
            const controller = field.showWhen && bound.get(field.showWhen.key);
            if (field.showWhen && controller) {
                const shownFor = field.showWhen.values;
                const flag = scriptBoolean(
                    shownFor.includes(String(controller.read()))
                );
                controller.watch((value) =>
                    flag.setData(shownFor.includes(String(value)))
                );
                visible = flag;
            }

            const start = current?.[field.key] ?? defaultValue(field, trigger);
            bound.set(
                field.key,
                this.bind(form, field, trigger, start, visible)
            );
        }

        return () => {
            const out: Record<string, FieldValue> = {};
            for (const [key, entry] of bound) {
                out[key] = entry.read();
            }
            return out;
        };
    }

    private bind(
        form: CustomForm,
        field: FieldSpec,
        trigger: Trigger,
        start: FieldValue,
        visible: ObservableBoolean | undefined
    ): Bound {
        switch (field.kind) {
            case 'number': {
                // A slider clamps, so a value past its range (typed before, or
                // from JSON) would quietly drop on the next save. Those get a
                // box even with the setting off.
                const numeric = Number(start);
                if (
                    Settings.get().typedNumbers ||
                    numeric < field.min ||
                    numeric > field.max
                ) {
                    return this.numberBox(form, field, start, visible);
                }
                const value = writableNumber(
                    clamp(Number(start), field.min, field.max)
                );
                form.slider(field.label, value, field.min, field.max, {
                    step: field.step,
                    visible,
                });
                // Sliders hand back float noise like 1.2000000000000002.
                const tidy = (raw: number): number =>
                    Math.round(raw * 100) / 100;
                return {
                    read: () => tidy(value.getData()),
                    watch: (listener) =>
                        value.subscribe((raw) => listener(tidy(raw))),
                };
            }

            case 'flag': {
                const value = writableBoolean(start === true);
                form.toggle(field.label, value, { visible });
                return {
                    read: () => value.getData(),
                    watch: (listener) => value.subscribe(listener),
                };
            }

            case 'text': {
                const value = writableString(String(start));
                if (field.presets) {
                    this.presets(form, field.presets, value, visible);
                }
                form.textField(field.label, value, {
                    description: field.description
                        ? `e.g. ${field.example}. ${field.description}`
                        : `e.g. ${field.example}`,
                    visible,
                });
                return {
                    read: () => value.getData(),
                    watch: (listener) => value.subscribe(listener),
                };
            }

            case 'choice':
                return this.dropdown(
                    form,
                    field.label,
                    field.options,
                    start,
                    visible
                );

            case 'target':
                return this.dropdown(
                    form,
                    field.label,
                    targetOptions(trigger),
                    start,
                    visible
                );
        }
    }

    private numberBox(
        form: CustomForm,
        field: { label: string; min: number; max: number; ceiling?: number },
        start: FieldValue,
        visible: ObservableBoolean | undefined
    ): Bound {
        const text = writableString(String(start));
        form.textField(field.label, text, {
            description: `Usually ${field.min} to ${field.max}, at most ${ceilingOf(field)}. Going far past the usual range can freeze the game.`,
            visible,
        });
        // Anything that isn't a number goes through as text so the save
        // fails with "has to be a number" instead of turning into 0.
        const parse = (raw: string): FieldValue => {
            const clean = raw.trim();
            const value = Number(clean);
            return clean.length > 0 && Number.isFinite(value) ? value : raw;
        };
        return {
            read: () => parse(text.getData()),
            watch: (listener) => text.subscribe((raw) => listener(parse(raw))),
        };
    }

    private dropdown(
        form: CustomForm,
        label: string,
        options: readonly ChoiceOption[],
        start: FieldValue,
        visible: ObservableBoolean | undefined
    ): Bound {
        const value = writableNumber(
            Math.max(
                options.findIndex((option) => option.value === start),
                0
            )
        );
        const pick = (index: number): string =>
            options[Math.round(index)]?.value ?? String(start);
        form.dropdown(
            label,
            value,
            options.map((option, index) => ({
                label: option.label,
                value: index,
            })),
            { visible }
        );
        return {
            read: () => pick(value.getData()),
            watch: (listener) =>
                value.subscribe((index) => listener(pick(index))),
        };
    }

    // A dropdown that fills in the text box below it, so the id stays
    // editable for anything not on the list.
    private presets(
        form: CustomForm,
        presets: readonly ChoiceOption[],
        text: ReturnType<typeof writableString>,
        visible: ObservableBoolean | undefined
    ): void {
        const known = presets.findIndex(
            (preset) => preset.value === text.getData()
        );
        const picked = writableNumber(known >= 0 ? known : presets.length);
        picked.subscribe((index) => {
            const preset = presets[Math.round(index)];
            if (preset) {
                text.setData(preset.value);
            }
        });
        form.dropdown(
            'Pick one',
            picked,
            [...presets, { value: '', label: 'Something else' }].map(
                (preset, index) => ({ label: preset.label, value: index })
            ),
            { visible }
        );
    }

    private tryOut(ability: Ability): void {
        const item = ItemEditorService.require(this.slot);
        if (!item.ok) {
            this.report(item);
            return;
        }
        ExitSignal.request(this.viewer);
        // Give the screen a moment to close so there's something to watch.
        system.runTimeout(() => {
            if (this.viewer.isValid) {
                AbilityRuntime.tryOut(this.viewer, ability, item.value);
            }
        }, 10);
    }

    private duplicate(ability: Ability): Result<string> {
        const current = this.read();
        if (!current.ok) {
            return current;
        }
        const index = current.value.findIndex(
            (entry) => entry.id === ability.id
        );
        const next = [...current.value];
        next.splice(index + 1, 0, { ...ability, id: newAbilityId() });
        return this.write(next);
    }

    private async remove(ability: Ability): Promise<void> {
        const confirmed = await confirmDestructive(
            this.viewer,
            'Remove ability',
            `Remove "${clip(describeSteps(ability))}" from this item?`,
            'Remove'
        );
        if (confirmed) {
            this.report(this.update(ability.id, () => undefined));
        }
    }

    private async removeAll(): Promise<void> {
        const confirmed = await confirmDestructive(
            this.viewer,
            'Remove all abilities',
            'Remove every ability on this item?',
            'Remove all'
        );
        if (confirmed) {
            this.report(this.write([]));
        }
    }

    // Every item in a stack shares the lore line that points at the
    // abilities, so there's no editing just one of them.
    private stackNote(): string {
        const item = ItemEditorService.require(this.slot);
        return item.ok && item.value.amount > 1
            ? ` Changes apply to all ${item.value.amount} in this stack.`
            : '';
    }

    private find(id: string): Ability | undefined {
        const abilities = this.read();
        return abilities.ok
            ? abilities.value.find((ability) => ability.id === id)
            : undefined;
    }

    private read(): Result<readonly Ability[]> {
        const item = ItemEditorService.require(this.slot);
        return item.ok ? ok(readAbilities(item.value)) : item;
    }

    private update(
        id: string,
        change: (ability: Ability) => Ability | undefined
    ): Result<string> {
        const current = this.read();
        if (!current.ok) {
            return current;
        }
        return this.write(
            current.value.flatMap((ability) =>
                ability.id === id ? (change(ability) ?? []) : [ability]
            )
        );
    }

    private write(abilities: readonly Ability[]): Result<string> {
        const property = ItemPropertyRegistry.get('abilities');
        if (!property.ok) {
            return fail("Can't edit abilities.");
        }
        return ItemEditorService.applyAll(this.slot, [
            jsonEdit(property.value, abilities.map(serializeAbility)),
        ]);
    }

    private report(outcome: Result<unknown>): void {
        notify(this.viewer, outcome);
    }
}

// Commands and messages can run long, and long rows wrap badly.
function clip(text: string): string {
    return text.length > LABEL_LENGTH
        ? `${text.slice(0, LABEL_LENGTH - 3)}...`
        : text;
}
