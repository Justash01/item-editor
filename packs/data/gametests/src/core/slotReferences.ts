import { EquipmentSlot } from '@minecraft/server';

// First alias is the canonical one.
const EQUIPMENT_ALIASES: readonly {
    slot: EquipmentSlot;
    label: string;
    aliases: readonly string[];
}[] = [
    {
        slot: EquipmentSlot.Mainhand,
        label: 'Main hand',
        aliases: ['mainhand', 'hand', 'selected'],
    },
    { slot: EquipmentSlot.Offhand, label: 'Off hand', aliases: ['offhand'] },
    { slot: EquipmentSlot.Head, label: 'Head', aliases: ['head', 'helmet'] },
    {
        slot: EquipmentSlot.Chest,
        label: 'Chest',
        aliases: ['chest', 'chestplate'],
    },
    { slot: EquipmentSlot.Legs, label: 'Legs', aliases: ['legs', 'leggings'] },
    { slot: EquipmentSlot.Feet, label: 'Feet', aliases: ['feet', 'boots'] },
];

const BY_ALIAS = new Map<string, EquipmentSlot>(
    EQUIPMENT_ALIASES.flatMap((entry) =>
        entry.aliases.map((alias) => [alias, entry.slot] as const)
    )
);

const LABELS = new Map<EquipmentSlot, string>(
    EQUIPMENT_ALIASES.map((entry) => [entry.slot, entry.label])
);

const CANONICAL = new Map<EquipmentSlot, string>(
    EQUIPMENT_ALIASES.map((entry) => [entry.slot, entry.aliases[0]!])
);

// No main hand, it's the selected hotbar slot and would show up twice.
export const NON_INVENTORY_EQUIPMENT_SLOTS: readonly EquipmentSlot[] =
    EQUIPMENT_ALIASES.map((entry) => entry.slot).filter(
        (slot) => slot !== EquipmentSlot.Mainhand
    );

export function equipmentSlotFromAlias(
    alias: string
): EquipmentSlot | undefined {
    return BY_ALIAS.get(alias.trim().toLowerCase());
}

export function equipmentSlotLabel(slot: EquipmentSlot): string {
    return LABELS.get(slot) ?? slot;
}

export function equipmentSlotReference(slot: EquipmentSlot): string {
    return CANONICAL.get(slot) ?? slot.toLowerCase();
}

export function slotAliasList(): string {
    return EQUIPMENT_ALIASES.map((entry) => entry.aliases[0]!).join(', ');
}

export type SlotGroup = 'armor' | 'equipment' | 'hotbar' | 'all';

export const SLOT_GROUPS: readonly {
    id: SlotGroup;
    label: string;
    description: string;
}[] = [
    {
        id: 'armor',
        label: 'Armor',
        description: 'Helmet, chestplate, leggings and boots',
    },
    {
        id: 'equipment',
        label: 'Armor and hands',
        description: 'Armor plus whatever is in each hand',
    },
    { id: 'hotbar', label: 'Hotbar', description: 'Inventory slots 0 to 8' },
    { id: 'all', label: 'Everything', description: 'Every item carried' },
];

export const ARMOR_SLOTS: readonly EquipmentSlot[] = [
    EquipmentSlot.Head,
    EquipmentSlot.Chest,
    EquipmentSlot.Legs,
    EquipmentSlot.Feet,
];

export const EQUIPMENT_SLOTS: readonly EquipmentSlot[] = [
    EquipmentSlot.Mainhand,
    EquipmentSlot.Offhand,
    ...ARMOR_SLOTS,
];

export const LAST_HOTBAR_SLOT = 8;

export function slotGroupFromAlias(alias: string): SlotGroup | undefined {
    const value = alias.trim().toLowerCase();
    return SLOT_GROUPS.find((group) => group.id === value)?.id;
}

export function slotGroupLabel(group: SlotGroup): string {
    return SLOT_GROUPS.find((entry) => entry.id === group)?.label ?? group;
}

// Slots are in the enum because only enum params get autocomplete.
const MAX_INVENTORY_SLOT = 35;

export const SLOT_ENUM_VALUES: readonly string[] = [
    ...EQUIPMENT_ALIASES.flatMap((entry) => entry.aliases),
    ...SLOT_GROUPS.map((group) => group.id),
    ...Array.from({ length: MAX_INVENTORY_SLOT + 1 }, (_, index) =>
        index.toString()
    ),
];
