import { ContainerSlot, ItemStack } from '@minecraft/server';

export class SlotHandle {
    constructor(
        private readonly slot: ContainerSlot,
        readonly label: string,
        readonly reference: string
    ) {}

    get isValid(): boolean {
        return this.slot.isValid;
    }

    hasItem(): boolean {
        return this.slot.isValid && this.slot.hasItem();
    }

    read(): ItemStack | undefined {
        return this.slot.isValid ? this.slot.getItem() : undefined;
    }

    write(item?: ItemStack): void {
        this.slot.setItem(item);
    }
}
