import { ItemStack } from '@minecraft/server';
import { Result, fail, ok } from '../util/Result';
import { ItemProperty, ItemValueKind } from './ItemProperty';
import { AbilitiesProperty } from './properties/AbilitiesProperty';
import { AmountProperty } from './properties/AmountProperty';
import {
    CanDestroyProperty,
    CanPlaceOnProperty,
} from './properties/BlockListProperty';
import { DamageProperty } from './properties/DamageProperty';
import { EnchantmentsProperty } from './properties/EnchantmentsProperty';
import { KeepOnDeathProperty } from './properties/KeepOnDeathProperty';
import { LockModeProperty } from './properties/LockModeProperty';
import { LoreProperty } from './properties/LoreProperty';
import { NameProperty } from './properties/NameProperty';
import { UnbreakableProperty } from './properties/UnbreakableProperty';

const PROPERTIES: readonly ItemProperty[] = [
    new NameProperty(),
    new AmountProperty(),
    new LoreProperty(),
    new DamageProperty(),
    new UnbreakableProperty(),
    new EnchantmentsProperty(),
    new KeepOnDeathProperty(),
    new LockModeProperty(),
    new CanDestroyProperty(),
    new CanPlaceOnProperty(),
    new AbilitiesProperty(),
];

const BY_ID = new Map<string, ItemProperty>(
    PROPERTIES.map((property) => [property.id, property])
);

export class ItemPropertyRegistry {
    private constructor() {}

    static ids(): string[] {
        return PROPERTIES.map((property) => property.id);
    }

    static ofKind(kind: ItemValueKind): ItemProperty[] {
        return PROPERTIES.filter((property) => property.valueKind === kind);
    }

    static supportedBy(item: ItemStack): ItemProperty[] {
        return PROPERTIES.filter((property) => property.supports(item));
    }

    static get(id: string): Result<ItemProperty> {
        const property = BY_ID.get(id.trim().toLowerCase());
        return property
            ? ok(property)
            : fail(
                  `"${id}" is not an editable property. Valid properties: ${ItemPropertyRegistry.ids().join(', ')}.`
              );
    }
}
