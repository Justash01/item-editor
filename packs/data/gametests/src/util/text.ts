import { Settings } from '../core/Settings';
import { Color } from './colors';

const ROMAN_NUMERALS: readonly (readonly [number, string])[] = [
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
];

// EnchantmentType.id has no namespace but vanilla-data does.
export function bareId(id: string): string {
    return id.includes(':') ? id.slice(id.indexOf(':') + 1) : id;
}

export function sameId(left: string, right: string): boolean {
    return bareId(left) === bareId(right);
}

export function idToName(id: string): string {
    return bareId(id)
        .split('_')
        .filter((word) => word.length > 0)
        .map((word) => word[0]!.toUpperCase() + word.slice(1))
        .join(' ');
}

export function levelText(value: number): string {
    return Settings.get().romanNumerals
        ? toRomanNumerals(value)
        : String(value);
}

export function toRomanNumerals(value: number): string {
    if (value > 10 || value < 1 || !Number.isInteger(value)) {
        return value.toString();
    }

    let remaining = value;
    let result = '';
    for (const [amount, numeral] of ROMAN_NUMERALS) {
        while (remaining >= amount) {
            result += numeral;
            remaining -= amount;
        }
    }
    return result;
}

export function fromRomanNumerals(text: string): number | undefined {
    const trimmed = text.trim();
    if (/^\d+$/.test(trimmed)) {
        return Number.parseInt(trimmed, 10);
    }
    if (!/^[IVXLCDM]+$/i.test(trimmed)) {
        return undefined;
    }

    const values: Record<string, number> = {
        i: 1,
        v: 5,
        x: 10,
        l: 50,
        c: 100,
        d: 500,
        m: 1000,
    };
    const upper = trimmed.toLowerCase();
    let total = 0;
    let previous = 0;
    for (let index = upper.length - 1; index >= 0; index--) {
        const value = values[upper[index]!]!;
        total += value < previous ? -value : value;
        previous = Math.max(previous, value);
    }
    return total;
}

export function splitList(text: string): string[] {
    return text
        .split(',')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
}

export function field(label: string, value: string): string {
    return `${Color.Gray}${label}: ${Color.Reset}${value}`;
}

export function accent(value: string | number | boolean): string {
    return `${Color.Aqua}${value}${Color.Reset}`;
}

export function heading(text: string): string {
    return `${Color.Yellow}${Color.Bold}${text}${Color.Reset}`;
}

// Formatting resets at each line break.
export function bulletList(entries: readonly string[]): string {
    return entries
        .map((entry) => `\n  ${Color.Gray}-${Color.Reset} ${entry}`)
        .join('');
}
