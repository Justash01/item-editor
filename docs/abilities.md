# Abilities

Abilities make an item do something on its own: a sword that calls lightning,
boots that give night vision, a pickaxe that mines the whole vein and smelts it
on the way into your inventory. For the rest of the editor, see the
[editor guide](editor.md).

## Contents

- [How an ability works](#how-an-ability-works)
- [Triggers](#triggers)
- [Steps](#steps)
- [Mining](#mining)
- [Conditions and costs](#conditions-and-costs)
- [The menus](#the-menus)
- [Stackable items](#stackable-items)
- [Writing them by hand](#writing-them-by-hand)
- [What they can't do](#what-they-cant-do)

## How an ability works

Open an item in the editor and pick **Abilities**, or jump straight there:

```
/jstash:editor @s mainhand abilities
```

An ability is one trigger, some optional conditions, and up to eight steps. The
trigger decides when it fires, the conditions decide whether it's allowed to,
and the steps are what actually happens, in order. An item can hold up to 16
abilities.

Chance, cooldown and costs belong to the whole ability, not to a step. That's
the reason to use steps at all. "25% chance: lightning and a thunder sound" as
one ability with two steps gives you both together a quarter of the time. As
two separate abilities they'd roll on their own, and you'd hear thunder with no
lightning. Steps can also wait before they run, so one can pull mobs in and the
next can launch them a second later.

If the parts should always happen together, make them steps. If each one
should decide for itself, make them separate abilities.

## Triggers

| Trigger | Fires | "Target" is |
| --- | --- | --- |
| On hit | when a hit from the item actually lands | whatever you hit |
| On kill | when you kill something while holding it | what died |
| On arrow hit | when something shot or thrown from it lands | whatever it hit, if anything |
| When hurt | when a mob or player hits you while you hold or wear it | the attacker |
| On use | when you right-click or tap with it | the mob you're looking at |
| On right-click mob | when you right-click a mob or player with it | the one you clicked |
| On eat | when you finish eating or drinking it | |
| While held | twice a second while it's in your main hand | |
| While worn | twice a second in an armor slot or your off hand | |
| While using | twice a second while you draw, aim, block or eat with it | |
| On jump | when you press jump while holding or wearing it | |
| On sneak | when you start sneaking while holding or wearing it | |
| On mine | when you break a block with it | |
| On break | when it runs out of durability | |

**On hit** only counts hits that do damage, so spam-clicking a mob during its
invulnerability frames doesn't fire it every click.

Hit, kill and hurt only count melee and projectile damage. Damage that
abilities cause themselves, like an explosion, lightning or **Deal damage**,
never sets another ability off.

**On arrow hit** covers anything with a projectile: bows, crossbows, tridents,
snowballs, eggs. The item is whatever you were holding when it was fired, so
switching items mid-flight doesn't change which abilities go off.

**On use** aims where you're looking, up to the [reach](editor.md#settings)
setting (12 blocks unless you change it). Looking at a block puts things in the
empty space in front of the face you're looking at, so a spawned mob lands on
top of a block or beside a wall rather than inside it. Looking at the sky puts
them out in the air at full reach.

**On eat** fires upon eating any food item, works for drinks too such as potions. Give
it a cooldown and the item can't be eaten again until the cooldown is up. Food is stackable, so make sure turn on
[stackable items](#stackable-items) first.

**While using** only works on items that have a use animation: bows,
crossbows, tridents, spyglasses, goat horns, brushes, food and potions. Something like a sword or a stick is never "in use", and
neither is a shield. For a shield use
While worn (off hand) or While held with **Only while sneaking**, the way the
Shield wall template does.

**On jump** fires on every press, in the air too, which is what double jump
boots need. Pair it with **Standing: only in the air** so the normal jump off
the ground doesn't count. **On jump** and **On sneak** go off for the main hand
and everything worn.

**On break** fires when the item wears out from use. `/clear`, dropping it or
dragging it around the inventory don't count. If you carry two identical
copies and one breaks, it may not fire.

## Steps

Most steps have an **Applies to** option: you, the target, every mob or
player near you, or every mob around the target. The last one is the splash
damage option, and on an arrow that misses it centers on where the arrow
landed. Picking anything with a radius shows a radius slider. The target
options only appear for triggers that have one.

**Combat and movement**
- **Deal damage** on top of the hit.
- **Lifesteal** heals you a share of the damage dealt. On hit only.
- **Set on fire**, **Knockback**, **Pull in** and **Launch up**. Knockback
  pointed at yourself throws you forward instead.
- **Blink** teleports you a few blocks the way you face, stopping short of
  walls.
- **Smash damage** adds damage for every block you fell before the hit, like a
  mace, with the mace's own smash sound. On hit only. Set **Falling at least**
  in the conditions so it doesn't fire standing still.
- **No fall damage** cancels your next landing's damage, as long as it happens
  within a few seconds. Mace-style hits and double jumps want this.
- **Shoot a projectile**: an arrow, a flaming arrow, a snowball, an egg, a
  bottle o' enchanting, a wind charge, or any entity id you type in. It's fired
  as yours, so kills count for you.

**Health and effects**
- **Potion effect** with a level and duration.
- **Clear effects**, either the bad ones or all of them.
- **Heal**, **Put out fire** and **Give XP**.

**Summon**
- **Lightning**, **Explosion** (optionally breaking blocks or starting fires)
  and **Spawn a mob**. Each can happen where the trigger happened or on you.

**Tags and scores**
- **Tag** adds or removes a tag, for commands or other abilities to check.
- **Score** adds to, takes from or sets a scoreboard score. The objective is
  made if it doesn't exist yet. Adding can stop at a cap, so a mana bar can
  refill without going past 100.
- **Score bar** shows one of your scores in the action bar as a bar, like
  `Mana |||||||||| 50/100`, filled up to whatever number you call full.

**Sound and text**
- **Sound** and **Particle**, each with a pick list or any id you like.
- **Message** to the action bar, chat or a title.
- **Run a command**, as you, the target or everyone nearby.

Messages and commands fill in a few placeholders:

| Placeholder | Becomes |
| --- | --- |
| `{player}` | your name |
| `{target}` | the target's name |
| `{x}` `{y}` `{z}` | where it happened |
| `{block}` | the block you mined |
| `{damage}` | the damage dealt or taken |

Commands run with the add-on's own permissions, whoever is holding the item.
Only operators can put abilities on items, but anyone can use one once it
exists, so treat a command ability like a command block you're handing out.
**Allow command steps** in `/jstash:settings` turns them all off at once if
you'd rather not.

## Mining

Three steps only show up for On mine, and they're where most of the fun is.

**Mine more blocks** breaks a 3x3 facing you, a 3x3x3 cube, or everything
connected of the same kind: a whole ore vein, or a whole tree. Fortune and
Silk Touch apply to every block. By default each extra block costs a point of
durability. If the ability only fires on certain blocks (say ores), the extra
blocks have to match too, so a 3x3 ore pickaxe won't chew through the stone
around the vein.

It never breaks bedrock, barriers, portals, command and structure blocks,
light blocks, or anything with an inventory, and it does nothing in Adventure
mode.

**Replace the block** puts something back where the broken block was: the same
block again (after a delay, if you want regrowing ore), a freshly replanted
crop, or a block of your choice. If something else has taken the spot by then,
or the chunk isn't loaded, it's skipped.

**Change the drops** smelts them, sends them straight to your inventory, does
both, or destroys them. It covers the extra blocks from **Mine more blocks**
too, even when that step lives in a different ability on the same item. So a
vein miner and a magnet on one pickaxe work together the way you'd hope.

## Conditions and costs

Each ability has a **Conditions and costs** screen.

| Setting | Does |
| --- | --- |
| Sneaking | Doesn't matter, only while sneaking, or only when not |
| Only against | Anything, players, mobs, or one kind of mob. Triggers with a target |
| Standing | On the ground or in the air |
| Falling at least | Blocks fallen before the hit. On hit |
| In water | In or out of water |
| Time of day | Sunrise, day, around noon, sunset, night or around midnight |
| Dimension | Overworld, Nether or End |
| Your health at most | Percent of your max health |
| Target health at most | Percent of the target's max health. Triggers with a target |
| Tag | Only with, or only without, a tag |
| Score | Compares a scoreboard score, yours or the target's (see below) |
| Only when mining | Any block, ores, logs and stems, crops, or a list you type. On mine |
| Chance | Percent of the time it fires |
| Cooldown | Seconds before it can fire again, per player |
| Fires every | Seconds between firings. While held, worn and using |
| Only every Nth time | Counts each time it could fire and goes off on every Nth |
| Steps | All of them in order, or one picked at random |
| Durability per use | Wears the item each time it fires |
| XP levels per use | Won't fire without enough levels |
| Costs score points | Takes points from an objective, and won't fire without them |
| Uses up an item | Takes items from your inventory, like ammo |
| Uses up one of the stack | On use only |
| Tell me when it's not ready | Shows "Ready in 2.5s", "Needs 3 levels" or "Needs 10 mana" on the action bar. On use, eat and right-click mob |

Sneaking is handy for putting two abilities on one item: right-click to dash,
sneak and right-click for something else. Costs are skipped in Creative.

The score condition can check that a score is at least, at most, more than,
less than, exactly or anything but a number; between two numbers or outside
them; higher than, lower than or the same as another of the same player's
scores (mana against max_mana, say); or just whether there's a score at all.
On triggers with a target it can check the target's score instead of yours.
Nobody on the scoreboard yet counts as 0, except for "Has a score at all" and
"Has no score yet", which tell the two apart. Score costs
and **Score** steps together make mana: a held ability that adds a point a
second up to 100, and a use ability that costs 10. The Mana regen template
shows a **Score bar** as well, so you can see it fill.

Times of day follow `/time set`: sunrise is 23000 to 24000, day 0 to 12000,
noon 5000 to 7000, sunset 12000 to 13000, night 13000 to 23000 and midnight
17000 to 19000. Noon falls inside day, and midnight inside night.

**Only every Nth time** counts after the cooldown and before the chance roll,
and the count is per player.

## The menus

The ability list groups everything by trigger. Abilities you've turned off are
grayed out. **From a template** starts from one of 30 ready-made ones:

| Trigger | Templates |
| --- | --- |
| On hit | Thunder strike, Lifesteal, Venom, Third strike, Execute, Mace smash, Wind burst |
| On kill | Reaper |
| On arrow hit | Explosive arrows |
| When hurt | Thorns |
| On use | Mana bolt, Fire charge wand, Dash, Blink, Fire wand |
| On right-click mob | Healing staff |
| On eat | Golden head |
| While held / worn / using | Mana regen, Swiftness, Night vision, Shield wall |
| On jump / sneak | Double jump, Sneak dash |
| On mine | Hammer, Vein miner, Tree feller, Auto smelt, Magnet, Replant, Ore regrowth |

Mana bolt and Mana regen go together on one item, or on two.

Each ability gets its own screen with its steps, **Add a step**,
**Conditions and costs**, **Try it**, **Turn off**, **Duplicate**, **Copy**,
**Save as a template** and **Remove**. **Try it** closes the menu and runs the
ability once where you're looking, ignoring chance, cooldown and costs. Mining
steps, smash damage and lifesteal are left out.

**Save as a template** puts it on the world's own list, which shows above the
built-in ones for everyone. Saving under a name that's already there replaces
it, and the list holds 32.

**Copy** (or **Copy all abilities** on the list) and **Paste abilities** move
abilities between items without touching names, lore or enchantments the way
the item clipboard would. Pasting adds to what's already there.

**Write abilities into lore** adds gray lines under the existing lore, one per
step, like "On hit: Strike lightning" and "then Explode at power 2". Long
ones wrap onto a second line. Lore holds 20 lines in all, so an item with a lot of steps may not
fit. After that the lines follow the abilities on their own, whether you
change them in the menu, with `/jstash:set` or by pasting, until
**Remove ability lore** takes them off. Lore you wrote yourself is left alone.

If an ability isn't going off and you can't see why, turn on
**Explain skipped abilities** in `/jstash:settings`. The action bar then says
what stopped it: "On hit skipped: not sneaking", the cooldown, a missed chance,
a cost you can't pay. Leave it off otherwise, held and worn abilities keep it
busy.

Forms only show what applies, and if something doesn't check out (a mob id
that doesn't exist, say) the form comes back with what you typed and the reason
at the top.

Numbers use sliders with sensible ranges. **Type any number** in
`/jstash:settings` swaps them for text boxes, so you can go past those ranges.
Very large values can lag the game or make it stop responding, so raise them a
bit at a time. A few stop early no matter what:

| Field | Stops at |
| --- | --- |
| Effect level | 256 |
| Explosion power | 32 |
| Mobs spawned at once | 64 |
| Radius | 64 blocks |
| Whole vein or tree | 1024 blocks |
| Blink | 128 blocks |
| Chance | 100% |

Everything else goes up to a million. A value past the slider's range, set with
the setting on or written by hand, shows as a text box even with the setting
off, so saving never quietly lowers it.

## Stackable items

Abilities on items that stack are off until you turn on **On stackable items**
in `/jstash:settings`.

With it on, their abilities are saved on the world, and the item shows one
blank line at the bottom of its tooltip. That's the only visible difference.
The lore editor, `/jstash:lore` and exports never show that line, and it takes
one of the 20 lore lines.

A few things follow from that:

- **Every item in a stack is the same item.** Editing a stack of 16 changes all
  16, and the menu says so. Split the stack and both halves keep their
  abilities.
- **Items only stack if their abilities match**, since their lore has to match.
  Change one half of a split stack and the halves won't merge again.
- **Identical abilities share one save.** Granting the same kit a hundred times
  doesn't pile up data.
- **Old versions stay behind.** After an edit, the previous version is kept,
  because some copy in a chest might still use it. A world holds up to 512 of
  these. Past that, saving a new set is refused.
- **Placed blocks lose them.** A block item with abilities keeps nothing once
  it's placed, the same as its name and lore.

Turning the setting off stops abilities on stackable items from firing. Nothing
is deleted, and turning it back on brings them back.

## Writing them by hand

Abilities are the `abilities` property, so they work anywhere the others do:
`/jstash:set`, `/jstash:grant`, kits, the clipboard and
[item data documents](commands.md#item-data-documents).

```
/jstash:grant @s minecraft:netherite_axe 1 "{name:'§bStorm Axe',abilities:[{trigger:'hit',chance:25,action:'lightning'},{trigger:'use',cooldown:6,do:[{action:'lightning'},{action:'sound',sound:'ambient.weather.thunder'}]}]}"
```

Each ability is an object with a `trigger`, any of the settings below, and its
steps in `do`. With a single step you can skip `do` and put the step's keys
straight on the ability, which is what the on-hit one above does. Anything left
out takes its default. `enabled:false` turns an ability off, and `id` is added
on its own to keep cooldowns apart.

Triggers are `hit`, `kill`, `shoot`, `hurt`, `use`, `interact`, `eat`, `held`,
`worn`, `using`, `jump`, `sneak`, `mine` and `break`.

**Ability settings**

| Key | Default | Values |
| --- | --- | --- |
| `sneak` | `'any'` | `any`, `only`, `never` |
| `victims` | `'any'` | `any`, `players`, `mobs`, `type` |
| `victimType` | `'minecraft:zombie'` | a mob id, with `victims:'type'` |
| `ground` | `'any'` | `any`, `ground`, `air` |
| `fall` | `0` | blocks, On hit only |
| `water` | `'any'` | `any`, `only`, `never` |
| `time` | `'any'` | `any`, `sunrise`, `day`, `noon`, `sunset`, `night`, `midnight` |
| `dimension` | `'any'` | `any`, `overworld`, `nether`, `the_end` |
| `health` | `100` | percent |
| `targetHealth` | `100` | percent |
| `tagCheck` | `'any'` | `any`, `has`, `lacks` |
| `tag` | `'vip'` | with `tagCheck` |
| `scoreCheck` | `'any'` | `any`, `atleast`, `atmost`, `above`, `below`, `equals`, `not`, `between`, `outside`, `higher`, `lower`, `same`, `set`, `unset` |
| `scoreWho` | `'self'` | `self` or `target`, on triggers with a target |
| `scoreObjective` | `'mana'` | with `scoreCheck` |
| `scoreValue` | `10` | the number, or the low end for `between` and `outside` |
| `scoreMax` | `20` | the high end for `between` and `outside` |
| `scoreOther` | `'max_mana'` | the objective `higher`, `lower` and `same` compare with |
| `blocks` | `'any'` | `any`, `ores`, `logs`, `crops`, `list` |
| `blockList` | `'minecraft:stone'` | block ids, comma separated, with `blocks:'list'` |
| `chance` | `100` | 1 to 100 |
| `cooldown` | `0` | seconds |
| `interval` | `0.5` | seconds, held, worn and using |
| `every` | `1` | fires on every Nth time |
| `pick` | `'all'` | `all`, `one` |
| `durability` | `0` | per use |
| `levels` | `0` | XP levels per use |
| `payScore` | `false` | with `costObjective:'mana'` and `scoreCost:10` |
| `payItem` | `false` | with `ammo:'minecraft:arrow'` and `ammoCount:1` |
| `consume` | `false` | On use only |
| `notice` | `true` | On use, eat and interact |

**Steps.** Every step takes `action` and an optional `delay` in seconds.
`target` is `self`, `target`, `mobs`, `players` or `around` (mobs around the
target), and `radius` goes with the last three. It defaults to the target where the trigger has one, and to you
otherwise, except for the steps marked "you" below. `at` is `event` or `self`.

| `action` | Keys and defaults |
| --- | --- |
| `damage` | `amount:4`, `target` |
| `smash` | `perBlock:2`, `max:40`, `sound:true`, `target` |
| `safefall` | `seconds:3` |
| `lifesteal` | `percent:20` |
| `fire` | `seconds:4`, `target` |
| `knockback` | `strength:1.5`, `target` |
| `pull` | `strength:1.5`, `target` |
| `launch` | `strength:1`, `target` |
| `blink` | `distance:6` |
| `projectile` | `projectile:'arrow'` (or `snowball`, `egg`, `xp_bottle`, `wind_charge_projectile`, `flaming_arrow`, `custom`), `custom` for your own id, `speed:2` |
| `effect` | `effect:'speed'`, `level:1`, `duration:10`, `particles:true`, `target` |
| `cleanse` | `which:'bad'` or `'all'`, `target` (you) |
| `heal` | `amount:4`, `target` (you) |
| `extinguish` | `target` (you) |
| `xp` | `amount:5` |
| `tag` | `mode:'add'` or `'remove'`, `tag:'marked'`, `target` (you) |
| `score` | `objective:'mana'`, `mode:'add'`, `'remove'` or `'set'`, `amount:1`, `cap:0`, `target` (you) |
| `bar` | `objective:'mana'`, `label:'Mana'`, `max:100`, `color:'b'` (a color code letter) |
| `lightning` | `at` |
| `explosion` | `power:2`, `breaksBlocks:false`, `causesFire:false`, `at` |
| `spawn` | `mob:'zombie'`, `count:1`, `at` |
| `sound` | `sound:'random.levelup'`, `volume:1`, `pitch:1`, `at` |
| `particle` | `particle:'minecraft:heart_particle'`, `at` |
| `message` | `text`, `where:'actionbar'`, `'chat'` or `'title'` |
| `command` | `command`, `target` |
| `area` | `shape:'3x3'`, `'3x3x3'` or `'vein'`, `limit:32`, `wear:true` |
| `replace` | `with:'regrow'`, `'replant'` or `'block'`, `block`, `after:0` |
| `drops` | `mode:'smelt'`, `'inventory'`, `'both'` or `'none'` |

Ids for effects, mobs, blocks and projectiles work with or without
`minecraft:`. Everything is checked before it's written, and a mistake names
the ability, the step and the field that's wrong.

## What they can't do

- **Some projectiles can't be shot.** Arrows, snowballs, eggs, splash potions,
  wind charges and bottles o' enchanting work. Fireballs, wither skulls, ender
  pearls and thrown tridents don't.
- **Holding right-click doesn't repeat On use.** **While using** covers bows,
  food and the like. For anything else,
  While held with **Only while sneaking** gets close: hold sneak and it keeps
  firing.
- **No new food.** On eat works on things that are already edible.
- **No cooldown bar on the hotbar**, except on items that already have one,
  like ender pearls.
- **Regrowing blocks need the chunk loaded.** A block set to come back after a
  minute won't if everyone has left the area by then.
- **Area mining ignores land claims** from other add-ons.
