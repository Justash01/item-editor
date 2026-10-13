import { EntityDamageCause, Player, system, world } from '@minecraft/server';

// There's no fall distance on entities in the API, so keep the highest point
// since each player last stood on something.
const peaks = new Map<string, number>();
const grounded = new Map<string, number>();
const cushioned = new Map<string, number>();

// The jump press arrives a tick or two after the player has left the ground,
// so a jump off the floor would otherwise already read as being in the air.
const GROUND_GRACE = 4;

export function installFalling(): void {
    system.runInterval(() => {
        for (const player of world.getAllPlayers()) {
            if (player.isOnGround) {
                grounded.set(player.id, system.currentTick);
            }
            const y = player.location.y;
            const peak = peaks.get(player.id);
            if (
                peak === undefined ||
                player.isOnGround ||
                player.isInWater ||
                player.isFlying ||
                player.isGliding ||
                player.isClimbing
            ) {
                peaks.set(player.id, y);
            } else if (y > peak) {
                peaks.set(player.id, y);
            }
        }
    });

    world.beforeEvents.entityHurt.subscribe((event) => {
        const until = cushioned.get(event.hurtEntity.id);
        if (
            until !== undefined &&
            event.damageSource.cause === EntityDamageCause.fall
        ) {
            cushioned.delete(event.hurtEntity.id);
            if (system.currentTick <= until) {
                event.cancel = true;
            }
        }
    });

    world.afterEvents.playerLeave.subscribe(({ playerId }) => {
        peaks.delete(playerId);
        grounded.delete(playerId);
        cushioned.delete(playerId);
    });
}

export function onGround(player: Player): boolean {
    const tick = grounded.get(player.id);
    return (
        player.isOnGround ||
        (tick !== undefined && system.currentTick - tick <= GROUND_GRACE)
    );
}

export function fallDistance(player: Player): number {
    const peak = peaks.get(player.id);
    return peak === undefined ? 0 : Math.max(0, peak - player.location.y);
}

// The next landing within the window takes no damage, whatever the height.
export function cushionFall(player: Player, seconds: number): void {
    cushioned.set(player.id, system.currentTick + Math.round(seconds * 20));
}
