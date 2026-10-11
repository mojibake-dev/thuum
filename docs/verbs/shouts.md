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
unlocked), the cast (validated and relayed), the recovery, and the
movement a shout causes measured against movement-speed's budget (carried
from M1). Later slices, each its own when a playtest asks: Unrelenting
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
  holds the shout, the shout is known, the variation's word is unlocked in
  the server's record, and the shout's recovery has run out on the
  server's clock; a cast that fails is refused and relayed to nobody.
- The recovery is the server's: the variation's recovery time times the
  caster's ShoutRecoveryMult, from the accepted cast. The caster's own game
  runs its own (the HUD's), which the server does not read.
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
    spell the actor has not learned (ActionListener.cpp:500-536);
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
  1053). Two and three words: HYPOTHESIS (longer; unmeasured).

## Observe (host or acting client sees the intent before the engine acts)

- Hook point: OPEN. Skyrim Platform's spellCast does not fire for a shout
  (x-shout-probe), so spell-cast's SpellCast never carries one. What the
  shouter's game does show: its player's animation events shoutStart, then
  the variation's breath (MT_BreathExhaleShort for one word), which the
  animation relay already sends the server (R2, recorded). Candidates: the
  server reads a shout from that relay (the equipped shout, the variation
  by the breath event), or the client reports the voice caster's cast
  (Skyrim Platform's or a native's hook on the voice ActorMagicCaster) as
  a SpellCast with castingSource 2. A probe of two and three words' events
  decides between them.
- SP filter: the player's own (0x14).
- Data captured: the shout in the voice slot (equipment), the variation,
  the caster's position.
- Side effects of hooking here: none expected.

## Impose (observers render the server's decision)

- Mechanism: at login the server teaches the player's game its record by
  SpSnippets (Actor.AddShout on the player for each shout, Game.TeachWord
  and Game.UnlockWord for each word), as learned-effects teaches effects; a
  change from an admin or a script the same way at once. An accepted cast
  is relayed as spell-cast relays casts (the figure casts the variation's
  spell).
- Visual without simulation achieved by: the figure's cast in observers'
  games (HYPOTHESIS: a shout's animation and sound come with it, the probe
  watches).
- Side effects: HYPOTHESIS (a relayed Unrelenting Force pushing the
  observer's own player in the observer's game: if the probe sees it, the
  relay of a push shout waits for its slice, as cast-teleport's teleport
  cast is never relayed).

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

- No new message in this slice: SpellCast (castingSource 2) in and relayed;
  SpSnippet out at login and on a change; the console's ConsoleCommand and
  ConsoleOutput for the admin's commands.
- Validator rules: unchanged (spell-cast's).
- Idempotency / ordering: teaching a known word again is harmless in the
  game; the login's snippets come before the player's first cast.
- Contract doc updated: no change.

## Server

- Where the logic lives:
  - the record: the change form gains the player's shouts, known words and
    unlocked words (form ids, FormDesc in the change form as the other
    records keep them); libespm reads SHOU (its three SNAM) and WOOP;
  - the cast rule: wire-rules spells (Rust, ADR-010) gains the shout's
    facts (the shout in the voice slot known, the cast's spell one of its
    variations, that variation's word unlocked, the recovery passed) beside
    spell-cast's; OnSpellCast for castingSource 2 asks it;
  - the recovery: the variation's recovery times ShoutRecoveryMult (the
    actor-values record, 1 without one) from the accepted cast, on the
    server's wall clock;
  - Papyrus natives on the server VM, each with its ledger line: Actor.
    AddShout, Game.TeachWord, Game.UnlockWord, Game.IsWordUnlocked (R0,
    the record, then the snippet to the player's game);
  - the console: TeachWord, UnlockWord, AddShout for an admin, refused for
    a player (console-commands' table gains the rows).
- DB fields / migration: the change form's three new lists, absent in old
  records (empty); a restart-persistence scenario (rule 6).
- Restart behavior: the record holds; a recovery running at a restart is
  forgotten (a runtime timer, as a cast is).
- Papyrus natives touched (ledger lines added): the four above.

## Client

- SP binding: none new (Actor.addShout, Game.teachWord and Game.unlockWord
  by snippet; Skyrim Platform declares them).
- TS handler: consoleCommandsService's schemas gain teachword, unlockword
  and addshout (sent to the server).
- Kill switch config key: none (the server's rule).

## Tests

- T0: libespm (UnrelentingForceShout's variations); wire-rules (a known
  shout with an unlocked word casts; an unknown shout, a word not unlocked,
  a spell not among the shout's variations, a cast inside the recovery are
  refused; ShoutRecoveryMult scales the recovery); the server (the record
  through a change form round trip; the natives write the record and send
  the snippets; the login teaches the record; OnSpellCast relays an
  accepted shout and nothing for a refused one; the console's rank).
- T1: none.
- T2: a difftest session: c1, taught Unrelenting Force's first word by the
  console as an admin, sends a voice SpellCast of its first variation, then
  another at once: the legacy server relays both; the fixed server relays
  the first and refuses the second (inside the recovery). Declared.
- T3 scenario id: lab/scenarios/b-shout.yaml: c1 is taught Unrelenting
  Force (the console, as an admin) and shouts at c2: c2 sees the shout,
  c1's second shout inside the recovery reaches nobody; c1 relaunches and
  the server restarts: c1 still knows the shout and its word (the record,
  rule 6); c1's Whirlwind Sprint dash is taken by the server, not sent
  back.
- Assertions that would fail if the verb silently regressed: the server's
  record of c1's shouts and words before and after the restart, c1's game's
  (the word's flags read by the driver), the relayed cast counted in c2's
  game, the refused second cast absent there, c1's position after the dash
  on the server.

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

Doc written 2026-10-10, before any code.

- [ ] doc complete, rung declared
- [ ] engine surface cited or delegated
- [ ] server logic + T0
- [ ] message + validator (same commit)
- [ ] native hook + T1
- [ ] TS handler
- [ ] T2 green
- [ ] T3 scenario green, no HYPOTHESIS tags
- [ ] ledger and suppression registry updated
