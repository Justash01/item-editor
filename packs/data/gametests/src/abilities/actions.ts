import {
    Entity,
    EntityComponentTypes,
    EntityDamageCause,
    Player,
    Vector3,
} from '@minecraft/server';
import { MinecraftEffectTypes } from '@minecraft/vanilla-data';
import { idToName, levelText } from '../util/text';
import {
    appliesTo,
    choiceField,
    flagField,
    flagOf,
    numberField,
    numberOf,
    textOf,
    whereField,
} from './fields';
import { MINING_ACTIONS } from './mining';
import {
    AbilityContext,
    ActionDefinition,
    ChoiceOption,
    FieldSpec,
    Values,
} from './types';

const EFFECTS: readonly ChoiceOption[] = Object.values(MinecraftEffectTypes)
    .map((id) => ({ value: id, label: idToName(id) }))
    .sort((left, right) => left.label.localeCompare(right.label));

const BAD_EFFECTS = new Set([
    'poison',
    'fatal_poison',
    'wither',
    'slowness',
    'mining_fatigue',
    'nausea',
    'blindness',
    'darkness',
    'hunger',
    'weakness',
    'levitation',
    'bad_omen',
    'infested',
    'oozing',
    'weaving',
    'wind_charged',
]);

const SOUNDS: readonly ChoiceOption[] = [
    { value: 'random.levelup', label: 'Level up' },
    { value: 'random.orb', label: 'XP orb' },
    { value: 'random.pop', label: 'Pop' },
    { value: 'note.pling', label: 'Pling' },
    { value: 'note.bell', label: 'Bell' },
    { value: 'random.explode', label: 'Explosion' },
    { value: 'ambient.weather.thunder', label: 'Thunder' },
    { value: 'item.trident.thunder', label: 'Trident thunder' },
    { value: 'mob.endermen.portal', label: 'Enderman teleport' },
    { value: 'mob.blaze.shoot', label: 'Blaze shoot' },
    { value: 'mob.ghast.fireball', label: 'Ghast fireball' },
    { value: 'mob.wither.shoot', label: 'Wither shoot' },
    { value: 'random.anvil_land', label: 'Anvil' },
    { value: 'random.glass', label: 'Glass breaking' },
    { value: 'random.totem', label: 'Totem' },
    { value: 'beacon.activate', label: 'Beacon' },
    { value: 'fire.ignite', label: 'Flint and steel' },
];

const PARTICLES: readonly ChoiceOption[] = [
    { value: 'minecraft:heart_particle', label: 'Hearts' },
    { value: 'minecraft:villager_happy', label: 'Green sparkles' },
    { value: 'minecraft:villager_angry', label: 'Angry cloud' },
    { value: 'minecraft:critical_hit_emitter', label: 'Critical hit' },
    { value: 'minecraft:totem_particle', label: 'Totem' },
    { value: 'minecraft:endrod', label: 'End rod' },
    { value: 'minecraft:basic_flame_particle', label: 'Flame' },
    { value: 'minecraft:soul_particle', label: 'Soul' },
    { value: 'minecraft:lava_particle', label: 'Lava pop' },
    { value: 'minecraft:note_particle', label: 'Music note' },
    { value: 'minecraft:large_explosion', label: 'Explosion' },
    { value: 'minecraft:huge_explosion_emitter', label: 'Big explosion' },
    { value: 'minecraft:sonic_explosion', label: 'Sonic boom' },
    { value: 'minecraft:knockback_roar_particle', label: 'Roar' },
];

const PROJECTILES: readonly ChoiceOption[] = [
    { value: 'minecraft:arrow', label: 'Arrow' },
    { value: 'minecraft:snowball', label: 'Snowball' },
    { value: 'flaming_arrow', label: 'Flaming arrow' },
    { value: 'minecraft:egg', label: 'Egg' },
    { value: 'minecraft:xp_bottle', label: "Bottle o' enchanting" },
    { value: 'minecraft:wind_charge_projectile', label: 'Wind charge' },
    { value: 'custom', label: 'Something else' },
];

