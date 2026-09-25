import {
    Block,
    BlockComponentTypes,
    BlockPermutation,
    Dimension,
    Entity,
    EntityComponentTypes,
    GameMode,
    ItemStack,
    Vector3,
    system,
    world,
} from '@minecraft/server';
import { idToName, splitList } from '../util/text';
import { isCreative, wearItem } from './costs';
import {
    choiceField,
    flagField,
    flagOf,
    numberField,
    numberOf,
    textOf,
} from './fields';
import {
    AbilityContext,
    ActionDefinition,
    ChoiceOption,
    DropMode,
    Values,
} from './types';

export const BLOCK_GROUPS: readonly ChoiceOption[] = [
    { value: 'any', label: 'Any block' },
    { value: 'ores', label: 'Ores' },
    { value: 'logs', label: 'Logs and stems' },
    { value: 'crops', label: 'Crops' },
    { value: 'list', label: 'Blocks I pick' },
];

const NEVER_BREAK = new Set([
    'minecraft:bedrock',
    'minecraft:barrier',
    'minecraft:border_block',
    'minecraft:allow',
    'minecraft:deny',
    'minecraft:command_block',
    'minecraft:chain_command_block',
    'minecraft:repeating_command_block',
    'minecraft:structure_block',
    'minecraft:structure_void',
    'minecraft:jigsaw',
    'minecraft:end_portal',
    'minecraft:end_portal_frame',
    'minecraft:end_gateway',
    'minecraft:portal',
    'minecraft:reinforced_deepslate',
    'minecraft:light_block',
]);

const AGED_CROPS = new Set([
    'minecraft:nether_wart',
    'minecraft:cocoa',
    'minecraft:melon_block',
    'minecraft:pumpkin',
]);

const SMELTS: Readonly<Record<string, string>> = {
    'minecraft:raw_iron': 'minecraft:iron_ingot',
    'minecraft:raw_gold': 'minecraft:gold_ingot',
    'minecraft:raw_copper': 'minecraft:copper_ingot',
    'minecraft:iron_ore': 'minecraft:iron_ingot',
    'minecraft:deepslate_iron_ore': 'minecraft:iron_ingot',
    'minecraft:gold_ore': 'minecraft:gold_ingot',
    'minecraft:deepslate_gold_ore': 'minecraft:gold_ingot',
    'minecraft:copper_ore': 'minecraft:copper_ingot',
    'minecraft:deepslate_copper_ore': 'minecraft:copper_ingot',
    'minecraft:ancient_debris': 'minecraft:netherite_scrap',
    'minecraft:cobblestone': 'minecraft:stone',
    'minecraft:cobbled_deepslate': 'minecraft:deepslate',
    'minecraft:stone': 'minecraft:smooth_stone',
    'minecraft:sand': 'minecraft:glass',
    'minecraft:red_sand': 'minecraft:glass',
    'minecraft:sandstone': 'minecraft:smooth_sandstone',
    'minecraft:red_sandstone': 'minecraft:smooth_red_sandstone',
    'minecraft:clay_ball': 'minecraft:brick',
    'minecraft:netherrack': 'minecraft:netherbrick',
    'minecraft:wet_sponge': 'minecraft:sponge',
    'minecraft:cactus': 'minecraft:green_dye',
    'minecraft:kelp': 'minecraft:dried_kelp',
    'minecraft:potato': 'minecraft:baked_potato',
    'minecraft:chorus_fruit': 'minecraft:popped_chorus_fruit',
};

const spawned: { entity: Entity; tick: number }[] = [];
// Drops the add-on put down itself. Without this, insta-mining the next block
// picks smelted stone back up and smelts it again into smooth stone.
const delivered = new Set<string>();

function isOre(id: string): boolean {
    return id.endsWith('_ore') || id === 'minecraft:ancient_debris';
}

function isLog(id: string): boolean {
    return /_(log|wood|stem|hyphae)$/.test(id);
}

function isCrop(permutation: BlockPermutation): boolean {
    return (
        'growth' in permutation.getAllStates() ||
        AGED_CROPS.has(permutation.type.id)
    );
}

