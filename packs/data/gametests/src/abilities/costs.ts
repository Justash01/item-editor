import {
    EntityComponentTypes,
    EquipmentSlot,
    GameMode,
    ItemComponentTypes,
    ItemStack,
    Player,
} from '@minecraft/server';
import { idToName } from '../util/text';
import { storedAbilities } from './storage';
import { AbilityContext } from './types';

export function equipment(
    player: Player,
    slot: EquipmentSlot
): ItemStack | undefined {
    return player
        .getComponent(EntityComponentTypes.Equippable)
        ?.getEquipment(slot);
}

export function isCreative(player: Player): boolean {
    return player.getGameMode() === GameMode.Creative;
}

function sameItem(left: ItemStack, right: ItemStack): boolean {
    return (
        left.typeId === right.typeId &&
        storedAbilities(left) === storedAbilities(right)
    );
}

// The item from the event is a copy, and by the time we get to it the player
// may have switched slots, so need to check the slot still holds the same thing.
function currentItem(ctx: AbilityContext): ItemStack | undefined {
    if (!ctx.slot || !ctx.holder.isValid) {
        return undefined;
    }
    const item = equipment(ctx.holder, ctx.slot);
    return item && sameItem(item, ctx.item) ? item : undefined;
}

export function wearItem(ctx: AbilityContext, amount: number): void {
    if (amount <= 0 || !ctx.slot || isCreative(ctx.holder)) {
        return;
    }
    const item = currentItem(ctx);
    const durability = item?.getComponent(ItemComponentTypes.Durability);
    if (!item || !durability || durability.unbreakable) {
        return;
    }

    const equippable = ctx.holder.getComponent(EntityComponentTypes.Equippable);
    if (durability.damage + amount >= durability.maxDurability) {
        equippable?.setEquipment(ctx.slot, undefined);
        ctx.holder.playSound('random.break');
        return;
    }
    durability.damage += amount;
    equippable?.setEquipment(ctx.slot, item);
}

function inventoryOf(player: Player) {
    return player.getComponent(EntityComponentTypes.Inventory)?.container;
}

function normalized(id: string): string {
    return id.includes(':') ? id : `minecraft:${id}`;
}

export function ammoShortfall(
    player: Player,
    id: string,
    count: number
): string | undefined {
    const container = inventoryOf(player);
    const type = normalized(id);
    let found = 0;
    if (container) {
        for (let slot = 0; slot < container.size && found < count; slot++) {
            const item = container.getItem(slot);
            if (item?.typeId === type) {
                found += item.amount;
            }
        }
    }
    return found >= count ? undefined : `Needs ${count} ${idToName(type)}`;
}

// Takes from the last slots first, so the hotbar is the last to run dry.
export function payAmmo(player: Player, id: string, count: number): void {
    const container = inventoryOf(player);
    const type = normalized(id);
    if (!container) {
        return;
    }
    let left = count;
    for (let slot = container.size - 1; slot >= 0 && left > 0; slot--) {
        const item = container.getItem(slot);
        if (item?.typeId !== type) {
            continue;
        }
        if (item.amount > left) {
            item.amount -= left;
            container.setItem(slot, item);
            left = 0;
        } else {
            left -= item.amount;
            container.setItem(slot, undefined);
        }
    }
}

export function useOne(ctx: AbilityContext): void {
    if (!ctx.slot || isCreative(ctx.holder)) {
        return;
    }
    const item = currentItem(ctx);
    if (!item) {
        return;
    }
    const equippable = ctx.holder.getComponent(EntityComponentTypes.Equippable);
    if (item.amount > 1) {
        item.amount -= 1;
        equippable?.setEquipment(ctx.slot, item);
    } else {
        equippable?.setEquipment(ctx.slot, undefined);
    }
}
