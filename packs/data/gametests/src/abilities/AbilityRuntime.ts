import {
    Direction,
    Entity,
    EntityComponentTypes,
    EntityDamageCause,
    EntityDieAfterEvent,
    EntityHurtAfterEvent,
    EquipmentSlot,
    ItemComponentTypes,
    ItemStack,
    Player,
    PlayerBreakBlockAfterEvent,
    PlayerInventoryItemChangeAfterEvent,
    Vector3,
    system,
    world,
} from '@minecraft/server';
import { Settings } from '../core/Settings';
import { Log } from '../util/Log';
import { describeError } from '../util/Result';
import { Ability, Step, describeStep, readAbilities } from './Ability';
import { actionFor, ownShots } from './actions';
import { equipment, isCreative, useOne, wearItem } from './costs';
import { flagOf, numberOf, textOf } from './fields';
import {
    blockFilter,
    itemsSpawnedSince,
    noteItemSpawn,
    settleDrops,
} from './mining';
import { storedAbilities } from './storage';
import { AbilityContext, Trigger } from './types';

type Base = Omit<AbilityContext, 'item'>;

const EQUIPMENT_INTERVAL = 10;
const READY_WINDOW = 1200;
const USE_WINDOW = 3;
const MAX_SHOTS = 512;
const WORN_SLOTS = [
    EquipmentSlot.Offhand,
    EquipmentSlot.Head,
    EquipmentSlot.Chest,
    EquipmentSlot.Legs,
    EquipmentSlot.Feet,
];

const log = Log.get('Abilities');
const cooldowns = new Map<string, number>();
const failed = new Set<string>();
const shots = new Map<string, { holder: Player; item: ItemStack }>();
const readied = new Map<string, { item: ItemStack; tick: number }>();
const lastUse = new Map<string, number>();

const FACES: Record<Direction, Vector3> = {
    [Direction.Up]: { x: 0, y: 1, z: 0 },
    [Direction.Down]: { x: 0, y: -1, z: 0 },
    [Direction.North]: { x: 0, y: 0, z: -1 },
    [Direction.South]: { x: 0, y: 0, z: 1 },
    [Direction.East]: { x: 1, y: 0, z: 0 },
    [Direction.West]: { x: -1, y: 0, z: 0 },
};

export class AbilityRuntime {
    private constructor() {}

    static install(): void {
        world.afterEvents.entityHurt.subscribe(onHurt);
        world.afterEvents.entityDie.subscribe(onDie);
        world.afterEvents.playerBreakBlock.subscribe(onMine);

        world.afterEvents.entityHitEntity.subscribe(({ damagingEntity }) =>
            markUse(damagingEntity)
        );
        world.afterEvents.entityHurt.subscribe(({ hurtEntity }) =>
            markUse(hurtEntity)
        );
        world.afterEvents.playerBreakBlock.subscribe(({ player }) =>
            markUse(player)
        );
        world.afterEvents.itemReleaseUse.subscribe(({ source }) =>
            markUse(source)
        );
        world.afterEvents.playerInteractWithBlock.subscribe(({ player }) =>
            markUse(player)
        );
        world.afterEvents.playerInteractWithEntity.subscribe(({ player }) =>
            markUse(player)
        );

        world.afterEvents.itemStartUse.subscribe(({ source, itemStack }) =>
            ready(source, itemStack)
        );

        world.afterEvents.itemUse.subscribe(({ source, itemStack }) => {
            markUse(source);
            ready(source, itemStack);
            if (hasTrigger(itemStack, 'use')) {
                fire(itemStack, {
                    trigger: 'use',
                    holder: source,
                    slot: EquipmentSlot.Mainhand,
                    dimension: source.dimension,
                    ...lookAt(source),
                });
            }
        });

        world.afterEvents.entitySpawn.subscribe(({ entity }) => {
            if (entity.isValid) {
                onSpawn(entity);
            }
        });

        world.afterEvents.projectileHitEntity.subscribe((event) => {
            const shot = takeShot(event.projectile);
            const hit = event.getEntityHit().entity;
            if (shot) {
                fire(shot.item, {
                    trigger: 'shoot',
                    holder: shot.holder,
                    slot: EquipmentSlot.Mainhand,
                    target: hit,
                    targetType: hit?.typeId,
                    location: event.location,
                    dimension: event.dimension,
                });
            }
        });

        world.afterEvents.projectileHitBlock.subscribe((event) => {
            const shot = takeShot(event.projectile);
            if (shot) {
                fire(shot.item, {
                    trigger: 'shoot',
                    holder: shot.holder,
                    slot: EquipmentSlot.Mainhand,
                    location: event.location,
                    dimension: event.dimension,
                });
            }
        });

        world.afterEvents.entityRemove.subscribe(({ removedEntityId }) => {
            shots.delete(removedEntityId);
            ownShots.delete(removedEntityId);
        });

        world.afterEvents.playerInventoryItemChange.subscribe(watchForBreak);

        world.afterEvents.playerLeave.subscribe(({ playerId }) => {
            for (const key of cooldowns.keys()) {
                if (key.startsWith(`${playerId}:`)) {
                    cooldowns.delete(key);
                }
            }
            readied.delete(playerId);
            lastUse.delete(playerId);
        });

        system.runInterval(checkEquipment, EQUIPMENT_INTERVAL);
    }

