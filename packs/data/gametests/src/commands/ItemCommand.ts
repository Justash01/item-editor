import {
    CommandPermissionLevel,
    CustomCommand,
    CustomCommandOrigin,
    CustomCommandParamType,
    CustomCommandResult,
} from '@minecraft/server';
import { CommandEnumId, CommandId } from '../Meta';
import { ResolvedSelection, Selection } from '../core/Selection';
import { SlotHandle } from '../core/SlotHandle';
import { ItemClipboard } from '../item/ItemClipboard';
import { ItemData } from '../item/ItemData';
import { ItemEditorService } from '../item/ItemEditorService';
import { ItemHistory } from '../item/ItemHistory';
import { ItemInspector } from '../item/ItemInspector';
import { Result, fail, ok } from '../util/Result';
import { accent, bulletList, heading } from '../util/text';
import { CommandEnumDefinition, CommandFeedback } from './EditorCommand';
import { SelectionCommand } from './SelectionCommand';
import { stringArg } from './args';
import { itemRef } from '../util/names';

// No clear/reset on purpose, /replaceitem already does both. UI only.
const OPERATIONS = [
    'list',
    'inspect',
    'export',
    'apply',
    'copy',
    'paste',
    'duplicate',
    'undo',
] as const;

type Operation = (typeof OPERATIONS)[number];

type OperationHandler = (
    selection: ResolvedSelection,
    slot: SlotHandle,
    data: string | undefined,
    origin: CustomCommandOrigin
) => Result<string>;

export class ItemCommand extends SelectionCommand {
    private readonly perSlot: ReadonlyMap<Operation, OperationHandler>;

    private static readonly WRITES: Partial<Record<Operation, string>> = {
        apply: 'applying a data document',
        paste: 'pasting item data',
    };

    constructor() {
        super('ItemCommand');
        this.perSlot = new Map<Operation, OperationHandler>([
            ['inspect', this.inspect],
            ['export', this.export],
            ['apply', this.apply],
            ['paste', this.paste],
            ['duplicate', this.duplicate],
        ]);
    }

    readonly definition: CustomCommand = {
        name: CommandId.Item,
        description:
            'Work on the whole selected item rather than one property.',
        permissionLevel: CommandPermissionLevel.GameDirectors,
        cheatsRequired: true,
        mandatoryParameters: [
            {
                name: CommandEnumId.ItemOperation,
                type: CustomCommandParamType.Enum,
            },
        ],
        optionalParameters: [
            { name: 'data', type: CustomCommandParamType.String },
        ],
    };

    override enums(): readonly CommandEnumDefinition[] {
        return [{ name: CommandEnumId.ItemOperation, values: OPERATIONS }];
    }

    protected override undoLabel(args: readonly unknown[]): string | undefined {
        const operation = stringArg(args, 0) as Operation | undefined;
        return operation ? ItemCommand.WRITES[operation] : undefined;
    }

    protected override summary(
        args: readonly unknown[],
        count: number
    ): string {
        const items = `${count} item${count === 1 ? '' : 's'}`;
        switch (stringArg(args, 0) as Operation | undefined) {
            case 'inspect':
                return `Inspected ${items}.`;
            case 'export':
                return `Exported ${items}.`;
            case 'duplicate':
                return `Duplicated ${items}.`;
            default:
                return super.summary(args, count);
        }
    }

    override execute(
        origin: CustomCommandOrigin,
        args: readonly unknown[]
    ): CustomCommandResult | undefined {
        const operation = stringArg(args, 0) as Operation | undefined;
        if (!operation || !OPERATIONS.includes(operation)) {
            return this.failure(
                `Unknown operation. Try: ${OPERATIONS.join(', ')}.`
            );
        }
        return super.execute(origin, args);
    }

