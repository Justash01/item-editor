import { Player } from '@minecraft/server';

// Menus are nested async loops that reopen when a child closes, so without this
// closing four menus deep means closing four screens. `active` keeps it from
// touching players in vanilla/other add-on screens.
export class ExitSignal {
    private constructor() {}

    private static readonly active = new Set<string>();
    private static readonly leaving = new Set<string>();

    static begin(viewer: Player): void {
        ExitSignal.active.add(viewer.id);
        ExitSignal.leaving.delete(viewer.id);
    }

    static end(viewer: Player): void {
        ExitSignal.active.delete(viewer.id);
        ExitSignal.leaving.delete(viewer.id);
    }

    static isActive(viewer: Player): boolean {
        return ExitSignal.active.has(viewer.id);
    }

    static request(viewer: Player): void {
        ExitSignal.leaving.add(viewer.id);
    }

    static isRequested(viewer: Player): boolean {
        return ExitSignal.leaving.has(viewer.id);
    }
}