    // Skips chance, cooldown, conditions and costs, and anything that needs a
    // real block break or a real hit to mean something.
    static tryOut(player: Player, ability: Ability, item: ItemStack): void {
        execute(
            {
                ...ability,
                steps: ability.steps.filter(
                    (step) => !actionFor(step.action)?.triggers
                ),
            },
            {
                trigger: ability.trigger,
                holder: player,
                item,
                dimension: player.dimension,
                ...lookAt(player),
            }
        );
    }
}

function onHurt({
    hurtEntity,
    damage,
    damageSource,
}: EntityHurtAfterEvent): void {
    // Only real hits and shots. Damage from an ability's own explosion or
    // lightning would otherwise set more abilities off, and two players with
    // thorns-style abilities would bounce damage back and forth forever.
    const { cause, damagingEntity, damagingProjectile } = damageSource;
    if (
        (cause !== EntityDamageCause.entityAttack &&
            cause !== EntityDamageCause.projectile) ||
        !hurtEntity.isValid ||
        !damagingEntity?.isValid ||
        damagingEntity.id === hurtEntity.id
    ) {
        return;
    }

    if (
        damagingEntity instanceof Player &&
        cause === EntityDamageCause.entityAttack &&
        !damagingProjectile
    ) {
        const item = equipment(damagingEntity, EquipmentSlot.Mainhand);
        if (item) {
            fire(item, {
                trigger: 'hit',
                holder: damagingEntity,
                slot: EquipmentSlot.Mainhand,
                target: hurtEntity,
                targetType: hurtEntity.typeId,
                location: hurtEntity.location,
                dimension: hurtEntity.dimension,
                damage,
            });
        }
    }

    if (hurtEntity instanceof Player) {
        for (const slot of [EquipmentSlot.Mainhand, ...WORN_SLOTS]) {
            const item = equipment(hurtEntity, slot);
            if (item) {
                fire(item, {
                    trigger: 'hurt',
                    holder: hurtEntity,
                    slot,
                    target: damagingEntity,
                    targetType: damagingEntity.typeId,
                    location: damagingEntity.location,
                    dimension: hurtEntity.dimension,
                    damage,
                });
            }
        }
    }
}

function onDie({ deadEntity, damageSource }: EntityDieAfterEvent): void {
    const killer = damageSource.damagingEntity;
    if (
        !(killer instanceof Player) ||
        !killer.isValid ||
        (damageSource.cause !== EntityDamageCause.entityAttack &&
            damageSource.cause !== EntityDamageCause.projectile)
    ) {
        return;
    }
    const item = equipment(killer, EquipmentSlot.Mainhand);
    if (!item) {
        return;
    }
    const valid = deadEntity.isValid;
    fire(item, {
        trigger: 'kill',
        holder: killer,
        slot: EquipmentSlot.Mainhand,
        target: valid ? deadEntity : undefined,
        targetType: valid ? deadEntity.typeId : undefined,
        location: valid ? deadEntity.location : killer.location,
        dimension: killer.dimension,
    });
}

