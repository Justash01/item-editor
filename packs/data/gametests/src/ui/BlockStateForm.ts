import { Block, BlockStates, Player } from '@minecraft/server';
import {
    CustomForm,
    ObservableNumber,
    ObservableString,
} from '@minecraft/server-ui';
import { BlockEditorService } from '../block/BlockEditorService';
import { Result, ok } from '../util/Result';
import { blockName } from '../util/rawText';
import { writableNumber, writableString } from './observables';
import { open } from './screens';

interface StateField {
    readonly name: string;
    readonly original: string;
    readonly options: readonly string[] | undefined;
    readonly read: () => string;
}

export class BlockStateForm {
    private constructor(
        private readonly block: Block,
        private readonly states: Record<string, boolean | number | string>
    ) {}

    static forBlock(block: Block): BlockStateForm {
        return new BlockStateForm(block, BlockEditorService.states(block));
    }

    get isEmpty(): boolean {
        return Object.keys(this.states).length === 0;
    }

    async prompt(viewer: Player): Promise<Result<Result<string>[]>> {
        const form = new CustomForm(viewer, blockName(this.block));
        form.label(`${this.block.x} ${this.block.y} ${this.block.z}`);
        form.spacer();

        const fields = Object.entries(this.states).map(([name, current]) =>
            this.addField(form, name, current)
        );

        let applied = false;
        form.divider();
        form.button('Apply states', () => {
            applied = true;
            form.close();
        });
        form.closeButton();

        const shown = await open(form, viewer);
        if (!shown.ok) {
            return shown;
        }

        return ok(applied ? this.apply(fields) : []);
    }

    private addField(
        form: CustomForm,
        name: string,
        current: boolean | number | string
    ): StateField {
        const original = String(current);
        const options = valueOptions(name);

        if (options) {
            const value: ObservableNumber = writableNumber(
                Math.max(options.indexOf(original), 0)
            );
            form.dropdown(
                name,
                value,
                options.map((label, index) => ({ label, value: index }))
            );
            return {
                name,
                original,
                options,
                read: () => options[value.getData()] ?? original,
            };
        }

        const value: ObservableString = writableString(original);
        form.textField(name, value, { description: `Currently ${original}` });
        return {
            name,
            original,
            options: undefined,
            read: () => value.getData(),
        };
    }

    private apply(fields: readonly StateField[]): Result<string>[] {
        const outcomes: Result<string>[] = [];

        for (const field of fields) {
            const raw = field.read();
            if (raw !== field.original) {
                outcomes.push(
                    BlockEditorService.setState(this.block, field.name, raw)
                );
            }
        }

        return outcomes;
    }
}

function valueOptions(name: string): readonly string[] | undefined {
    const type = BlockStates.get(name);
    if (
        !type ||
        type.validValues.length === 0 ||
        type.validValues.length > 32
    ) {
        return undefined;
    }
    return type.validValues.map((value) => String(value));
}
