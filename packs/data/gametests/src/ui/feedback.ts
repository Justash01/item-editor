import { Player } from '@minecraft/server';
import { Settings } from '../core/Settings';
import { Result } from '../util/Result';
import { Color } from '../util/colors';
import { chatMessage } from '../util/names';

const SUCCESS = 'random.orb';
const FAILURE = 'note.bass';

export type MessageKind = 'success' | 'failure' | 'info';

export function playSuccess(viewer: Player): void {
    if (viewer.isValid && Settings.get().soundFeedback) {
        viewer.playSound(SUCCESS);
    }
}

export function playFailure(viewer: Player): void {
    if (viewer.isValid && Settings.get().soundFeedback) {
        viewer.playSound(FAILURE);
    }
}

export function chat(
    viewer: Player,
    message: string,
    kind: MessageKind = 'info'
): void {
    if (!viewer.isValid) {
        return;
    }

    const level = Settings.get().chatFeedback;
    if (level === 'off' || (level === 'failures' && kind !== 'failure')) {
        return;
    }
    viewer.sendMessage(chatMessage(message));
}

export function succeed(viewer: Player, message: string): void {
    playSuccess(viewer);
    chat(viewer, `${Color.Green}${message}`, 'success');
}

export function failWith(viewer: Player, message: string): void {
    playFailure(viewer);
    chat(viewer, `${Color.Red}${message}`, 'failure');
}

// Non-string or empty successes are just menus closing or unchanged forms.
export function notify(viewer: Player, outcome: Result<unknown>): void {
    if (!outcome.ok) {
        failWith(viewer, outcome.error);
    } else if (typeof outcome.value === 'string' && outcome.value.length > 0) {
        succeed(viewer, outcome.value);
    }
}
