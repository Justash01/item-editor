import {
    Block,
    CommandPermissionLevel,
    CustomCommand,
    CustomCommandOrigin,
    CustomCommandParamType,
    CustomCommandResult,
    Dimension,
    Vector3,
    world,
} from '@minecraft/server';
import { CommandEnumId, CommandId } from '../Meta';
import { BlockEditorService } from '../block/BlockEditorService';
import { BlockInspector } from '../block/BlockInspector';
import { InventorySource } from '../core/InventorySource';
import { ItemEditorService } from '../item/ItemEditorService';
import { ItemInspector } from '../item/ItemInspector';
import { Result, attempt, fail, ok } from '../util/Result';
import { accent, bulletList, heading } from '../util/text';
import {
    CommandEnumDefinition,
    CommandFeedback,
    EditorCommand,
} from './EditorCommand';
import { stringArg, vectorArg } from './args';
import { blockRef } from '../util/names';

const OPERATIONS = ['inspect', 'states', 'set', 'reset', 'contents'] as const;

type Operation = (typeof OPERATIONS)[number];

export class BlockCommand extends EditorCommand {
    constructor() {
        super('BlockCommand');
    }

    readonly definition: CustomCommand = {
        name: CommandId.Block,
        description: 'Inspect a block or change its states.',
        permissionLevel: CommandPermissionLevel.GameDirectors,
        cheatsRequired: true,
        mandatoryParameters: [
            {
                name: CommandEnumId.BlockOperation,
                type: CustomCommandParamType.Enum,
            },
            { name: 'position', type: CustomCommandParamType.Location },
        ],
        optionalParameters: [
            { name: 'state', type: CustomCommandParamType.String },
            { name: 'value', type: CustomCommandParamType.String },
        ],
    };

    override enums(): readonly CommandEnumDefinition[] {
        return [{ name: CommandEnumId.BlockOperation, values: OPERATIONS }];
    }

    execute(
        origin: CustomCommandOrigin,
        args: readonly unknown[]
    ): CustomCommandResult | undefined {
        const operation = stringArg(args, 0) as Operation | undefined;
        if (!operation || !OPERATIONS.includes(operation)) {
            return this.failure(
                `Unknown operation. Try: ${OPERATIONS.join(', ')}.`
            );
        }

        const position = vectorArg(args, 1);
        if (!position) {
            return this.failure('Needs a block position.');
        }

        const state = stringArg(args, 2);
        const value = stringArg(args, 3);

        return this.defer(origin, () => {
            const block = this.blockAt(this.dimensionOf(origin), position);
            if (!block.ok) {
                return block;
            }
            return this.run(origin, operation, block.value, state, value);
        });
    }

    private run(
        origin: CustomCommandOrigin,
        operation: Operation,
        block: Block,
        state: string | undefined,
        value: string | undefined
    ): Result<string> {
        switch (operation) {
            case 'inspect':
                CommandFeedback.raw(origin, BlockInspector.describe(block));
                return ok(
                    `Inspected ${blockRef(block)} at ${block.x} ${block.y} ${block.z}.`
                );

            case 'states':
                return this.states(origin, block);

            case 'set':
                if (state === undefined || value === undefined) {
                    return fail(
                        `Usage: /${CommandId.Block} set <position> <state> <value>. Run "states" first to see what this block defines.`
                    );
                }
                return BlockEditorService.setState(block, state, value);

            case 'reset':
                return BlockEditorService.resetStates(block);

            case 'contents':
                return this.contents(origin, block);
        }
    }

    private states(origin: CustomCommandOrigin, block: Block): Result<string> {
        const states = Object.entries(BlockEditorService.states(block));
        if (states.length === 0) {
            return ok(`${blockRef(block)} has no block states.`);
        }

        const entries = states.map(
            ([name, current]) => `${name} = ${accent(current)}`
        );
        CommandFeedback.raw(
            origin,
            heading(`${blockRef(block)} block states`) + bulletList(entries)
        );
        return ok(`Listed ${states.length} state(s) on ${blockRef(block)}.`);
    }

    private contents(
        origin: CustomCommandOrigin,
        block: Block
    ): Result<string> {
        const source = InventorySource.of(block);
        if (!source.ok) {
            return source;
        }

        const occupied = source.value.listOccupied();
        if (occupied.length === 0) {
            return ok(`${source.value.displayName} is empty.`);
        }

        for (const handle of occupied) {
            const item = ItemEditorService.require(handle);
            if (item.ok) {
                CommandFeedback.raw(
                    origin,
                    ItemInspector.describe(
                        item.value,
                        handle,
                        source.value.displayName
                    )
                );
            }
        }

        return ok(
            `Listed ${occupied.length} item(s) in ${source.value.displayName}.`
        );
    }

    private dimensionOf(origin: CustomCommandOrigin): Dimension {
        return (
            origin.sourceEntity?.dimension ??
            origin.sourceBlock?.dimension ??
            world.getDimension('overworld')
        );
    }

    private blockAt(dimension: Dimension, position: Vector3): Result<Block> {
        const location = {
            x: Math.floor(position.x),
            y: Math.floor(position.y),
            z: Math.floor(position.z),
        };

        const found = attempt(
            () => dimension.getBlock(location),
            `Could not read the block at ${location.x} ${location.y} ${location.z}`
        );
        if (!found.ok) {
            return found;
        }

        return found.value
            ? ok(found.value)
            : fail(
                  `No block at ${location.x} ${location.y} ${location.z}; that chunk is not loaded.`
              );
    }
}
