import { ItemStack } from '@minecraft/server';
import { namespaced } from '../Meta';
import { refreshLore } from '../item/generatedLore';
import { Result, fail, ok } from '../util/Result';
import {
    BaseItemProperty,
    ItemMutation,
    ItemPropertyControl,
    ItemValueKind,
} from '../item/ItemProperty';

export type StatId = 'attack' | 'protection';

interface StatSpec {
    readonly id: StatId;
    readonly label: string;
    readonly description: string;
    readonly min: number;
    readonly max: number;
    readonly step: number;
    readonly normal: number;
    readonly format: (value: number) => string;
}

const STATS: Record<StatId, StatSpec> = {
    attack: {
        id: 'attack',
        label: 'Attack damage',
        description:
            'Percent of the normal damage, for hits and for arrows it shoots. 100 is normal, 200 doubles it.',
        min: 0,
        max: 1000,
        step: 10,
        normal: 100,
        format: (value) => `${value}% damage`,
    },
    protection: {
        id: 'protection',
        label: 'Protection',
        description:
            'Percent of incoming damage blocked while worn or in the off-hand. Pieces add up, 100 blocks everything.',
        min: 0,
        max: 100,
        step: 5,
        normal: 0,
        format: (value) => `blocks ${value}% of damage`,
    },
};

function key(id: StatId): string {
    return namespaced(`stat.${id}`);
}

// Stackables can't hold dynamic properties, and nobody needs a stat on a
// stack of dirt anyway.
export function statOf(item: ItemStack | undefined, id: StatId): number {
    const spec = STATS[id];
    if (!item || item.isStackable) {
        return spec.normal;
    }
    const value = item.getDynamicProperty(key(id));
    return typeof value === 'number' ? value : spec.normal;
}

// Same trick as the ability summary, a code nobody types marks the line.
const LINE = '§j§t§r';

export function isStatLine(line: string): boolean {
    return line.startsWith(LINE);
}

export function statLines(item: ItemStack): string[] {
    const lines: string[] = [];
    const attack = statOf(item, 'attack') - STATS.attack.normal;
    if (attack !== 0) {
        lines.push(
            attack > 0
                ? `${LINE}§9+${attack}% Damage Dealt`
                : `${LINE}§cDeals ${-attack}% Less Damage`
        );
    }
    const protection = statOf(item, 'protection');
    if (protection !== STATS.protection.normal) {
        lines.push(`${LINE}§9-${protection}% Damage Taken`);
    }
    return lines;
}

export function hasRangedStats(item: ItemStack): boolean {
    return statOf(item, 'attack') !== STATS.attack.normal;
}

class StatProperty extends BaseItemProperty {
    readonly valueKind: ItemValueKind = 'number';
    readonly id: string;
    readonly label: string;
    readonly description: string;
    readonly syntax: string;

    constructor(private readonly spec: StatSpec) {
        super();
        this.id = spec.id;
        this.label = spec.label;
        this.description = spec.description;
        this.syntax = `a whole number from ${spec.min} to ${spec.max}`;
    }

    override supports(item: ItemStack): boolean {
        return !item.isStackable;
    }

    control(): ItemPropertyControl {
        return {
            kind: 'slider',
            min: this.spec.min,
            max: this.spec.max,
            step: this.spec.step,
        };
    }

    toInput(item: ItemStack): string {
        return String(statOf(item, this.spec.id));
    }

    format(item: ItemStack): string | undefined {
        const value = statOf(item, this.spec.id);
        return value === this.spec.normal ? undefined : this.spec.format(value);
    }

    parse(raw: string): Result<ItemMutation> {
        const clean = raw.trim().replace(/%$/, '');
        if (!/^\d+$/.test(clean)) {
            return fail(`"${raw}" is not a whole number.`);
        }
        const value = Number.parseInt(clean, 10);
        if (value < this.spec.min || value > this.spec.max) {
            return fail(
                `${this.spec.label} has to be between ${this.spec.min} and ${this.spec.max}.`
            );
        }
        const id = key(this.spec.id);
        const normal = this.spec.normal;
        return ok((item) => {
            item.setDynamicProperty(id, value === normal ? undefined : value);
            refreshLore(item);
        });
    }

    reset(item: ItemStack): void {
        item.setDynamicProperty(key(this.spec.id), undefined);
        refreshLore(item);
    }
}

export const STAT_PROPERTIES = [
    new StatProperty(STATS.attack),
    new StatProperty(STATS.protection),
];
