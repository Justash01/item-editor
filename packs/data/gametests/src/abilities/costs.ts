import {
    EntityComponentTypes,
    EquipmentSlot,
    GameMode,
    ItemComponentTypes,
    ItemStack,
    Player,
} from '@minecraft/server';
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
