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
        label: 'Third strike',
        detail: 'Every third hit calls down lightning',
        ability: {
            trigger: 'hit',
            every: 3,
            do: [{ action: 'lightning' }],
        },
    },
    {
        label: 'Execute',
        detail: 'Big extra damage on anything under a third of its health',
        ability: {
            trigger: 'hit',
            targetHealth: 33,
            do: [{ action: 'damage', amount: 10 }],
        },
    },
    {
        label: 'Mace smash',
        detail: 'Falling hits deal more the further you fell and knock mobs back',
        ability: {
            trigger: 'hit',
            fall: 1.5,
            do: [
                { action: 'smash', perBlock: 2 },
                {
                    action: 'knockback',
                    strength: 1.5,
                    target: 'around',
                    radius: 3,
                },
                { action: 'safefall', seconds: 2 },
            ],
        },
    },
    {
        label: 'Wind burst',
        detail: 'A falling hit bounces you back up into the air',
        ability: {
            trigger: 'hit',
            fall: 1.5,
            do: [
                { action: 'launch', strength: 1.5, target: 'self' },
                { action: 'safefall', seconds: 5 },
                { action: 'sound', sound: 'wind_charge.burst', at: 'self' },
                {
                    action: 'particle',
                    particle: 'minecraft:wind_explosion_emitter',
                    at: 'self',
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
        label: 'Mana bolt',
        detail: 'Shoots a wind charge for 10 mana. Pair it with Mana regen',
        ability: {
            trigger: 'use',
            payScore: true,
            costObjective: 'mana',
            scoreCost: 10,
            do: [
                {
                    action: 'projectile',
                    projectile: 'minecraft:wind_charge_projectile',
                    speed: 2,
                },
            ],
        },
    },
    {
        label: 'Fire charge wand',
        detail: 'Shoots a flaming arrow, using up a fire charge from your inventory',
        ability: {
            trigger: 'use',
            payItem: true,
            ammo: 'minecraft:fire_charge',
            ammoCount: 1,
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
        label: 'Healing staff',
        detail: 'Right-click a pet or a friend to heal them',
        ability: {
            trigger: 'interact',
            cooldown: 2,
            do: [
                { action: 'heal', amount: 6, target: 'target' },
                {
                    action: 'particle',
                    particle: 'minecraft:heart_particle',
                },
            ],
        },
    },
    {
        label: 'Golden head',
        detail: 'Regeneration, absorption and speed, then 20 seconds before the next one',
        ability: {
            trigger: 'eat',
            cooldown: 20,
            do: [
                {
                    action: 'effect',
                    effect: 'minecraft:regeneration',
                    level: 2,
                    duration: 9,
                },
                {
                    action: 'effect',
                    effect: 'minecraft:absorption',
                    level: 2,
                    duration: 120,
                },
                {
                    action: 'effect',
                    effect: 'minecraft:speed',
                    level: 1,
                    duration: 10,
                },
            ],
        },
    },
    {
        label: 'Shield wall',
        detail: 'Resistance while you sneak with the shield in your off-hand',
        ability: {
            trigger: 'worn',
            sneak: 'only',
            do: [
                {
                    action: 'effect',
                    effect: 'minecraft:resistance',
                    level: 2,
                    duration: 1,
                    particles: false,
                },
            ],
        },
    },
    {
        label: 'Double jump',
        detail: 'Press jump in the air for a second jump',
        ability: {
            trigger: 'jump',
            ground: 'air',
            cooldown: 1,
            do: [
                { action: 'launch', strength: 1, target: 'self' },
                { action: 'safefall', seconds: 4 },
                { action: 'sound', sound: 'mob.ghast.fireball', volume: 0.4 },
            ],
        },
    },
    {
        label: 'Sneak dash',
        detail: 'Tap sneak to dash forward, every 3 seconds',
        ability: {
            trigger: 'sneak',
            cooldown: 3,
            do: [{ action: 'knockback', strength: 2.5, target: 'self' }],
        },
    },
    {
        label: 'Mana regen',
        detail: 'One mana a second while held, up to 100, with a bar to show it',
        ability: {
            trigger: 'held',
            interval: 1,
            do: [
                { action: 'score', objective: 'mana', amount: 1, cap: 100 },
                { action: 'bar', objective: 'mana', label: 'Mana', max: 100 },
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
