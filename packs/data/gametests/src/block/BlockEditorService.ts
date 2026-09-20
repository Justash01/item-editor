import { Block, BlockPermutation } from '@minecraft/server';
import type { BlockStateSuperset } from '@minecraft/vanilla-data';
import { Result, attempt, fail, ok } from '../util/Result';
import { blockRef } from '../util/names';

type StateName = keyof BlockStateSuperset;

export class BlockEditorService {
    private constructor() {}

    static states(block: Block): Record<string, boolean | number | string> {
        return block.permutation.getAllStates();
    }

    static setState(
        block: Block,
        stateName: string,
        rawValue: string
    ): Result<string> {
        const states = BlockEditorService.states(block);
        const current = states[stateName];

        if (current === undefined) {
            const available = Object.keys(states);
            return fail(
                available.length === 0
                    ? `${blockRef(block)} has no block states.`
                    : `"${stateName}" is not a state on ${blockRef(block)}. Available states: ${available.join(', ')}.`
            );
        }

        const coerced = coerce(rawValue, current);
        if (!coerced.ok) {
            return fail(`State "${stateName}": ${coerced.error}`);
        }

        return attempt(() => {
            const permutation = block.permutation.withState(
                stateName as StateName,
                coerced.value as never
            );
            block.setPermutation(permutation);
            return `Set ${stateName} to ${coerced.value} on ${blockRef(block)}.`;
        }, `Failed to set "${stateName}"`);
    }

    static resetStates(block: Block): Result<string> {
        return attempt(() => {
            block.setPermutation(BlockPermutation.resolve(block.typeId));
            return `Reset ${blockRef(block)} to its default states.`;
        }, 'Failed to reset the block');
    }
}

function coerce(
    raw: string,
    current: boolean | number | string
): Result<boolean | number | string> {
    const value = raw.trim();

    if (typeof current === 'boolean') {
        if (value === 'true' || value === 'false') {
            return ok(value === 'true');
        }
        return fail(`expected true or false, got "${raw}".`);
    }

    if (typeof current === 'number') {
        if (!/^-?\d+$/.test(value)) {
            return fail(`expected a whole number, got "${raw}".`);
        }
        return ok(Number.parseInt(value, 10));
    }

    return ok(value);
}
