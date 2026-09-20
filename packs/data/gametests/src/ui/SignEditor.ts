import {
    Block,
    BlockComponentTypes,
    BlockSignComponent,
    DyeColor,
    Player,
    SignSide,
} from '@minecraft/server';
import { CustomForm } from '@minecraft/server-ui';
import { Result, attempt, fail, ok } from '../util/Result';
import { idToName } from '../util/text';
import { Menu } from './Menu';
import { writableBoolean, writableNumber, writableString } from './observables';
import { ExitSignal } from './ExitSignal';
import { open } from './screens';
import { notify } from './feedback';
import { blockRef } from '../util/names';

const COLOURS: readonly DyeColor[] = Object.values(DyeColor);

const SIDES: readonly { side: SignSide; label: string }[] = [
    { side: SignSide.Front, label: 'Front' },
    { side: SignSide.Back, label: 'Back' },
];

export class SignEditor {
    constructor(
        private readonly viewer: Player,
        private readonly block: Block
    ) {}

    static supports(block: Block): boolean {
        return block.isValid && block.hasComponent(BlockComponentTypes.Sign);
    }

    async browse(): Promise<Result<void>> {
        for (;;) {
            if (ExitSignal.isRequested(this.viewer)) {
                return ok(undefined);
            }

            const sign = this.component();
            if (!sign.ok) {
                return sign;
            }

            let acted = false;
            const waxed = sign.value.isWaxed;

            const menu = new Menu(this.viewer, 'Sign')
                .withBack()
                .body(waxed ? 'Waxed (locked in game).' : 'Not waxed.');

            for (const { side, label } of SIDES) {
                const text = sign.value.getText(side) ?? '';
                menu.option(
                    `${label}: ${preview(text)}`,
                    async () => {
                        acted = true;
                        await this.editSide(side, label);
                    },
                    'Edit this face'
                );
            }

            menu.section('Sign').option(
                waxed ? 'Remove wax' : 'Wax sign',
                () => {
                    acted = true;
                    this.report(this.setWaxed(!waxed));
                },
                waxed
                    ? 'Let the sign be edited in game again'
                    : 'Seal the sign so it cannot be edited in game'
            );

            const shown = await menu.show();
            if (!shown.ok) {
                return shown;
            }
            if (!acted) {
                return ok(undefined);
            }
        }
    }

    private async editSide(side: SignSide, label: string): Promise<void> {
        const sign = this.component();
        if (!sign.ok) {
            return;
        }

        const form = new CustomForm(this.viewer, `${label} of sign`);
        form.label('Use new lines to fill the four rows.');
        form.spacer();

        const text = writableString(sign.value.getText(side) ?? '');
        const current = sign.value.getTextDyeColor(side);
        const color = writableNumber(
            Math.max(
                COLOURS.findIndex((entry) => entry === current),
                0
            )
        );
        const glowing = writableBoolean(current !== undefined);

        form.textField('Text', text, { description: 'What the face reads' });
        form.dropdown(
            'Dye color',
            color,
            COLOURS.map((entry, index) => ({
                label: idToName(entry),
                value: index,
            })),
            { description: 'Only applied when the color is kept' }
        );
        form.toggle('Keep dye color', glowing, {
            description: 'Turn off to restore the default color',
        });

        let save = false;
        form.divider();
        form.button('Save', () => {
            save = true;
            form.close();
        });
        form.closeButton();

        const shown = await open(form, this.viewer);
        if (!shown.ok || !save) {
            return;
        }

        const chosen = glowing.getData()
            ? COLOURS[Math.round(color.getData())]
            : undefined;

        this.report(
            this.mutate(`the ${label.toLowerCase()} face`, (component) => {
                component.setText(text.getData(), side);
                component.setTextDyeColor(chosen, side);
            })
        );
    }

    // Edits on a waxed sign get silently ignored, so unwax for the write.
    private mutate(
        what: string,
        change: (component: BlockSignComponent) => void
    ): Result<string> {
        const sign = this.component();
        if (!sign.ok) {
            return sign;
        }

        const component = sign.value;
        const wasWaxed = component.isWaxed;

        return attempt(() => {
            if (wasWaxed) {
                component.setWaxed(false);
            }
            change(component);
            if (wasWaxed) {
                component.setWaxed(true);
            }
            return `Updated ${what}.`;
        }, 'Failed to write the sign');
    }

    private setWaxed(waxed: boolean): Result<string> {
        const sign = this.component();
        if (!sign.ok) {
            return sign;
        }

        return attempt(() => {
            sign.value.setWaxed(waxed);
            return waxed ? 'Waxed the sign.' : 'Removed the wax.';
        }, 'Failed to write the sign');
    }

    private component(): Result<BlockSignComponent> {
        if (!this.block.isValid) {
            return fail('That sign is no longer loaded.');
        }

        const component = this.block.getComponent(BlockComponentTypes.Sign);
        return component
            ? ok(component)
            : fail(`${blockRef(this.block)} is not a sign.`);
    }

    private report(outcome: Result<string>): void {
        notify(this.viewer, outcome);
    }
}

function preview(text: string): string {
    const flat = text.replace(/\s+/g, ' ').trim();
    if (flat.length === 0) {
        return '(blank)';
    }
    return flat.length > 24 ? `${flat.slice(0, 23)}…` : flat;
}
