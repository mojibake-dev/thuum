# Validator audit: every refusal the server can emit, classed by ADR-063 decision 4

Read-only census, 2026-11-03 (playtest 41's root-cause plan, W2). Ref read: the fork's `origin/m4-turbo2-union-srv-3`
(35509f7a), by `git grep` and `git show`. ADR-063 decision 4: the server validates consistency only (two owners
colliding, item conservation, bounds that would break the world for the others); it does not check the owner's engine
against the record's idea of where the owner stands or what it may touch. This file is the audit's table; each
OWNER-CHECK row retires only with its replacing rule written first (the hand-off it guarded, its tie-break) and a
two-seat scenario of the collision itself.

Paths, relative to the fork:
- AL `skymp5-server/cpp/server_guest_lib/ActionListener.cpp`; PO `.../PartOne.cpp`; MA `.../MpActor.cpp`;
  MOR `.../MpObjectReference.cpp`; MV `.../MovementValidation.cpp`; RB `.../gamemode_events/ReadBookEvent.cpp`
- perks.rs `skymp-wire/crates/wire-rules/src/perks.rs`; val, codec, json, tx, bridge:
  `skymp-wire/crates/wire-{validate,codec,json,transport,bridge}/src/lib.rs`

## Counts

159 distinct E_ codes: 131 from gameplay rules, 28 from the wire layer.

| Class | Gameplay | Wire layer | Total |
| --- | --- | --- | --- |
| CONSISTENCY | 86 (5 only log and accept) | 28 | 114 |
| OWNER-CHECK | 26 (4 downgrade the action instead of refusing it) | 0 | 26 |
| R0-NUMBER | 9 | 0 | 9 |
| UNSURE | 10 | 0 | 10 |

Two owner-checks carry no E_ code, so a grep misses them: the snap-back on a 4096-unit jump or a cell change (MV:123-127)
and the "WorldSpace doesn't match" throw in CheckInteractionAbility (MOR:2576).

## OWNER-CHECK (26)

| Code | Verb | What it checks | Site |
| --- | --- | --- | --- |
| E_MOVE_SPEED | movement-speed | the actor's own ground-speed budget (660 u/s, burst 2048); snaps the player back | MV:139 |
| E_HIT_REACH | melee-reach | melee distance between the server's copies (162 + body + 256 slack) | AL:5814 |
| E_HIT_CONE | hit-cone | target outside 35 degrees (+45 slack) of the server's heading | AL:5825 |
| E_HIT_POWER | damage-flags | power flag with no start event seen in 3 s; the hit downgraded | AL:5776 |
| E_HIT_SNEAK | damage-flags | sneak flag while the server's IsSneaking is false; downgraded | AL:5781 |
| E_HIT_BASH | blocking | bash with no start event seen; downgraded | AL:5786 |
| E_HIT_RANGE | marksman | arrow hit farther than any recorded shot could have flown yet | AL:5846 |
| E_HIT_WEAPON | npc-stream | a hosted NPC swings a weapon its record's hands lack; the hit dropped | AL:5877 |
| E_SPELL_RANGE | spell-cast | spell hit beyond the cast's reach + 256 | AL:5590 |
| E_SPELL_ORIGIN | spell-cast | launch point beyond the ray + 512 of the server position; launch stripped, cast kept | AL:5972 |
| E_SHOT_ORIGIN | marksman | bow launch more than 512 u from the server position | AL:4701 |
| E_SHOUT_RECOVERY | shouts | a shout before the server-clock cooldown ends (400 ms skew) | AL:1516 |
| E_ACTIVATE_REACH | activation-reach | first activation beyond 452 u + the target's bounds | AL:2125 |
| E_CONTAINER_CELL | containers | a put or take from another cell or world | AL:1973 |
| E_CONTAINER_REACH | containers | a put or take beyond activation reach | AL:1983 |
| E_CLAIM_REACH | npc-talk | a dialogue claim from another cell, or beyond reach of the NPC record | AL:750, :757 |
| E_LOCK_REACH | locks | a lock report from another cell or out of reach | AL:3786 |
| E_WORDWALL_CELL | word-wall | the reporter in a different cell from the wall | AL:3416 |
| E_WORDWALL_REACH | word-wall | outside the trigger primitive and out of reach | AL:3435 |
| E_MARKER_NONE | map-markers | no marker of that type within 8000 u of the server position | AL:2464 |
| E_EFFECTS_NO_EAT | learned-effects | ingredient effects reported with no matching eat in the last 10 s | AL:2533 |
| E_PLACED_RANGE | spell-placed-object | a placed object outside 64 to 320 u on the ground or 256 dz of the caster (Raise Wall's band) | PO:3390 |
| E_PROP_STEP | prop-physics | the owner's sample over the 6000 u/s step budget (floor 128, first sample 3000) | AL:3920 |
| E_DEATH_UNCHECKED | npc-fate | the host's NPC death with no hit (3 s), fall (200 u) or hazard (512 u, 5 s) the server saw | AL:4149 |
| E_DEATH_FAR | npc-fate | the body more than 2048 u from the record | AL:4128 |
| E_DEATH_IMMORTAL | npc-fate | the server's MayDie (essential, protected) overrides the host's death | AL:4121 |

The ten most likely to refuse ordinary two-player play, in retirement order:
1. E_HIT_REACH: PvP melee is measured between two server copies each up to 130 ms old; latency plus a sprint pushes a
   real swing past the slack.
2. E_HIT_CONE: at close range, circling or strafing swings the computed bearing past 80 degrees.
3. E_MOVE_SPEED (with the codeless snap-back): everyone, all the time; Whirlwind Sprint, a throw by the other player's
   attack or shout, and lag bursts snap players back.
4. E_DEATH_UNCHECKED: an NPC the guest killed through a refused hit, damage over time, poison or a prop dies on the host
   and stays alive on the server.
5. E_SPELL_RANGE: a moving target measured against reach from the cast position refuses hits the caster's engine landed.
6. E_HIT_POWER: a late or lost start event turns a real power attack into a plain hit.
7. E_HIT_WEAPON: the host's NPCs cannot damage the guest while the record's hands lag the host's outfit roll.
8. E_ACTIVATE_REACH: a corpse, door or prop the guest sees in one place while the record holds another.
9. E_CONTAINER_REACH: in co-op looting, items bounce back when the looter's or the corpse's server copy drifts.
10. E_SHOUT_RECOVERY: delivery skew over 400 ms, or an unreported change to the recovery multiplier, refuses an on-time
    shout (it happened in playtest fifteen).

Where a check sits on a hit between two players, ADR-063 keeps the server's damage NUMBER (R0); whether the hit's
acceptance is a consistency question or the owner's goes to Eli as one decision memo before those rows retire.

## R0-NUMBER (9)

| Code | Verb | What it checks | Site |
| --- | --- | --- | --- |
| E_SHOUT_UNKNOWN | shouts | the shout in the voice slot is not in the server's shout record | AL:1510 |
| E_SHOUT_WORD | shouts | a needed word is not unlocked in the server record | AL:1514 |
| E_HEADSHOT_HELMET, _RACE, _ARCHERY | headshot | the server's kill rule: the victim's helmet, the race list, the shooter's Archery floor | AL:5661-5663 |
| E_PERK_POINTS, _PREREQ, _SKILL, _LEVEL | perks | a perk pick against the server's points, HasPerk, actor-value and level conditions | perks.rs:363-366 |

## UNSURE (10)

| Code | Verb | Why unsure | Site |
| --- | --- | --- | --- |
| E_APPEARANCE_RACE | character-creation | a race not offered or permitted: an admin policy, not consistency | AL:1219 |
| E_REST_OFF, E_DEATH_OFF | rest, npc-fate | a feature switched off in config (policy) | AL:2237, :4086 |
| E_QUEST_DENIED, E_QUEST_UNLISTED | quest-stage | a quest the world's config does not share (policy) | AL:3128, :3133 |
| E_REST_FIGHTING | rest | mixed: a fight with another player (likely keep) and a 10 s own-hit window (an owner-check) | AL:2241 |
| E_EQUIP_REFUSED | npc-stream | a hosted NPC's whole worn set refused for one item the record lacks: disputes the host's own outfit roll | AL:1799 |
| E_TRAP_ACTIVATE | traps | catch-all for whatever Activate throws (worldspace mismatch, parent-only activation) | AL:3707 |
| E_CONDITION_UNKNOWN, E_PERK_CONDITION | magic-effects, perks | the server's evaluator lacks the condition function: a coverage gap | MA:3914, perks.rs:367 |

## CONSISTENCY (114)

| Codes | Verb | What they check | Sites |
| --- | --- | --- | --- |
| E_PROP_UNKNOWN, _KIND, _RANGE, _HELD, _NOT_OWNER, _CELL | prop-physics | an unknown or non-item reference; touch above 3 or a non-finite transform; grabbed by another player; a sample from a non-owner; E_PROP_CELL now only for a record or sample in no cell | AL:3262-3298, :3872-3916 |
| E_CLAIM_NO_ACTOR, _NONE, _NPC, _DEAD, _COMBAT, _HELD, _UNLOADED | npc-talk | unknown actor; release with no claim; a player's actor; dead; the host reports it fighting; held by another; the claimant has not loaded the cell | AL:722-777 |
| E_SPEECH_OWN, E_STATE_OWN, E_CAST_FORM | npc-stream | a host-only message sent for one's own actor; a hosted cast of a non-spell | AL:646, :811, :6066 |
| E_EQUIP_UNKNOWN_SPELL, _UNKNOWN_WEAPON, E_CAST_UNKNOWN, E_SHOT_QUIVER | npc-stream, marksman | logged and accepted: the hosted actor's spell, weapon or ammo is not in the record | AL:1601, :1837, :6072, :4712 |
| E_OBJANIM_RANGE, _NO_REF, _ACTOR, _NO_CELL, _NOT_HOST, _RATE | traps | bad reference or event; unknown; an actor; unknown cell; the reporter does not host the cell; over 8/s | AL:3466-3524 |
| E_TRAP_NO_REF, _NO_CELL, _NOT_HOST, _UNLINKED, _RATE | traps | unknown reference or cell; not the host; the pair not linked in the game files; over 8/s | AL:3651-3691 |
| E_LOCK_NO_REF, _OPEN, _KEY, _NO_PICK, _RANGE, _RATE, _UNKNOWN | locks | unknown; not locked; key-only lock; no lockpick held; broken-pick count out of range; report gap; fallback | AL:3748-3791 |
| E_ACTIVATE_LOCKED | locks | locked with no key: the player's game is prompted to pick | MOR:1869 |
| E_CONTAINER_BUSY | containers | an exclusive container already held by another opener | MOR:2020 |
| E_DEATH_NO_ACTOR, _PLAYER, _NOT_HOST, _NO_KILLER, _SCRIPT, _CAUSE | npc-fate | unknown actor; a player's actor; the reporter is not the simulator; unknown killer; a script kill is the server's; cause out of range | AL:4093-4231 |
| E_SHOT_NO_BOW, _NO_ARROW | marksman | bow or arrow not in the server inventory | AL:4664, :4670 |
| E_SPELL_NO_CAST, E_SPELL_TICK | spell-cast, second-hand | a hit with no recorded cast; a repeat hit from a passive area effect on the same target within 400 ms | AL:5591, :5711 |
| E_HIT_NO_SHOT, E_HEADSHOT_NO_SHOT | marksman, headshot | a hit with no recorded shot (17 s); a headshot with no claimed bow hit (1.5 s) | AL:5847, :5664 |
| E_SHOUT_SPELL | shouts | the spell is not a variation of the shout | AL:1512 |
| E_WORDWALL_NO_REF, _NOT_A_WALL | word-wall | unknown reference; teaches no word | AL:3393, :3400 |
| E_REST_HOURS, _DEAD, E_REST | rest | hours outside 1 to 24; the server holds the player dead; fallback | AL:2235-2243 |
| E_QUEST_UNKNOWN, _STAGE, _OWN_START, _FULL | quest-stage | not a quest; stage not defined; a start-game quest stays the seat's own; the 4096 cap | AL:3104-3179 |
| E_RACEMENU_PARTS, _CLOSED | racemenu-sync | unknown or forbidden head part; the race menu not opened by the server | AL:2707, :2715 |
| E_EFFECTS_FORM | learned-effects | not an ingredient | AL:2518 |
| E_POISON_NOT_HELD, _NO_WEAPON, _ALREADY | poison | poison or weapon not held; weapon already poisoned | MA:822-858 |
| E_SKILL_NONE, _NAN, _RANGE, _UNKNOWN, _NO_RECORD, _SET_NO_COST, E_BOOK_SKILL | leveling | not a skill; NaN or out-of-range amount; no record yet; SET_NO_COST only logs; the book teaches no skill | PO:3219-3290, MA:1632, RB:81 |
| E_PERK_UNKNOWN, _HIDDEN, _OWNED, _FULL, _NO_RECORD | perks | unknown or unplayable; already owned; the perk cap; no record yet | perks.rs:359-362, PO:5123 |
| E_PLACED_SET, _LATE, _BASE, _REPEAT, _NAN, _UNKNOWN | spell-placed-object | no such request; after the 6 s window; base not named; duplicate; NaN; fallback | PO:3380-3392 |
| E_VAL_SCHEMA_VERSION, _NONFINITE, _OUT_OF_WORLD, _RATE, _ZERO_DELTA, _SEQ_REPLAY, _RANGE | validation (wire) | schema version, NaN, a position beyond 1e6, per-message rate budgets, zero delta, replay, field ranges | val:23-41 |
| E_WIRE_TOO_LONG, _MALFORMED, _TRAILING, _NONCANONICAL, _CAPACITY | validation | binary message size and shape | codec:21-35, wire-schema/src/bounded.rs:29 |
| E_JSON_TOO_LONG, _SYNTAX, _NO_TYPE, _UNKNOWN_TYPE, _SHAPE, _NO_FORM, _NONFINITE | validation | the legacy JSON shape | json:32-56 |
| E_TX_LIMIT, _DIRECTION, _PASSWORD, _TOKEN, _BIND, _ENCODE, _NO_CLIENT; E_BRIDGE_ADDR, _BIND | transport | size budget, a server-to-client message from a client, connection admission; the rest startup or internal faults | tx:37-111, bridge:125-126 |

## Left out of the 159

- E_CLIENT_* (14 codes): emitted by the game client (wire-client-ffi), not the server; E_RACE_PERMIT and
  E_SHOUT_FROM_HIT are client-side too.
- E_VAL_WORLD and E_VAL_FINITE: doc-comment typos (wire-schema/src/skymp.rs:1585-1586), never emitted.
- E_SHOT_EQUIPMENT: retired, in a comment at AL:1554. E_PROP_REACH: retired at 85b6c096, in the comment at AL:3243.
- Named in docs but absent from server code: E_MOD_LOCK* (lab tooling), E_MARKER_RATE and _TYPE, E_TRAPHIT_RANGE,
  E_COMMAND_UNLOADED, E_PVE_FILE.