    protected override run(
        selection: ResolvedSelection,
        args: readonly unknown[],
        origin: CustomCommandOrigin
    ): Result<string> | Result<string>[] {
        switch (stringArg(args, 0) as Operation) {
            case 'list':
                return this.list(selection, origin);
            case 'copy':
                return this.copy(selection, origin);
            case 'undo':
                return ItemHistory.undoLatest(
                    SelectionCommand.historyTargets(selection)
                );
            default:
                return super.run(selection, args, origin);
        }
    }

    protected runOn(
        selection: ResolvedSelection,
        slot: SlotHandle,
        args: readonly unknown[],
        origin: CustomCommandOrigin
    ): Result<string> {
        const operation = stringArg(args, 0) as Operation;
        const handler = this.perSlot.get(operation);
        if (!handler) {
            return fail(`Unknown operation "${operation}".`);
        }
        return handler.call(this, selection, slot, stringArg(args, 1), origin);
    }

    private list(
        selection: ResolvedSelection,
        origin: CustomCommandOrigin
    ): Result<string> {
        const occupied = selection.source.listOccupied();
        if (occupied.length === 0) {
            return ok(`${selection.source.displayName} is carrying nothing.`);
        }

        const entries = occupied.map((handle) => {
            const item = handle.read();
            const name = item ? (item.nameTag ?? itemRef(item)) : 'empty';
            const amount = item && item.amount > 1 ? ` x${item.amount}` : '';
            return `${accent(handle.reference)}: ${name}${amount}`;
        });

        CommandFeedback.raw(
            origin,
            heading(`Items carried by ${selection.source.displayName}`) +
                bulletList(entries)
        );
        return ok(
            `Listed ${occupied.length} item(s). Select one with /${CommandId.Select}.`
        );
    }

    private inspect(
        selection: ResolvedSelection,
        slot: SlotHandle,
        _data: string | undefined,
        origin: CustomCommandOrigin
    ): Result<string> {
        const item = ItemEditorService.require(slot);
        if (!item.ok) {
            return item;
        }

        CommandFeedback.raw(
            origin,
            ItemInspector.describe(
                item.value,
                slot,
                selection.source.displayName
            )
        );
        return ok(`Inspected ${Selection.describe(selection)}.`);
    }

    private export(
        selection: ResolvedSelection,
        slot: SlotHandle,
        _data: string | undefined,
        origin: CustomCommandOrigin
    ): Result<string> {
        const item = ItemEditorService.require(slot);
        if (!item.ok) {
            return item;
        }

        const document = ItemData.stringify(item.value);
        CommandFeedback.raw(
            origin,
            selection.slots.length > 1
                ? `${accent(slot.label)}: ${document}`
                : document
        );
        return ok(`Exported ${slot.label}.`);
    }

    private apply(
        _selection: ResolvedSelection,
        slot: SlotHandle,
        data: string | undefined
    ): Result<string> {
        if (data === undefined) {
            return fail(
                `Needs a data document, like /${CommandId.Item} apply "{name:'Example'}". Run "export" to see the current one.`
            );
        }
        return ItemEditorService.applyData(slot, data);
    }

    private copy(
        selection: ResolvedSelection,
        origin: CustomCommandOrigin
    ): Result<string> {
        const viewer = CommandFeedback.viewer(origin);
        if (!viewer) {
            return fail('Only a player has a clipboard.');
        }

        const [slot, ...rest] = selection.slots;
        if (!slot || rest.length > 0) {
            return fail(`Copy needs one item, not ${selection.slots.length}.`);
        }
        return ItemClipboard.copy(viewer, slot);
    }

    private paste(
        _selection: ResolvedSelection,
        slot: SlotHandle,
        _data: string | undefined,
        origin: CustomCommandOrigin
    ): Result<string> {
        const viewer = CommandFeedback.viewer(origin);
        return viewer
            ? ItemClipboard.paste(viewer, slot)
            : fail('Only a player has a clipboard.');
    }

    private duplicate(
        selection: ResolvedSelection,
        slot: SlotHandle
    ): Result<string> {
        return ItemEditorService.duplicate(selection.source, slot);
    }
}
