# Verb: shouts

## Intent

A player shouts the shouts it knows, with the words it has unlocked, no
sooner than its recovery allows, and every observer sees the shout; what a
player knows of shouts is the server's and follows it between sessions.

Roadmap reference: skymp/ROADMAP.md "Shouts" ("Ability to equip and cast
shouts. Learning words of power. Possibility to limit the study of words of
power, i.e. determine who is a Dovakin and who is not. Iteratively test and
add more and more shouts.")
Milestone: M2 (docs/PLAN.md M2 6)   Class: B
Scope of the first slice: the record (shouts known, words known and
unlocked), the cast (validated; observers see it through the animation
relay), the recovery, and the effects a shout's own spell already has a
path for (a damage spell's hits). The movement a shout causes was measured
against movement-speed's budget once (x-shout-probe: Whirlwind Sprint's
one word inside the burst) and is no assertion of this slice. Later slices, each its own when a playtest asks: Unrelenting
Force's push imposed on its victim (on stagger's impose path, docs/verbs/
stagger.md), unlocking a word with a dragon soul in the Magic menu, word
walls, who may learn words at all (the roadmap's "Dovakin").

### Sequences and combinations (ADR-033)

| sequence or combination | probe or scenario | result |
| --- | --- | --- |
| a second Fire Breath within three seconds of the first, in god mode | x-tgm-breath4 (four breaths at 0, 2.5, 4.9 and 24 s; its control confounded by c2's death at the third), x-tgm-breath5 (five at 0, 2, 4, 6, 10 s at a c2 with 100000 health) | RED on caff3e04 and a930968b: breaths two and three of breath4 010539 were drawn on c2 only because they hit it (reported from the hit); playtest nineteen's third session, 13 of 18 releases never reached the server. The fire-report build (35a3975f) is staged with breath5: five server lines and five cones expected |
| a shout while the voice recovery of the previous still runs (any mode) | none yet | open: the recovery read names no variation; the fire's source form should (35a3975f) |

## Authority

Rung: R0 for what a player knows and for its recovery; R1 for the cast.
- The record is the server's: the shouts a player has, the words it knows
  and the words it has unlocked, persisted with the player and applied to
  its game at login (as learned-effects applies what a player learned,
  docs/verbs/learned-effects.md). Only the server changes it: an admin's
  console command, a server Papyrus native a script calls.
- The cast is the caster's game's (the engine picks the variation by how
  long the shout key is held) and the server validates it: the voice slot
  holds the shout and the record has it, the cast's spell is one of its
  variations, every word up to that variation is unlocked in the server's
  record, and the last accepted shout's recovery has run out on the
  server's clock. A refused shout counts for nothing on the server (its
  hits are refused); no shout is relayed as a cast, accepted or not:
  observers see the figure's shoutStart through the animation relay.
- The recovery is the server's: the variation's recovery time times the
  caster's ShoutRecoveryMult (the actor-values record's base plus the
  running effects', 1 without either), from the accepted shout, kept per
  player across a reconnect and forgotten at a restart. The caster's own
  game runs its own (the HUD's), which the server reads only to learn the
  variation (Observe).
- A shout's effects follow the paths their effects already have: a damage
  spell's hits are spell-cast's (OnSpellHit, R0); the caster's own dash
  (Whirlwind Sprint) is a move under movement-speed's budget, permitted as
  cast-teleport permits a teleport's jump if the budget refuses it
  (docs/verbs/cast-teleport.md); a push on another player is a later slice.
Why not R0 for the cast: the engine chooses the variation from the key's
hold and launches the spell along the caster's aim; the server can bound
the choice (known, unlocked, recovered), not make it.
Rate limit / bounds: one accepted shout per recovery; spell-cast's own
bounds on casts.

## Engine surface

- The records (CommonLibSSE-NG include/RE/T/TESShout.h): a shout has three
  variations, each a word of power, a spell and a recovery time in seconds
  (TESShout::Variation, :34-41; variations[3], :69); a word of power is a
  form with its translation (include/RE/T/TESWordOfPower.h:34). Skyrim.esm,
  read with lab/esm.py on sky-srv (2026-10-10):
  - UnrelentingForceShout 0x13E07: words 0x13E22, 0x13E23, 0x13E24; spells
    0x13E09, 0x13F39, 0x13F3A; recovery 15, 20, 45;
  - WhirlwindSprintShout 0x2F7BA: words 0x2F7BB, 0x2F7BC, 0x2F7BD; spells
    0x2F7BE, 0x2F7BF, 0x2F7C0; recovery 20, 25, 35;
  - FireBreathShout 0x3F9EA: words 0x20E17, 0x20E18, 0x20E19; spells
    0x3F9EB, 0x3F9EC, 0x3F9ED; recovery 30, 50, 100;
  - 75 SHOU records in all, most of them creatures' and scenes' (dragons',
    the Greybeards', draugr's), whose words and recovery differ from the
    player's.
- A word known and a word unlocked in the game: runtime flags on the word's
  form, kKnown (1 << 6) and kUnlocked (1 << 0) (include/RE/T/TESForm.h:67,
  :56). HYPOTHESIS: that these are the two Papyrus Game.TeachWord and
  Game.UnlockWord set, measured by reading them after each.
- The recovery in the game: Actor::GetVoiceRecoveryTime (include/RE/A/
  Actor.h:566; src/RE/A/Actor.cpp:631, RELOCATION_ID(37854, 38808)) and the
  high process's voiceRecoveryTime (include/RE/H/HighProcessData.h:191);
  actor values ShoutRecoveryMult 86, VoicePoints 37, VoiceRate 38,
  DragonSouls 133 (include/RE/A/ActorValues.h:94, 45, 46, 141).
- What the fork does today:
  - the voice slot is equipment (skymp5-server Equipment.h:19-27, skymp5-
    client sync/equipment.ts:39-57 and :87-122) and the server drops a voice
    spell the actor has not learned (ActionListener.cpp:500-536, upstream
    #2665), but the client read the slot with GetEquippedSpell, which
    returns spells only, so the server never saw a shout there (consistent
    with x-shout-probe3's server log: no voice slot refused for the
    equipped Unrelenting Force, which the check would have refused). Built
    on m2-shouts: the client reads the shout (getEquippedShout) and equips
    one the server sends (equipShout); the server takes a shout its record
    holds and takes one it lacks out of the player's game
    (Actor.RemoveShout);
  - favorites keep a shout (ActionListener.cpp:1201-1229);
  - a cast comes as SpellCast with the engine's castingSource
    (magicSyncService.ts:105-121) and the server keeps a cast per hand, 2 the
    voice (PartOne.h:173; OnSpellCast clamps the source, ActionListener.cpp:
    2390-2392). But a shout fires no spellCast: x-shout-probe
    20261011-060059 recorded none in the shouter's game for Unrelenting
    Force or Whirlwind Sprint, and the server logged no SpellCast, so today
    a shout reaches the server not at all (Observe, below);
  - an observer's game casts a relayed spell from the figure
    (castSpellImmediate); HYPOTHESIS: whether that shows a shout (its
    animation and sound) and whether a push from it lands on the observer's
    player there (a figure's spell lands no damage on the player,
    docs/verbs/spell-cast.md, x-spell-observe);
  - the Papyrus natives Actor.AddShout, Actor.EquipShout,
    Actor.GetEquippedShout, Game.TeachWord, Game.UnlockWord and
    Game.IsWordUnlocked are missing on the server (docs/NATIVES.md);
  - the console commands TeachWord, UnlockWord and AddShout are not among
    skymp5-client's overridden ones (consoleCommandsService.ts:19-20), so
    typed they run in the caller's game alone: R3 by omission, a bug under
    the design law (a player could teach itself every word), closed here.
- The movement: movement-speed's budget (wire-rules movement: 660 units a
  second, a 2048 burst) against Whirlwind Sprint's dash: one word carried
  the shouter 1052 units in x-shout-probe, inside the burst, and the server
  took it (no move back; the observer's game showed the figure travel
  1053). x-whirlwind-probe 20261012-072444, east from the lab spawn down
  the hill: one word 1548 units over the ground, three words 2140, the
  server taking both (no E_MOVE_SPEED: the dash spans several movement
  reports while the budget refills); c2 watched the figure travel 3068
  units in all, the fall included, and its own game counted fall damage on
  the figure (a figure holds a million health; nothing reaches the server).

## Observe (host or acting client sees the intent before the engine acts)

- Hook point: the player's own MT_BreathExhale* after its shoutStart
  (sendAnimationEvent, filtered in native to 0x14 and each name), built on
  m2-shouts as skymp5-client shoutService.ts: the hooks only note the
  release (no script function runs inside a hook); the next frames read
  the voice recovery once the game has set it (at most 1.5 s), find the
  variation whose recovery times ShoutRecoveryMult the reading sits at or
  just under (it counts down from the release), and report a SpellCast
  from the voice (castingSource 2) with that variation's spell
  (Shout.GetNthSpell), the reads through SKSE's Papyrus by callNative as
  the lab driver's voice step proved them. HYPOTHESIS until b-shout: that
  the reads land within the window and name one word the same way. How it
  was found, narrowed by x-shout-probe2 (20261011-215824, all three
  words of Unrelenting Force, the key held about 0.2, 0.6 and 1.5 s): each
  shout fired shoutStart, then MT_BreathExhaleShort at its release, 215,
  615 and 882 ms later (three words charge in about 0.88 s and release by
  themselves), and never a spellCast. The breath's name is the same for
  every variation, and the masters hold no setting for when a word charges
  (only fShoutRumble* and texts), so neither the events nor the hold time
  name the variation exactly. What does: the recovery the shouter's game
  sets at the release, the variation's recovery time times its
  ShoutRecoveryMult (Actor::GetVoiceRecoveryTime, CommonLibSSE-NG
  include/RE/A/Actor.h:566; SKSE's Papyrus Actor.GetVoiceRecoveryTime, by
  callNative), against the shout's three (Shout.GetNthRecoveryTime). The
  proposal: at its player's MT_BreathExhaleShort after a shoutStart, the
  client reads its voice recovery, finds the variation, and reports a
  SpellCast with castingSource 2 and that variation's spell, which the
  server validates against its record (spell-cast's path: the shout in the
  voice slot, the variation's word unlocked, the recovery passed) and
  records so the variation's hits count. x-shout-probe3 (20261011-221358,
  the voice step about 2 s after each release): before any shout 0, the
  shout's three 15, 20 and 45 (ShoutRecoveryMult 1); after a 0.2 s hold
  18.3 left, so 20, two words (one word needs a shorter tap than the
  driver's); a second shout inside that recovery never fired (1.6 left,
  the first's); after a 1.5 s hold 44.0 left, so 45, three words.
  CONFIRMED for two and three words: read at the release, the recovery
  names the variation, the three set at least 5 s apart; one word
  unobserved.
- The watcher's game already shows the shout: c2's game played c1's
  figure's shoutStart each time (x-shout-probe2, the relay); the push
  reached c2 not at all (its position unchanged), the effect's slice.
- SP filter: the player's own (0x14).
- Data captured: the shout in the voice slot (equipment), the variation,
  the caster's position.
- Side effects of hooking here: none expected.

- The release reported at the engine's own fire of the voice (fork
  35a3975f, ADR-034; HYPOTHESIS until x-tgm-breath5 on its stage): SKSE's
  action event kVoiceFire (CommonLibSSE-NG include/SKSE/Events.h:37-67,
  through SKSE::GetActionEventSource(), API.h:31) reaches the plugin once
  per shout the engine casts, with the actor and a source form; the plugin
  raises the player's own as skseAction to JS and ShoutService reports the
  source form's spell as the voice's cast when that form is a spell,
  whatever the recovery reads and whether or not the shout hits anything.
  The recovery read above and the hit-based report stay as the fallback
  when the source form is not a spell (then the shout alone is named, and
  its variation still comes from the recovery). Why: playtest nineteen's
  third session (2026-10-15, parity caff3e04, recording playtest-19-3): 13
  of Eli's 18 god-mode Fire Breaths never reached the server, every second
  breath within three seconds among them; with a zero recovery the release
  was reported only from a hit of the shout's spell (reportFromHeld), and
  a breath that hits nobody has none. God mode does set the 30 s voice
  recovery after all (x-tgm-breath4 20261016-010539 read 22.75 s at the
  fourth breath), so the recovery read names no variation for a second
  breath under the first's recovery; the fire's source form names it.

## Impose (observers render the server's decision)

- Mechanism: at login the server teaches the player's game its record by
  SpSnippets (Actor.AddShout on the player for each shout, Game.TeachWord
  and Game.UnlockWord for each word), as learned-effects teaches effects; a
  change from an admin or a script the same way at once. An accepted shout
  is not relayed as a cast: a figure's cast of the variation's spell would
  run the spell's effect (a push, fire) in each observer's game, the
  effect slice's question, as cast-teleport's teleport cast is never
  relayed. A shout's damage on another player is the shouter's game's
  hit, claimed against the accepted shout (spell-cast's claim) and dealt
  by the server's effect rule (R0).
- Visual without simulation achieved by: the figure's shoutStart, which the
  animation relay already brings to every observer (x-shout-probe2: c2's
  game played it for each of c1's shouts).
- Side effects: none new; the push on another player waits for its slice.

## Suppress (engine's own behavior blocked on non-hosts)

- What is suppressed: the console's TeachWord, UnlockWord and AddShout run
  in the caller's game (refused for a player, sent to the server for an
  admin, docs/verbs/console-commands.md's table); the caster's game's own
  shout with a word the server's record does not hold has no effect beyond
  that game (refused cast, nothing relayed).
- How: consoleCommandsService's schemas (the console verb's path); the
  cast's validation.
- Release condition: none.
- Side effects: none new.

## Message contract

- No new message in this slice: SpellCast (castingSource 2, the
  variation's spell, aim 0, no graph variables) in from shoutService and
  never relayed; UpdateEquipment's voiceSpell may now name a SHOU as well
  as a SPEL (the same u32, the shape unchanged); SpSnippet out at login, on
  a change and for a shout the record lacks (Actor.RemoveShout); the
  console's ConsoleCommand and ConsoleOutput for the admin's commands.
- Validator rules: unchanged (spell-cast's: a spell, a slot 0 to 3, the aim
  within a quarter turn).
- Idempotency / ordering: teaching a known word again is harmless in the
  game; the login's snippets come before the player's first cast.
- Contract doc updated: no change.

## Server

- Where the logic lives:
  - the record: the change form's ShoutRecord, three lists of FormDesc as
    the engine keeps them (the shouts in the player's list; the words of
    power known; the words unlocked, each word a flag of its own in the
    engine, whichever shouts share it), absent in older records; built on
    fork m2-shouts 9579dbd2 (MpActor::RecordShoutEntry, ShoutSnippets);
    libespm reads SHOU (its three SNAM) and WOOP for the cast rule;
  - the cast rule: wire-rules shouts (Rust, ADR-010), built on m2-shouts:
    Voices keeps each player's recovery and judges a shout from its facts
    (the shout in the voice slot recorded, the spell's place among its
    variations, the record's unlocked words, the variation's recovery and
    ShoutRecoveryMult); OnSpellCast asks it for a player's cast from the
    voice when the slot holds a shout, starts the accepted shout's cast for
    its hits (PartOne::StartCast) and logs a refusal (E_SHOUT_UNKNOWN,
    E_SHOUT_SPELL, E_SHOUT_WORD, E_SHOUT_RECOVERY); OnHit claims a hit with
    a variation's spell against it; libespm reads SHOU's three SNAM;
  - the recovery: the variation's recovery times ShoutRecoveryMult (the
    actor-values record's base plus the running effects', 1 without
    either) from the accepted shout, on the server's monotonic clock, kept
    across a reconnect (a reconnect would otherwise clear it);
  - the lab's view: mp.get(actor, "shouts"), the record and the recovery
    left (lab gamemode labState, server.actor(c).shouts, wordsUnlocked,
    shoutRecovery);
  - Papyrus natives on the server VM (Actor.AddShout, Game.TeachWord,
    Game.UnlockWord, Game.IsWordUnlocked, R0, each with its ledger line):
    with the word walls' slice, since a global Game function on the server
    has no player to act for until a script's activation names one;
  - the console: TeachWord, UnlockWord, AddShout for an admin, refused for
    a player (console-commands' table gains the rows), built on m2-shouts:
    the record, then the target's own game told by snippet (Game.TeachWord,
    Game.UnlockWord, Actor.AddShout);
  - the login: the record taught again on the first movement, as
    learned-effects teaches (ActionListener, SendShoutRecord).
- DB fields / migration: the change form's three new lists, absent in old
  records (empty); a restart-persistence scenario (rule 6).
- Restart behavior: the record holds; a recovery running at a restart is
  forgotten (a runtime timer, as a cast is).
- Papyrus natives touched (ledger lines added): none on the server VM in
  this slice; Actor.AddShout, Game.TeachWord and Game.UnlockWord are the
  server's snippets to a player's game (their rows say so, as
  Actor.StartCombat's).

## Client

- SP binding: none new (Actor.addShout, Game.teachWord and Game.unlockWord
  by snippet; Skyrim Platform declares them; SKSE's
  Actor.GetVoiceRecoveryTime, Shout.GetNthRecoveryTime and
  Shout.GetNthSpell by callNative).
- TS handler: consoleCommandsService's schemas gain teachword, unlockword
  and addshout (sent to the server); shoutService reports a shout (Observe);
  sync/equipment.ts reads and equips a shout in the voice slot; hitService
  holds the player's spell hits while a shout's report is due (the shout's
  spell hits on the frames after the release, before the report can be
  read, and a hit the server sees before its shout has no cast to claim;
  on the one reliable ordered channel a hit sent after the report arrives
  after it).
- Kill switch config key: none (the server's rule).

## Tests

- T0: libespm (UnrelentingForceShout's variations, EspmTest); wire-rules
  shouts and the bridge (a recorded shout with its words unlocked stands
  and starts its recovery, ShoutRecoveryMult scaling it; an unrecorded
  shout, a locked word, a spell no variation's and a shout inside the
  recovery are refused, a refused one leaving the recovery as it was;
  nonsense recoveries set none); the server, ShoutsTest (the record
  through a change form round trip; the console writes the record and
  sends the snippets, refused for a player; the login teaches the record;
  a shout stands once per recovery, its hit counts and it reaches nobody;
  the record refuses the rest; the voice slot takes a recorded shout
  only).
- T1: none.
- T2: difftest session shouts (fork m2-shouts): c1, an owner, adds itself
  Fire Breath and unlocks Yol by the console, reports the shout in its
  voice slot, shouts one word (VoiceFireBreath1) and hits c2, then shouts
  again inside the recovery and hits again: the wire stack records, takes
  the slot, counts the first hit once (c2's 100 to 0.5) and refuses the
  second shout and its hit; the legacy stack refuses the slot and counts
  neither. Declared from the code and the records before the run.
- T3 scenario id: lab/scenarios/b-shout.yaml (drafted): c1 is given Fire
  Breath and Yol by the console as an owner, equips it and shouts one word
  at c2: the server takes it (its recovery above 20 s), c2's health falls
  on the server, c2's game plays the figure's shoutStart; c1's own game
  clears its recovery and shouts again: its game shouts, the server
  refuses it (its recovery not restarted, c2 unhurt); the server restarts
  and c1's game is relaunched: the record holds, the fresh game has Yol
  unlocked again, and c1's next shout stands.
- Assertions that would fail if the verb silently regressed: the server's
  record of c1's shouts and words before and after the restart, c1's
  game's (the word unlocked, read by the driver), the server's recovery
  after the first shout and after the refused one, c2's health on the
  server after each shout, the figure's shoutStart in c2's game, c1's own
  shoutStart for the refused shout (the refusal is not vacuous).

## Dynamic plan (fill when any tag above is still HYPOTHESIS)

- x-shout-probe, on parity (no server shout rules yet), after the driver
  equips a shout (lab-driver's equip step learns Shout forms:
  Actor.EquipShout): c1 types player.addshout 13e07, player.teachword and
  player.unlockword 13e22 (they run in c1's game alone today), equips the
  shout and holds the shout key (Z, DirectInput 44, HYPOTHESIS the clones'
  binding) briefly at c2, both watching (c1's own casts, the figures'
  positions); then Whirlwind Sprint (2f7ba, 2f7bb) east along the strip.
  Read: whether a shout fires spellCast and with which spell and source;
  what the server logs (OnSpellCast's verdict); whether c2's game shows
  c1's figure shout and whether c2's own player is pushed there; c1's dash
  length and whether the server sends it back (E_MOVE_SPEED); the word's
  flags in c1's game after teachword and unlockword.
- Expected: a spellCast with the variation's spell and source 2; the
  server refusing it as not equipped (the slot holds the shout) or taking
  it; c2's player not pushed (a figure's spell lands nothing there); a dash
  of several hundred units sent back past the budget's burst.
- Owner: agent.
- x-shout-probe 20261011-060059 (on the m2-block server, lab-driver
  eff3448):
  - the console's AddShout, TeachWord and UnlockWord ran in c1's game alone
    ("Player now knows the Word 'Fus'", "The Word 'Fus' is now
    unlocked"): CONFIRMED, the hole Suppress closes;
  - Unrelenting Force, one word: c1's game played shoutStart and
    MT_BreathExhaleShort and fired no spellCast; its engine sent
    staggerStart to c2's figure, which deathService blanked; c2 never
    moved, on the server or in its own game, and the server heard nothing:
    the shout reached nobody;
  - Whirlwind Sprint, one word: 1052 units, taken by the server inside the
    burst, the figure travelling as far in c2's game; again no spellCast.
  Next: which events two and three words fire (the hook, Observe), a dash
  of three words against the burst, and whether c2's game plays the
  figure's shoutStart (its visual) from the relay.

## Status

Doc written 2026-10-10, before any code. x-shout-probe 20261011-060059
reopened Observe (a shout fires no spellCast); x-shout-probe2 and 3 found
the hook (the recovery at the release names the variation). Fork branch
m2-shouts (from parity f828279f): 9579dbd2 and 98e97d9b the record, the
console's word commands and the login; c2334252 libespm's SHOU; ac243dca
the cast (wire-rules shouts, OnSpellCast's voice, OnHit's claim, the voice
slot, shoutService, mp.get "shouts", ShoutsTest, the T2 session); eeb2c930
a merge of m2-stagger (the shouts merge sweep runs b-stagger); d985e789
the hits held for the report. T2's first run (2026-10-11): the shouts
logic held on the wire stack (the first shout taken, its hit counted, the
second refused, E_SHOUT_RECOVERY and E_SPELL_NO_CAST in the test server's
log), but Fire Breath's first word is a one-second effect in
Dragonborn.esm's override of VoiceFireBreath1 (EFIT 50 over 1 s; Skyrim.esm
has it instant), dealt in ticks whose values ride the effect clock, so the
session now puts c2 in god mode and reads the shout's acceptance from the
effect set both games are told. b-shout's first runs (20261012-020313 and
the next) red: the server's record, c1's game's word and both games'
shoutStart held, but no SpellCast reached the server; x-shout-console
20261012-020808 read c1's console: "Trace in ShoutService: shout 3f9ea
variation 0 recovery 30", the variation found and the report never sent.
e0826331 takes the variation's spell from the typed Shout.getNthSpell
(HYPOTHESIS: callNative's game object has no Form methods) and logs any
throw (E_SHOUT_REPORT); c4641e26 merges m2-pt13's left-hand cast fix.
b-shout (thuum db6ed77, awaiting Eli's review) green twice on c4641e26
(20261012-030519 and -030920): the record and the word in c1's game, the
first shout taken (the server's recovery 25.9 s at the check, c2 burned to
0.505), the cleared-recovery shout refused (E_SHOUT_RECOVERY, its hit
E_SPELL_NO_CAST, the recovery 17.1 s and running, c2 untouched), and after
a restart and a relaunch the record and the word back and the next shout
taken (0.506). 291763e3 and 3f9e4bc8 settle the T2 session: c2 in god mode,
health messages compared as presence only (the fire's ticks vary in
number), the effect set's start and end exact; T2 green on 3f9e4bc8. DONE
2026-10-11: the merge sweep 38 of 38 (a-actor-values and a-favorites red
on sky-c1 lab faults, E_RUN_RELAUNCH and E_RUN_TELEPORT with no assertion
failed, green on their reruns), fork parity fast-forwarded to 3f9e4bc8,
both clones' clean-m1 promoted. Was left before that:
the fork pipeline (build and T0), T2, b-shout (drafted in the scratchpad,
its own commit once green), the ledger rows at the merge (Actor.AddShout,
Game.TeachWord, Game.UnlockWord, Actor.RemoveShout as the server's
snippets).

- [x] doc complete, rung declared
- [x] engine surface cited or delegated
- [x] server logic + T0 (ShoutsTest, EspmTest's SHOU)
- [x] message + validator (same commit): no new message; SpellCast from
      the voice, the voice slot's u32 naming a SHOU as well
- [x] native hook + T1: no new native (SKSE's voice and shout reads)
- [x] TS handler (shoutService, the voice slot in sync/equipment.ts,
      hitService's held hits)
- [x] T2 green (3f9e4bc8, 18 declared divergences)
- [x] T3 scenario green: b-shout (thuum db6ed77, awaiting Eli's review)
      green twice; HYPOTHESIS left: the push of Unrelenting Force on another
      player (a later slice), the cause of callNative's spell (a fallback
      now); Whirlwind Sprint's three words fit the burst
      (x-whirlwind-probe 20261012-072444)
- [x] ledger and suppression registry updated (Actor.AddShout,
      Game.TeachWord, Game.UnlockWord, Actor.RemoveShout as the server's
      snippets; Actor.GetVoiceRecoveryTime, Shout.GetNthRecoveryTime,
      Shout.GetNthSpell as the client's reads)

## Playtest fourteen (2026-10-12, Eli, parity ef3fb03c)

- Held: the record (console AddShout, TeachWord and UnlockWord answered
  "recorded"), a Fire Breath shout taken by the server (22:57:34, "recovers
  in 30.0 s") that burned test 2, the game refusing a second shout inside
  the recovery, and the record across test 1's relaunch (both shouts and
  their first words back).
- Found: test 2's screen shows test 1's figure shouting (the animation
  relay) but not the breath: the server relays no shout (this slice's
  choice: a shout's effect on another player was left for later). A relay
  of the voice cast would let observers' figures breathe fire as a figure
  casts a spell, which lands nothing on the observer (spell-cast,
  x-spell-observe): a slice.
- Found: after a relaunch the login's re-teach (Actor.AddShout,
  Game.TeachWord, Game.UnlockWord for every recorded shout and word) shows
  the game's big learned notice for each, which is cumbersome: the
  re-teach should be silent (a slice; how the engine learns a word without
  the notice is to read).
- A word wall teaching into the server's record: M4, with dungeons (Eli,
  2026-10-12, "leave it in dungeons"; docs/PLAN.md M4).
- Built on fork m2-visuals 140ed04d (2026-10-12), both to show on the lab
  before playtest fifteen:
  - the relay: an accepted shout's cast goes to every other game that sees
    the shouter, so the observer's figure launches the breath from its
    voice; the damage stays the server's, from the shouter's hits. A refused
    shout is relayed to nobody. As first built (140ed04d) it drew nothing:
    the client's shout carried no graph variables, and an observer's
    castSpellImmediate refuses a cast without them (Skyrim Platform
    MagicApi.cpp, AnimationGraphMasterBehaviourDescriptor.h:158-161); and the
    relay passed the client's bytes, whose caster is 0x14, which each
    neighbour's game would read as its own player. Since 2b6dd88f the server
    relays the cast it resolved (its caster the shouter's form id) to every
    listener but the shouter, as a bow shot's relay does, and the client's
    shout carries the shouter's graph variables and its facing as the aim
    (717b071d: radians, the pitch within the validator's quarter turn).
    ShoutsTest: the neighbour's cast names the shouter, the shouter is sent
    none; difftest shouts declares c2's relay by its caster. Probes
    x-shout-relay and x-uf-ethereal on 2b6dd88f: c2's watch records a hit
    taken from the figure with the shout's spell when the breath launches
    in c2's game, c2's health against the server's shows no second count,
    and Unrelenting Force's push lands in the target's own game (Eli: "does
    unrelenting force ragdoll").
  - the silent re-teach, read first (x-reteach-probe 20261013-061753, with
    lab/frida/hud-trace.js on UIMessageQueue::AddMessage): of the three
    calls, only Game.TeachWord raised a HUD message, the word-of-power one
    (HUDData type 21, kWordOfPower1, CommonLibSSE-NG H/HUDData.h:34, text
    "Fire Breath") at 06:19:53.05, a second after the server's teachword at
    06:19:51.99; AddShout (06:19:38.8) and UnlockWord (06:20:04.2) raised
    none. Its caller ran from a Papyrus native (NativeFunctionBase::Call,
    Address Library 104651) through ids 55631 and 55500 to the sender
    51648, none named in CommonLib. A login now marks a known word with
    SKSE's Form.SetPlayerKnows (the form's known flag 0x40: skse64
    GameForms.h kFlagPlayerKnows; CommonLib T/TESForm.h:67 kKnown), then
    unlocks it as before; the console's live teachword keeps the game's
    message (a word learned). HYPOTHESIS: the known flag is all TeachWord
    leaves on the word besides the message (b-shout's relaunch checks the
    word still reads unlocked, x-reteach2 screenshots the login).
- Read on the lab (2026-10-13):
  - x-reteach2 (20261013-072218, 140ed04d): after a relaunch the word read
    unlocked in c1's game (`known` 1) and on the server. Its screenshots
    showed no notice, which is weak evidence alone (x-reteach-probe's
    screenshot 5 s after the live teachword showed none either, the notice
    having faded while hud-trace caught it); the absence follows from SKSE's
    Form.SetPlayerKnows itself, which sets the form's flag and calls no UI
    (skse64 PapyrusForm.cpp, SetPlayerKnows). Whether the flag alone serves
    the shout after a relaunch is b-shout's to show in the sweep.
  - x-shout-relay (20261013-082608, 31b56fc9): c2's game took three hits
    from its figure of c1 with Fire Breath's spell (0x3F9EB): the breath
    leaves the figure. It also burned c2 in its own game, down to 0.34
    against the server's half.
  - x-uf-ethereal (20261013-082909, 31b56fc9): Become Ethereal, shouted by
    c2, drew on its figure in c1's game (dark and translucent, the shout's
    swirl around it), and c1's punch from 80 units landed nothing (no hit
    reached the server). Unrelenting Force's three words reached c2's game
    (four hits from the figure) but did not push it: the push is a Stagger
    effect (VoiceUnrelentingForceEffect02 and 03, archetype 33), and the
    stagger verb has the server decide a player's staggers, so the engine's
    own does not move the player (Eli: "does unrelenting force ragdoll":
    not yet, a slice of the server's stagger). c2 lost 50, and that is the
    game's own number: Dragonborn.esm overrides VoiceUnrelentingForce3 with
    a fourth effect, MGEF 0x0201FF2B at 40 over 1 s beside Skyrim.esm's
    instant 10 (lab/esm.py on Dragonborn.esm), which the server runs at its
    250 ms tick (five steps of 10 in c2's game: 90, 80, 70, 60, 50). The
    first run, on 140ed04d, lost the same 50 with no hit in c2's game; its
    reading here as a figure firing its own shout was wrong.
  - The fixes, on m2-visuals, for the breath's local burn: ae8446a9
    dispels a figure's spell from the player at its hit (an effect over
    time stops), and be69bf68 sets the damage an actor deals the player to
    count nothing locally (fDiffMultHPToPC*, skymp5-client
    ragdollService.ts), as ADR-028 has the server count it. Its commit and
    comment cite x-uf-ethereal's 50 as evidence, wrongly (the 50 is the
    server's, above); the evidence is x-shout-relay's 0.34. On be69bf68
    (20261013-092505) the breath still left the figure and c2's health
    followed the server's four ticks alone, 100 to 50; Unrelenting Force
    (20261013-092736) took the server's 50 on both sides.
  - Replaced 2026-10-14 (fork m2-push 4e8aa04c, docs/verbs/push.md): the
    dispel also stopped every other consequence of a figure's shout on the
    player, Unrelenting Force's throw among them. The player's AddTarget
    hook now refuses only another actor's Health, Magicka or Stamina value
    effects; the breath's burn is one, so it still counts nothing locally.
- The shout relay, the silent restore at login and the local damage counted
  nothing: merged on fork parity 11c126b9 (2026-10-13 05:31: the sweep of
  every scenario on m2-visuals be69bf68, 40 of 40 green, and T2 green on
  11c126b9, which adds a difftest session change alone).

## Playtest fifteen (2026-10-13, Eli, parity 11c126b9)

- Passed: test 1's Fire Breath left its figure toward test 2 on test 2's
  screen and took about 50, once (the server: "shouts 3f9ea, variation 0
  (spell 3f9eb); recovers in 30.0 s" at 19:49:45 and 19:53:59 UTC); turned
  away, the fire went where test 1 faced. A silent relaunch passed: no word-
  of-power notice at the login, and Fire Breath still shouted.
- Found: Unrelenting Force (its three words recorded at 19:58 by the
  console) reached the server only as hits: "E_SPELL_NO_CAST: ff000000 hits
  ff000001 with spell 13f3a 352 units away; refused", twice at 20:00:54 and
  twice at 20:07:06 (after a relaunch), and no line of a UF shout, accepted
  or refused. Test 1's client never reported it: shoutService reports a
  release (MT_BreathExhale*) only within chargeMs (3000 ms) of shoutStart,
  and only when the voice recovery names one of the shout's three variations
  (else E_SHOUT_UNREAD, in the game's console). With no cast the server
  counted nothing, relayed nothing (test 2 saw no shout) and nothing pushed.
  The lab's Unrelenting Force (x-uf-ethereal, a 2 s hold) was reported;
  HYPOTHESIS: a person's hold, or rotfern's recovery, falls outside those
  windows. To reproduce on the lab: holds of 1.5, 3.5 and 6 s, and the
  console's history for E_SHOUT.
- Found: one of test 2's Become Ethereal shouts was refused at 19.98 s of
  its 20.0 s recovery (accepted 20:06:04.608, then "E_SHOUT_RECOVERY ...
  refused" at 20:06:24.590): the game let it go and the server's clock had
  18 ms left. The recovery check needs the network's slack, as the other
  validators have one; a refused shout is not relayed, so test 1 saw no
  ghost that time, which may be the look Eli found unreliable.
- Found: Become Ethereal did not stop damage. The server still damages an
  ethereal player when a hit is reported (the self-cast slice,
  docs/verbs/magic-effects.md).

- Built on fork m2-fifteen (2026-10-13, after x-uf-hold 20261013-203328 and
  x-uf-rotfern 20261013-204305 reported every shout, the lab's characters
  and rotfern on Eli's saved world alike, so the playtest's quarter hour of
  unreported shouts did not reproduce): the shout recovery's skew (04b2b27b:
  a shout stands with up to 400 ms of the last recovery left, wire-rules
  RECOVERY_SKEW_MS), god mode's (88bc8888: TGM's shouts start no recovery on
  the server, as its game sets none), and the report from a shout's own hit
  (337be481: when the recovery cannot name the variation, god mode's
  included, the held hit of one of the shout's spells names it; a hit of one
  with no report within chargeMs, the release unseen, reports it first; each
  logs E_SHOUT_FROM_HIT or E_SHOUT_UNREPORTED with why).
- Root cause found (2026-10-13): with magic readied or a weapon drawn a
  shout's release is CombatReady_BreathExhaleShort, not MT_BreathExhaleShort
  (x-shout-drawn2 20261013-221426, c1's own graph events in each state), and
  shoutService hooked only MT_BreathExhale*: x-shout-drawn 20261013-220949
  saw Fire Breath's release unseen with Flames readied and with a sword
  drawn, reported only from its hit (E_SHOUT_UNREPORTED), and x-self-cast's
  Become Ethereal, which hits nothing, went unreported (20261013-214827,
  20261013-220500). Playtest fifteen's Unrelenting Force was shouted with
  Flames readied in rotfern's hand; the lab's earlier shouts were all made
  with the hands down. A wait was ruled out (x-shout-wait 20261013-220058).
  Fork m2-fifteen 744fddb0 hooks both releases.
- On 744fddb0 (2026-10-13): x-shout-drawn (20261013-230348) had Fire Breath
  reported in all three states, hands down, Flames readied and an Iron
  Sword drawn ("shouts 3f9ea, variation 0 (spell 3f9eb); recovers in 30.0
  s" each time). Each breath's first hit spent the cast ("at 1 times its
  magnitudes (once)") and its duplicate report was refused (E_SPELL_NO_CAST,
  the cast already spent); three breaths of 50 killed c2. Each also
  staggered c2 by 0.05: Skyrim.esm's VoiceFireBreath1 (0x3F9EB) carries
  StaggerPushFFAimed (MGEF 0xA44C0) at 0.05 beside its fire at 50 (lab/
  esm.py on sky-srv), which the server now plays as a spell's stagger
  (docs/verbs/stagger.md). x-uf-push (20261013-231113): Unrelenting
  Force's three words stagger their target by 1.5, a stumble with no
  throw and no move; the game's ragdoll throw is a later slice
  (stagger.md).
  b-self-cast's Become Ethereal, shouted with Invisibility readied, was
  reported every time (four runs, 20261013-231616 to -232603).

## Playtest sixteen (2026-10-13, Eli, parity 8eb4e78e)

- Passed: Unrelenting Force's three words from test 1, once with the hands
  down and once with Flames readied (fifteen's lost shout, now hooked at
  CombatReady_BreathExhaleShort, 744fddb0): each time test 2 saw the shout
  leave the figure, stumbled on both screens (the spell stagger at 1.5) and
  lost about 50.
- Passed: Become Ethereal, both items (docs/verbs/self-cast.md).
- Found: test 1 in god mode breathed Fire Breath at test 2 twice in a row.
  Both hits counted and test 1's figure's shout animation played on test
  2's screen both times, but the fire showed only the first time (Eli: "fire
  hits, test 1's animation plays, but doesnt show the particle effect of the
  shout anymore. actually it only plays the fire fx for test 2 the first
  time"). HYPOTHESIS: the figure keeps its own voice recovery in the
  observer's game (Fire Breath's first word, 30 s), which god mode clears in
  the shouter's game only, so the observer's engine refuses the relayed
  second shout: the animation events play, the breath does not. Probe
  x-tgm-breath (breaths at t, t+4 s and t+38 s) reads it. The same gap would
  show without god mode wherever the shouter's recovery is shorter than the
  figure's (a perk or an amulet the figure lacks). Under ADR-031 the
  figure's local recovery must not gate a shout the server accepted.
  - x-tgm-breath (20261014-052706, the lab's characters, breaths at 0, 5.7
    and 41.3 s): the server took all three ("recovers in 0.0 s" in god
    mode, each hit counted once); c2's game took the figure's shoutStart
    all three times and applied the breath's effects to its player all
    three times (fire 0x20E16 and StaggerPushFFAimed 0xA44C0, at 0.6, 6.3
    and 41.9 s). So the figure's second shout 5.7 s after the first was
    not refused in the lab, and the voice-recovery HYPOTHESIS is weakened.
    The screenshots, taken 1.2 s plus the capture's two to three seconds
    after each breath, came too late to show a one-second breath either
    way. Open: the second breath's look (Eli saw it missing twice in a row,
    on rotfern's figure, seconds apart, and back after a wait). The read
    that settles it is the recorder's trace of the figure's events and
    art (ADR-031), not a screenshot.

## Playtest seventeen (2026-10-14, Eli, parity 4e8aa04c)

- Still found: test 1 in god mode breathes Fire Breath at test 2 twice in a
  row, and test 2 sees the fire once ("nope still only once"). x-tgm-breath
  (20261014-141100, before the merge) had c2's game take the breath's hit
  on all three breaths and the figure take shoutStart and
  MT_BreathExhaleShort each time, so the second breath lands but its fire
  is not drawn. Its screenshots came 1.2 s late. Next probe: a screenshot
  at the release of each breath, and lab/frida/launch-trace.js on c2 to see
  whether the second breath launches a projectile there at all.
- Traced (x-tgm-breath2 20261014-212025, lab/frida/launch-trace.js on c2): a
  projectile is launched in c2's game for every breath, the second
  included (at 0, 9.9 and 48.1 s), each by our relay (Skyrim Platform's
  cast for the figure, a SkyrimPlatformImpl.dll frame), none by the
  engine's own shout. So the second breath is cast and lands; what Eli
  misses is its drawn fire. The screenshots, 0.4 and 0.8 s after each key,
  caught no flames for any breath (the first's included), only embers after
  the second: still too late for a half-second flame. Open: what the
  launched projectile draws the second time (its art on the figure's
  mouth node, the voice caster's state after the first cast).
- Read (2026-10-14, the re-analyst on sky-re, static; HYPOTHESIS until the
  trace): Fire Breath's first word (SPEL 0x3F9EB, fire-and-forget, aimed)
  fires PROJ 0x647BF, a cone (type 0x10, kCone, CommonLibSSE-NG
  include/RE/B/BGSProjectile.h:38; model Magic\VoiceFlameWaveProject01.nif,
  speed 1200), whose flames are most likely drawn by a shared master
  particle system (ADDN MPSFireWaveFlames 0x647BC, addon index 64) that the
  cone's model registers as an emitter. Skyrim Platform's relay does not
  cast this word through MagicCaster::CastSpellImmediate: for an aimed
  fire-and-forget spell it calls Projectile::Launch itself (MagicApi.cpp
  :128-163, use-origin true, no target), so the figure's voice caster holds
  nothing between breaths. The candidates for the missing second fire: the
  second cone's emitter never joins particle system 64, or system 64 is
  removed after the first breath ("destroy when unused") and rebuilt
  without emitting. Fixes by the trace's answer: give ADDN 0x647BC the
  addon's always-loaded flag at the client's start (BGSAddonNode's flags,
  CommonLibSSE-NG include/RE/B/BGSAddonNode.h), or relay aimed
  fire-and-forget casts through the engine's CastSpellImmediate as
  concentration casts already are. The trace: on c2 and on c1 for
  comparison, the particle system's slot 64 and the cone's emitter
  registration across the breaths (ids in the re-analyst's report).
- The trace's script: lab/frida/mps-trace.js (main 4823973; ids resolved
  with lab/addr.py, the fields cited to CommonLibSSE-NG's headers where
  they name them, the rest the re-analyst's HYPOTHESIS). It polls slot 64's
  system every 50 ms (its pointer, emitter and particle-object counts,
  destroyWhenNotInUse) and logs the cone's launch, Init3D, emitter
  registration, emits, a rebuild that changes the system and the cone's
  Kill. Probes, after playtest eighteen: x-tgm-breath3 (the script on both
  games, x-tgm-breath2's three breaths) for (a) against (b), then
  x-tgm-breath3-fix (c2's script first sets ADDN 0x647BC's flags to
  kAlwaysLoaded, CommonLibSSE-NG include/RE/B/BGSAddonNode.h:12-16): fix
  (1)'s test, all three breaths drawn if (b) holds.
- The addons' flags, read from Skyrim.esm on sky-srv (lab/esm.py,
  2026-10-14): the breaths' MPSFireWaveFlames 0x647BC (index 64),
  MPSFrostWaveProjectile 0x68BCF (65) and MPSDragonFireWave 0xE1532 (71)
  carry DNAM flags 1; vanilla's common impacts (MPSFireBoltImpact01 0x2B95B,
  MPSBloodSprayImpact01 0x1BFEE, MPSActorDustSpray01 0xF0EAB) carry 3,
  kAlwaysLoaded. Fix (1) as a candidate: fork m2-breath f0e4f073 gives the
  three breath addons the flag at the data load (Skyrim Platform's
  EventHandler, kDataLoaded); it merges only if x-tgm-breath3-fix draws
  every breath.
- Playtest eighteen (2026-10-14, Eli): "for the unresolved tgm+firebreath
  issue, sometimes i can see the effect in screen 2 twice in a row, but its
  still janky". So the second breath's fire is drawn some of the time,
  which fits a system destroyed when not in use and rebuilt in time for
  some second breaths (b) better than an emitter that never joins (a).
- Traced (x-tgm-breath3 20261015-030033, lab/frida/mps-trace.js on both
  games, breaths at 0, 10 and 48 s): (a) and (b) are both FALSE. In c2's
  game every breath, the second included, registered its cone's emitters
  (RegisterMPSEmitters returned 1 eighteen times per Init3D), raised
  system 64's emitter count from 0 to 3 through AddEmitter, and emitted (33,
  30 and 31 emits on that system in the 3 s after each launch), with no
  rebuild and the system's slot never null across the run (polled every
  50 ms; destroyWhenNotInUse 1 throughout, the flags 1). c1's own breaths
  read the same. So the system's lifetime is not the missing fire, and the
  always-loaded flag (fork m2-breath) changes nothing that matters; it stays
  unmerged. What the probe did not reproduce is Eli's spacing: his breaths
  come seconds apart in god mode, the probe's 10 s. HYPOTHESIS (c): a cone
  launched while the previous cone's emitters are still registered meets
  the system's emitter cap (BSMasterParticleSystem::maxEmitterObj, 0x162)
  and its emitters are refused, so nothing emits for it; "sometimes" is
  whether the previous cone's emitters were gone by the next breath.
  x-tgm-breath4 (breaths at 0, 2.5, 5 and 20 s, mps-trace2.js reading the
  cap) tests it.
- MEASURED (x-tgm-breath4 20261015-035032, breaths at 0, 2.5, 4.9 and 24 s):
  (c) is false too, and the fire was never a rendering matter. Every breath
  that reached the observer's game joined system 64 and emitted (about 30
  emits in 3 s each, the cap untouched); but the observer's game launched
  three breaths of the shouter's four: the 2.5 s one never arrived. The
  server log says why: three shouts taken (03:52:55, 03:53:00, 03:53:19),
  none at 03:52:57, where only that breath's hits came, refused as having
  no cast (E_SPELL_NO_CAST). The shouter's own game never reported it: in
  god mode the voice recovery is zero, so shoutService.ts reports a shout
  from its own hit (reportFromHit), and a hit of the same spell within
  chargeMs (3000 ms, shoutService.ts:263) of the last report counts as that
  shout's and reports nothing (:171). A second breath under 3 s is
  swallowed, one past 3 s goes through: Eli's "sometimes". The fix is the
  sender's rule of the cast-action verb (docs/verbs/cast-action.md): the
  client reports every shout release and the server judges it; its probe
  is x-tgm-breath4 again, four launches in the observer's game. Fork
  m2-breath (the always-loaded flag) fixes nothing and is deleted.

