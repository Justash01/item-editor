/**
 * Item Editor
 *
 * Discord: jstash
 * GitHub: https://github.com/Justash01
 * Repository: https://github.com/Justash01/item-editor
 * Website: https://jstash.dev/
 */

import { AbilityRuntime } from './abilities/AbilityRuntime';
import { Log } from './util/Log';
import { installCommands } from './commands';
import { EditorWand } from './ui/EditorWand';

installCommands();
EditorWand.install();
AbilityRuntime.install();

Log.get('ItemEditor').info('Item Editor loaded.');
