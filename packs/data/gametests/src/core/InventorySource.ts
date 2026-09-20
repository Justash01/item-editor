import {
    Block,
    BlockComponentTypes,
    Container,
    Entity,
    EntityComponentTypes,
    EntityEquippableComponent,
    EquipmentSlot,
    ItemStack,
    Player,
} from '@minecraft/server';
import { Result, fail, ok } from '../util/Result';
import { SlotHandle } from './SlotHandle';
import {
    ARMOR_SLOTS,
    EQUIPMENT_SLOTS,
    LAST_HOTBAR_SLOT,
    NON_INVENTORY_EQUIPMENT_SLOTS,
    SlotGroup,
    equipmentSlotFromAlias,
    equipmentSlotLabel,
    equipmentSlotReference,
    slotAliasList,
    slotGroupFromAlias,
} from './slotReferences';
import { blockRef, entityRef } from '../util/names';

export abstract class InventorySource {
    abstract readonly displayName: string;

    abstract readonly id: string;

    abstract readonly slotSyntax: string;

    abstract resolve(reference: string): Result<SlotHandle>;

    resolveMany(reference: string): Result<SlotHandle[]> {
        const group = slotGroupFromAlias(reference);
        if (!group) {
            const slot = this.resolve(reference);
            return slot.ok ? ok([slot.value]) : slot;
        }

        const slots = this.groupSlots(group);
        if (!slots.ok) {
            return slots;
        }
        return slots.value.length > 0
            ? slots
            : fail(`${this.displayName} has no items in "${group}".`);
    }

    protected abstract groupSlots(group: SlotGroup): Result<SlotHandle[]>;

    abstract listOccupied(): SlotHandle[];

    abstract defaultSlot(): Result<SlotHandle>;

    abstract addItem(item: ItemStack): ItemStack | undefined;

    static of(target: Entity | Block): Result<InventorySource> {
        return target instanceof Entity
            ? EntityInventorySource.create(target)
            : BlockInventorySource.create(target);
    }
}

export class EntityInventorySource extends InventorySource {
    readonly displayName: string;
    readonly id: string;

    private constructor(
        private readonly entity: Entity,
        private readonly container: Container | undefined,
        private readonly equippable: EntityEquippableComponent | undefined
    ) {
        super();
        this.displayName = describeEntity(entity);
        this.id = entity.id;
    }

    static create(entity: Entity): Result<InventorySource> {
        const container = entity.getComponent(
            EntityComponentTypes.Inventory
        )?.container;
        const equippable = entity.getComponent(EntityComponentTypes.Equippable);

        if (!container && !equippable) {
            return fail(`${describeEntity(entity)} has no inventory to edit.`);
        }

        return ok(new EntityInventorySource(entity, container, equippable));
    }

    get slotSyntax(): string {
        const size = this.container?.size;
        const indexHint =
            size === undefined ? 'a slot index' : `a slot index 0-${size - 1}`;
        return `${slotAliasList()}, or ${indexHint}`;
    }

    resolve(reference: string): Result<SlotHandle> {
        const trimmed = reference.trim();
        if (trimmed.length === 0) {
            return this.defaultSlot();
        }

        const equipmentSlot = equipmentSlotFromAlias(trimmed);
        if (equipmentSlot) {
            if (!this.equippable) {
                return fail(
                    `${this.displayName} has no equipment slots; use ${this.slotSyntax}.`
                );
            }
            return ok(this.equipmentSlot(this.equippable, equipmentSlot));
        }

        if (!/^\d+$/.test(trimmed)) {
            return fail(
                `"${reference}" is not a slot. Expected ${this.slotSyntax}.`
            );
        }

        const container = this.container;
        if (!container) {
            return fail(
                `${this.displayName} has no inventory container; use ${slotAliasList()}.`
            );
        }

        const index = Number.parseInt(trimmed, 10);
        if (index >= container.size) {
            return fail(
                `Slot ${index} is out of range; ${this.displayName} has slots 0-${container.size - 1}.`
            );
        }

        return ok(this.containerSlot(container, index));
    }

    listOccupied(): SlotHandle[] {
        const handles: SlotHandle[] = [];

        if (this.equippable) {
            for (const slot of NON_INVENTORY_EQUIPMENT_SLOTS) {
                const handle = this.equipmentSlot(this.equippable, slot);
                if (handle.hasItem()) {
                    handles.push(handle);
                }
            }
        }

        const container = this.container;
        if (container) {
            for (let index = 0; index < container.size; index++) {
                const slot = container.getSlot(index);
                if (!slot.isValid || !slot.hasItem()) {
                    continue;
                }
                handles.push(this.containerSlot(container, index));
            }
        }

        return handles;
    }

    defaultSlot(): Result<SlotHandle> {
        return this.resolve('mainhand');
    }

