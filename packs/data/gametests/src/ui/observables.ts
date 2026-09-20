import {
    ObservableBoolean,
    ObservableNumber,
    ObservableString,
} from '@minecraft/server-ui';

// Input controls need clientWritable or the input never comes back and every
// field looks unchanged.
export function writableString(value: string): ObservableString {
    return new ObservableString(value, { clientWritable: true });
}

export function writableNumber(value: number): ObservableNumber {
    return new ObservableNumber(value, { clientWritable: true });
}

export function writableBoolean(value: boolean): ObservableBoolean {
    return new ObservableBoolean(value, { clientWritable: true });
}

export function scriptBoolean(value: boolean): ObservableBoolean {
    return new ObservableBoolean(value, { clientWritable: false });
}

export function scriptNumber(value: number): ObservableNumber {
    return new ObservableNumber(value, { clientWritable: false });
}

export function scriptString(value: string): ObservableString {
    return new ObservableString(value, { clientWritable: false });
}

export function clamp(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) {
        return min;
    }
    return Math.min(Math.max(value, min), max);
}
