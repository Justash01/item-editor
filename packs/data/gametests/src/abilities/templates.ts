import { JsonObject } from '../util/json';

export interface Template {
    readonly label: string;
    readonly detail: string;
    readonly ability: JsonObject;
}

export const TEMPLATES: readonly Template[] = [
    {
        label: 'Thunder strike',
        detail: 'One hit in five calls down lightning',
        ability: {
            trigger: 'hit',
            chance: 20,
            cooldown: 5,
            do: [{ action: 'lightning' }],
        },
    },
    {
        label: 'Lifesteal',
        detail: 'Heal a fifth of the damage you deal',
        ability: {
            trigger: 'hit',
            do: [{ action: 'lifesteal', percent: 20 }],
        },
    },
    {
        label: 'Venom',
        detail: 'Poison whatever you hit',
        ability: {
            trigger: 'hit',
            do: [
                {
                    action: 'effect',
                    effect: 'minecraft:poison',
                    level: 1,
                    duration: 5,
                },
            ],
        },
    },
    {
        label: 'Reaper',
        detail: 'Kills heal you and give XP',
        ability: {
            trigger: 'kill',
            do: [
                { action: 'heal', amount: 4 },
                { action: 'xp', amount: 10 },
            ],
        },
    },
    {
        label: 'Explosive arrows',
        detail: 'Arrows blow up where they land, without breaking blocks',
        ability: {
            trigger: 'shoot',
            do: [{ action: 'explosion', power: 2 }],
        },
    },
    {
        label: 'Thorns',
        detail: 'Hurt whoever hits you',
        ability: {
            trigger: 'hurt',
            do: [{ action: 'damage', amount: 2 }],
        },
    },
    {
        label: 'Dash',
        detail: 'Throw yourself forward, every 3 seconds',
        ability: {
            trigger: 'use',
            cooldown: 3,
            do: [
                { action: 'knockback', strength: 2.5, target: 'self' },
                { action: 'sound', sound: 'mob.ghast.fireball' },
            ],
        },
    },
    {
        label: 'Blink',
        detail: 'Teleport 8 blocks the way you face',
        ability: {
            trigger: 'use',
            cooldown: 5,
            do: [
                { action: 'blink', distance: 8 },
                { action: 'sound', sound: 'mob.endermen.portal', at: 'self' },
            ],
        },
    },
    {
        label: 'Fire wand',
        detail: 'Shoot flaming arrows',
        ability: {
            trigger: 'use',
            cooldown: 1,
            do: [
                {
                    action: 'projectile',
                    projectile: 'flaming_arrow',
                    speed: 3,
                },
            ],
        },
    },
    {
        label: 'Swiftness',
        detail: 'Speed while you hold it',
        ability: {
            trigger: 'held',
            do: [
                {
                    action: 'effect',
                    effect: 'minecraft:speed',
                    level: 2,
                    duration: 2,
                    particles: false,
                },
            ],
        },
    },
    {
        label: 'Night vision',
        detail: 'See in the dark while you wear it',
        ability: {
            trigger: 'worn',
            do: [
                {
                    action: 'effect',
                    effect: 'minecraft:night_vision',
                    level: 1,
                    duration: 15,
                    particles: false,
                },
            ],
        },
    },
    {
        label: 'Hammer',
        detail: 'Mine 3x3 at a time',
        ability: {
            trigger: 'mine',
            do: [{ action: 'area', shape: '3x3' }],
        },
    },
    {
        label: 'Vein miner',
        detail: 'Sneak to mine the whole ore vein',
        ability: {
            trigger: 'mine',
            sneak: 'only',
            blocks: 'ores',
            do: [{ action: 'area', shape: 'vein', limit: 32 }],
        },
    },
    {
        label: 'Tree feller',
        detail: 'Chop the whole tree at once',
        ability: {
            trigger: 'mine',
            blocks: 'logs',
            do: [{ action: 'area', shape: 'vein', limit: 64 }],
        },
    },
    {
        label: 'Auto smelt',
        detail: 'Drops come out smelted',
        ability: {
            trigger: 'mine',
            do: [{ action: 'drops', mode: 'smelt' }],
        },
    },
    {
        label: 'Magnet',
        detail: 'Drops go straight to your inventory',
        ability: {
            trigger: 'mine',
            do: [{ action: 'drops', mode: 'inventory' }],
        },
    },
    {
        label: 'Replant',
        detail: 'Harvested crops plant themselves again',
        ability: {
            trigger: 'mine',
            blocks: 'crops',
            do: [{ action: 'replace', with: 'replant' }],
        },
    },
    {
        label: 'Ore regrowth',
        detail: 'Mined ores come back after a minute',
        ability: {
            trigger: 'mine',
            blocks: 'ores',
            do: [{ action: 'replace', with: 'regrow', after: 60 }],
        },
    },
];