    protected groupSlots(group: SlotGroup): Result<SlotHandle[]> {
        switch (group) {
            case 'all':
                return ok(this.listOccupied());

            case 'hotbar': {
                const container = this.container;
                if (!container) {
                    return fail(`${this.displayName} has no hotbar.`);
                }
                const last = Math.min(LAST_HOTBAR_SLOT, container.size - 1);
                const handles: SlotHandle[] = [];
                for (let index = 0; index <= last; index++) {
                    const handle = this.containerSlot(container, index);
                    if (handle.hasItem()) {
                        handles.push(handle);
                    }
                }
                return ok(handles);
            }

            case 'armor':
            case 'equipment': {
                const equippable = this.equippable;
                if (!equippable) {
                    return fail(`${this.displayName} has no equipment slots.`);
                }
                const slots = group === 'armor' ? ARMOR_SLOTS : EQUIPMENT_SLOTS;
                return ok(
                    slots
                        .map((slot) =>
                            this.groupEquipmentSlot(equippable, slot)
                        )
                        .filter((handle) => handle.hasItem())
                );
            }
        }
    }

    // Player main hand goes through the hotbar index so it shares undo history
    // with the item list and the other groups.
    private groupEquipmentSlot(
        equippable: EntityEquippableComponent,
        slot: EquipmentSlot
    ): SlotHandle {
        if (
            slot === EquipmentSlot.Mainhand &&
            this.entity instanceof Player &&
            this.container
        ) {
            return this.containerSlot(
                this.container,
                this.entity.selectedSlotIndex
            );
        }
        return this.equipmentSlot(equippable, slot);
    }

    addItem(item: ItemStack): ItemStack | undefined {
        return this.container ? this.container.addItem(item) : item;
    }

    private equipmentSlot(
        equippable: EntityEquippableComponent,
        slot: EquipmentSlot
    ): SlotHandle {
        return new SlotHandle(
            equippable.getEquipmentSlot(slot),
            equipmentSlotLabel(slot),
            equipmentSlotReference(slot)
        );
    }

    private containerSlot(container: Container, index: number): SlotHandle {
        const isSelected =
            this.entity instanceof Player &&
            this.entity.selectedSlotIndex === index;
        return new SlotHandle(
            container.getSlot(index),
            isSelected ? `Slot ${index} (main hand)` : `Slot ${index}`,
            index.toString()
        );
    }
}

export class BlockInventorySource extends InventorySource {
    readonly displayName: string;
    readonly id: string;

    private constructor(
        block: Block,
        private readonly container: Container
    ) {
        super();
        this.displayName = blockRef(block);
        this.id = `${block.dimension.id}:${block.x},${block.y},${block.z}`;
    }

    static create(block: Block): Result<InventorySource> {
        const container = block.getComponent(
            BlockComponentTypes.Inventory
        )?.container;
        if (!container) {
            return fail(`${blockRef(block)} is not a container.`);
        }
        return ok(new BlockInventorySource(block, container));
    }

    get slotSyntax(): string {
        return `a slot index 0-${this.container.size - 1}`;
    }

    resolve(reference: string): Result<SlotHandle> {
        const trimmed = reference.trim();
        if (trimmed.length === 0) {
            return this.defaultSlot();
        }

        if (!/^\d+$/.test(trimmed)) {
            return fail(
                `"${reference}" is not a slot. Expected ${this.slotSyntax}.`
            );
        }

        const index = Number.parseInt(trimmed, 10);
        if (index >= this.container.size) {
            return fail(
                `Slot ${index} is out of range; ${this.displayName} has slots 0-${this.container.size - 1}.`
            );
        }

        return ok(this.slotAt(index));
    }

    listOccupied(): SlotHandle[] {
        const handles: SlotHandle[] = [];
        for (let index = 0; index < this.container.size; index++) {
            const slot = this.container.getSlot(index);
            if (slot.isValid && slot.hasItem()) {
                handles.push(this.slotAt(index));
            }
        }
        return handles;
    }

    protected groupSlots(group: SlotGroup): Result<SlotHandle[]> {
        return group === 'all'
            ? ok(this.listOccupied())
            : fail(`${this.displayName} only supports the "all" slot group.`);
    }

    defaultSlot(): Result<SlotHandle> {
        const first = this.container.firstItem();
        return first === undefined
            ? fail(`${this.displayName} is empty.`)
            : ok(this.slotAt(first));
    }

    addItem(item: ItemStack): ItemStack | undefined {
        return this.container.addItem(item);
    }

    private slotAt(index: number): SlotHandle {
        return new SlotHandle(
            this.container.getSlot(index),
            `Slot ${index}`,
            index.toString()
        );
    }
}

export function describeEntity(entity: Entity): string {
    return entityRef(entity);
}