export function blockFilter(
    settings: Values
): (permutation: BlockPermutation) => boolean {
    switch (textOf(settings, 'blocks')) {
        case 'ores':
            return (permutation) => isOre(permutation.type.id);
        case 'logs':
            return (permutation) => isLog(permutation.type.id);
        case 'crops':
            return isCrop;
        case 'list': {
            const ids = new Set(splitList(textOf(settings, 'blockList')));
            return (permutation) => ids.has(permutation.type.id);
        }
        default:
            return () => true;
    }
}

export function itemsSpawnedSince(tick: number): Entity[] {
    return spawned
        .filter((entry) => entry.tick >= tick)
        .map((entry) => entry.entity);
}

export function noteItemSpawn(entity: Entity): void {
    if (delivered.delete(entity.id)) {
        return;
    }
    const now = system.currentTick;
    while (spawned.length > 0 && now - spawned[0]!.tick > 5) {
        spawned.shift();
    }
    spawned.push({ entity, tick: now });
}

// Vanilla drops are already on the ground by the time the after event runs,
// so the only way to change them is to find the item entities and swap them.
export function settleDrops(ctx: AbilityContext): void {
    const mined = ctx.mined;
    if (!mined) {
        return;
    }
    const state = mined.drops;
    if (state.wear > 0) {
        wearItem(ctx, state.wear);
        state.wear = 0;
    }

    const collect = !state.collected && state.mode !== 'normal';
    if (!collect && state.loot.length === 0) {
        return;
    }
    state.collected ||= collect;

    // Drops can land a tick after the break event.
    system.run(() => {
        const stacks = collect ? pickUpDrops(ctx.dimension, mined) : [];
        stacks.push(...state.loot.splice(0));
        deliver(ctx, stacks, state.mode);
    });
}

function pickUpDrops(
    dimension: Dimension,
    mined: { location: Vector3; tick: number }
): ItemStack[] {
    const center = centerOf(mined.location);
    const stacks: ItemStack[] = [];
    for (const { entity, tick } of spawned) {
        if (
            tick < mined.tick ||
            !entity.isValid ||
            entity.dimension.id !== dimension.id ||
            distance(entity.location, center) > 2
        ) {
            continue;
        }
        const stack = entity.getComponent(EntityComponentTypes.Item)?.itemStack;
        if (stack) {
            stacks.push(stack);
            entity.remove();
        }
    }
    return stacks;
}

function deliver(
    ctx: AbilityContext,
    stacks: ItemStack[],
    mode: DropMode
): void {
    if (mode === 'none' || stacks.length === 0) {
        return;
    }
    const out =
        mode === 'smelt' || mode === 'both' ? stacks.map(smelted) : stacks;
    const at = centerOf(ctx.mined?.location ?? ctx.location);

    if (mode === 'inventory' || mode === 'both') {
        const container = ctx.holder.isValid
            ? ctx.holder.getComponent(EntityComponentTypes.Inventory)?.container
            : undefined;
        for (const stack of out) {
            const leftover = container ? container.addItem(stack) : stack;
            if (leftover) {
                delivered.add(ctx.dimension.spawnItem(leftover, at).id);
            }
        }
        return;
    }

    for (const stack of out) {
        delivered.add(ctx.dimension.spawnItem(stack, at).id);
    }
}

function smelted(stack: ItemStack): ItemStack {
    const id =
        SMELTS[stack.typeId] ??
        (/_(log|wood)$/.test(stack.typeId) ? 'minecraft:charcoal' : undefined);
    if (!id) {
        return stack;
    }
    try {
        return new ItemStack(id, stack.amount);
    } catch {
        return stack;
    }
}

function centerOf(location: Vector3): Vector3 {
    return {
        x: Math.floor(location.x) + 0.5,
        y: Math.floor(location.y) + 0.5,
        z: Math.floor(location.z) + 0.5,
    };
}

function distance(left: Vector3, right: Vector3): number {
    return Math.hypot(left.x - right.x, left.y - right.y, left.z - right.z);
}

