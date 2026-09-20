import {
    CommandPermissionLevel,
    CustomCommand,
    CustomCommandParamType,
} from '@minecraft/server';
import { CommandEnumId, CommandId } from '../Meta';
import { ResolvedSelection } from '../core/Selection';
import { SlotHandle } from '../core/SlotHandle';
import { ItemEditorService, jsonEdit } from '../item/ItemEditorService';
import { ItemPropertyRegistry } from '../item/ItemPropertyRegistry';
import { Result, fail, ok } from '../util/Result';
import { CommandEnumDefinition } from './EditorCommand';
import { SelectionCommand } from './SelectionCommand';
import { numberArg, stringArg } from './args';

const OPERATIONS = ['add', 'set', 'insert', 'remove', 'clear'] as const;

type Operation = (typeof OPERATIONS)[number];

export class LoreCommand extends SelectionCommand {
    constructor() {
        super('LoreCommand');
    }

    readonly definition: CustomCommand = {
        name: CommandId.Lore,
        description: 'Edit the selected item lore, a line at a time.',
        permissionLevel: CommandPermissionLevel.GameDirectors,
        cheatsRequired: true,
        mandatoryParameters: [
            {
                name: CommandEnumId.LoreOperation,
                type: CustomCommandParamType.Enum,
            },
        ],
        optionalParameters: [
            { name: 'value', type: CustomCommandParamType.String },
            { name: 'line', type: CustomCommandParamType.Integer },
        ],
    };

    override enums(): readonly CommandEnumDefinition[] {
        return [{ name: CommandEnumId.LoreOperation, values: OPERATIONS }];
    }

    protected override undoLabel(args: readonly unknown[]): string {
        return `the lore ${stringArg(args, 0) ?? 'change'}`;
    }

    protected override summary(
        _args: readonly unknown[],
        count: number
    ): string {
        return `Updated the lore on ${count} items.`;
    }

    protected runOn(
        _selection: ResolvedSelection,
        slot: SlotHandle,
        args: readonly unknown[]
    ): Result<string> {
        const operation = stringArg(args, 0) as Operation | undefined;
        if (!operation || !OPERATIONS.includes(operation)) {
            return fail(`Unknown operation. Try: ${OPERATIONS.join(', ')}.`);
        }

        const current = ItemEditorService.require(slot);
        if (!current.ok) {
            return current;
        }

        const updated = this.edit(
            current.value.getLore(),
            operation,
            stringArg(args, 1),
            numberArg(args, 2)
        );
        if (!updated.ok) {
            return updated;
        }

        const property = ItemPropertyRegistry.get('lore');
        if (!property.ok) {
            return property;
        }

        return ItemEditorService.applyAll(slot, [
            jsonEdit(property.value, updated.value),
        ]);
    }

    private edit(
        lore: string[],
        operation: Operation,
        value: string | undefined,
        line: number | undefined
    ): Result<string[]> {
        switch (operation) {
            case 'clear':
                return ok([]);

            case 'add':
                return value === undefined
                    ? fail(`Usage: /${CommandId.Lore} add "<text>".`)
                    : ok([...lore, value]);

            case 'set':
            case 'insert': {
                if (value === undefined || line === undefined) {
                    return fail(
                        `Usage: /${CommandId.Lore} ${operation} "<text>" <line>.`
                    );
                }

                const limit =
                    operation === 'set' ? lore.length - 1 : lore.length;
                const bounds = this.checkLine(line, limit, lore.length);
                if (!bounds.ok) {
                    return bounds;
                }

                const result = [...lore];
                if (operation === 'set') {
                    result[line] = value;
                } else {
                    result.splice(line, 0, value);
                }
                return ok(result);
            }

            case 'remove': {
                const index = this.lineFor(value, line);
                if (index === undefined) {
                    return fail(`Usage: /${CommandId.Lore} remove <line>.`);
                }

                const bounds = this.checkLine(
                    index,
                    lore.length - 1,
                    lore.length
                );
                if (!bounds.ok) {
                    return bounds;
                }

                const result = [...lore];
                result.splice(index, 1);
                return ok(result);
            }
        }
    }

    // Optional params can't be skipped, so `remove 2` lands in the value slot.
    private lineFor(
        value: string | undefined,
        line: number | undefined
    ): number | undefined {
        if (line !== undefined) {
            return line;
        }
        if (value !== undefined && /^\d+$/.test(value.trim())) {
            return Number.parseInt(value.trim(), 10);
        }
        return undefined;
    }

    private checkLine(
        line: number,
        limit: number,
        count: number
    ): Result<void> {
        if (count === 0) {
            return fail('That item has no lore yet; use "add" first.');
        }
        if (line < 0 || line > limit) {
            return fail(
                `Line ${line} is out of range; valid lines are 0-${limit}.`
            );
        }
        return ok(undefined);
    }
}
