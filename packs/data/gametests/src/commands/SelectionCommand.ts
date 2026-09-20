import {
    CustomCommandOrigin,
    CustomCommandResult,
    ItemStack,
} from '@minecraft/server';
import { ResolvedSelection, Selection } from '../core/Selection';
import { SlotHandle } from '../core/SlotHandle';
import { HistoryTarget, ItemHistory } from '../item/ItemHistory';
import { Result, fail, ok } from '../util/Result';
import { CommandFeedback, EditorCommand } from './EditorCommand';
import { itemRef } from '../util/names';

export abstract class SelectionCommand extends EditorCommand {
    protected abstract runOn(
        selection: ResolvedSelection,
        slot: SlotHandle,
        args: readonly unknown[],
        origin: CustomCommandOrigin
    ): Result<string>;

    // undefined = read-only, nothing gets pushed onto the undo stack.
    protected undoLabel(_args: readonly unknown[]): string | undefined {
        return undefined;
    }

    protected summary(args: readonly unknown[], count: number): string {
        const label = this.undoLabel(args);
        const items = `${count} item${count === 1 ? '' : 's'}`;
        return label === undefined
            ? `Done with ${items}.`
            : `Finished ${label} on ${items}.`;
    }

    execute(
        origin: CustomCommandOrigin,
        args: readonly unknown[]
    ): CustomCommandResult | undefined {
        const viewer = CommandFeedback.viewer(origin);
        if (!viewer) {
            return this.failure('Only players have a selection.');
        }

        return this.defer(origin, () => {
            const selection = Selection.resolve(viewer);
            return selection.ok
                ? this.run(selection.value, args, origin)
                : selection;
        });
    }

    protected run(
        selection: ResolvedSelection,
        args: readonly unknown[],
        origin: CustomCommandOrigin
    ): Result<string> | Result<string>[] {
        const label = this.undoLabel(args);
        const batch = ItemHistory.nextBatch();
        const runOne = (slot: SlotHandle): Result<string> =>
            label === undefined
                ? this.runOn(selection, slot, args, origin)
                : ItemHistory.around(
                      SelectionCommand.historyKey(selection, slot),
                      slot,
                      label,
                      () => this.runOn(selection, slot, args, origin),
                      batch
                  );

        if (selection.slots.length === 1) {
            return selection.slots.map(runOne);
        }

        const skipped: string[] = [];
        const applicable = selection.slots.filter((slot) => {
            const item = slot.read();
            if (!item || this.appliesTo(item, args)) {
                return true;
            }
            skipped.push(item.nameTag ?? itemRef(item));
            return false;
        });
        const skipNote =
            skipped.length === 0
                ? ''
                : ` Skipped ${skipped.length} that it doesn't apply to: ${skipped.join(', ')}.`;

        if (applicable.length === 0) {
            return fail(`None of the selected items apply.${skipNote}`);
        }

        const failures: Result<string>[] = [];
        for (const slot of applicable) {
            const outcome = runOne(slot);
            if (!outcome.ok) {
                failures.push(fail(`${slot.label}: ${outcome.error}`));
            }
        }
        const succeeded = applicable.length - failures.length;

        return succeeded === 0
            ? failures
            : [ok(`${this.summary(args, succeeded)}${skipNote}`), ...failures];
    }

    protected appliesTo(_item: ItemStack, _args: readonly unknown[]): boolean {
        return true;
    }

    protected static historyTargets(
        selection: ResolvedSelection
    ): HistoryTarget[] {
        return selection.slots.map((slot) => ({
            key: SelectionCommand.historyKey(selection, slot),
            slot,
        }));
    }

    private static historyKey(
        selection: ResolvedSelection,
        slot: SlotHandle
    ): string {
        return ItemHistory.keyFor(selection.entity.id, slot);
    }
}
