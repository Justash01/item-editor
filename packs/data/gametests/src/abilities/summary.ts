import { Ability, describeStep, triggerLabel } from './Ability';

// Color codes nobody types by hand, so the summary lines can be found and
// replaced later without touching lore the player wrote.
const PREFIX = '§j§a§r§7';
// Lore lines get cut off past about 50 characters, color codes included, and
// the prefix plus a two-space indent take 10 of those.
const WIDTH = 38;

export function isSummaryLine(line: string): boolean {
    return line.startsWith(PREFIX);
}

export function summaryLines(abilities: readonly Ability[]): string[] {
    return abilities
        .filter((ability) => ability.enabled)
        .flatMap((ability) =>
            ability.steps.flatMap((step, index) =>
                wrap(
                    index === 0
                        ? `${triggerLabel(ability.trigger)}: ${describeStep(step)}`
                        : `then ${describeStep(step)}`
                ).map(
                    (line, at) =>
                        PREFIX + (index === 0 && at === 0 ? line : `  ${line}`)
                )
            )
        );
}

function wrap(text: string): string[] {
    const lines: string[] = [];
    let current = '';
    for (const word of text.split(' ')) {
        if (current.length > 0 && current.length + 1 + word.length > WIDTH) {
            lines.push(current);
            current = word;
        } else {
            current = current.length > 0 ? `${current} ${word}` : word;
        }
    }
    if (current.length > 0) {
        lines.push(current);
    }
    return lines;
}
