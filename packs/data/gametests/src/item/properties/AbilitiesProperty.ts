import { ItemStack } from '@minecraft/server';
import {
    describeAbility,
    parseAbilities,
    readAbilities,
    serializeAbility,
    writeAbilities,
} from '../../abilities/Ability';
import { allowsAbilities } from '../../abilities/storage';
import { Result, ok } from '../../util/Result';
import {
    JsonValue,
    parseRelaxedJson,
    stringifyRelaxedJson,
} from '../../util/json';
import { bulletList } from '../../util/text';
import {
    BaseItemProperty,
    ItemMutation,
    ItemPropertyControl,
    ItemValueKind,
} from '../ItemProperty';

export class AbilitiesProperty extends BaseItemProperty {
    readonly id = 'abilities';
    readonly label = 'Abilities';
    readonly description =
        'What the item does when you hit, use, mine or wear it.';
    readonly syntax =
        "a list like [{trigger:'hit',chance:20,do:[{action:'lightning'}]}], or empty to clear";
    readonly valueKind: ItemValueKind = 'composite';

    override supports(item: ItemStack): boolean {
        return allowsAbilities(item);
    }

    control(): ItemPropertyControl {
        return {
            kind: 'text',
            placeholder: "[{trigger:'hit',action:'lightning'}]",
        };
    }

    toInput(item: ItemStack): string {
        const abilities = readAbilities(item);
        return abilities.length > 0
            ? stringifyRelaxedJson(abilities.map(serializeAbility))
            : '';
    }

    format(item: ItemStack): string | undefined {
        const abilities = readAbilities(item);
        return abilities.length > 0
            ? bulletList(abilities.map(describeAbility))
            : undefined;
    }

    override toJson(item: ItemStack): JsonValue | undefined {
        const abilities = readAbilities(item);
        return abilities.length > 0
            ? abilities.map(serializeAbility)
            : undefined;
    }

    override fromJson(value: JsonValue): Result<ItemMutation> {
        const abilities = parseAbilities(value);
        if (!abilities.ok) {
            return abilities;
        }
        return ok((target) => {
            writeAbilities(target, abilities.value);
        });
    }

    parse(raw: string): Result<ItemMutation> {
        if (raw.trim().length === 0) {
            return ok((item) => {
                writeAbilities(item, []);
            });
        }
        const parsed = parseRelaxedJson(raw);
        return parsed.ok ? this.fromJson(parsed.value) : parsed;
    }

    reset(item: ItemStack): void {
        writeAbilities(item, []);
    }
}
