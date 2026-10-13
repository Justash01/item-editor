import { Player, world } from '@minecraft/server';
import { namespaced } from '../Meta';
import { Result, attempt, fail } from '../util/Result';
import { JsonObject, parseRelaxedJson } from '../util/json';
import { Ability, describeAbility, serializeAbility } from './Ability';
import { Template } from './templates';

const LIBRARY = namespaced('templates');
const CLIPBOARD = namespaced('ability_clipboard');
const MAX_SAVED = 32;
const MAX_LABEL = 32;

// Saved on the world so every player on it shares the same list.
export function savedTemplates(): Template[] {
    const stored = world.getDynamicProperty(LIBRARY);
    if (typeof stored !== 'string') {
        return [];
    }
    const parsed = parseRelaxedJson(stored);
    if (!parsed.ok || !Array.isArray(parsed.value)) {
        return [];
    }
    const out: Template[] = [];
    for (const entry of parsed.value) {
        if (
            entry !== null &&
            typeof entry === 'object' &&
            !Array.isArray(entry) &&
            typeof entry.label === 'string' &&
            entry.ability !== null &&
            typeof entry.ability === 'object' &&
            !Array.isArray(entry.ability)
        ) {
            out.push({
                label: entry.label,
                detail:
                    typeof entry.detail === 'string' ? entry.detail : 'Saved',
                ability: entry.ability,
            });
        }
    }
    return out;
}

export function saveTemplate(label: string, ability: Ability): Result<string> {
    const clean = label.trim();
    if (clean.length === 0) {
        return fail('The template needs a name.');
    }
    if (clean.length > MAX_LABEL) {
        return fail(`Template names are ${MAX_LABEL} characters at most.`);
    }

    const saved = savedTemplates().filter((entry) => entry.label !== clean);
    if (saved.length >= MAX_SAVED) {
        return fail(
            `The world already holds ${MAX_SAVED} templates. Delete one first.`
        );
    }
    // A fresh id on every use, so the stored one doesn't matter.
    const stored = serializeAbility(ability);
    delete stored.id;
    saved.push({
        label: clean,
        detail: describeAbility(ability),
        ability: stored,
    });
    return attempt(() => {
        world.setDynamicProperty(LIBRARY, JSON.stringify(saved));
        return `Saved "${clean}" to the world's templates.`;
    }, 'Failed to save the template');
}

export function deleteTemplate(label: string): Result<string> {
    const saved = savedTemplates();
    const left = saved.filter((entry) => entry.label !== label);
    if (left.length === saved.length) {
        return fail(`There is no template called "${label}".`);
    }
    return attempt(() => {
        world.setDynamicProperty(
            LIBRARY,
            left.length > 0 ? JSON.stringify(left) : undefined
        );
        return `Deleted the "${label}" template.`;
    }, 'Failed to delete the template');
}

// Per player, unlike the templates.
export function copyAbilities(
    player: Player,
    abilities: readonly Ability[]
): Result<string> {
    return attempt(() => {
        player.setDynamicProperty(
            CLIPBOARD,
            JSON.stringify(abilities.map(serializeAbility))
        );
        return abilities.length === 1
            ? 'Copied 1 ability.'
            : `Copied ${abilities.length} abilities.`;
    }, 'Failed to copy');
}

export function copiedAbilities(player: Player): JsonObject[] {
    const stored = player.getDynamicProperty(CLIPBOARD);
    if (typeof stored !== 'string') {
        return [];
    }
    const parsed = parseRelaxedJson(stored);
    if (!parsed.ok || !Array.isArray(parsed.value)) {
        return [];
    }
    return parsed.value.filter(
        (entry): entry is JsonObject =>
            entry !== null && typeof entry === 'object' && !Array.isArray(entry)
    );
}
