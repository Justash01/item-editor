import { ItemStack } from '@minecraft/server';
import { Settings } from '../core/Settings';
import { SlotHandle } from '../core/SlotHandle';
import { Result, attempt, fail, ok } from '../util/Result';

interface Snapshot {
    readonly item: ItemStack | undefined;
    readonly label: string;
    readonly batch: number;
}

export interface HistoryTarget {
    readonly key: string;
    readonly slot: SlotHandle;
}

export interface PendingUndo {
    readonly label: string;
    readonly count: number;
}

// In memory only, an ItemStack can't go in a dynamic property.
export class ItemHistory {
    private constructor() {}

    private static readonly stacks = new Map<string, Snapshot[]>();
    private static lastBatch = 0;

    static nextBatch(): number {
        return ++ItemHistory.lastBatch;
    }

    static has(key: string): boolean {
        return (ItemHistory.stacks.get(key)?.length ?? 0) > 0;
    }

    static peek(key: string): string | undefined {
        return ItemHistory.top(key)?.label;
    }

    static pending(targets: readonly HistoryTarget[]): PendingUndo | undefined {
        const latest = ItemHistory.latest(targets);
        return latest.length === 0
            ? undefined
            : { label: latest[0]!.snapshot.label, count: latest.length };
    }

    static undo(key: string, slot: SlotHandle): Result<string> {
        return ItemHistory.undoLatest([{ key, slot }]);
    }

    // A single-item edit made after a batch gets undone first, the batch comes
    // back on the next undo.
    static undoLatest(targets: readonly HistoryTarget[]): Result<string> {
        const latest = ItemHistory.latest(targets);
        if (latest.length === 0) {
            return fail(
                targets.length === 1
                    ? 'There is nothing to undo for this slot.'
                    : 'There is nothing to undo for these items.'
            );
        }

        const errors: string[] = [];
        for (const { target, snapshot } of latest) {
            const history = ItemHistory.stacks.get(target.key);
            history?.pop();
            if (history?.length === 0) {
                ItemHistory.stacks.delete(target.key);
            }

            const restored = attempt(() => {
                target.slot.write(snapshot.item);
            }, `Failed to undo ${target.slot.label}`);
            if (!restored.ok) {
                errors.push(restored.error);
            }
        }

        if (errors.length > 0) {
            return fail(errors.join('\n'));
        }

        const label = latest[0]!.snapshot.label;
        return ok(
            latest.length === 1
                ? `Undid ${label}.`
                : `Undid ${label} on ${latest.length} items.`
        );
    }

    static forget(key: string): void {
        ItemHistory.stacks.delete(key);
    }

    static keyFor(ownerId: string, slot: SlotHandle): string {
        return `${ownerId}/${slot.reference}`;
    }

    // Snapshot before the form opens, that's what undo should go back to.
    static async aroundAsync(
        key: string,
        slot: SlotHandle,
        label: string,
        write: () => Promise<Result<string>>,
        batch = ItemHistory.nextBatch()
    ): Promise<Result<string>> {
        const before = slot.read()?.clone();
        const outcome = await write();

        if (outcome.ok && outcome.value.length > 0) {
            ItemHistory.push(key, { item: before, label, batch });
        }

        return outcome;
    }

    static around(
        key: string,
        slot: SlotHandle,
        label: string,
        write: () => Result<string>,
        batch = ItemHistory.nextBatch()
    ): Result<string> {
        const before = slot.read()?.clone();
        const outcome = write();

        if (outcome.ok) {
            ItemHistory.push(key, { item: before, label, batch });
        }

        return outcome;
    }

    private static top(key: string): Snapshot | undefined {
        const history = ItemHistory.stacks.get(key);
        return history?.[history.length - 1];
    }

    private static latest(
        targets: readonly HistoryTarget[]
    ): { target: HistoryTarget; snapshot: Snapshot }[] {
        const tops = targets.flatMap((target) => {
            const snapshot = ItemHistory.top(target.key);
            return snapshot ? [{ target, snapshot }] : [];
        });

        const newest = Math.max(...tops.map((entry) => entry.snapshot.batch));
        return tops.filter((entry) => entry.snapshot.batch === newest);
    }

    private static push(key: string, snapshot: Snapshot): void {
        const history = ItemHistory.stacks.get(key) ?? [];
        history.push(snapshot);
        while (history.length > Settings.get().undoDepth) {
            history.shift();
        }
        ItemHistory.stacks.set(key, history);
    }
}
