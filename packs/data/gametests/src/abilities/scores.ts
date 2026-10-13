import { Entity, world } from '@minecraft/server';
import { numberOf, textOf } from './fields';
import { AbilityContext, Values } from './types';

// getScore throws for anyone who isn't on that objective yet, rather than
// handing back undefined like the types say.
export function readScore(
    entity: Entity,
    objectiveId: string
): number | undefined {
    const objective = world.scoreboard.getObjective(objectiveId);
    if (
        !objective ||
        !entity.scoreboardIdentity ||
        !objective.hasParticipant(entity)
    ) {
        return undefined;
    }
    return objective.getScore(entity);
}

export function writeScore(
    entity: Entity,
    objectiveId: string,
    value: number
): void {
    const objective =
        world.scoreboard.getObjective(objectiveId) ??
        world.scoreboard.addObjective(objectiveId);
    const whole = Math.round(value);
    if (entity.scoreboardIdentity) {
        objective.setScore(entity, whole);
    } else {
        // setScore can't give an entity its first identity, the command can.
        entity.runCommand(
            `scoreboard players set @s "${objectiveId}" ${whole}`
        );
    }
}

export const SCORE_CHECKS = [
    { value: 'atleast', label: 'At least a number' },
    { value: 'atmost', label: 'At most a number' },
    { value: 'above', label: 'More than a number' },
    { value: 'below', label: 'Less than a number' },
    { value: 'equals', label: 'Exactly a number' },
    { value: 'not', label: 'Anything but a number' },
    { value: 'between', label: 'Between two numbers' },
    { value: 'outside', label: 'Outside two numbers' },
    { value: 'higher', label: 'Higher than another score' },
    { value: 'lower', label: 'Lower than another score' },
    { value: 'same', label: 'Same as another score' },
    { value: 'set', label: 'Has a score at all' },
    { value: 'unset', label: 'Has no score yet' },
] as const;

export const NUMBER_CHECKS = [
    'atleast',
    'atmost',
    'above',
    'below',
    'equals',
    'not',
    'between',
    'outside',
];
export const RANGE_CHECKS = ['between', 'outside'];
export const OTHER_CHECKS = ['higher', 'lower', 'same'];
export const ALL_CHECKS = SCORE_CHECKS.map((check) => check.value);

// The wanted part on its own, like "at least 10" or "between 5 and 20".
function wanted(settings: Values, other?: number): string {
    const value = numberOf(settings, 'scoreValue');
    const [low, high] = range(settings);
    const name = textOf(settings, 'scoreOther');
    switch (textOf(settings, 'scoreCheck')) {
        case 'atleast':
            return `at least ${value}`;
        case 'atmost':
            return `at most ${value}`;
        case 'above':
            return `over ${value}`;
        case 'below':
            return `under ${value}`;
        case 'equals':
            return `exactly ${value}`;
        case 'not':
            return `anything but ${value}`;
        case 'between':
            return `${low} to ${high}`;
        case 'outside':
            return `not ${low} to ${high}`;
        case 'higher':
            return `over ${name}${other === undefined ? '' : ` (${other})`}`;
        case 'lower':
            return `under ${name}${other === undefined ? '' : ` (${other})`}`;
        case 'same':
            return `equal to ${name}${other === undefined ? '' : ` (${other})`}`;
        default:
            return '';
    }
}

function range(settings: Values): [number, number] {
    const a = numberOf(settings, 'scoreValue');
    const b = numberOf(settings, 'scoreMax');
    return [Math.min(a, b), Math.max(a, b)];
}

function whose(settings: Values): string {
    return textOf(settings, 'scoreWho') === 'target' ? "target's " : '';
}

export function describeScoreCheck(settings: Values): string | undefined {
    const check = textOf(settings, 'scoreCheck');
    const name = `${whose(settings)}${textOf(settings, 'scoreObjective')}`;
    switch (check) {
        case '':
        case 'any':
            return undefined;
        case 'set':
            return `with a ${name} score`;
        case 'unset':
            return `with no ${name} score`;
        default:
            return `${name} ${wanted(settings)}`;
    }
}

// Why the score check fails, or undefined when it passes. Nobody on the
// scoreboard counts as 0, so "at most" works before the first point.
export function scoreUnmet(
    settings: Values,
    ctx: AbilityContext
): string | undefined {
    const check = textOf(settings, 'scoreCheck');
    if (!check || check === 'any') {
        return undefined;
    }
    const entity =
        textOf(settings, 'scoreWho') === 'target' ? ctx.target : ctx.holder;
    if (!entity?.isValid) {
        return 'no target to check the score of';
    }
    const name = `${whose(settings)}${textOf(settings, 'scoreObjective')}`;
    const stored = readScore(entity, textOf(settings, 'scoreObjective'));
    if (check === 'set') {
        return stored === undefined ? `no ${name} score` : undefined;
    }
    if (check === 'unset') {
        return stored === undefined ? undefined : `has a ${name} score`;
    }

    const score = stored ?? 0;
    const value = numberOf(settings, 'scoreValue');
    const [low, high] = range(settings);
    const other = OTHER_CHECKS.includes(check)
        ? (readScore(entity, textOf(settings, 'scoreOther')) ?? 0)
        : 0;
    let met: boolean;
    switch (check) {
        case 'atleast':
            met = score >= value;
            break;
        case 'atmost':
            met = score <= value;
            break;
        case 'above':
            met = score > value;
            break;
        case 'below':
            met = score < value;
            break;
        case 'equals':
            met = score === value;
            break;
        case 'not':
            met = score !== value;
            break;
        case 'between':
            met = score >= low && score <= high;
            break;
        case 'outside':
            met = score < low || score > high;
            break;
        case 'higher':
            met = score > other;
            break;
        case 'lower':
            met = score < other;
            break;
        case 'same':
            met = score === other;
            break;
        default:
            met = true;
    }
    return met
        ? undefined
        : `${name} is ${score}, needs ${wanted(settings, OTHER_CHECKS.includes(check) ? other : undefined)}`;
}
