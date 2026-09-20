import { Player } from '@minecraft/server';
import {
    CustomForm,
    DataDrivenScreenClosedReason,
    UIRawMessage,
} from '@minecraft/server-ui';
import { Settings } from '../core/Settings';
import { Result, ok } from '../util/Result';
import { uiText } from '../util/rawText';
import { ExitSignal } from './ExitSignal';
import { open } from './screens';

export type Label = string | UIRawMessage;

type Choice = () => void | Promise<void>;

interface Entry {
    readonly label: Label;
    readonly detail: Label | undefined;
    readonly run: Choice;
}

interface Group {
    readonly title: string | undefined;
    readonly entries: Entry[];
}

// Handlers run after the screen closes, otherwise the next screen conflicts
// with this one.
function label(value: Label): UIRawMessage {
    return typeof value === 'string' ? uiText(value) : value;
}

export class Menu {
    private readonly groups: Group[] = [{ title: undefined, entries: [] }];
    private subtitle: Label | undefined;
    private nested = false;

    constructor(
        private readonly viewer: Player,
        private readonly title: Label
    ) {}

    // Keep it short, long text wraps badly.
    body(text: Label): this {
        this.subtitle = text;
        return this;
    }

    withBack(): this {
        this.nested = true;
        return this;
    }

    section(title: string): this {
        this.groups.push({ title, entries: [] });
        return this;
    }

    option(label: Label, run: Choice, detail?: Label): this {
        this.groups[this.groups.length - 1]!.entries.push({
            label,
            detail,
            run,
        });
        return this;
    }

    async show(): Promise<Result<void>> {
        const form = new CustomForm(this.viewer, label(this.title));

        if (this.subtitle) {
            form.label(label(this.subtitle));
            form.spacer();
        }

        let chosen: Choice | undefined;
        let wentBack = false;

        for (const group of this.groups) {
            if (group.entries.length === 0) {
                continue;
            }

            if (group.title) {
                form.divider();
                form.header(group.title);
                // Headings sit right on top of the next row without this.
                form.spacer();
            }

            for (const entry of group.entries) {
                form.button(
                    label(entry.label),
                    () => {
                        chosen = entry.run;
                        form.close();
                    },
                    entry.detail ? { tooltip: label(entry.detail) } : undefined
                );
            }
        }

        form.divider();
        if (this.nested) {
            form.button(
                'Back',
                () => {
                    wentBack = true;
                    form.close();
                },
                { tooltip: 'Return to the previous screen' }
            );
        }
        form.closeButton();

        const shown = await open(form, this.viewer);
        if (!shown.ok) {
            return shown;
        }

        // Rows and Back close from script, ClientClosed is only ever X/Close.
        if (
            !wentBack &&
            !chosen &&
            shown.value === DataDrivenScreenClosedReason.ClientClosed
        ) {
            ExitSignal.request(this.viewer);
        }

        if (chosen) {
            await chosen();
        }
        return ok(undefined);
    }
}

export async function confirmDestructive(
    viewer: Player,
    title: string,
    message: string,
    confirmLabel: string
): Promise<boolean> {
    return Settings.get().confirmDestructive
        ? Dialog.confirm(viewer, title, message, confirmLabel)
        : true;
}

export class Dialog {
    private constructor() {}

    static async alert(
        viewer: Player,
        title: string,
        message: string
    ): Promise<void> {
        const form = new CustomForm(viewer, title)
            .label(uiText(message))
            .spacer();

        let wentBack = false;
        form.button('Back', () => {
            wentBack = true;
            form.close();
        });
        form.closeButton();

        const shown = await open(form, viewer);

        // Back returns to the caller, Close/X exits the editor.
        if (
            !wentBack &&
            shown.ok &&
            shown.value === DataDrivenScreenClosedReason.ClientClosed
        ) {
            ExitSignal.request(viewer);
        }
    }

    static async confirm(
        viewer: Player,
        title: string,
        message: string,
        confirmLabel = 'Confirm'
    ): Promise<boolean> {
        const form = new CustomForm(viewer, title)
            .label(uiText(message))
            .spacer();

        let confirmed = false;
        form.divider();
        form.button('Cancel', () => {
            form.close();
        });
        form.button(confirmLabel, () => {
            confirmed = true;
            form.close();
        });

        const shown = await open(form, viewer);
        return shown.ok && confirmed;
    }
}
