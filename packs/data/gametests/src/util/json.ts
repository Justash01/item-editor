import { Result, fail, ok } from './Result';

export type JsonValue =
    string | number | boolean | null | JsonValue[] | JsonObject;

export interface JsonObject {
    [key: string]: JsonValue;
}

// Unquoted keys and single quotes so it doesn't fight the outer "...".
export function parseRelaxedJson(text: string): Result<JsonValue> {
    const parser = new Parser(text);
    return parser.parseDocument();
}

export function stringifyRelaxedJson(value: JsonValue): string {
    if (value === null) {
        return 'null';
    }
    if (typeof value === 'string') {
        return quote(value);
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
    }
    if (Array.isArray(value)) {
        return `[${value.map(stringifyRelaxedJson).join(',')}]`;
    }

    const entries = Object.entries(value).map(
        ([key, entry]) => `${formatKey(key)}:${stringifyRelaxedJson(entry)}`
    );
    return `{${entries.join(',')}}`;
}

const SIMPLE_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;

function formatKey(key: string): string {
    return SIMPLE_KEY.test(key) ? key : quote(key);
}

function quote(text: string): string {
    const escaped = text.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    return `'${escaped}'`;
}

const KEY_END = /[\s:,}\]]/;

class Parser {
    private index = 0;

    constructor(private readonly text: string) {}

    parseDocument(): Result<JsonValue> {
        this.skipWhitespace();
        if (this.index >= this.text.length) {
            return fail('the value is empty.');
        }

        let value: JsonValue;
        try {
            value = this.parseValue();
        } catch (error) {
            return fail(
                error instanceof SyntaxIssue
                    ? error.message
                    : 'the value could not be read.'
            );
        }

        this.skipWhitespace();
        if (this.index < this.text.length) {
            return fail(
                `unexpected "${this.text[this.index]}" at position ${this.index}.`
            );
        }

        return ok(value);
    }

    private parseValue(): JsonValue {
        this.skipWhitespace();
        const character = this.peek();

        switch (character) {
            case '{':
                return this.parseObject();
            case '[':
                return this.parseArray();
            case '"':
            case "'":
                return this.parseString();
            default:
                return this.parseLiteral();
        }
    }

    private parseObject(): JsonObject {
        this.expect('{');
        const result: JsonObject = {};

        for (;;) {
            this.skipWhitespace();
            if (this.peek() === '}') {
                this.index++;
                return result;
            }

            const key = this.parseKey();
            this.skipWhitespace();
            this.expect(':');
            result[key] = this.parseValue();

            this.skipWhitespace();
            if (this.peek() === ',') {
                this.index++;
                continue;
            }
            if (this.peek() === '}') {
                this.index++;
                return result;
            }
            throw new SyntaxIssue(
                `expected "," or "}" at position ${this.index}.`
            );
        }
    }

    private parseArray(): JsonValue[] {
        this.expect('[');
        const result: JsonValue[] = [];

        for (;;) {
            this.skipWhitespace();
            if (this.peek() === ']') {
                this.index++;
                return result;
            }

            result.push(this.parseValue());

            this.skipWhitespace();
            if (this.peek() === ',') {
                this.index++;
                continue;
            }
            if (this.peek() === ']') {
                this.index++;
                return result;
            }
            throw new SyntaxIssue(
                `expected "," or "]" at position ${this.index}.`
            );
        }
    }

    private parseKey(): string {
        const character = this.peek();
        if (character === '"' || character === "'") {
            return this.parseString();
        }

        const start = this.index;
        while (
            this.index < this.text.length &&
            !KEY_END.test(this.text[this.index]!)
        ) {
            this.index++;
        }

        if (this.index === start) {
            throw new SyntaxIssue(
                `expected a property name at position ${start}.`
            );
        }
        return this.text.slice(start, this.index);
    }

    private parseString(): string {
        const quoteCharacter = this.text[this.index]!;
        this.index++;

        let result = '';
        while (this.index < this.text.length) {
            const character = this.text[this.index]!;

            if (character === '\\') {
                this.index++;
                result += this.readEscape();
                continue;
            }
            if (character === quoteCharacter) {
                this.index++;
                return result;
            }

            result += character;
            this.index++;
        }

        throw new SyntaxIssue('a quoted string was never closed.');
    }

    private readEscape(): string {
        const character = this.text[this.index];
        if (character === undefined) {
            throw new SyntaxIssue('the value ends with a dangling "\\".');
        }
        this.index++;

        switch (character) {
            case 'n':
                return '\n';
            case 't':
                return '\t';
            case 'r':
                return '\r';
            case 'u': {
                const code = this.text.slice(this.index, this.index + 4);
                if (!/^[0-9a-fA-F]{4}$/.test(code)) {
                    throw new SyntaxIssue(
                        `"\\u" must be followed by four hex digits at position ${this.index}.`
                    );
                }
                this.index += 4;
                return String.fromCharCode(Number.parseInt(code, 16));
            }
            default:
                return character;
        }
    }

    private parseLiteral(): JsonValue {
        const start = this.index;
        while (
            this.index < this.text.length &&
            !KEY_END.test(this.text[this.index]!)
        ) {
            this.index++;
        }

        const token = this.text.slice(start, this.index);
        if (token.length === 0) {
            throw new SyntaxIssue(
                `unexpected "${this.text[start]}" at position ${start}.`
            );
        }

        if (token === 'true') return true;
        if (token === 'false') return false;
        if (token === 'null') return null;

        if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(token)) {
            return Number(token);
        }

        throw new SyntaxIssue(
            `"${token}" is not a number, true, false, or null. Quote it to use it as text.`
        );
    }

    private peek(): string | undefined {
        return this.text[this.index];
    }

    private expect(character: string): void {
        if (this.text[this.index] !== character) {
            throw new SyntaxIssue(
                `expected "${character}" at position ${this.index}.`
            );
        }
        this.index++;
    }

    private skipWhitespace(): void {
        while (
            this.index < this.text.length &&
            /\s/.test(this.text[this.index]!)
        ) {
            this.index++;
        }
    }
}

class SyntaxIssue extends Error {}

export function describeJsonType(value: JsonValue): string {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'a list';
    if (typeof value === 'object') return 'an object';
    return `a ${typeof value}`;
}
