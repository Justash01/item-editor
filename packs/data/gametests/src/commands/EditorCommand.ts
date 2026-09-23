import {
    CustomCommand,
    CustomCommandOrigin,
    CustomCommandResult,
    CustomCommandStatus,
    Entity,
    Player,
    system,
} from '@minecraft/server';
import { Log } from '../util/Log';
import { Color } from '../util/colors';
import { Result, describeError } from '../util/Result';
import { chatMessage, plainText } from '../util/names';
import { MessageKind, chat } from '../ui/feedback';

export interface CommandEnumDefinition {
    readonly name: string;
    readonly values: readonly string[];
}

export abstract class EditorCommand {
    protected readonly log: Log;

    protected constructor(name: string) {
        this.log = Log.get(name);
    }

    abstract readonly definition: CustomCommand;

    enums(): readonly CommandEnumDefinition[] {
        return [];
    }

    // Return undefined when defer() reports the result, otherwise the player
    // gets two messages.
    abstract execute(
        origin: CustomCommandOrigin,
        args: readonly unknown[]
    ): CustomCommandResult | undefined;

    protected failure(message: string): CustomCommandResult {
        return {
            status: CustomCommandStatus.Failure,
            message: plainText(message),
        };
    }

    protected defer(
        origin: CustomCommandOrigin,
        action: () => Result<string> | Result<string>[]
    ): undefined {
        system.run(() => {
            try {
                const outcomes = action();
                for (const outcome of Array.isArray(outcomes)
                    ? outcomes
                    : [outcomes]) {
                    CommandFeedback.report(origin, outcome);
                }
            } catch (error) {
                this.log.error(error);
                CommandFeedback.error(
                    origin,
                    `Unexpected error: ${describeError(error)}`
                );
            }
        });
        return undefined;
    }
}

export class CommandFeedback {
    private constructor() {}

    private static readonly log = Log.get('command');

    static report(origin: CustomCommandOrigin, outcome: Result<string>): void {
        if (outcome.ok) {
            CommandFeedback.success(origin, outcome.value);
        } else {
            CommandFeedback.error(origin, outcome.error);
        }
    }

    static success(origin: CustomCommandOrigin, message: string): void {
        CommandFeedback.send(
            origin,
            `${Color.Green}${message}`,
            message,
            'success'
        );
    }

    static error(origin: CustomCommandOrigin, message: string): void {
        CommandFeedback.send(
            origin,
            `${Color.Red}${message}`,
            message,
            'failure'
        );
    }

    static raw(origin: CustomCommandOrigin, message: string): void {
        CommandFeedback.send(origin, message, message, 'always');
    }

    private static send(
        origin: CustomCommandOrigin,
        formatted: string,
        plain: string,
        kind: MessageKind | 'always'
    ): void {
        const viewer = CommandFeedback.viewer(origin);
        if (!viewer) {
            CommandFeedback.log.info(plainText(plain));
            return;
        }

        if (kind === 'always') {
            viewer.sendMessage(chatMessage(formatted));
        } else {
            chat(viewer, formatted, kind);
        }
    }

    static viewer(origin: CustomCommandOrigin): Player | undefined {
        const candidates: (Entity | undefined)[] = [
            origin.sourceEntity,
            origin.initiator,
        ];
        for (const candidate of candidates) {
            if (candidate instanceof Player) {
                return candidate;
            }
        }
        return undefined;
    }
}
