import { ItemStack } from '@minecraft/server';
import { Result, fail } from '../util/Result';
import { JsonValue, describeJsonType } from '../util/json';

export type ItemMutation = (item: ItemStack) => void;

export type ItemValueKind = 'text' | 'number' | 'flag' | 'choice' | 'composite';

export type ItemPropertyControl =
    | { readonly kind: 'text'; readonly placeholder: string }
    | { readonly kind: 'toggle' }
    | {
          readonly kind: 'slider';
          readonly min: number;
          readonly max: number;
          readonly step: number;
      }
    | { readonly kind: 'dropdown'; readonly options: readonly string[] };

export interface ItemProperty {
    // Also the enum value and JSON key, renaming it breaks saved kits.
    readonly id: string;

    readonly label: string;

    readonly description: string;

    readonly syntax: string;

    readonly valueKind: ItemValueKind;

    supports(item: ItemStack): boolean;

    control(item: ItemStack): ItemPropertyControl;

    choices(): readonly string[];

    // Has to round-trip through parse(), toJson builds on it.
    toInput(item: ItemStack): string;

    format(item: ItemStack): string | undefined;

    isDefault(item: ItemStack): boolean;

    parse(raw: string, item: ItemStack): Result<ItemMutation>;

    toJson(item: ItemStack): JsonValue | undefined;

    fromJson(value: JsonValue, item: ItemStack): Result<ItemMutation>;

    reset(item: ItemStack): void;
}

export abstract class BaseItemProperty implements ItemProperty {
    abstract readonly id: string;
    abstract readonly label: string;
    abstract readonly description: string;
    abstract readonly syntax: string;
    abstract readonly valueKind: ItemValueKind;

    abstract control(item: ItemStack): ItemPropertyControl;
    abstract toInput(item: ItemStack): string;
    abstract format(item: ItemStack): string | undefined;
    abstract parse(raw: string, item: ItemStack): Result<ItemMutation>;
    abstract reset(item: ItemStack): void;

    supports(_item: ItemStack): boolean {
        return true;
    }

    choices(): readonly string[] {
        return [];
    }

    isDefault(item: ItemStack): boolean {
        return this.format(item) === undefined;
    }

    toJson(item: ItemStack): JsonValue | undefined {
        if (!this.supports(item) || this.isDefault(item)) {
            return undefined;
        }

        const input = this.toInput(item);
        switch (this.valueKind) {
            case 'number':
                return Number(input);
            case 'flag':
                return input === 'true';
            default:
                return input;
        }
    }

    fromJson(value: JsonValue, item: ItemStack): Result<ItemMutation> {
        const expected = this.expectedJsonType();
        if (expected !== null && typeof value !== expected) {
            return fail(
                `expected ${describeExpected(expected)}, got ${describeJsonType(value)}.`
            );
        }
        return this.parse(String(value), item);
    }

    protected expectedJsonType(): 'string' | 'number' | 'boolean' | null {
        switch (this.valueKind) {
            case 'number':
                return 'number';
            case 'flag':
                return 'boolean';
            case 'text':
            case 'choice':
                return 'string';
            default:
                return null;
        }
    }
}

function describeExpected(expected: 'string' | 'number' | 'boolean'): string {
    switch (expected) {
        case 'string':
            return 'text';
        case 'number':
            return 'a number';
        case 'boolean':
            return 'true or false';
    }
}