function blockAt(dimension: Dimension, location: Vector3): Block | undefined {
    try {
        return dimension.getBlock(location);
    } catch {
        return undefined;
    }
}

function breakable(block: Block): boolean {
    return (
        !block.isAir &&
        !block.isLiquid &&
        !NEVER_BREAK.has(block.typeId) &&
        !block.typeId.startsWith('minecraft:light_block') &&
        !block.getComponent(BlockComponentTypes.Inventory)
    );
}

function veinId(id: string): string {
    return id.replace(':lit_', ':');
}

function box(ctx: AbilityContext, origin: Vector3, cube: boolean): Block[] {
    const view = ctx.holder.getViewDirection();
    const size = [Math.abs(view.x), Math.abs(view.y), Math.abs(view.z)];
    const facing = size.indexOf(Math.max(...size));

    const blocks: Block[] = [];
    for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
            for (let dz = -1; dz <= 1; dz++) {
                const offset = [dx, dy, dz];
                if (
                    (dx === 0 && dy === 0 && dz === 0) ||
                    (!cube && offset[facing] !== 0)
                ) {
                    continue;
                }
                const block = blockAt(ctx.dimension, {
                    x: origin.x + dx,
                    y: origin.y + dy,
                    z: origin.z + dz,
                });
                if (block) {
                    blocks.push(block);
                }
            }
        }
    }
    return blocks;
}

function vein(
    ctx: AbilityContext,
    origin: Vector3,
    id: string,
    limit: number
): Block[] {
    const kind = veinId(id);
    const key = (at: Vector3): string => `${at.x},${at.y},${at.z}`;
    const seen = new Set([key(origin)]);
    const queue: Vector3[] = [origin];
    const found: Block[] = [];

    while (queue.length > 0 && found.length < limit) {
        const at = queue.shift()!;
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                for (let dz = -1; dz <= 1; dz++) {
                    const next = { x: at.x + dx, y: at.y + dy, z: at.z + dz };
                    if (seen.has(key(next)) || found.length >= limit) {
                        continue;
                    }
                    seen.add(key(next));
                    const block = blockAt(ctx.dimension, next);
                    if (block && veinId(block.typeId) === kind) {
                        found.push(block);
                        queue.push(next);
                    }
                }
            }
        }
    }
    return found;
}

function replanted(
    permutation: BlockPermutation
): BlockPermutation | undefined {
    const states = permutation.getAllStates();
    const stage =
        'growth' in states ? 'growth' : 'age' in states ? 'age' : undefined;
    return stage
        ? BlockPermutation.resolve(permutation.type.id, {
              ...states,
              [stage]: 0,
          })
        : undefined;
}

const DROP_MODES: readonly ChoiceOption[] = [
    { value: 'smelt', label: 'Smelt them' },
    { value: 'inventory', label: 'Straight to your inventory' },
    { value: 'both', label: 'Smelt them into your inventory' },
    { value: 'none', label: 'Destroy them' },
];

