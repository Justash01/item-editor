import { ItemStack } from '@minecraft/server';
import { Log } from '../util/Log';
import { Result, fail, ok } from '../util/Result';
import {
    JsonObject,
    JsonValue,
    describeJsonType,
    parseRelaxedJson,
} from '../util/json';
import { idToName, splitList } from '../util/text';
import { ACTIONS, actionFor } from './actions';
import {
    choiceField,
    defaultValue,
    flagField,
    flagOf,
    numberField,
    numberOf,
    readFields,
    textOf,
} from './fields';
import { BLOCK_GROUPS } from './mining';
import { storeAbilities, storedAbilities } from './storage';
import { FieldSpec, TRIGGERS, Trigger, Values } from './types';

const MAX_ABILITIES = 16;
export const MAX_STEPS = 8;
const ID_PATTERN = /^[a-z0-9]{1,16}$/;

const log = Log.get('Abilities');

export interface Step {
    readonly action: string;
    readonly delay: number;
    readonly values: Values;
}

export interface Ability {
    readonly id: string;
    readonly trigger: Trigger;
    readonly enabled: boolean;
    readonly settings: Values;
    readonly steps: readonly Step[];
}

const AGAINST: readonly Trigger[] = ['hit', 'kill', 'shoot', 'hurt'];
const EVERY_TRIGGER = TRIGGERS.map((entry) => entry.id);

export const CONDITIONS: readonly FieldSpec[] = [
    choiceField(
        'sneak',
        'Sneaking',
        [
            { value: 'any', label: "Doesn't matter" },
            { value: 'only', label: 'Only while sneaking' },
            { value: 'never', label: 'Only when not sneaking' },
        ],
        'any'
    ),
    choiceField(
        'victims',
        'Only against',
        [
            { value: 'any', label: 'Anything' },
            { value: 'players', label: 'Players' },
            { value: 'mobs', label: 'Mobs, not players' },
            { value: 'type', label: 'One kind of mob' },
        ],
        'any',
        { triggers: AGAINST }
    ),
    {
        kind: 'text',
        key: 'victimType',
        label: 'Mob id',
        default: 'minecraft:zombie',
        example: 'minecraft:creeper',
        maxLength: 64,
        check: 'entity',
        triggers: AGAINST,
        showWhen: { key: 'victims', values: ['type'] },
    },
    choiceField('blocks', 'Only when mining', BLOCK_GROUPS, 'any', {
        triggers: ['mine'],
    }),
    {
        kind: 'text',
        key: 'blockList',
        label: 'Block ids, separated by commas',
        default: 'minecraft:stone',
        example: 'minecraft:diamond_ore, minecraft:iron_ore',
        maxLength: 512,
        check: 'blocks',
        triggers: ['mine'],
        showWhen: { key: 'blocks', values: ['list'] },
    },
];

export const TIMING: readonly FieldSpec[] = [
    numberField('chance', 'Chance, in percent', 1, 100, 1, 100, {
        ceiling: 100,
    }),
    numberField('cooldown', 'Cooldown, in seconds', 0, 120, 0.5, 0),
];

export const COSTS: readonly FieldSpec[] = [
    numberField('durability', 'Durability per use', 0, 50, 1, 0, {
        triggers: EVERY_TRIGGER.filter((trigger) => trigger !== 'break'),
    }),
    numberField('levels', 'XP levels per use', 0, 30, 1, 0),
    flagField('consume', 'Uses up one of the stack', false, {
        triggers: ['use'],
    }),
    flagField('notice', "Tell me when it's not ready", true, {
        triggers: ['use'],
    }),
];

const SETTINGS: readonly FieldSpec[] = [...CONDITIONS, ...TIMING, ...COSTS];

export const STEP_DELAY: FieldSpec = numberField(
    'delay',
    'Wait first, in seconds',
    0,
    10,
    0.5,
    0
);