// Projectiles spawned by an ability, so the arrow-hit tracking leaves them be.
// Otherwise an arrow-hit ability that shoots would keep feeding itself.
export const ownShots = new Set<string>();

function subjects(ctx: AbilityContext, values: Values): Entity[] {
    const radius = numberOf(values, 'radius');
    switch (textOf(values, 'target')) {
        case 'target':
            return ctx.target?.isValid ? [ctx.target] : [];
        case 'mobs':
            return ctx.dimension
                .getEntities({
                    location: ctx.holder.location,
                    maxDistance: radius,
                    excludeTypes: [
                        'minecraft:player',
                        'minecraft:item',
                        'minecraft:xp_orb',
                    ],
                    excludeFamilies: ['inanimate'],
                })
                .filter((entity) =>
                    entity.hasComponent(EntityComponentTypes.Health)
                );
        case 'players':
            return ctx.dimension
                .getPlayers({
                    location: ctx.holder.location,
                    maxDistance: radius,
                })
                .filter((player) => player.id !== ctx.holder.id);
        default:
            return ctx.holder.isValid ? [ctx.holder] : [];
    }
}

function whom(values: Values): string {
    const radius = numberOf(values, 'radius');
    switch (textOf(values, 'target')) {
        case 'target':
            return 'the target';
        case 'mobs':
            return `mobs within ${radius} blocks`;
        case 'players':
            return `players within ${radius} blocks`;
        default:
            return 'you';
    }
}

function place(ctx: AbilityContext, values: Values): Vector3 {
    return textOf(values, 'at') === 'self' ? ctx.holder.location : ctx.location;
}

function flat(x: number, z: number): { x: number; z: number } {
    const length = Math.hypot(x, z);
    return length < 0.0001 ? { x: 0, z: 0 } : { x: x / length, z: z / length };
}

function fillIn(text: string, ctx: AbilityContext): string {
    const at = (value: number): string =>
        (Math.round(value * 100) / 100).toString();
    const target = ctx.target?.isValid ? plainName(ctx.target) : '';
    return text
        .replace(/\{x\}/g, at(ctx.location.x))
        .replace(/\{y\}/g, at(ctx.location.y))
        .replace(/\{z\}/g, at(ctx.location.z))
        .replace(/\{player\}/g, ctx.holder.name)
        .replace(/\{target\}/g, target)
        .replace(/\{block\}/g, ctx.mined?.permutation.type.id ?? '')
        .replace(/\{damage\}/g, at(ctx.damage ?? 0));
}

function plainName(entity: Entity): string {
    if (entity instanceof Player) {
        return entity.name;
    }
    return entity.nameTag || idToName(entity.typeId);
}

function heal(entity: Entity, amount: number): void {
    const health = entity.getComponent(EntityComponentTypes.Health);
    if (health) {
        health.setCurrentValue(
            Math.min(health.currentValue + amount, health.effectiveMax)
        );
    }
}

function presetText(
    key: string,
    label: string,
    presets: readonly ChoiceOption[],
    example: string
): FieldSpec {
    return {
        kind: 'text',
        key,
        label,
        default: presets[0]!.value,
        example,
        maxLength: 64,
        presets,
    };
}

