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