export function newAbilityId(): string {
    return Math.random().toString(36).slice(2, 10) || 'ability';
}

export function triggerLabel(trigger: Trigger): string {
    return TRIGGERS.find((entry) => entry.id === trigger)?.label ?? trigger;
}

export function describeStep(step: Step): string {
    const action = actionFor(step.action);
    const what = action ? action.describe(step.values) : step.action;
    return step.delay > 0 ? `${what} after ${step.delay}s` : what;
}

export function describeSteps(ability: Ability): string {
    const first = ability.steps[0];
    const what = first ? describeStep(first) : 'Nothing';
    const more = ability.steps.length - 1;
    return more > 0 ? `${what}, then ${more} more` : what;
}

export function describeAbility(ability: Ability): string {
    return `${triggerLabel(ability.trigger)}: ${describeSteps(ability)}`;
}

export function abilityTerms(ability: Ability): string {
    const settings = ability.settings;
    const terms: string[] = [];
    if (!ability.enabled) {
        terms.push('turned off');
    }

    const chance = numberOf(settings, 'chance');
    if (chance > 0 && chance < 100) {
        terms.push(`${chance}% chance`);
    }
    if (numberOf(settings, 'cooldown') > 0) {
        terms.push(`${numberOf(settings, 'cooldown')}s cooldown`);
    }

    switch (textOf(settings, 'sneak')) {
        case 'only':
            terms.push('while sneaking');
            break;
        case 'never':
            terms.push('not while sneaking');
            break;
    }

    switch (textOf(settings, 'victims')) {
        case 'players':
            terms.push('players only');
            break;
        case 'mobs':
            terms.push('mobs only');
            break;
        case 'type':
            terms.push(`${idToName(textOf(settings, 'victimType'))} only`);
            break;
    }

    const blocks = textOf(settings, 'blocks');
    if (blocks === 'list') {
        const count = splitList(textOf(settings, 'blockList')).length;
        terms.push(`${count} picked block${count === 1 ? '' : 's'}`);
    } else if (blocks && blocks !== 'any') {
        const group = BLOCK_GROUPS.find((entry) => entry.value === blocks);
        terms.push(`${(group?.label ?? blocks).toLowerCase()} only`);
    }

    if (numberOf(settings, 'durability') > 0) {
        terms.push(`${numberOf(settings, 'durability')} durability a use`);
    }
    if (numberOf(settings, 'levels') > 0) {
        terms.push(`${numberOf(settings, 'levels')} levels a use`);
    }
    if (flagOf(settings, 'consume')) {
        terms.push('uses one up');
    }
    return terms.join(', ');
}

export function parseStep(raw: JsonValue, trigger: Trigger): Result<Step> {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
        return fail(`expected a step, got ${describeJsonType(raw)}.`);
    }

    const action =
        typeof raw.action === 'string' ? actionFor(raw.action) : undefined;
    if (!action) {
        return fail(
            `action has to be one of ${ACTIONS.map((entry) => entry.type).join(', ')}.`
        );
    }
    if (action.triggers && !action.triggers.includes(trigger)) {
        return fail(
            `${action.label} only works with ${action.triggers.map(triggerLabel).join(', ')}.`
        );
    }

    const values = readFields(action.fields, raw, trigger);
    if (!values.ok) {
        return fail(`${action.label}: ${values.error}`);
    }
    const delay = readFields([STEP_DELAY], raw, trigger);
    if (!delay.ok) {
        return delay;
    }

    return ok({
        action: action.type,
        delay: numberOf(delay.value, 'delay'),
        values: values.value,
    });
}

