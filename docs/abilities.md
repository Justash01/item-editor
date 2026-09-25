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
| While held | twice a second while it's in your main hand | |
| While worn | twice a second in an armor slot or your off hand | |
| On mine | when you break a block with it | |
| On break | when it runs out of durability | |

**On hit** only counts hits that do damage, so spam-clicking a mob during its
invulnerability frames doesn't fire it every click. It also knows how much
damage was dealt, which is what lifesteal feeds on.

Hit, kill and hurt only count melee and projectile damage. Damage that
abilities cause themselves, like an explosion, lightning or **Deal damage**,
never sets another ability off. That's deliberate: otherwise two players
wearing thorns-style armor would bounce damage between them forever.

**On arrow hit** covers anything with a projectile: bows, crossbows, tridents,
snowballs, eggs. The item is whatever you were holding when it was fired, so
switching items mid-flight doesn't change which abilities go off.

**On use** aims where you're looking, up to the [reach](editor.md#settings)
setting (12 blocks unless you change it). Looking at a block puts things in the
empty space in front of the face you're looking at, so a spawned mob lands on
top of a block or beside a wall rather than inside it. Looking at the sky puts
them out in the air at full reach.

**On break** is a best guess, because the game has no event for an item
breaking. It fires when a nearly spent item disappears from a slot right after
you used it. `/clear`, dropping it or dragging it around the inventory don't
count. If you carry two identical copies and one breaks, it reads as the item
being moved and won't fire.

## Steps

Most steps have an **Applies to** option: you, the target, or every mob or
player near you. Picking one of the "near you" options shows a radius slider.
The target option only appears for triggers that have one.

**Combat and movement**
- **Deal damage** on top of the hit.
- **Lifesteal** heals you a share of the damage dealt. On hit only.
- **Set on fire**, **Knockback**, **Pull in** and **Launch up**. Knockback
  pointed at yourself throws you forward instead.
- **Blink** teleports you a few blocks the way you face, stopping short of
  walls.
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

## Mining

Three steps only show up for On mine, and they're where most of the fun is.

**Mine more blocks** breaks a 3x3 facing you, a 3x3x3 cube, or everything
connected of the same kind: a whole ore vein, or a whole tree. The drops come
from the block's loot table using the tool in your hand, so Fortune and Silk
Touch still apply to every block. By default each extra block costs a point of
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
| Only against | Anything, players, mobs, or one kind of mob. Hit, kill, arrow hit and hurt |
| Only when mining | Any block, ores, logs and stems, crops, or a list you type. On mine |
| Chance | Percent of the time it fires |
| Cooldown | Seconds before it can fire again, per player |
| Durability per use | Wears the item each time it fires |
| XP levels per use | Won't fire without enough levels |
| Uses up one of the stack | On use only |
| Tell me when it's not ready | Shows "Ready in 2.5s" or "Needs 3 levels" on the action bar. On use only |

Sneaking is handy for putting two abilities on one item: right-click to dash,
sneak and right-click for something else. Costs are skipped in Creative.

## The menus

The ability list groups everything by trigger. Abilities you've turned off are
grayed out. **From a template** starts from one of 18 ready-made ones:

| Trigger | Templates |
| --- | --- |
| On hit | Thunder strike, Lifesteal, Venom |
| On kill | Reaper |
| On arrow hit | Explosive arrows |
| When hurt | Thorns |
| On use | Dash, Blink, Fire wand |
| While held / worn | Swiftness, Night vision |
| On mine | Hammer, Vein miner, Tree feller, Auto smelt, Magnet, Replant, Ore regrowth |

Each ability gets its own screen with its steps, **Add a step**,
**Conditions and costs**, **Try it**, **Turn off**, **Duplicate** and
**Remove**. **Try it** closes the menu and runs the ability once where you're
looking, ignoring chance, cooldown and costs. Mining steps and lifesteal are
left out, since they need a real break or a real hit.

Forms only show what applies, and if something doesn't check out (a mob id
that doesn't exist, say) the form comes back with what you typed and the reason
at the top.

Numbers use sliders with sensible ranges. **Type any number** in
`/jstash:settings` swaps them for text boxes, so you can go past those ranges.
Very large values can lag the game or make it stop responding, so raise them a
bit at a time. A few stop early no matter what:

| Field | Stops at |
| --- | --- |
| Effect level | 256 (the game's own limit) |
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

Items that stack can't carry hidden data the way tools and armor do, so
abilities on them are off until you turn on **On stackable items** in
`/jstash:settings`.

With it on, their abilities are saved on the world, and the item gets a lore
line made only of color codes that points at them. It shows as one blank line
at the bottom of the tooltip, and it's the only visible difference. The lore
editor, `/jstash:lore` and exports never show that line, and it takes one of
the 20 lore lines.

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

Triggers are `hit`, `kill`, `shoot`, `hurt`, `use`, `held`, `worn`, `mine` and
`break`.

**Ability settings**

| Key | Default | Values |
| --- | --- | --- |
| `sneak` | `'any'` | `any`, `only`, `never` |
| `victims` | `'any'` | `any`, `players`, `mobs`, `type` |
| `victimType` | `'minecraft:zombie'` | a mob id, with `victims:'type'` |
| `blocks` | `'any'` | `any`, `ores`, `logs`, `crops`, `list` |
| `blockList` | `'minecraft:stone'` | block ids, comma separated, with `blocks:'list'` |
| `chance` | `100` | 1 to 100 |
| `cooldown` | `0` | seconds |
| `durability` | `0` | per use |
| `levels` | `0` | XP levels per use |
| `consume` | `false` | On use only |
| `notice` | `true` | On use only |

**Steps.** Every step takes `action` and an optional `delay` in seconds.
`target` is `self`, `target`, `mobs` or `players`, and `radius` goes with the
last two. It defaults to the target where the trigger has one, and to you
otherwise, except for the steps marked "you" below. `at` is `event` or `self`.

| `action` | Keys and defaults |
| --- | --- |
| `damage` | `amount:4`, `target` |
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

- **Some projectiles won't spawn.** The game only lets scripts summon arrows,
  snowballs, eggs, splash potions, wind charges and bottles o' enchanting.
  Fireballs, wither skulls, ender pearls and thrown tridents are all refused.
- **Holding right-click doesn't repeat On use.** The game only reports holding
  jump and sneak, so an ability can't tell that the use button is still down.
  While held with **Only while sneaking** gets close: hold sneak and it keeps
  firing.
- **No cooldown bar on the hotbar.** That overlay only works on items that
  already have a vanilla cooldown, like ender pearls.
- **Regrowing blocks need the chunk loaded.** A block set to come back after a
  minute won't if everyone has left the area by then.
- **Area mining ignores land claims**, since other add-ons never see those
  blocks being broken.
