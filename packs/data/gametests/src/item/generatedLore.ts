import { ItemStack } from '@minecraft/server';
import { readAbilities } from '../abilities/Ability';
import { loreRoom, setVisibleLore, visibleLore } from '../abilities/storage';
import { isSummaryLine, summaryLines } from '../abilities/summary';
import { Settings } from '../core/Settings';
import { isStatLine, statLines } from '../stats/ItemStats';

export function hasSummary(item: ItemStack): boolean {
    return visibleLore(item).some(isSummaryLine);
}

// Stat lines and the ability summary are rebuilt from the item every time
// either changes, so they can't go stale
export function refreshLore(
    item: ItemStack,
    summary: boolean = hasSummary(item)
): void {
    const current = visibleLore(item);
    // Stats go on top, where vanilla puts its own attack damage line
    const lines = [
        ...(Settings.get().statLore ? statLines(item) : []),
        ...current.filter((line) => !isSummaryLine(line) && !isStatLine(line)),
        ...(summary ? summaryLines(readAbilities(item)) : []),
    ].slice(0, loreRoom(item));
    if (lines.join('\n') !== current.join('\n')) {
        setVisibleLore(item, lines);
    }
}