function onMine({
    player,
    block,
    dimension,
    brokenBlockPermutation,
    itemStackBeforeBreak,
}: PlayerBreakBlockAfterEvent): void {
    if (!itemStackBeforeBreak) {
        return;
    }
    const at = { x: block.x, y: block.y, z: block.z };
    fire(itemStackBeforeBreak, {
        trigger: 'mine',
        holder: player,
        slot: EquipmentSlot.Mainhand,
        location: { x: at.x + 0.5, y: at.y + 0.5, z: at.z + 0.5 },
        dimension,
        mined: {
            location: at,
            permutation: brokenBlockPermutation,
            tick: system.currentTick,
            accepts: () => true,
            drops: { mode: 'normal', loot: [], wear: 0, collected: false },
        },
    });
}

// Nothing ties an arrow to the bow that fired it, so remember whatever the
// owner was holding when it spawned.
function onSpawn(entity: Entity): void {
    if (entity.typeId === 'minecraft:item') {
        noteItemSpawn(entity);
        return;
    }
    if (ownShots.delete(entity.id)) {
        return;
    }
    const owner = entity.getComponent(EntityComponentTypes.Projectile)?.owner;
    if (!(owner instanceof Player) || !owner.isValid) {
        return;
    }
    const held = equipment(owner, EquipmentSlot.Mainhand);
    const item =
        held && hasTrigger(held, 'shoot') ? held : takeReadied(owner.id);
    if (item) {
        // Arrows left in chunks that unload never send entityRemove.
        if (shots.size >= MAX_SHOTS) {
            const oldest = shots.keys().next().value;
            if (oldest !== undefined) {
                shots.delete(oldest);
            }
        }
        shots.set(entity.id, { holder: owner, item });
    }
}

// A thrown trident (or the last snowball) has already left the hand by the
// time it spawns, so fall back to whatever was being charged or thrown.
function ready(player: Player, item: ItemStack): void {
    if (hasTrigger(item, 'shoot')) {
        readied.set(player.id, { item, tick: system.currentTick });
    }
}

function takeReadied(playerId: string): ItemStack | undefined {
    const entry = readied.get(playerId);
    readied.delete(playerId);
    return entry && system.currentTick - entry.tick <= READY_WINDOW
        ? entry.item
        : undefined;
}

function takeShot(
    projectile: Entity
): { holder: Player; item: ItemStack } | undefined {
    const shot = shots.get(projectile.id);
    shots.delete(projectile.id);
    return shot?.holder.isValid ? shot : undefined;
}

function checkEquipment(): void {
    for (const player of world.getAllPlayers()) {
        const equippable = player.getComponent(EntityComponentTypes.Equippable);
        if (!equippable) {
            continue;
        }
        const base = {
            holder: player,
            location: player.location,
            dimension: player.dimension,
        };
        const held = equippable.getEquipment(EquipmentSlot.Mainhand);
        if (held) {
            fire(held, {
                ...base,
                trigger: 'held',
                slot: EquipmentSlot.Mainhand,
            });
        }
        for (const slot of WORN_SLOTS) {
            const worn = equippable.getEquipment(slot);
            if (worn) {
                fire(worn, { ...base, trigger: 'worn', slot });
            }
        }
    }
}

