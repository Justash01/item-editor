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
import {
    ALL_CHECKS,
    NUMBER_CHECKS,
    OTHER_CHECKS,
    RANGE_CHECKS,
    SCORE_CHECKS,
    describeScoreCheck,
} from './scores';
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

const AGAINST: readonly Trigger[] = [
    'hit',
    'kill',
    'shoot',
    'hurt',
    'interact',
];
const EVERY_TRIGGER = TRIGGERS.map((entry) => entry.id);
const WITH_TARGET = TRIGGERS.filter((entry) => entry.target).map(
    (entry) => entry.id
);
const REPEATING: readonly Trigger[] = ['held', 'worn', 'using'];
const TOLD: readonly Trigger[] = ['use', 'eat', 'interact'];

const ANY = { value: 'any', label: "Doesn't matter" };

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
    choiceField(
        'ground',
        'Standing',
        [
            ANY,
            { value: 'ground', label: 'Only on the ground' },
            { value: 'air', label: 'Only in the air' },
        ],
        'any'
    ),
    numberField('fall', 'Falling at least, in blocks', 0, 20, 0.5, 0, {
        triggers: ['hit'],
        description: 'For smash hits. 0 means it fires standing still too.',
    }),
    choiceField(
        'water',
        'In water',
        [
            ANY,
            { value: 'only', label: 'Only in water' },
            { value: 'never', label: 'Only out of water' },
        ],
        'any'
    ),
    choiceField(
        'time',
        'Time of day',
        [
            ANY,
            { value: 'sunrise', label: 'Sunrise' },
            { value: 'day', label: 'Day' },
            { value: 'noon', label: 'Around noon' },
            { value: 'sunset', label: 'Sunset' },
            { value: 'night', label: 'Night' },
            { value: 'midnight', label: 'Around midnight' },
        ],
        'any'
    ),
    choiceField(
        'dimension',
        'Dimension',
        [
            ANY,
            { value: 'overworld', label: 'Overworld' },
            { value: 'nether', label: 'Nether' },
            { value: 'the_end', label: 'The End' },
        ],
        'any'
    ),
    numberField('health', 'Your health at most, in percent', 1, 100, 1, 100, {
        ceiling: 100,
        description: '100 means any health.',
    }),
    numberField(
        'targetHealth',
        'Target health at most, in percent',
        1,
        100,
        1,
        100,
        {
            ceiling: 100,
            triggers: WITH_TARGET,
            description: '100 means any health. Low values make an execute.',
        }
    ),
    choiceField(
        'tagCheck',
        'Tag',
        [
            ANY,
            { value: 'has', label: 'Only with a tag' },
            { value: 'lacks', label: 'Only without a tag' },
        ],
        'any'
    ),
    {
        kind: 'text',
        key: 'tag',
        label: 'Tag name',
        default: 'vip',
        example: 'red_team',
        maxLength: 64,
        showWhen: { key: 'tagCheck', values: ['has', 'lacks'] },
    },
    choiceField('scoreCheck', 'Score', [ANY, ...SCORE_CHECKS], 'any'),
    choiceField(
        'scoreWho',
        'Whose score',
        [
            { value: 'self', label: 'Yours' },
            { value: 'target', label: "The target's" },
        ],
        'self',
        {
            triggers: WITH_TARGET,
            showWhen: { key: 'scoreCheck', values: ALL_CHECKS },
        }
    ),
    {
        kind: 'text',
        key: 'scoreObjective',
        label: 'Scoreboard objective',
        default: 'mana',
        example: 'kills',
        maxLength: 32,
        showWhen: { key: 'scoreCheck', values: ALL_CHECKS },
    },
    numberField(
        'scoreValue',
        'Number, or where the range starts',
        0,
        100,
        1,
        10,
        {
            showWhen: { key: 'scoreCheck', values: NUMBER_CHECKS },
        }
    ),
    numberField('scoreMax', 'Where the range ends', 0, 100, 1, 20, {
        showWhen: { key: 'scoreCheck', values: RANGE_CHECKS },
    }),
    {
        kind: 'text',
        key: 'scoreOther',
        label: 'The other objective',
        default: 'max_mana',
        example: 'deaths',
        maxLength: 32,
        showWhen: { key: 'scoreCheck', values: OTHER_CHECKS },
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
    numberField('interval', 'Fires every, in seconds', 0.5, 60, 0.5, 0.5, {
        triggers: REPEATING,
    }),
    numberField('every', 'Only every Nth time', 1, 20, 1, 1, {
        ceiling: 1000,
        description: '3 fires on the 3rd, 6th, 9th time and so on.',
    }),
    choiceField(
        'pick',
        'Steps',
        [
            { value: 'all', label: 'Run all of them, in order' },
            { value: 'one', label: 'Run one at random' },
        ],
        'all'
    ),
];

