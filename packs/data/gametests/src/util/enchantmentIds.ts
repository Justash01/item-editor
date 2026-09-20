import { MinecraftEnchantmentTypes } from '@minecraft/vanilla-data';

export const ENCHANTMENT_IDS: readonly string[] = Object.values(
    MinecraftEnchantmentTypes
).sort();