const GENERAL: readonly ActionDefinition[] = [
    {
        type: 'damage',
        label: 'Deal damage',
        detail: 'Extra damage on top of the hit',
        group: 'Combat and movement',
        fields: [
            numberField('amount', 'Damage, in half hearts', 1, 40, 1, 4),
            ...appliesTo('target'),
        ],
        describe: (values) =>
            `Deal ${numberOf(values, 'amount')} damage to ${whom(values)}`,
        run: (ctx, values) => {
            // Magic rather than entityAttack, or it would count as another hit
            // and set the on-hit abilities off again.
            for (const entity of subjects(ctx, values)) {
                entity.applyDamage(
                    numberOf(values, 'amount'),
                    entity.id === ctx.holder.id
                        ? { cause: EntityDamageCause.magic }
                        : {
                              cause: EntityDamageCause.magic,
                              damagingEntity: ctx.holder,
                          }
                );
            }
        },
    },
    {
        type: 'lifesteal',
        label: 'Lifesteal',
        detail: 'Heal a share of the damage you dealt',
        group: 'Combat and movement',
        triggers: ['hit'],
        fields: [numberField('percent', 'Share, in percent', 5, 100, 5, 20)],
        describe: (values) =>
            `Heal ${numberOf(values, 'percent')}% of the damage dealt`,
        run: (ctx, values) => {
            if (ctx.damage) {
                heal(
                    ctx.holder,
                    (ctx.damage * numberOf(values, 'percent')) / 100
                );
            }
        },
    },
    {
        type: 'fire',
        label: 'Set on fire',
        detail: 'Burn you, the target, or everything nearby',
        group: 'Combat and movement',
        fields: [
            numberField('seconds', 'Burn for, in seconds', 1, 30, 1, 4),
            ...appliesTo('target'),
        ],
        describe: (values) =>
            `Set ${whom(values)} on fire for ${numberOf(values, 'seconds')}s`,
        run: (ctx, values) => {
            for (const entity of subjects(ctx, values)) {
                entity.setOnFire(numberOf(values, 'seconds'), true);
            }
        },
    },
    {
        type: 'knockback',
        label: 'Knockback',
        detail: 'Shove things away from you, or throw yourself forward',
        group: 'Combat and movement',
        fields: [
            numberField('strength', 'Strength', 0.5, 5, 0.5, 1.5),
            ...appliesTo('target', 'Pushes'),
        ],
        describe: (values) =>
            textOf(values, 'target') === 'self'
                ? `Throw yourself forward, strength ${numberOf(values, 'strength')}`
                : `Knock ${whom(values)} back, strength ${numberOf(values, 'strength')}`,
        run: (ctx, values) => {
            const strength = numberOf(values, 'strength');
            // applyImpulse doesnt work on players, knockback is the only way to
            // move one.
            for (const entity of subjects(ctx, values)) {
                if (entity.id === ctx.holder.id) {
                    const view = ctx.holder.getViewDirection();
                    const forward = flat(view.x, view.z);
                    entity.applyKnockback(
                        { x: forward.x * strength, z: forward.z * strength },
                        Math.max(0.3, view.y * strength)
                    );
                    continue;
                }
                const away = flat(
                    entity.location.x - ctx.holder.location.x,
                    entity.location.z - ctx.holder.location.z
                );
                entity.applyKnockback(
                    { x: away.x * strength, z: away.z * strength },
                    0.3
                );
            }
        },
    },
    {
        type: 'pull',
        label: 'Pull in',
        detail: 'Drag things toward you',
        group: 'Combat and movement',
        fields: [
            numberField('strength', 'Strength', 0.5, 5, 0.5, 1.5),
            ...appliesTo('target', 'Pulls'),
        ],
        describe: (values) =>
            `Pull ${whom(values)} toward you, strength ${numberOf(values, 'strength')}`,
        run: (ctx, values) => {
            const strength = numberOf(values, 'strength');
            for (const entity of subjects(ctx, values)) {
                if (entity.id === ctx.holder.id) {
                    continue;
                }
                const toward = flat(
                    ctx.holder.location.x - entity.location.x,
                    ctx.holder.location.z - entity.location.z
                );
                entity.applyKnockback(
                    { x: toward.x * strength, z: toward.z * strength },
                    0.2
                );
            }
        },
    },
    {
        type: 'launch',
        label: 'Launch up',
        detail: 'Send something straight into the air',
        group: 'Combat and movement',
        fields: [
            numberField('strength', 'Strength', 0.5, 3, 0.5, 1),
            ...appliesTo('target', 'Launches'),
        ],
        describe: (values) =>
            `Launch ${whom(values)} up, strength ${numberOf(values, 'strength')}`,
        run: (ctx, values) => {
            for (const entity of subjects(ctx, values)) {
                entity.applyKnockback(
                    { x: 0, z: 0 },
                    numberOf(values, 'strength')
                );
            }
        },
    },
    {
        type: 'blink',
        label: 'Blink',
        detail: 'Teleport a few blocks the way you face',
        group: 'Combat and movement',
        fields: [
            numberField('distance', 'Distance, in blocks', 2, 16, 1, 6, {
                ceiling: 128,
            }),
        ],
        describe: (values) => `Blink ${numberOf(values, 'distance')} blocks`,
        run: (ctx, values) => {
            const holder = ctx.holder;
            const view = holder.getViewDirection();
            const head = holder.getHeadLocation();
            let reach = numberOf(values, 'distance');

            // Stop short of whatever is in the way.
            const hit = holder.getBlockFromViewDirection({
                maxDistance: reach,
            });
            if (hit) {
                const point = {
                    x: hit.block.x + hit.faceLocation.x,
                    y: hit.block.y + hit.faceLocation.y,
                    z: hit.block.z + hit.faceLocation.z,
                };
                reach = Math.max(
                    0,
                    Math.hypot(
                        point.x - head.x,
                        point.y - head.y,
                        point.z - head.z
                    ) - 1
                );
            }
            holder.tryTeleport(
                {
                    x: holder.location.x + view.x * reach,
                    y: holder.location.y + view.y * reach,
                    z: holder.location.z + view.z * reach,
                },
                { checkForBlocks: true, keepVelocity: false }
            );
        },
    },
    {
        type: 'projectile',
        label: 'Shoot a projectile',
        detail: 'Fire an arrow, snowball or wind charge where you look',
        group: 'Combat and movement',
        fields: [
            choiceField(
                'projectile',
                'Projectile',
                PROJECTILES,
                'minecraft:arrow'
            ),
            {
                kind: 'text',
                key: 'custom',
                label: 'Entity id',
                description:
                    'Only real projectiles fly. Anything else just appears in front of you.',
                default: 'minecraft:splash_potion',
                example: 'minecraft:xp_bottle',
                maxLength: 64,
                check: 'entity',
                showWhen: { key: 'projectile', values: ['custom'] },
            },
            numberField('speed', 'Speed', 0.5, 4, 0.5, 2),
        ],
        describe: (values) => {
            const picked = PROJECTILES.find(
                (option) => option.value === textOf(values, 'projectile')
            );
            return picked && picked.value !== 'custom'
                ? `Shoot ${picked.label.toLowerCase()}`
                : `Shoot ${idToName(textOf(values, 'custom'))}`;
        },
        run: (ctx, values) => {
            const holder = ctx.holder;
            const view = holder.getViewDirection();
            const head = holder.getHeadLocation();
            const picked = textOf(values, 'projectile');
            const flaming = picked === 'flaming_arrow';
            const id = flaming
                ? 'minecraft:arrow'
                : picked === 'custom'
                  ? textOf(values, 'custom')
                  : picked;
            const shot = ctx.dimension.spawnEntity(id, {
                x: head.x + view.x * 1.2,
                y: head.y + view.y * 1.2,
                z: head.z + view.z * 1.2,
            });
            ownShots.add(shot.id);
            if (flaming) {
                shot.setOnFire(60, false);
            }
            const projectile = shot.getComponent(
                EntityComponentTypes.Projectile
            );
            if (!projectile) {
                return;
            }
            projectile.owner = holder;
            const speed = numberOf(values, 'speed');
            projectile.shoot({
                x: view.x * speed,
                y: view.y * speed,
                z: view.z * speed,
            });
        },
    },
    {
        type: 'effect',
        label: 'Potion effect',
        detail: 'Give an effect to you, the target, or everyone nearby',
        group: 'Health and effects',
        fields: [
            choiceField('effect', 'Effect', EFFECTS, 'minecraft:speed'),
            numberField('level', 'Level', 1, 10, 1, 1, { ceiling: 256 }),
            numberField('duration', 'Duration, in seconds', 1, 600, 1, 10),
            flagField('particles', 'Show particles', true),
            ...appliesTo('target'),
        ],
        describe: (values) =>
            `${idToName(textOf(values, 'effect'))} ${levelText(numberOf(values, 'level'))} on ${whom(values)} for ${numberOf(values, 'duration')}s`,
        run: (ctx, values) => {
            for (const entity of subjects(ctx, values)) {
                entity.addEffect(
                    textOf(values, 'effect'),
                    numberOf(values, 'duration') * 20,
                    {
                        amplifier: numberOf(values, 'level') - 1,
                        showParticles: flagOf(values, 'particles'),
                    }
                );
            }
        },
    },
    {
        type: 'cleanse',
        label: 'Clear effects',
        detail: 'Remove the bad effects, or all of them',
        group: 'Health and effects',
        fields: [
            choiceField(
                'which',
                'Which effects',
                [
                    { value: 'bad', label: 'Only the bad ones' },
                    { value: 'all', label: 'All of them' },
                ],
                'bad'
            ),
            ...appliesTo('self'),
        ],
        describe: (values) =>
            textOf(values, 'which') === 'all'
                ? `Clear every effect on ${whom(values)}`
                : `Clear bad effects on ${whom(values)}`,
        run: (ctx, values) => {
            const all = textOf(values, 'which') === 'all';
            for (const entity of subjects(ctx, values)) {
                for (const effect of entity.getEffects()) {
                    const id = effect.typeId.replace('minecraft:', '');
                    if (all || BAD_EFFECTS.has(id)) {
                        entity.removeEffect(effect.typeId);
                    }
                }
            }
        },
    },
    {
        type: 'heal',
        label: 'Heal',
        detail: 'Give health back',
        group: 'Health and effects',
        fields: [
            numberField('amount', 'Health, in half hearts', 1, 40, 1, 4),
            ...appliesTo('self'),
        ],
        describe: (values) =>
            `Heal ${whom(values)} by ${numberOf(values, 'amount')}`,
        run: (ctx, values) => {
            for (const entity of subjects(ctx, values)) {
                heal(entity, numberOf(values, 'amount'));
            }
        },
    },
    {
        type: 'extinguish',
        label: 'Put out fire',
        detail: 'Stop you or others from burning',
        group: 'Health and effects',
        fields: [...appliesTo('self')],
        describe: (values) => `Put out fire on ${whom(values)}`,
        run: (ctx, values) => {
            for (const entity of subjects(ctx, values)) {
                entity.extinguishFire(true);
            }
        },
    },
    {
        type: 'xp',
        label: 'Give XP',
        detail: 'Experience points for you',
        group: 'Health and effects',
        fields: [numberField('amount', 'XP points', 1, 100, 1, 5)],
        describe: (values) => `Give ${numberOf(values, 'amount')} XP`,
        run: (ctx, values) => {
            ctx.holder.addExperience(numberOf(values, 'amount'));
        },
    },
    {
        type: 'lightning',
        label: 'Lightning',
        detail: 'Strike lightning',
        group: 'Summon',
        fields: [whereField()],
        describe: (values) =>
            textOf(values, 'at') === 'self'
                ? 'Strike lightning on you'
                : 'Strike lightning',
        run: (ctx, values) => {
            ctx.dimension.spawnEntity(
                'minecraft:lightning_bolt',
                place(ctx, values)
            );
        },
    },
    {
        type: 'explosion',
        label: 'Explosion',
        detail: 'Blow something up',
        group: 'Summon',
        fields: [
            numberField('power', 'Power', 1, 8, 1, 2, { ceiling: 32 }),
            flagField('breaksBlocks', 'Breaks blocks', false),
            flagField('causesFire', 'Starts fires', false),
            whereField(),
        ],
        describe: (values) =>
            `Explode at power ${numberOf(values, 'power')}${flagOf(values, 'breaksBlocks') ? ', breaking blocks' : ''}`,
        run: (ctx, values) => {
            ctx.dimension.createExplosion(
                place(ctx, values),
                numberOf(values, 'power'),
                {
                    breaksBlocks: flagOf(values, 'breaksBlocks'),
                    causesFire: flagOf(values, 'causesFire'),
                    source: ctx.holder,
                }
            );
        },
    },
    {
        type: 'spawn',
        label: 'Spawn a mob',
        detail: 'Any mob, a few at a time',
        group: 'Summon',
        fields: [
            {
                kind: 'text',
                key: 'mob',
                label: 'Mob id',
                default: 'minecraft:zombie',
                example: 'minecraft:wolf',
                maxLength: 64,
                check: 'entity',
            },
            numberField('count', 'How many', 1, 8, 1, 1, { ceiling: 64 }),
            whereField(),
        ],
        describe: (values) =>
            `Spawn ${numberOf(values, 'count')} ${idToName(textOf(values, 'mob'))}`,
        run: (ctx, values) => {
            const at = place(ctx, values);
            for (let i = 0; i < numberOf(values, 'count'); i++) {
                ctx.dimension.spawnEntity(textOf(values, 'mob'), at);
            }
        },
    },
    {
        type: 'sound',
        label: 'Sound',
        detail: 'Play a sound',
        group: 'Sound and text',
        fields: [
            presetText('sound', 'Sound id', SOUNDS, 'mob.blaze.shoot'),
            numberField('volume', 'Volume', 0.1, 4, 0.1, 1),
            numberField('pitch', 'Pitch', 0.5, 2, 0.1, 1),
            whereField(),
        ],
        describe: (values) => `Play ${textOf(values, 'sound')}`,
        run: (ctx, values) => {
            ctx.dimension.playSound(
                textOf(values, 'sound'),
                place(ctx, values),
                {
                    volume: numberOf(values, 'volume'),
                    pitch: numberOf(values, 'pitch'),
                }
            );
        },
    },
    {
        type: 'particle',
        label: 'Particle',
        detail: 'Show a particle',
        group: 'Sound and text',
        fields: [
            presetText(
                'particle',
                'Particle id',
                PARTICLES,
                'minecraft:heart_particle'
            ),
            whereField(),
        ],
        describe: (values) => `Show ${textOf(values, 'particle')}`,
        run: (ctx, values) => {
            const at = place(ctx, values);
            ctx.dimension.spawnParticle(textOf(values, 'particle'), {
                x: at.x,
                y: at.y + 1,
                z: at.z,
            });
        },
    },
    {
        type: 'message',
        label: 'Message',
        detail: 'Show yourself some text. {target}, {damage} and friends work',
        group: 'Sound and text',
        fields: [
            {
                kind: 'text',
                key: 'text',
                label: 'Text',
                default: '',
                example: '§cCritical hit on {target}!',
                maxLength: 120,
            },
            choiceField(
                'where',
                'Shown as',
                [
                    { value: 'actionbar', label: 'Action bar' },
                    { value: 'chat', label: 'Chat message' },
                    { value: 'title', label: 'Title' },
                ],
                'actionbar'
            ),
        ],
        describe: (values) => `Say "${textOf(values, 'text')}"`,
        run: (ctx, values) => {
            const text = fillIn(textOf(values, 'text'), ctx);
            switch (textOf(values, 'where')) {
                case 'chat':
                    ctx.holder.sendMessage(text);
                    break;
                case 'title':
                    ctx.holder.onScreenDisplay.setTitle(text);
                    break;
                default:
                    ctx.holder.onScreenDisplay.setActionBar(text);
            }
        },
    },
    {
        type: 'command',
        label: 'Run a command',
        detail: 'Any slash command. {x} {y} {z}, {player}, {target} and {block} get filled in',
        group: 'Sound and text',
        fields: [
            {
                kind: 'text',
                key: 'command',
                label: 'Command',
                default: '',
                example: 'say {player} struck at {x} {y} {z}',
                maxLength: 256,
                stripSlash: true,
            },
            ...appliesTo('target', 'Runs as'),
        ],
        describe: (values) =>
            `Run /${textOf(values, 'command')}${textOf(values, 'target') === 'self' ? '' : ` as ${whom(values)}`}`,
        run: (ctx, values) => {
            const command = fillIn(textOf(values, 'command'), ctx);
            for (const entity of subjects(ctx, values)) {
                entity.runCommand(command);
            }
        },
    },
];

export const ACTIONS: readonly ActionDefinition[] = [
    ...GENERAL,
    ...MINING_ACTIONS,
];

export function actionFor(type: string): ActionDefinition | undefined {
    return ACTIONS.find((action) => action.type === type);
}
