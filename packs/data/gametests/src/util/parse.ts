import { Result, fail, ok } from './Result';

const TRUE_WORDS = new Set(['true', 'yes', 'on', '1']);
const FALSE_WORDS = new Set(['false', 'no', 'off', '0']);

export function parseBoolean(raw: string): Result<boolean> {
    const value = raw.trim().toLowerCase();
    if (TRUE_WORDS.has(value)) {
        return ok(true);
    }
    if (FALSE_WORDS.has(value)) {
        return ok(false);
    }
    return fail(`"${raw}" is not true or false.`);
}

export function parseChoice<T extends string>(
    raw: string,
    options: readonly T[]
): Result<T> {
    const value = raw.trim().toLowerCase();
    const match = options.find((option) => option.toLowerCase() === value);
    return match !== undefined
        ? ok(match)
        : fail(`"${raw}" is not one of: ${options.join(', ')}.`);
}