function lookAt(player: Player): {
    target?: Entity;
    targetType?: string;
    location: Vector3;
} {
    const reach = Settings.get().reach;
    const entity = player
        .getEntitiesFromViewDirection({ maxDistance: reach })
        .find(
            (hit) =>
                hit.entity.typeId !== 'minecraft:item' &&
                hit.entity.typeId !== 'minecraft:xp_orb' &&
                !hit.entity.hasComponent(EntityComponentTypes.Projectile)
        )?.entity;
    if (entity) {
        return {
            target: entity,
            targetType: entity.typeId,
            location: entity.location,
        };
    }
    // The empty block in front of the face, so a spawned mob stands on top of
    // or beside the block instead of ending up inside it.
    const hit = player.getBlockFromViewDirection({ maxDistance: reach });
    if (hit) {
        const side = FACES[hit.face];
        return {
            location: {
                x: hit.block.x + side.x + 0.5,
                y: hit.block.y + side.y,
                z: hit.block.z + side.z + 0.5,
            },
        };
    }
    const head = player.getHeadLocation();
    const view = player.getViewDirection();
    return {
        location: {
            x: head.x + view.x * reach,
            y: head.y + view.y * reach,
            z: head.z + view.z * reach,
        },
    };
}

function hasTrigger(item: ItemStack, trigger: Trigger): boolean {
    return readAbilities(item).some(
        (ability) => ability.enabled && ability.trigger === trigger
    );
}

function fire(item: ItemStack, base: Base): void {
    const abilities = readAbilities(item);
    if (abilities.length === 0) {
        return;
    }

    const now = system.currentTick;
    for (const ability of abilities) {
        if (!ability.enabled || ability.trigger !== base.trigger) {
            continue;
        }
        const ctx: AbilityContext = {
            ...base,
            item,
            // Drops stay shared, so somthing like vein miner and a magnet on the same
            // pickaxe both work on the one break.
            mined: base.mined && {
                ...base.mined,
                accepts: blockFilter(ability.settings),
            },
        };
        if (!conditionsMet(ability, ctx)) {
            continue;
        }

        const key = `${ctx.holder.id}:${ability.id}`;
        const ready = cooldowns.get(key) ?? 0;
        if (now < ready) {
            tell(
                ability,
                ctx,
                `Ready in ${Math.ceil((ready - now) / 2) / 10}s`
            );
            continue;
        }

        const chance = numberOf(ability.settings, 'chance');
        if (chance < 100 && Math.random() * 100 >= chance) {
            continue;
        }

        const levels = numberOf(ability.settings, 'levels');
        if (
            levels > 0 &&
            !isCreative(ctx.holder) &&
            ctx.holder.level < levels
        ) {
            tell(
                ability,
                ctx,
                `Needs ${levels} level${levels === 1 ? '' : 's'}`
            );
            continue;
        }

        cooldowns.set(
            key,
            now + Math.round(numberOf(ability.settings, 'cooldown') * 20)
        );
        execute(ability, ctx);
        pay(ability, ctx);
    }
}

function conditionsMet(ability: Ability, ctx: AbilityContext): boolean {
    const settings = ability.settings;
    const sneak = textOf(settings, 'sneak');
    if (
        (sneak === 'only' && !ctx.holder.isSneaking) ||
        (sneak === 'never' && ctx.holder.isSneaking)
    ) {
        return false;
    }

    const victims = textOf(settings, 'victims');
    if (victims && victims !== 'any') {
        const type = ctx.targetType;
        if (
            !type ||
            (victims === 'players' && type !== 'minecraft:player') ||
            (victims === 'mobs' && type === 'minecraft:player') ||
            (victims === 'type' && type !== textOf(settings, 'victimType'))
        ) {
            return false;
        }
    }

    return !ctx.mined || ctx.mined.accepts(ctx.mined.permutation);
}

function tell(ability: Ability, ctx: AbilityContext, message: string): void {
    if (ability.trigger === 'use' && flagOf(ability.settings, 'notice')) {
        ctx.holder.onScreenDisplay.setActionBar(message);
    }
}

function pay(ability: Ability, ctx: AbilityContext): void {
    const settings = ability.settings;
    const levels = numberOf(settings, 'levels');
    if (levels > 0 && !isCreative(ctx.holder)) {
        ctx.holder.addLevels(-levels);
    }
    wearItem(ctx, numberOf(settings, 'durability'));
    if (flagOf(settings, 'consume')) {
        useOne(ctx);
    }
}

