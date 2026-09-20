import { BlockTypes, ItemStack } from '@minecraft/server';
import { Result, fail, ok } from '../../util/Result';
import { splitList } from '../../util/text';
import { JsonValue, describeJsonType } from '../../util/json';
import {
    BaseItemProperty,
    ItemMutation,
    ItemPropertyControl,
    ItemValueKind,
} from '../ItemProperty';

export abstract class BlockListProperty extends BaseItemProperty {
    abstract override readonly id: string;
    abstract override readonly label: string;
    abstract override readonly description: string;

    readonly syntax = 'comma separated block identifiers, or empty to clear';
    readonly valueKind: ItemValueKind = 'composite';

    protected abstract read(item: ItemStack): string[];
    protected abstract apply(item: ItemStack, blocks: string[]): void;

    control(): ItemPropertyControl {
        return {
            kind: 'text',
            placeholder: 'minecraft:stone, minecraft:dirt',
        };
    }

    toInput(item: ItemStack): string {
        return this.read(item).join(', ');
    }

    format(item: ItemStack): string | undefined {
        const blocks = this.read(item);
        return blocks.length > 0 ? blocks.join(', ') : undefined;
    }

    override toJson(item: ItemStack): JsonValue | undefined {
        const blocks = this.read(item);
        return blocks.length > 0 ? blocks : undefined;
    }

    override fromJson(value: JsonValue): Result<ItemMutation> {
        if (typeof value === 'string') {
            return this.parse(value);
        }
        if (!Array.isArray(value)) {
            return fail(
                `expected a list of block identifiers, got ${describeJsonType(value)}.`
            );
        }

        const blocks: string[] = [];
        for (const block of value) {
            if (typeof block !== 'string') {
                return fail(
                    `every block identifier must be text, got ${describeJsonType(block)}.`
                );
            }
            blocks.push(block);
        }

        return this.build(blocks);
    }

    parse(raw: string): Result<ItemMutation> {
        return this.build(splitList(raw));
    }

    private build(blocks: string[]): Result<ItemMutation> {
        const unknown = blocks.filter((block) => !BlockTypes.get(block));
        if (unknown.length > 0) {
            return fail(
                `Unknown block ${unknown.length === 1 ? 'type' : 'types'}: ${unknown.join(', ')}.`
            );
        }

        return ok((item) => {
            this.apply(item, blocks);
        });
    }

    reset(item: ItemStack): void {
        this.apply(item, []);
    }
}

export class CanDestroyProperty extends BlockListProperty {
    readonly id = 'candestroy';
    readonly label = 'Can destroy';
    readonly description = 'Blocks this can break in adventure mode.';

    protected read(item: ItemStack): string[] {
        return item.getCanDestroy();
    }

    protected apply(item: ItemStack, blocks: string[]): void {
        item.setCanDestroy(blocks);
    }
}

export class CanPlaceOnProperty extends BlockListProperty {
    readonly id = 'canplaceon';
    readonly label = 'Can place on';
    readonly description =
        'Blocks this can be placed against in adventure mode.';

    protected read(item: ItemStack): string[] {
        return item.getCanPlaceOn();
    }

    protected apply(item: ItemStack, blocks: string[]): void {
        item.setCanPlaceOn(blocks);
    }
}