export const COSTS: readonly FieldSpec[] = [
    numberField('durability', 'Durability per use', 0, 50, 1, 0, {
        triggers: EVERY_TRIGGER.filter((trigger) => trigger !== 'break'),
    }),
    numberField('levels', 'XP levels per use', 0, 30, 1, 0),
    flagField('payScore', 'Costs score points', false),
    {
        kind: 'text',
        key: 'costObjective',
        label: 'Scoreboard objective',
        default: 'mana',
        example: 'mana',
        maxLength: 32,
        showWhen: { key: 'payScore', values: ['true'] },
    },
    numberField('scoreCost', 'Points per use', 1, 100, 1, 10, {
        showWhen: { key: 'payScore', values: ['true'] },
    }),
    flagField('payItem', 'Uses up an item from your inventory', false),
    {
        kind: 'text',
        key: 'ammo',
        label: 'Item id',
        default: 'minecraft:arrow',
        example: 'minecraft:redstone',
        maxLength: 64,
        check: 'item',
        showWhen: { key: 'payItem', values: ['true'] },
    },
    numberField('ammoCount', 'How many per use', 1, 64, 1, 1, {
        showWhen: { key: 'payItem', values: ['true'] },
    }),
    flagField('consume', 'Uses up one of the stack', false, {
        triggers: ['use'],
    }),
    flagField('notice', "Tell me when it's not ready", true, {
        triggers: TOLD,
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
    const interval = numberOf(settings, 'interval');
    if (interval > 0.5) {
        terms.push(`every ${interval}s`);
    }
    const every = numberOf(settings, 'every');
    if (every > 1) {
        terms.push(`every ${ordinal(every)} time`);
    }
    if (textOf(settings, 'pick') === 'one') {
        terms.push('one step at random');
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

    terms.push(...situationTerms(settings));

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
    if (flagOf(settings, 'payScore')) {
        terms.push(
            `${numberOf(settings, 'scoreCost')} ${textOf(settings, 'costObjective')} a use`
        );
    }
    if (flagOf(settings, 'payItem')) {
        terms.push(
            `uses ${numberOf(settings, 'ammoCount')} ${idToName(textOf(settings, 'ammo'))}`
        );
    }
    if (flagOf(settings, 'consume')) {
        terms.push('uses one up');
    }
    return terms.join(', ');
}

function situationTerms(settings: Values): string[] {
    const terms: string[] = [];
    const pick = (key: string, labels: Record<string, string>): void => {
        const label = labels[textOf(settings, key)];
        if (label) {
            terms.push(label);
        }
    };
    pick('ground', { ground: 'on the ground', air: 'in the air' });
    pick('water', { only: 'in water', never: 'out of water' });
    pick('time', {
        sunrise: 'at sunrise',
        day: 'by day',
        noon: 'around noon',
        sunset: 'at sunset',
        night: 'at night',
        midnight: 'around midnight',
    });
    pick('dimension', {
        overworld: 'in the Overworld',
        nether: 'in the Nether',
        the_end: 'in the End',
    });

    if (numberOf(settings, 'fall') > 0) {
        terms.push(`after falling ${numberOf(settings, 'fall')}+ blocks`);
    }
    const health = numberOf(settings, 'health');
    if (health > 0 && health < 100) {
        terms.push(`at ${health}% health or less`);
    }
    const target = numberOf(settings, 'targetHealth');
    if (target > 0 && target < 100) {
        terms.push(`target at ${target}% or less`);
    }

    const tag = textOf(settings, 'tag');
    if (textOf(settings, 'tagCheck') === 'has') {
        terms.push(`tagged ${tag}`);
    } else if (textOf(settings, 'tagCheck') === 'lacks') {
        terms.push(`not tagged ${tag}`);
    }
    const score = describeScoreCheck(settings);
    if (score) {
        terms.push(score);
    }
    return terms;
}

function ordinal(value: number): string {
    const tens = value % 100;
    if (tens >= 11 && tens <= 13) {
        return `${value}th`;
    }
    switch (value % 10) {
        case 1:
            return `${value}st`;
        case 2:
            return `${value}nd`;
        case 3:
            return `${value}rd`;
        default:
            return `${value}th`;
    }
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