function execute(ability: Ability, ctx: AbilityContext): void {
    for (const step of ability.steps) {
        if (step.delay > 0) {
            system.runTimeout(
                () => {
                    if (ctx.holder.isValid) {
                        runStep(ability, step, ctx);
                        settleDrops(ctx);
                    }
                },
                Math.round(step.delay * 20)
            );
        } else {
            runStep(ability, step, ctx);
        }
    }
    settleDrops(ctx);
}

function runStep(ability: Ability, step: Step, ctx: AbilityContext): void {
    const action = actionFor(step.action);
    if (!action) {
        return;
    }
    try {
        action.run(ctx, step.values);
    } catch (error) {
        // Held abilities fire twice a second, a broken one would bury the log.
        const key = `${ability.id}:${step.action}`;
        if (!failed.has(key)) {
            failed.add(key);
            log.warn(`${describeStep(step)} failed: ${describeError(error)}`);
        }
    }
}

// There's currently no event for an item breaking, so it's a nearly spent item vanishing from a
// slot. The drop and the slot change arrive in no fixed order, hence waiting a
// couple of ticks before ruling out a move or a throw.
function watchForBreak({
    player,
    beforeItemStack,
    itemStack,
}: PlayerInventoryItemChangeAfterEvent): void {
    if (
        !beforeItemStack ||
        itemStack ||
        !nearlySpent(beforeItemStack) ||
        !hasTrigger(beforeItemStack, 'break')
    ) {
        return;
    }

    const signature = signatureOf(beforeItemStack);
    const changedAt = system.currentTick;
    const gliding = player.isGliding;
    system.runTimeout(() => {
        if (
            !player.isValid ||
            !(gliding || usedAround(player.id, changedAt)) ||
            droppedSince(player, signature, changedAt) ||
            carries(player, signature)
        ) {
            return;
        }
        fire(beforeItemStack, {
            trigger: 'break',
            holder: player,
            location: player.location,
            dimension: player.dimension,
        });
    }, 2);
}

function markUse(entity: Entity): void {
    if (entity instanceof Player) {
        lastUse.set(entity.id, system.currentTick);
    }
}

// Durability only goes down when the item gets used, so a spent item vanishing
// with no use around it was cleared or picked up with the cursor. The use
// event can land a tick either side of the slot change.
function usedAround(playerId: string, tick: number): boolean {
    const used = lastUse.get(playerId);
    return used !== undefined && Math.abs(used - tick) <= USE_WINDOW;
}

// The last use can cost more than one point, so leave a little margin.
function nearlySpent(item: ItemStack): boolean {
    const durability = item.getComponent(ItemComponentTypes.Durability);
    return (
        durability !== undefined &&
        !durability.unbreakable &&
        durability.maxDurability - durability.damage <= 2
    );
}

// Two identical copies look like one item here, so if one breaks while the
// other is in the inventory it reads as a move and doesn't fire.
function signatureOf(item: ItemStack): string {
    return `${item.typeId}|${item.nameTag ?? ''}|${storedAbilities(item) ?? ''}`;
}

// entityItemDrop is typed as handing over an array but doesn't at runtime, so
// look for the item among the ones that just spawned next to the player.
function droppedSince(
    player: Player,
    signature: string,
    tick: number
): boolean {
    const at = player.location;
    return itemsSpawnedSince(tick - 2).some((entity) => {
        if (
            !entity.isValid ||
            entity.dimension.id !== player.dimension.id ||
            Math.hypot(
                entity.location.x - at.x,
                entity.location.y - at.y,
                entity.location.z - at.z
            ) > 4
        ) {
            return false;
        }
        const stack = entity.getComponent(EntityComponentTypes.Item)?.itemStack;
        return stack !== undefined && signatureOf(stack) === signature;
    });
}

function carries(player: Player, signature: string): boolean {
    const container = player.getComponent(
        EntityComponentTypes.Inventory
    )?.container;
    if (container) {
        for (let slot = 0; slot < container.size; slot++) {
            const item = container.getItem(slot);
            if (item && signatureOf(item) === signature) {
                return true;
            }
        }
    }
    return WORN_SLOTS.some((slot) => {
        const item = equipment(player, slot);
        return item !== undefined && signatureOf(item) === signature;
    });
}