export function parseAbility(raw: JsonValue): Result<Ability> {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
        return fail(`expected an ability, got ${describeJsonType(raw)}.`);
    }

    const trigger = TRIGGERS.find((entry) => entry.id === raw.trigger)?.id;
    if (!trigger) {
        return fail(
            `trigger has to be one of ${TRIGGERS.map((entry) => entry.id).join(', ')}.`
        );
    }

    if (raw.enabled !== undefined && typeof raw.enabled !== 'boolean') {
        return fail('enabled has to be true or false.');
    }

    const settings = readFields(SETTINGS, raw, trigger);
    if (!settings.ok) {
        return settings;
    }

    const list =
        raw.do !== undefined
            ? raw.do
            : typeof raw.action === 'string'
              ? [raw]
              : undefined;
    if (!Array.isArray(list) || list.length === 0) {
        return fail('an ability needs at least one step in "do".');
    }
    if (list.length > MAX_STEPS) {
        return fail(`an ability has ${MAX_STEPS} steps at most.`);
    }

    const steps: Step[] = [];
    for (const [index, entry] of list.entries()) {
        const step = parseStep(entry, trigger);
        if (!step.ok) {
            return fail(
                list.length > 1
                    ? `step ${index + 1}: ${step.error}`
                    : step.error
            );
        }
        steps.push(step.value);
    }

    return ok({
        id:
            typeof raw.id === 'string' && ID_PATTERN.test(raw.id)
                ? raw.id
                : newAbilityId(),
        trigger,
        enabled: raw.enabled !== false,
        settings: settings.value,
        steps,
    });
}

export function parseAbilities(raw: JsonValue): Result<Ability[]> {
    if (!Array.isArray(raw)) {
        return fail(
            `expected a list of abilities, got ${describeJsonType(raw)}.`
        );
    }
    if (raw.length > MAX_ABILITIES) {
        return fail(`an item holds ${MAX_ABILITIES} abilities at most.`);
    }

    const abilities: Ability[] = [];
    const seen = new Set<string>();
    for (const [index, entry] of raw.entries()) {
        const ability = parseAbility(entry);
        if (!ability.ok) {
            return fail(`ability ${index + 1}: ${ability.error}`);
        }
        // Cooldowns are keyed by id, so two copies of one ability on the same
        // item would share a cooldown.
        const id = seen.has(ability.value.id)
            ? newAbilityId()
            : ability.value.id;
        seen.add(id);
        abilities.push({ ...ability.value, id });
    }
    return ok(abilities);
}

export function serializeStep(step: Step): JsonObject {
    const out: JsonObject = { action: step.action, ...step.values };
    if (step.delay > 0) {
        out.delay = step.delay;
    }
    return out;
}

export function serializeAbility(ability: Ability): JsonObject {
    const out: JsonObject = { trigger: ability.trigger };
    for (const field of SETTINGS) {
        const value = ability.settings[field.key];
        if (
            value !== undefined &&
            value !== defaultValue(field, ability.trigger)
        ) {
            out[field.key] = value;
        }
    }
    if (!ability.enabled) {
        out.enabled = false;
    }
    out.do = ability.steps.map(serializeStep);
    out.id = ability.id;
    return out;
}

const cache = new Map<string, readonly Ability[]>();
const unreadable = new Set<string>();

export function readAbilities(item: ItemStack): readonly Ability[] {
    const stored = storedAbilities(item);
    if (stored === undefined) {
        return [];
    }

    const cached = cache.get(stored);
    if (cached) {
        return cached;
    }

    const parsed = parseRelaxedJson(stored);
    const abilities = parsed.ok ? parseAbilities(parsed.value) : parsed;
    if (!abilities.ok) {
        if (!unreadable.has(stored)) {
            unreadable.add(stored);
            log.warn(
                `Ignoring broken abilities on ${item.typeId}: ${abilities.error}`
            );
        }
        return [];
    }

    if (cache.size > 256) {
        cache.clear();
    }
    cache.set(stored, abilities.value);
    return abilities.value;
}

export function writeAbilities(
    item: ItemStack,
    abilities: readonly Ability[]
): void {
    storeAbilities(
        item,
        abilities.length === 0
            ? undefined
            : JSON.stringify(abilities.map(serializeAbility))
    );
}
