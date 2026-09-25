import {
    BlockPermutation,
    Dimension,
    Entity,
    EquipmentSlot,
    ItemStack,
    Player,
    Vector3,
} from '@minecraft/server';

export type Trigger =
    | 'hit'
    | 'kill'
    | 'shoot'
    | 'hurt'
    | 'use'
    | 'held'
    | 'worn'
    | 'mine'
    | 'break';

interface TriggerInfo {
    readonly id: Trigger;
    readonly label: string;
    readonly detail: string;
    // What "Target" means for this trigger, if it has one at all.
    readonly target?: string;
}

export const TRIGGERS: readonly TriggerInfo[] = [
    {
        id: 'hit',
        label: 'On hit',
        detail: 'When you hit a mob or player with it',
        target: 'the mob you hit',
    },
    {
        id: 'kill',
        label: 'On kill',
        detail: 'When you kill something while holding it',
        target: 'what you killed',
    },
    {
        id: 'shoot',
        label: 'On arrow hit',
        detail: 'When an arrow, trident or anything else shot from it lands',
        target: 'what it hit',
    },
    {
        id: 'hurt',
        label: 'When hurt',
        detail: 'When a mob or player hits you while you hold or wear it',
        target: 'the attacker',
    },
    {
        id: 'use',
        label: 'On use',
        detail: 'When you right-click or tap with it',
        target: 'the mob you look at',
    },
    {
        id: 'held',
        label: 'While held',
        detail: 'Twice a second while it sits in your main hand',
    },
    {
        id: 'worn',
        label: 'While worn',
        detail: 'Twice a second while it sits in an armor slot or your off-hand',
    },
    { id: 'mine', label: 'On mine', detail: 'When you break a block with it' },
    { id: 'break', label: 'On break', detail: 'When the item itself breaks' },
];

export type DropMode = 'normal' | 'smelt' | 'inventory' | 'both' | 'none';

interface DropState {
    mode: DropMode;
    loot: ItemStack[];
    wear: number;
    collected: boolean;
}

interface MinedBlock {
    readonly location: Vector3;
    readonly permutation: BlockPermutation;
    readonly tick: number;
    readonly accepts: (permutation: BlockPermutation) => boolean;
    readonly drops: DropState;
}

export interface AbilityContext {
    readonly trigger: Trigger;
    readonly holder: Player;
    readonly item: ItemStack;
    readonly slot?: EquipmentSlot;
    readonly target?: Entity;
    readonly targetType?: string;
    readonly location: Vector3;
    readonly dimension: Dimension;
    readonly damage?: number;
    readonly mined?: MinedBlock;
}

export type FieldValue = number | boolean | string;
export type Values = Readonly<Record<string, FieldValue>>;

export interface ChoiceOption {
    readonly value: string;
    readonly label: string;
}

export interface FieldExtras {
    readonly description?: string;
    // Left out entirely for other triggers, in the form and in the data.
    readonly triggers?: readonly Trigger[];
    readonly showWhen?: {
        readonly key: string;
        readonly values: readonly string[];
    };
}

export type FieldSpec = FieldExtras &
    (
        | {
              readonly kind: 'number';
              readonly key: string;
              readonly label: string;
              // min and max are the slider. Typed values can go up to the
              // ceiling, which is only lower than the default where going
              // further freezes or breaks the world.
              readonly min: number;
              readonly max: number;
              readonly ceiling?: number;
              readonly step: number;
              readonly default: number;
          }
        | {
              readonly kind: 'flag';
              readonly key: string;
              readonly label: string;
              readonly default: boolean;
          }
        | {
              readonly kind: 'text';
              readonly key: string;
              readonly label: string;
              readonly default: string;
              readonly example: string;
              readonly maxLength: number;
              readonly stripSlash?: boolean;
              readonly check?: 'block' | 'blocks' | 'entity';
              readonly presets?: readonly ChoiceOption[];
          }
        | {
              readonly kind: 'choice';
              readonly key: string;
              readonly label: string;
              readonly options: readonly ChoiceOption[];
              readonly default: string;
          }
        | {
              readonly kind: 'target';
              readonly key: string;
              readonly label: string;
              readonly prefer: 'self' | 'target';
          }
    );

export interface ActionDefinition {
    readonly type: string;
    readonly label: string;
    readonly detail: string;
    readonly group: string;
    readonly fields: readonly FieldSpec[];
    readonly triggers?: readonly Trigger[];
    describe(values: Values): string;
    run(ctx: AbilityContext, values: Values): void;
}
