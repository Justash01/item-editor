import {
    Entity,
    EntityComponentTypes,
    EntityDamageCause,
    EntityHurtBeforeEvent,
    EquipmentSlot,
    Player,
    world,
} from '@minecraft/server';
import { shotItem } from '../abilities/AbilityRuntime';
import { statOf } from './ItemStats';

const GUARDED = [
    EquipmentSlot.Head,
    EquipmentSlot.Chest,
    EquipmentSlot.Legs,
    EquipmentSlot.Feet,
    EquipmentSlot.Offhand,
];

// Damage that should always get through, or /kill and the void stop working.
const UNBLOCKABLE = new Set<string>([
    EntityDamageCause.override,
    EntityDamageCause.selfDestruct,
    EntityDamageCause.void,
]);

export class StatRuntime {
    private constructor() {}

    static install(): void {
        world.beforeEvents.entityHurt.subscribe(adjustDamage);
    }
}

// The damage here is already after armor, so both stats scale it rather than
// adding or taking a flat amount.
function adjustDamage(event: EntityHurtBeforeEvent): void {
    const { damageSource, hurtEntity } = event;
    let damage = event.damage;

    // Players only: scripts can't see what a mob is holding.
    const attacker = damageSource.damagingEntity;
    if (attacker instanceof Player) {
        const projectile = damageSource.damagingProjectile;
        const weapon = projectile
            ? shotItem(projectile.id)
            : damageSource.cause === EntityDamageCause.entityAttack
              ? equipped(attacker, EquipmentSlot.Mainhand)
              : undefined;
        damage *= statOf(weapon, 'attack') / 100;
    }

    if (!UNBLOCKABLE.has(damageSource.cause)) {
        let blocked = 0;
        for (const slot of GUARDED) {
            blocked += statOf(equipped(hurtEntity, slot), 'protection');
        }
        damage *= 1 - Math.min(blocked, 100) / 100;
    }

    if (damage === event.damage) {
        return;
    }
    if (damage <= 0) {
        event.cancel = true;
        return;
    }
    event.damage = damage;
}

function equipped(entity: Entity, slot: EquipmentSlot) {
    return entity
        .getComponent(EntityComponentTypes.Equippable)
        ?.getEquipment(slot);
}
