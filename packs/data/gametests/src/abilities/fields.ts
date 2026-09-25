import { BlockTypes, EntityTypes } from '@minecraft/server';
import { Result, fail, ok } from '../util/Result';
import { JsonObject, JsonValue } from '../util/json';
import { splitList } from '../util/text';
import {
    ChoiceOption,
    FieldExtras,
    FieldSpec,
    FieldValue,
    TRIGGERS,
    Trigger,
    Values,
} from './types';

const DEFAULT_CEILING = 1_000_000;

const PLACE_TRIGGERS: readonly Trigger[] = [
    'hit',
    'kill',
    'shoot',
    'hurt',
    'use',
    'mine',
];

export function numberOf(values: Values, key: string): number {
    const value = values[key];
    return typeof value === 'number' ? value : 0;
}

export function flagOf(values: Values, key: string): boolean {
    return values[key] === true;
}

export function textOf(values: Values, key: string): string {
    const value = values[key];
    return typeof value === 'string' ? value : '';
}

function hasTarget(trigger: Trigger): boolean {
    return TRIGGERS.some((entry) => entry.id === trigger && entry.target);
}

export function targetOptions(trigger: Trigger): ChoiceOption[] {
    const options: ChoiceOption[] = [{ value: 'self', label: 'You' }];
    if (hasTarget(trigger)) {
        options.push({ value: 'target', label: 'Target' });
    }
    options.push(
        { value: 'mobs', label: 'Mobs near you' },
        { value: 'players', label: 'Players near you' }
    );
    return options;
}

export function defaultValue(field: FieldSpec, trigger: Trigger): FieldValue {
    if (field.kind === 'target') {
        return field.prefer === 'target' && hasTarget(trigger)
            ? 'target'
            : 'self';
    }
    return field.default;
}

function isUsed(field: FieldSpec, trigger: Trigger, values: Values): boolean {
    if (field.triggers && !field.triggers.includes(trigger)) {
        return false;
    }
    if (field.showWhen) {
        const current = values[field.showWhen.key];
        return (
            current !== undefined &&
            field.showWhen.values.includes(String(current))
        );
    }
    return true;
}

// Fields that don't apply are dropped rather than validated, so a hidden
// "custom block" box can't block a save.
export function readFields(
    fields: readonly FieldSpec[],
    raw: JsonObject,
    trigger: Trigger
): Result<Values> {
    const values: Record<string, FieldValue> = {};
    for (const field of fields) {
        if (!isUsed(field, trigger, values)) {
            continue;
        }
        const value = readField(field, raw[field.key], trigger);
        if (!value.ok) {
            return value;
        }
        values[field.key] = value.value;
    }
    return ok(values);
}

function readField(
    field: FieldSpec,
    value: JsonValue | undefined,
    trigger: Trigger
): Result<FieldValue> {
    if (value === undefined) {
        const fallback = defaultValue(field, trigger);
        if (field.kind !== 'text') {
            return ok(fallback);
        }
        value = fallback;
    }

    switch (field.kind) {
        case 'number': {
            if (typeof value !== 'number' || !Number.isFinite(value)) {
                return fail(`${field.label} has to be a number.`);
            }
            const ceiling = ceilingOf(field);
            if (value < field.min || value > ceiling) {
                return fail(
                    `${field.label} has to be between ${field.min} and ${ceiling}.`
                );
            }
            if (field.step >= 1 && !Number.isInteger(value)) {
                return fail(`${field.label} has to be a whole number.`);
            }
            return ok(value);
        }

        case 'flag':
            return typeof value === 'boolean'
                ? ok(value)
                : fail(`${field.label} has to be true or false.`);

        case 'text': {
            if (typeof value !== 'string') {
                return fail(`${field.label} has to be text.`);
            }
            const clean = field.stripSlash
                ? value.trim().replace(/^\//, '')
                : value.trim();
            if (clean.length === 0) {
                return fail(`${field.label} can't be empty.`);
            }
            if (clean.length > field.maxLength) {
                return fail(
                    `${field.label} is too long, ${field.maxLength} characters at most.`
                );
            }
            return field.check ? checkIds(field.check, clean) : ok(clean);
        }

        case 'choice': {
            // Effects and the like are namespaced, but nobody types that.
            const picked = field.options.find(
                (option) =>
                    option.value === value ||
                    option.value === `minecraft:${String(value)}`
            );
            if (picked) {
                return ok(picked.value);
            }
            return fail(
                field.options.length > 8
                    ? `"${String(value)}" isn't a ${field.label.toLowerCase()} this can use.`
                    : `${field.label} has to be one of ${field.options.map((option) => option.value).join(', ')}.`
            );
        }

        case 'target': {
            const options = targetOptions(trigger);
            return options.some((option) => option.value === value)
                ? ok(String(value))
                : fail(
                      `${field.label} has to be one of ${options.map((option) => option.value).join(', ')} here.`
                  );
        }
    }
}

function normalizeId(id: string): string {
    const clean = id.trim().toLowerCase();
    return clean.includes(':') ? clean : `minecraft:${clean}`;
}

function checkIds(
    check: 'block' | 'blocks' | 'entity',
    text: string
): Result<string> {
    const ids = check === 'blocks' ? splitList(text) : [text];
    const clean: string[] = [];
    for (const raw of ids) {
        const id = normalizeId(raw);
        const known =
            check === 'entity' ? EntityTypes.get(id) : BlockTypes.get(id);
        if (!known) {
            return fail(
                `there's no ${check === 'entity' ? 'mob' : 'block'} called ${id}.`
            );
        }
        clean.push(id);
    }
    return ok(clean.join(', '));
}

export function ceilingOf(field: { ceiling?: number }): number {
    return field.ceiling ?? DEFAULT_CEILING;
}

export function numberField(
    key: string,
    label: string,
    min: number,
    max: number,
    step: number,
    fallback: number,
    extras: FieldExtras & { ceiling?: number } = {}
): FieldSpec {
    return {
        kind: 'number',
        key,
        label,
        min,
        max,
        step,
        default: fallback,
        ...extras,
    };
}

export function flagField(
    key: string,
    label: string,
    fallback: boolean,
    extras: FieldExtras = {}
): FieldSpec {
    return { kind: 'flag', key, label, default: fallback, ...extras };
}

export function choiceField(
    key: string,
    label: string,
    options: readonly ChoiceOption[],
    fallback: string,
    extras: FieldExtras = {}
): FieldSpec {
    return {
        kind: 'choice',
        key,
        label,
        options,
        default: fallback,
        ...extras,
    };
}

export function appliesTo(
    prefer: 'self' | 'target',
    label = 'Applies to'
): FieldSpec[] {
    return [
        { kind: 'target', key: 'target', label, prefer },
        numberField('radius', 'Radius, in blocks', 1, 16, 1, 5, {
            ceiling: 64,
            showWhen: { key: 'target', values: ['mobs', 'players'] },
        }),
    ];
}

export function whereField(): FieldSpec {
    return choiceField(
        'at',
        'Where',
        [
            { value: 'event', label: 'Where it happened' },
            { value: 'self', label: 'On you' },
        ],
        'event',
        { triggers: PLACE_TRIGGERS }
    );
}
