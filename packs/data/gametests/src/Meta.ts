export const NAMESPACE = 'jstash';

export function namespaced(name: string): string {
    return `${NAMESPACE}:${name}`;
}

export const CommandId = {
    Select: namespaced('select'),
    Set: namespaced('set'),
    Enchant: namespaced('ench'),
    Lore: namespaced('lore'),
    Item: namespaced('item'),
    Kit: namespaced('kit'),
    Grant: namespaced('grant'),
    Block: namespaced('block'),
    Editor: namespaced('editor'),
    Settings: namespaced('settings'),
} as const;

// Enum params are matched by name, so the param name has to be exactly the
// registered enum name.
export const CommandEnumId = {
    Slot: namespaced('slot'),
    Property: namespaced('property'),
    ItemOperation: namespaced('item_op'),
    LoreOperation: namespaced('lore_op'),
    KitOperation: namespaced('kit_op'),
    BlockOperation: namespaced('block_op'),
    Enchantment: namespaced('enchantment'),
    Panel: namespaced('panel'),
} as const;
