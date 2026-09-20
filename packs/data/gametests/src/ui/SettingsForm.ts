import { Player } from '@minecraft/server';
import { CustomForm } from '@minecraft/server-ui';
import {
    CHAT_FEEDBACK_LEVELS,
    ChatFeedback,
    REACH_RANGE,
    Settings,
    UNDO_RANGE,
} from '../core/Settings';
import { describeError } from '../util/Result';
import { failWith, succeed } from './feedback';
import { writableBoolean, writableNumber } from './observables';
import { open } from './screens';

export class SettingsForm {
    private constructor() {}

    static async open(viewer: Player): Promise<void> {
        const current = Settings.get();
        const form = new CustomForm(viewer, 'Item Editor settings');

        const chatFeedback = writableNumber(chatIndex(current.chatFeedback));
        const soundFeedback = writableBoolean(current.soundFeedback);
        const localizedNames = writableBoolean(current.localizedNames);
        const romanNumerals = writableBoolean(current.romanNumerals);
        const confirmDestructive = writableBoolean(current.confirmDestructive);
        const reach = writableNumber(current.reach);
        const undoDepth = writableNumber(current.undoDepth);
        const wandNeedsSneak = writableBoolean(current.wandNeedsSneak);

        form.header('Feedback');
        // Headings sit right on top of the next row without this.
        form.spacer();
        form.dropdown(
            'Chat messages',
            chatFeedback,
            CHAT_FEEDBACK_LEVELS.map((level, index) => ({
                label: level.label,
                value: index,
            })),
            { description: 'What editor actions report in chat.' }
        );
        form.toggle('Sounds', soundFeedback, {
            description: 'A sound when something works, another when it fails.',
        });

        form.divider();
        form.header('Display');
        form.spacer();
        form.toggle('Localized names', localizedNames, {
            description:
                'Names in your language instead of ids like minecraft:diamond_sword.',
        });
        form.toggle('Roman enchantment levels', romanNumerals, {
            description: 'Sharpness V instead of Sharpness 5.',
        });

        form.divider();
        form.header('Editor');
        form.spacer();
        form.toggle('Confirm destructive actions', confirmDestructive, {
            description: 'Ask before resets, deletes and enchantment strips.',
        });
        form.slider('Reach', reach, REACH_RANGE.min, REACH_RANGE.max, {
            step: 1,
            description: 'How far the "in view" options reach, in blocks.',
        });
        form.slider('Undo steps', undoDepth, UNDO_RANGE.min, UNDO_RANGE.max, {
            step: 1,
            description: 'How many changes each slot remembers.',
        });

        form.divider();
        form.header('Wand');
        form.spacer();
        form.toggle('Only while sneaking', wandNeedsSneak, {
            description:
                'The wand waits until you sneak. The item works normally otherwise.',
        });

        let save = false;
        form.divider();
        form.button('Save', () => {
            save = true;
            form.close();
        });
        form.closeButton();

        const shown = await open(form, viewer);
        if (!shown.ok) {
            failWith(viewer, shown.error);
            return;
        }
        if (!save) {
            return;
        }

        try {
            Settings.save({
                chatFeedback: chatAt(chatFeedback.getData()),
                soundFeedback: soundFeedback.getData(),
                localizedNames: localizedNames.getData(),
                romanNumerals: romanNumerals.getData(),
                confirmDestructive: confirmDestructive.getData(),
                reach: Math.round(reach.getData()),
                undoDepth: Math.round(undoDepth.getData()),
                wandNeedsSneak: wandNeedsSneak.getData(),
            });
            succeed(viewer, 'Settings saved.');
        } catch (error) {
            failWith(
                viewer,
                `Failed to save settings: ${describeError(error)}`
            );
        }
    }
}

function chatIndex(level: ChatFeedback): number {
    return Math.max(
        CHAT_FEEDBACK_LEVELS.findIndex((entry) => entry.id === level),
        0
    );
}

function chatAt(index: number): ChatFeedback {
    return CHAT_FEEDBACK_LEVELS[Math.round(index)]?.id ?? 'all';
}
