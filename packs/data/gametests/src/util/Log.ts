export class Log {
    private static readonly instances = new Map<string, Log>();

    private constructor(private readonly name: string) {}

    static get(name: string): Log {
        let instance = Log.instances.get(name);
        if (!instance) {
            instance = new Log(name);
            Log.instances.set(name, instance);
        }
        return instance;
    }

    info(...parts: unknown[]): void {
        this.write(console.log, parts);
    }

    warn(...parts: unknown[]): void {
        this.write(console.warn, parts);
    }

    error(...parts: unknown[]): void {
        this.write(console.error, parts);
    }

    private write(sink: (message: string) => void, parts: unknown[]): void {
        sink(`[${this.name}] ${parts.map(render).join(' ')}`);
    }
}

function render(part: unknown): string {
    if (part instanceof Error) {
        return part.stack ?? `${part.name}: ${part.message}`;
    }
    if (typeof part === 'object' && part !== null) {
        try {
            return JSON.stringify(part);
        } catch {
            return String(part);
        }
    }
    return String(part);
}
