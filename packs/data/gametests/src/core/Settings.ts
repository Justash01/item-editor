import { world } from '@minecraft/server';
import { namespaced } from '../Meta';
import { parseRelaxedJson } from '../util/json';

const PROPERTY = namespaced('settings');

export type ChatFeedback = 'all' | 'failures' | 'off';

export const CHAT_FEEDBACK_LEVELS: readonly {
    id: ChatFeedback;
    label: string;
}[] = [
    { id: 'all', label: 'Everything' },
    { id: 'failures', label: 'Failures only' },
    { id: 'off', label: 'Nothing' },
];

export const REACH_RANGE = { min: 4, max: 64 };
export const UNDO_RANGE = { min: 1, max: 25 };

export interface AddonSettings {
    readonly chatFeedback: ChatFeedback;
    readonly soundFeedback: boolean;
    readonly localizedNames: boolean;
    readonly romanNumerals: boolean;
    readonly confirmDestructive: boolean;
    readonly reach: number;
    readonly undoDepth: number;
    readonly wandNeedsSneak: boolean;
    readonly stackableAbilities: boolean;
    readonly typedNumbers: boolean;
}

export const DEFAULT_SETTINGS: AddonSettings = {
    chatFeedback: 'all',
    soundFeedback: true,
    localizedNames: true,
    romanNumerals: true,
    confirmDestructive: true,
    reach: 12,
    undoDepth: 10,
    wandNeedsSneak: false,
    stackableAbilities: false,
    typedNumbers: false,
};

export class Settings {
    private constructor() {}

    static get(): AddonSettings {
        const stored = world.getDynamicProperty(PROPERTY);
        if (typeof stored !== 'string') {
            return DEFAULT_SETTINGS;
        }

        const parsed = parseRelaxedJson(stored);
        if (
            !parsed.ok ||
            parsed.value === null ||
            typeof parsed.value !== 'object' ||
            Array.isArray(parsed.value)
        ) {
            return DEFAULT_SETTINGS;
        }

        const value = parsed.value;
        const flag = (key: keyof AddonSettings): boolean =>
            typeof value[key] === 'boolean'
                ? value[key]
                : (DEFAULT_SETTINGS[key] as boolean);
        const whole = (
            key: keyof AddonSettings,
            range: { min: number; max: number }
        ): number =>
            typeof value[key] === 'number'
                ? Math.min(
                      Math.max(Math.round(value[key]), range.min),
                      range.max
                  )
                : (DEFAULT_SETTINGS[key] as number);

        return {
            chatFeedback: chatFeedbackOf(value.chatFeedback),
            soundFeedback: flag('soundFeedback'),
            localizedNames: flag('localizedNames'),
            romanNumerals: flag('romanNumerals'),
            confirmDestructive: flag('confirmDestructive'),
            reach: whole('reach', REACH_RANGE),
            undoDepth: whole('undoDepth', UNDO_RANGE),
            wandNeedsSneak: flag('wandNeedsSneak'),
            stackableAbilities: flag('stackableAbilities'),
            typedNumbers: flag('typedNumbers'),
        };
    }

    static save(settings: AddonSettings): void {
        world.setDynamicProperty(PROPERTY, JSON.stringify(settings));
    }
}

// Was a plain on/off toggle before the three-way choice.
function chatFeedbackOf(stored: unknown): ChatFeedback {
    if (typeof stored === 'boolean') {
        return stored ? 'all' : 'off';
    }
    return CHAT_FEEDBACK_LEVELS.some((level) => level.id === stored)
        ? (stored as ChatFeedback)
        : DEFAULT_SETTINGS.chatFeedback;
}
