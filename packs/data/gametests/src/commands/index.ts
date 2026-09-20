import { BlockCommand } from './BlockCommand';
import { CommandRegistry } from './CommandRegistry';
import { EditorCommand } from './EditorCommand';
import { EditorGuiCommand } from './EditorGuiCommand';
import { EnchantCommand } from './EnchCommand';
import { GrantCommand } from './GrantCommand';
import { ItemCommand } from './ItemCommand';
import { KitCommand } from './KitCommand';
import { LoreCommand } from './LoreCommand';
import { SelectCommand } from './SelectCommand';
import { SetCommand } from './SetCommand';
import { SettingsCommand } from './SettingsCommand';

export function editorCommands(): readonly EditorCommand[] {
    return [
        new SelectCommand(),
        new SetCommand(),
        new EnchantCommand(),
        new LoreCommand(),
        new ItemCommand(),
        new KitCommand(),
        new GrantCommand(),
        new BlockCommand(),
        new EditorGuiCommand(),
        new SettingsCommand(),
    ];
}

export function installCommands(): void {
    CommandRegistry.install(editorCommands());
}
