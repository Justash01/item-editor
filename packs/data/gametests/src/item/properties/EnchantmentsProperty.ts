import {
    Enchantment,
    EnchantmentTypes,
    ItemComponentTypes,
    ItemEnchantableComponent,
    ItemStack,
} from '@minecraft/server';
import { Result, describeError, fail, ok } from '../../util/Result';
import { JsonValue, describeJsonType } from '../../util/json';
import {
    fromRomanNumerals,
    idToName,
    splitList,
    levelText,
} from '../../util/text';
import {
    BaseItemProperty,
    ItemMutation,
    ItemPropertyControl,
    ItemValueKind,
} from '../ItemProperty';
import { itemRef } from '../../util/names';

interface RequestedEnchantment {
    readonly name: string;
    readonly level: number;
}

// sharpness, fire aspect 2, minecraft:unbreaking III
const ENTRY_PATTERN = /^(.+?)(?:\s+([0-9]+|[ivxlcdmIVXLCDM]+))?$/;

export class EnchantmentsProperty extends BaseItemProperty {
    readonly id = 'enchantments';
    readonly label = 'Enchantments';
    readonly description = 'Replaces the whole enchantment list.';
    readonly syntax =
        'comma separated "name level" pairs such as "sharpness 5, unbreaking III"';
    readonly valueKind: ItemValueKind = 'composite';

    override supports(item: ItemStack): boolean {
        return item.hasComponent(ItemComponentTypes.Enchantable);
    }

    control(): ItemPropertyControl {
        return { kind: 'text', placeholder: 'sharpness 5, unbreaking 3' };
    }

    toInput(item: ItemStack): string {
        return this.enchantments(item)
            .map((each) => `${idToName(each.type.id)} ${each.level}`)
            .join(', ');
    }

    format(item: ItemStack): string | undefined {
        const enchantments = this.enchantments(item);
        if (enchantments.length === 0) {
            return undefined;
        }
        return enchantments
            .map((each) => `${idToName(each.type.id)} ${levelText(each.level)}`)
            .join(', ');
    }

    override toJson(item: ItemStack): JsonValue | undefined {
        const enchantments = this.enchantments(item);
        if (enchantments.length === 0) {
            return undefined;
        }

        const result: Record<string, number> = {};
        for (const each of enchantments) {
            result[each.type.id] = each.level;
        }
        return result;
    }

    override fromJson(value: JsonValue, item: ItemStack): Result<ItemMutation> {
        if (typeof value === 'string') {
            return this.parse(value, item);
        }
        if (
            value === null ||
            typeof value !== 'object' ||
            Array.isArray(value)
        ) {
            return fail(
                `expected a { name: level } object, got ${describeJsonType(value)}.`
            );
        }

        const requested: RequestedEnchantment[] = [];
        for (const [name, level] of Object.entries(value)) {
            if (typeof level !== 'number') {
                return fail(
                    `the level for "${name}" must be a number, got ${describeJsonType(level)}.`
                );
            }
            requested.push({ name, level });
        }

        return this.build(requested, item);
    }

    parse(raw: string, item: ItemStack): Result<ItemMutation> {
        const requested: RequestedEnchantment[] = [];

        for (const entry of splitList(raw)) {
            const match = ENTRY_PATTERN.exec(entry);
            if (!match) {
                return fail(`"${entry}" is not a "name level" pair.`);
            }

            const [, rawName, rawLevel] = match;
            const level =
                rawLevel === undefined ? 1 : fromRomanNumerals(rawLevel);
            if (level === undefined) {
                return fail(`"${rawLevel}" is not an enchantment level.`);
            }
            requested.push({ name: rawName!.trim(), level });
        }

        return this.build(requested, item);
    }

    // Stripping the item first means existing enchantments don't count as
    // duplicates while entries still conflict with each other. It works on the
    // item itself rather than a scratch copy because iOS hosts refuse
    // enchantment writes on stacks made by clone() or new ItemStack(). Safe
    // either way: the mutation below clears and re-applies the whole list, and
    // nothing reaches the slot unless every edit staged cleanly.
    private build(
        requested: readonly RequestedEnchantment[],
        item: ItemStack
    ): Result<ItemMutation> {
        const enchantable = item.getComponent(ItemComponentTypes.Enchantable);
        if (!enchantable) {
            return fail(`${itemRef(item)} cannot be enchanted.`);
        }
        clearEnchantments(enchantable);

        const resolved: Enchantment[] = [];
        for (const { name, level } of requested) {
            const typeId = name.trim().toLowerCase().replace(/\s+/g, '_');
            const type = EnchantmentTypes.get(typeId);
            if (!type) {
                return fail(`"${name}" is not an enchantment.`);
            }

            if (!Number.isInteger(level) || level < 1) {
                return fail(
                    `the level for ${idToName(type.id)} must be a whole number of at least 1.`
                );
            }
            if (level > type.maxLevel) {
                return fail(
                    `${idToName(type.id)} only goes up to level ${type.maxLevel}.`
                );
            }

            const enchantment: Enchantment = { type, level };

            // Both can still throw on things the checks above miss.
            try {
                if (!enchantable.canAddEnchantment(enchantment)) {
                    return fail(
                        `${idToName(type.id)} cannot be applied to ${itemRef(item)}, or conflicts with another entry.`
                    );
                }
                enchantable.addEnchantment(enchantment);
            } catch (error) {
                return fail(
                    `${idToName(type.id)} cannot be applied to ${itemRef(item)}: ${describeError(error)}`
                );
            }

            resolved.push(enchantment);
        }

        return ok((target) => {
            const component = target.getComponent(
                ItemComponentTypes.Enchantable
            );
            if (!component) {
                return;
            }
            clearEnchantments(component);
            if (resolved.length > 0) {
                component.addEnchantments(resolved);
            }
        });
    }

    reset(item: ItemStack): void {
        const component = item.getComponent(ItemComponentTypes.Enchantable);
        if (component) {
            clearEnchantments(component);
        }
    }

    private enchantments(item: ItemStack): Enchantment[] {
        return (
            item
                .getComponent(ItemComponentTypes.Enchantable)
                ?.getEnchantments() ?? []
        );
    }
}

// iOS hosts throw on removeAllEnchantments, so take them off one at a time
// when that happens.
export function clearEnchantments(component: ItemEnchantableComponent): void {
    try {
        component.removeAllEnchantments();
    } catch {
        for (const each of component.getEnchantments()) {
            component.removeEnchantment(each.type);
        }
    }
}
