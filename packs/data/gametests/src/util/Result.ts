export type Result<T> = Success<T> | Failure;

export interface Success<T> {
    readonly ok: true;
    readonly value: T;
}

export interface Failure {
    readonly ok: false;
    readonly error: string;
}

export function ok<T>(value: T): Success<T> {
    return { ok: true, value };
}

export function fail(error: string): Failure {
    return { ok: false, error };
}

export function attempt<T>(action: () => T, context: string): Result<T> {
    try {
        return ok(action());
    } catch (error) {
        return fail(`${context}: ${describeError(error)}`);
    }
}

export function describeError(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }
    return String(error);
}