export const MINING_ACTIONS: readonly ActionDefinition[] = [
    {
        type: 'area',
        label: 'Mine more blocks',
        detail: 'Break a 3x3 area, a cube, or the whole vein',
        group: 'Mining',
        triggers: ['mine'],
        fields: [
            choiceField(
                'shape',
                'Shape',
                [
                    { value: '3x3', label: '3x3, facing you' },
                    { value: '3x3x3', label: '3x3x3 cube' },
                    { value: 'vein', label: 'Whole vein or tree' },
                ],
                '3x3'
            ),
            numberField('limit', 'Most blocks at once', 8, 128, 8, 32, {
                ceiling: 1024,
                showWhen: { key: 'shape', values: ['vein'] },
            }),
            flagField('wear', 'Each block wears the tool', true),
        ],
        describe: (values) => {
            switch (textOf(values, 'shape')) {
                case 'vein':
                    return `Mine the whole vein, up to ${numberOf(values, 'limit')} blocks`;
                case '3x3x3':
                    return 'Mine a 3x3x3 cube';
                default:
                    return 'Mine a 3x3 area';
            }
        },
        run: (ctx, values) => {
            const mined = ctx.mined;
            if (!mined || ctx.holder.getGameMode() === GameMode.Adventure) {
                return;
            }
            const shape = textOf(values, 'shape');
            const blocks =
                shape === 'vein'
                    ? vein(
                          ctx,
                          mined.location,
                          mined.permutation.type.id,
                          numberOf(values, 'limit')
                      )
                    : box(ctx, mined.location, shape === '3x3x3');

            const loot = world.getLootTableManager();
            const creative = isCreative(ctx.holder);
            // One odd block shouldn't leave the rest of the tree standing, so
            // keep going and report the first problem at the end.
            let problem: unknown;
            for (const block of blocks) {
                try {
                    if (
                        !breakable(block) ||
                        !mined.accepts(block.permutation)
                    ) {
                        continue;
                    }
                    if (!creative) {
                        mined.drops.loot.push(
                            ...(loot.generateLootFromBlock(block, ctx.item) ??
                                [])
                        );
                    }
                    block.setType('minecraft:air');
                    if (flagOf(values, 'wear')) {
                        mined.drops.wear += 1;
                    }
                } catch (error) {
                    problem ??= error;
                }
            }
            if (problem !== undefined) {
                throw problem;
            }
        },
    },
    {
        type: 'replace',
        label: 'Replace the block',
        detail: 'Put a block back where the broken one was',
        group: 'Mining',
        triggers: ['mine'],
        fields: [
            choiceField(
                'with',
                'Replace with',
                [
                    { value: 'regrow', label: 'The same block again' },
                    { value: 'replant', label: 'A freshly planted crop' },
                    { value: 'block', label: 'A block I pick' },
                ],
                'regrow'
            ),
            {
                kind: 'text',
                key: 'block',
                label: 'Block id',
                default: 'minecraft:cobblestone',
                example: 'minecraft:stone',
                maxLength: 64,
                check: 'block',
                showWhen: { key: 'with', values: ['block'] },
            },
            numberField('after', 'After, in seconds', 0, 600, 5, 0),
        ],
        describe: (values) => {
            const after = numberOf(values, 'after');
            const when = after > 0 ? ` after ${after}s` : '';
            switch (textOf(values, 'with')) {
                case 'replant':
                    return `Replant the crop${when}`;
                case 'block':
                    return `Put ${idToName(textOf(values, 'block'))} there${when}`;
                default:
                    return `Grow the block back${when}`;
            }
        },
        run: (ctx, values) => {
            const mined = ctx.mined;
            if (!mined) {
                return;
            }
            const permutation =
                textOf(values, 'with') === 'block'
                    ? BlockPermutation.resolve(textOf(values, 'block'))
                    : textOf(values, 'with') === 'replant'
                      ? replanted(mined.permutation)
                      : mined.permutation;
            if (!permutation) {
                return;
            }

            // Skip it if something else took the spot in the meantime, or if
            // the chunk isn't loaded any more.
            const put = (): void => {
                const block = blockAt(ctx.dimension, mined.location);
                if (block?.isAir) {
                    block.setPermutation(permutation);
                }
            };
            const after = numberOf(values, 'after');
            if (after > 0) {
                system.runTimeout(put, after * 20);
            } else {
                put();
            }
        },
    },
    {
        type: 'drops',
        label: 'Change the drops',
        detail: 'Smelt them, send them to your inventory, or get rid of them',
        group: 'Mining',
        triggers: ['mine'],
        fields: [choiceField('mode', 'Drops', DROP_MODES, 'smelt')],
        describe: (values) => {
            switch (textOf(values, 'mode')) {
                case 'inventory':
                    return 'Send the drops to your inventory';
                case 'both':
                    return 'Smelt the drops into your inventory';
                case 'none':
                    return 'Destroy the drops';
                default:
                    return 'Smelt the drops';
            }
        },
        run: (ctx, values) => {
            if (ctx.mined) {
                ctx.mined.drops.mode = textOf(values, 'mode') as DropMode;
            }
        },
    },
];
