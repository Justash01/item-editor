import { Block, BlockComponentTypes, Player } from '@minecraft/server';
import { accent, bulletList, field, heading } from '../util/text';
import { blockRef, itemRef } from '../util/names';

export class BlockInspector {
    private constructor() {}

    static describe(block: Block): string {
        const lines: string[] = [
            heading(`${blockRef(block)} at ${block.x} ${block.y} ${block.z}`),
            field('Identifier', accent(block.typeId)),
            field('Dimension', accent(block.dimension.id)),
        ];

        BlockInspector.appendStates(block, lines);
        BlockInspector.appendComponents(block, lines);
        BlockInspector.appendEnvironment(block, lines);

        const tags = block.getTags();
        if (tags.length > 0) {
            lines.push(field('Tags', accent(tags.join(', '))));
        }

        return lines.join('\n');
    }

    static send(viewer: Player, block: Block): void {
        viewer.sendMessage(BlockInspector.describe(block));
    }

    private static appendStates(block: Block, lines: string[]): void {
        const states = Object.entries(block.permutation.getAllStates());
        if (states.length === 0) {
            lines.push(field('States', accent('none')));
            return;
        }

        const rendered = states.map(
            ([name, value]) => `${name} = ${accent(value)}`
        );
        lines.push(field('States', bulletList(rendered)));
    }

    private static appendComponents(block: Block, lines: string[]): void {
        const inventory = block.getComponent(BlockComponentTypes.Inventory);
        if (inventory) {
            const container = inventory.container;
            const used = container
                ? container.size - container.emptySlotsCount
                : 0;
            lines.push(
                field(
                    'Container',
                    `${accent(used)} of ${accent(container?.size ?? 0)} slots used`
                )
            );
        }

        const sign = block.getComponent(BlockComponentTypes.Sign);
        if (sign) {
            lines.push(
                field(
                    'Sign',
                    `${accent(sign.getText() ?? '')}${sign.isWaxed ? ' (waxed)' : ''}`
                )
            );
        }

        const recordPlayer = block.getComponent(
            BlockComponentTypes.RecordPlayer
        );
        if (recordPlayer) {
            const record = recordPlayer.getRecord();
            lines.push(
                field(
                    'Record',
                    record
                        ? `${accent(itemRef(record))}${recordPlayer.isPlaying() ? ', playing' : ''}`
                        : accent('empty')
                )
            );
        }

        const fluidContainer = block.getComponent(
            BlockComponentTypes.FluidContainer
        );
        if (fluidContainer) {
            lines.push(field('Fluid level', accent(fluidContainer.fillLevel)));
        }
    }

    private static appendEnvironment(block: Block, lines: string[]): void {
        const traits = [
            block.isAir ? 'air' : undefined,
            block.isLiquid ? 'liquid' : undefined,
            block.isWaterlogged ? 'waterlogged' : undefined,
        ].filter((trait): trait is string => trait !== undefined);

        if (traits.length > 0) {
            lines.push(field('Traits', accent(traits.join(', '))));
        }

        lines.push(
            field(
                'Light',
                `block ${accent(block.getLightLevel())}, sky ${accent(block.getSkyLightLevel())}`
            )
        );

        const redstone = block.getRedstonePower();
        if (redstone !== undefined) {
            lines.push(field('Redstone power', accent(redstone)));
        }
    }
}
