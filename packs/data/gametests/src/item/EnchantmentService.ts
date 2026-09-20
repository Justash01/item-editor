import {
    EnchantmentTypes,
    ItemComponentTypes,
    ItemStack,
} from '@minecraft/server';
import { SlotHandle } from '../core/SlotHandle';
import { ENCHANTMENT_IDS } from '../util/enchantmentIds';
import { JsonObject } from '../util/json';
import { Result, fail, ok } from '../util/Result';
import { idToName, sameId } from '../util/text';
import { ItemEditorService, jsonEdit } from './ItemEditorService';
import { ItemPropertyRegistry } from './ItemPropertyRegistry';
import { clearEnchantments } from './properties/EnchantmentsProperty';
import { itemRef } from '../util/names';

export interface EnchantmentChoice {
    readonly id: string;
    readonly label: string;
    readonly maxLevel: number;
}

// Otherwise conflicts go to whatever sorts first, e.g. Bane of Arthropods over
// Sharpness, Blast Protection over Protection.
const PREFERRED = [
    'minecraft:sharpness',
    'minecraft:protection',
    'minecraft:density',
    'minecraft:mending',
    'minecraft:fortune',
    'minecraft:loyalty',
    'minecraft:channeling',
    'minecraft:multishot',
    'minecraft:depth_strider',
];

const CURSES = ['minecraft:binding', 'minecraft:vanishing'];

export class EnchantmentService {
    private constructor() {}

    static choices(): EnchantmentChoice[] {
        const choices: EnchantmentChoice[] = [];

        for (const id of ENCHANTMENT_IDS) {
            const type = EnchantmentTypes.get(id);
            if (type) {
                choices.push({
                    id,
                    label: idToName(id),
                    maxLevel: type.maxLevel,
                });
            }
        }

        return choices.sort((left, right) =>
            left.label.localeCompare(right.label)
        );
    }

    static supports(item: ItemStack): boolean {
        return item.hasComponent(ItemComponentTypes.Enchantable);
    }

    // Strips and rebuilds the stack it's handed, so pass a copy read from the
    // slot. iOS hosts refuse enchantment writes on stacks made by clone() or
    // new ItemStack(), which rules out a separate scratchpad.
    // Existing enchantments go first so conflicts keep what the player picked.
    static plan(item: ItemStack, cap?: number): Result<Map<string, number>> {
        const enchantable = item.getComponent(ItemComponentTypes.Enchantable);
        if (!enchantable) {
            return fail(`${itemRef(item)} cannot be enchanted.`);
        }

        const existing = enchantable.getEnchantments().map((e) => e.type.id);
        clearEnchantments(enchantable);

        const all = EnchantmentService.choices();
        const find = (id: string): EnchantmentChoice[] =>
            all.filter((choice) => sameId(choice.id, id));
        const isCurse = (id: string): boolean =>
            CURSES.some((curse) => sameId(curse, id));

        const ordered = [
            ...existing.flatMap(find),
            ...PREFERRED.flatMap(find),
            ...all.filter((choice) => !isCurse(choice.id)),
        ];

        const levels = new Map<string, number>();
        for (const choice of ordered) {
            if (levels.has(choice.id)) {
                continue;
            }

            const type = EnchantmentTypes.get(choice.id);
            if (!type) {
                continue;
            }

            const level =
                cap === undefined
                    ? choice.maxLevel
                    : Math.min(cap, choice.maxLevel);
            const enchantment = { type, level };
            try {
                if (!enchantable.canAddEnchantment(enchantment)) {
                    continue;
                }
                enchantable.addEnchantment(enchantment);
                levels.set(choice.id, level);
            } catch {
                // Conflicts with something already picked.
            }
        }

        return ok(levels);
    }

    static fill(slot: SlotHandle, cap?: number): Result<string> {
        const current = ItemEditorService.require(slot);
        if (!current.ok) {
            return current;
        }

        const levels = EnchantmentService.plan(current.value, cap);
        if (!levels.ok) {
            return levels;
        }

        const written = EnchantmentService.write(slot, levels.value);
        if (!written.ok) {
            return written;
        }

        const name = itemRef(current.value);
        const count = `${levels.value.size} enchantment${levels.value.size === 1 ? '' : 's'}`;
        return ok(
            cap === undefined
                ? `Maxed ${count} on ${name} in ${slot.label}.`
                : `Set ${count} to level ${cap} or their max on ${name} in ${slot.label}.`
        );
    }

    static removeAll(slot: SlotHandle): Result<string> {
        const current = ItemEditorService.require(slot);
        if (!current.ok) {
            return current;
        }
        if (!EnchantmentService.supports(current.value)) {
            return fail(`${itemRef(current.value)} cannot be enchanted.`);
        }

        const written = EnchantmentService.write(slot, new Map());
        return written.ok
            ? ok(
                  `Removed all enchantments from ${itemRef(current.value)} in ${slot.label}.`
              )
            : written;
    }

    static write(
        slot: SlotHandle,
        levels: ReadonlyMap<string, number>
    ): Result<string> {
        const property = ItemPropertyRegistry.get('enchantments');
        if (!property.ok) {
            return fail("Can't edit enchantments.");
        }

        const document: JsonObject = {};
        for (const [id, level] of levels) {
            document[id] = level;
        }

        const written = ItemEditorService.applyAll(slot, [
            jsonEdit(property.value, document),
        ]);
        if (!written.ok) {
            return written;
        }

        // The game accepts some enchantments and then quietly drops them, the
        // curses on most items being the ones that do it.
        const refused = EnchantmentService.refused(slot, levels);
        return refused.length === 0
            ? written
            : ok(`${written.value} The game refused ${refused.join(', ')}.`);
    }

    private static refused(
        slot: SlotHandle,
        levels: ReadonlyMap<string, number>
    ): string[] {
        const item = slot.read();
        const applied = item
            ?.getComponent(ItemComponentTypes.Enchantable)
            ?.getEnchantments();
        if (!applied) {
            return [];
        }

        return [...levels.keys()]
            .filter((id) => !applied.some((each) => sameId(each.type.id, id)))
            .map(idToName);
    }
}
