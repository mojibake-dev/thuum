# Verb: stagger

## Intent

A hit that staggers in the game (a power attack, a bash on a player who is
not blocking, a power attack that a block does not absorb) staggers its
victim on the victim's own screen and on every observer's, with the
engine's own magnitude, decided by the server.

Roadmap reference: skymp/ROADMAP.md "Anims triggered by enemy" ("Usually in
PvP. Stagger, random dodge animation, sprint collision reaction"); the
stagger only (dodges and sprint collisions are later slices).
Milestone: M2 (docs/PLAN.md M2 5a, split from blocking on 2026-10-10)
Class: B

## Authority

Rung: R0 for whether a hit staggers and its magnitude; R2 for the stagger's
animation, which the victim's game plays at the server's word and its
client relays.
- Whether a hit staggers, and how hard, is the server's: the engine's
  formula (below) from the records (the attacker's weapon, the attack it
  started, the victim's race) and the server's own state (the backed power
  and bash flags, damage-flags and blocking; the victim's block, shield and
  Block skill; its running).
- The victim's game staggers its player when the server says so, with the
  server's magnitude and the attacker as the source; its stagger animation
  then reaches observers as any of its animation events (recorded and
  relayed).
- The attacker's game's own stagger of the victim's figure is never shown:
  it is that game's verdict, a round trip late (deathService already
  refuses it).
Why not R1: the victim's game never sees the hit (a figure's hit lands
nothing in the victim's game, docs/verbs/blocking.md, x-block-probe), so it
cannot compute the stagger; the attacker's game sees the victim through a
figure and its verdict is the one the server does not trust.
Rate limit / bounds: one stagger per hit the server takes; a stagger's
magnitude in (0, 1] as the engine clamps it; the victim's game refuses a
second stagger while it is staggered (the engine's own rule).

## Engine surface

- What the server does today (fork parity, m2-god): no stagger anywhere.
  AnimationSystem records each actor's last power attack start and, on
  m2-block, its last bash start (AnimationSystem.cpp), not which attack.
- What the client does today: deathService refuses staggerStart on every
  figure (skymp5-client deathService.ts:44-56, a sendAnimationEvent hook
  over 0xff000000 to 0xffffffff that blanks the event), so no figure ever
  staggers, whichever game or relay sends it. A relayed animation reaches a
  figure through sync/animation.ts applyAnimation (:122-180, Debug.
  sendAnimationEvent at :180), which already keeps an allow list for
  attacks on references with their default animations disabled
  (allowedAnims, :170-174).
- The engine's own reading (thuum ghidra/notes/block-formula.md, the
  re-analyst on 1.7.104 under Address Library IDs shared with 1.6.1170,
  2026-10-10; HYPOTHESIS by rule 2 until the lab agrees):
  - the magnitude, HitData.stagger (CommonLibSSE-NG include/RE/H/HitData.h:
    69), set by ID 44009 when the hit is built: an attack's (ID 26428) =
    the weapon's stagger x the attack data's staggerOffset / (fStaggerMassMult
    x m + fStaggerMassBase) - max(0, (m - fStaggerMassOffsetBase) x
    fStaggerMassOffsetMult), plus the attacker's BowStaggerBonus (actor
    value 87) for a bow or crossbow, m the victim's Mass (actor value 36)
    times fStaggerPlayerMassMult when the victim is the player; a bash's (ID
    26422) = (the attacker's Block x fStaggerAttackMult + fStaggerAttackBase)
    / (fStaggerMassMult x Mass + fStaggerMassBase) x fStaggerRunningMult if
    the victim runs x fStaggerRecoilingMult if it recoils x
    fStaggerBlockingMult if it blocks x fStaggerShieldMult for a shield bash
    (fStagger1WeapMult or fStagger2WeapMult for a weapon's) x the bash's
    staggerOffset, at least fStaggerMin; against a blocking victim an
    attack's loses ID 26426's reduction, fStaggerBlockAttackShieldMult x R
    + fStaggerBlockAttackShieldBase + fStaggerBlockMult x Block +
    fStaggerBlockBase + the mass offset of the victim's own Mass, unscaled
    (ID 44009 passes actor value 36 itself; R the shield's rating, or a
    drawn weapon's type value by ID 18093), at least fStaggerMin, tested by
    IsBlocking before the cone;
  - the gate, ID 38586 (the victim's hit reaction): only when the hit dealt
    damage and did not kill, outside kill moves; a timed bash (kTimedBash,
    HitData.h:37) makes the victim perform kActionLargeRecoil instead
    (BGSDefaultObjectManager.h:89); otherwise with HitData.stagger above 0:
    a player victim always staggers while bPlayerAlwaysStaggered:Combat (an
    INI bool, 1 by default) holds, any victim of a blocked hit or a bash
    (kBlocked, kBash, HitData.h:21 and 36) always, of a bow, a staff or a
    crossbow always, others at iStaggerAttackChance;
  - the start, ID 37710 (`void(Actor* target, float magnitude, Actor*
    source)`): refused while the target is staggered (ActorState's
    staggered bit, include/RE/A/ActorState.h:134), restrained or in
    ragdoll; the perk entry points kModTargetStagger and kModIncomingStagger
    (include/RE/B/BGSEntryPoint.h:46-47); the magnitude clamped to 1; the
    graph floats staggerMagnitude and staggerDirection
    (include/RE/F/FixedStrings.h:167-168; the direction the yaw from the
    target's heading to the source over 2 pi) set; the default action
    kActionStaggerStart performed (BGSDefaultObjectManager.h:85); the
    staggered bit set, which the graph's staggered-stop handler clears.
  - Address Library IDs 37710, 38586, 44009, 26428, 26422, 26426, 32887
    (SetGraphVariableFloat), 41557 (perform an action) and 14993 (the
    action's data) all resolve for 1.6.1170 (`just addr`, 2026-10-10).
- The records (Skyrim.esm, read with lab/esm.py on sky-srv, 2026-10-10):
  - a weapon's stagger, WEAP DNAM's float at offset 0x60: Iron Sword 0.75,
    Iron Battleaxe 1.15, Long Bow 0 (in memory TESObjectWEAP::Data's
    staggerValue, include/RE/T/TESObjectWEAP.h:174); libespm's WEAP DNAM
    reads 12 of its 100 bytes today;
  - an attack's staggerOffset, RACE ATKD at +24, named by the ATKE that
    follows it (include/RE/B/BGSAttackData.h:32): NordRace and OrcRace both
    attackStart 0, attackPowerStartForward and attackPowerStartInPlace 1.0,
    attackPowerStartForwardH2HRightHand 0.5, bashStart 0.5, bashPowerStart
    1.5; libespm's RACE reads ATKD's strike angle only;
  - a race's base Mass, RACE DATA at +52: 1.0 for both (actor value 36,
    include/RE/A/ActorValues.h:44);
  - the settings: Skyrim.esm sets fStaggerPlayerMassMult 2.5,
    fStaggerMassOffsetBase 2.1, fStaggerMin 0, fStaggerBlockBase 0.001,
    fStaggerBlockAttackShieldMult 0.001, fStaggerBlockAttackShieldBase 0.01,
    fStaggerBlockMult 0.005, fStaggerBlockingMult 0, iStaggerAttackChance 50
    (and fStaggerBlockAttackMult -0.0001, which no code reads); Update,
    Dawnguard and Dragonborn set none; the rest keep the executable's
    defaults (the notes' table): fStaggerAttackBase 0.5, fStaggerAttackMult
    0.01, fStaggerMassBase 0, fStaggerMassMult 1, fStaggerMassOffsetMult
    0.15, fStaggerShieldMult 1, fStagger1WeapMult 0.2, fStagger2WeapMult
    0.5, fStaggerRunningMult 1.5, fStaggerRecoilingMult 1.5,
    fStaggerDaggerAR 5, fStagger1WeapAR 10, fStagger2WeapAR 15,
    fStaggerBowAR 5.
- Worked numbers (HYPOTHESIS, from the reading above): a Nord's forward
  power attack with an Iron Sword on a player, 0.75 x 1.0 / (1 x 1.0 x
  2.5), less (2.5 - 2.1) x 0.15, is 0.24; on a player blocking with an Iron
  Shield at Block 20, minus 0.001 x 20 + 0.01 + 0.005 x 20 + 0.001 + 0 (Mass
  1 is under the offset's 2.1) = 0.131, leaving 0.109 (a blocked hit always
  staggers; the doc's first draft took the scaled mass here, 0.049); a
  plain swing, offset 0, none; a shield bash at Block 15 on a player not
  blocking, (15 x 0.01 + 0.5) / (1 x m) x 1 x 0.5 = 0.325 with m 1.0, or
  0.13 if the bash path takes the player's mass multiplier too (unread; the
  rule takes it unscaled, as the notes read ID 26422); on a blocking
  player, times fStaggerBlockingMult 0: none.
- The victim's own game does not stagger from a figure's power attack:
  CONFIRMED (x-stagger-probe 20261011-055806: the victim's game recorded
  the hit taken, but no staggerStart reached its player and IsStaggering
  stayed false, unblocked and blocked), though the engine's gate would
  stagger a player on any hit with stagger above 0 (the figure's hit there
  carries none, or never reaches the reaction).
- TiltedEvolution (a map only, ADR-005): staggerMagnitude,
  staggerDirection and IsStaggering are among its synced graph variables
  (block-formula.md, its last hypothesis); no stagger hook.

## Observe (host or acting client sees the intent before the engine acts)

- Hook point: none new in the games. The server records which attack each
  player started (its last attack start event by name, beside the power
  attack and bash starts AnimationSystem already keeps), to find the
  attack's staggerOffset among its race's ATKD.
- SP filter: the animation relay's, as now.
- Data captured: the attack start's event name; OnHit's flags as backed.
- Side effects of hooking here: none new.

## Impose (observers render the server's decision)

- Mechanism: after a hit the server takes and its damage, a stagger with
  magnitude above 0 that passes the gate sends the victim's game an
  SpSnippet calling a new client native, TESModPlatform.Stagger(target,
  magnitude, source), with the victim's player and the attacker's figure:
  the native calls the engine's own start (ID 37710), so the graph floats,
  the action, the staggered bit and the perks are the engine's. The
  victim's client relays its player's stagger animation as any event, and
  each observer's game plays it on the victim's figure: deathService lets a
  relayed staggerStart through (applyAnimation marks it, as allowedAnims
  marks attacks) and still refuses one its own engine starts.
- Visual without simulation achieved by: the relayed staggerStart on the
  figure. HYPOTHESIS: which stagger the figure plays with its own
  staggerMagnitude and staggerDirection unset (the probe watches; if it
  plays the wrong one, the server's snippet goes to observers too, with the
  figure as the target, or the relay carries the two floats).
- Side effects: HYPOTHESIS (the victim loses its controls for the stagger's
  length, as in the game; a stagger that lands while the victim's game
  refuses one, already staggered, is dropped there, as the engine does).

## Suppress (engine's own behavior blocked on non-hosts)

- What is suppressed: an observer's own engine staggering a figure from its
  own verdict (deathService's refusal, kept for engine-started staggers).
- How: the sendAnimationEvent hook's filter, narrowed by the allow mark.
- Release condition: none.
- Side effects: none (the victim's own game does not stagger from a
  figure's hit, CONFIRMED above, so nothing more needs refusing there).

## Message contract

- No new message: OnHit in; SpSnippet (MsgType 30) to the victim's game
  out; the animation relay as now.
- Validator rules: unchanged.
- Idempotency / ordering: one snippet per hit the server takes, after its
  damage on the reliable channel.
- Contract doc updated: no change.

## Server

- Where the logic lives: wire-rules stagger (Rust, ADR-010): the magnitude
  from the facts (an attack's or a bash's, the block's reduction, the
  floor) and the gate (a player victim always while the server's own
  playerAlwaysStaggered setting holds, default true as the game's INI; a
  blocked hit or a bash always; a bow, a staff or a crossbow always; others
  at iStaggerAttackChance), the settings from the masters and the
  executable's defaults as constants with the notes' citations. The C++
  core gathers the facts: the weapon's stagger and the race's ATKD
  staggerOffset by the attack's event name and Mass (libespm WEAP DNAM,
  RACE ATKD and DATA, each read further), the victim's Block and the
  shield (blocking's facts), running (movement's runMode), recoiling (not
  recorded: false); sends the snippet after OnWeaponHit's damage, not for a
  hit that killed.
- DB fields / migration: none.
- Restart behavior: none (a stagger is live).
- Papyrus natives touched: none on the server; TESModPlatform.Stagger on
  the client, with its ledger line (Client only, R0: the server's
  magnitude).

## Client

- SP binding: TESModPlatform.Stagger(Actor target, Float magnitude, Actor
  source), skyrim-platform PapyrusTESModPlatform, calling ID 37710 through
  REL::Relocation (the signature from the notes, HYPOTHESIS until the
  probe), declared in the .psc and the committed .pex (lab/pex.py
  add-native).
- TS handler: deathService.ts's hookDisableStagger narrowed by an allow
  mark that sync/animation.ts applyAnimation sets for a relayed
  staggerStart.
- Kill switch config key: none (the server's rule).

## Tests

- T0: wire-rules stagger (the worked numbers: the power attack's 0.24, the
  blocked one's 0.109, a plain swing's none, a bash's on a player and none
  on a blocker; the gate's cases; the floor and the clamp; nonsense
  refused); the server (a power attack on a player sends the victim the
  snippet with its magnitude and the attacker; a plain swing sends none; a
  killing hit none; a bash on a blocker none).
- T1: none.
- T2: a difftest session: c1 starts a forward power attack
  (attackPowerStartForward among its animation events) and hits c2 with
  the power flag: the legacy server sends c2 no stagger; the fixed server
  sends it the snippet. Declared.
- T3 scenario id: lab/scenarios/b-stagger.yaml: c1 power attacks c2 (the
  attack key held): c2's own game staggers (staggerStart among its own
  events, IsStaggering), c1's game shows c2's figure stagger; a plain swing
  staggers nobody; a bash on c2's raised shield staggers nobody, on c2's
  lowered one staggers c2.
- Assertions that would fail if the verb silently regressed: the stagger
  seen in the victim's game and on the figure in the attacker's for the
  power attack and the bash, and in neither for the plain swing and the
  bash on the raised shield.

## Dynamic plan (fill when any tag above is still HYPOTHESIS)

- Driver first (thuum lab/driver): watch-start also records each watched
  figure's animation events (a second hook over the figures' range, rule 9
  filtered to stagger* and recoil*) and its IsStaggering on each change; a
  step `graph-float {name, value}` sets one of the player's graph floats
  (ObjectReference.SetAnimationVariableFloat).
- x-stagger-probe, on parity (no server stagger yet): c1 and c2 hold Iron
  Swords facing each other, both watching (bools IsStaggering):
  1. c1 power attacks c2 (Right Attack held, hold-key 199 for 1.2 s): does
     c2's own game stagger from the figure's hit (the Suppress question),
     does c1's engine try to stagger c2's figure (a blanked event), what
     does the server log of the hit (the power flag backed);
  2. c2 staggers itself by the graph's floats and the event (graph-float
     staggerMagnitude 0.24, staggerDirection 0, anim-event staggerStart):
     does c2's game play a stagger (IsStaggering, controls), does c2's
     client relay staggerStart (c1's client log, the blanked figure event
     in c1's watch);
  3. c1 bashes c2 with its shield lowered, then raised (anim-event
     bashStart): the engine's own verdict in c1's game.
  Read: whether the victim's own game staggers from a figure (Suppress),
  whether a self-started stagger relays, the event names. The native's own
  call (ID 37710) is measured on the branch, before b-stagger.
- Expected: no stagger in c2's own game from c1's figure; the self-started
  stagger plays and relays and is blanked on c1's figure; c1's engine
  blanks its own stagger of the figure.
- Owner: agent.
- x-stagger-probe 20261011-055806 (on the m2-block server, lab-driver
  eff3448), each expectation CONFIRMED:
  - a power attack (c1, standing: attackPowerStartInPlace; the server
    backed it, 12.656 of c2's 100): c1's engine sent staggerStart to c2's
    figure 15 ms before its hit, which deathService blanked (not taken);
    c2's own game recorded the hit taken and did not stagger;
  - the same on c2's raised shield (the server's share 0.502 x 0.66): c1's
    engine again sent the figure a staggerStart (a blocked hit always
    staggers), blanked; c2's own game played blockAnticipateStart and
    blockHitStart and no stagger, and showed c1's figure recoiling;
  - c2 staggered itself with the graph's floats and the event
    (staggerMagnitude 0.24, staggerDirection 0, staggerStart): its game
    played a stagger (IsStaggering for 1.7 s) and its client relayed the
    staggerStart, which c1's game blanked on the figure, the refusal this
    verb narrows;
  - the driver's bashStart is no bash to the engine: both "bashes" landed
    as plain swings (6.328, then the shield's 0.502), so b-stagger bashes
    by the game's own keys (block held, then attack).
  Left for the m2-stagger build: the native's own call (ID 37710) staggering
  the player at the server's word, the relay playing on the figure once
  allowed, and which stagger the figure plays with its floats unset.

## Status

Doc written 2026-10-10, before any code; blocking's notes (thuum
ghidra/notes/block-formula.md) are the engine reading. Fork branch
m2-stagger, stacked on m2-block f828279f: 55acfc49 the rule (wire-rules
stagger, bridged, tests), c73e423a the server (libespm's WEAP stagger,
RACE mass and ATKD offsets and the stagger GMSTs; AnimationSystem's last
attack by name; OnWeaponHit's stagger snippet after the damage;
StaggerTest), 742044fe the client (TESModPlatform.Stagger over ID 37710,
AE only; deathService lets a relayed staggerStart through), acf5627c the
difftest session. T0 green (fork pipeline 1223: 334 test cases);
Windows run 38112498776 green; T2 green (2026-10-10 23:22: the session's
TESModPlatform.Stagger(the player, 0.24, c1's figure), declared from the
formula, held). Staged 2026-10-11 01:41 for b-stagger: the server sent
c2's game TESModPlatform.Stagger(the player, 0.24, c1's figure) at the
power attack (its log), and c2's game never staggered (20261011-084217,
-084440, red): x-stagger-snippet 20261011-084719 read c2's console,
"SpSnippet TESModPlatform Stagger failed TypeError: Cannot read
properties of undefined (reading 'apply')": a snippet's global function
runs through Skyrim Platform's bindings, which come from its own dump and
lack its TESModPlatform natives (the ledger's "not in SP's dump"), so any
server snippet to one of them failed. c9762817: spSnippetService calls an
unbound global by name through callNative (the update context snippets
run in), as magicEffectsService calls its natives. On that client
(b-stagger 20261011-213039, -213301, red): c2's game staggered at the
server's word (IsStaggering for 1.75 s), but no staggerStart showed among
its own events and none reached c1: the engine's stagger is an action,
which Skyrim Platform's sendAnimationEvent hook never sees, so the
victim's client cannot relay it. bba1450e: the server relays the stagger
itself to every game that sees the victim, as the victim's own
staggerStart (an UpdateAnimation to its listeners; the victim's client
draws no figure of itself), which deathService lets through; StaggerTest
and the T2 session cover it. b-stagger reads the victim's side from its
graph's IsStaggering and the figure's from the relayed event and its
IsStaggering. 9cfbcff7 sends to each listener itself (the base class's
send to listeners is protected; fork pipeline 1244 failed on it).
b-stagger (thuum 7431108) green twice on 9cfbcff7 (20261011-220330 and
-220642): the power attack and the blocked one staggered c2 in its own
game and on c1's screen (the relayed event taken, the figure's
IsStaggering), the plain swing nobody. T2 on 9cfbcff7 went red on its
session alone: difftest compares UpdateAnimation (t 3) as presence only by
default, so the declared relay could never occur; f321a52f compares it
message by message and declares the relay to c2 too (an actor listens to
itself), and T2 went green on f321a52f (2026-10-11 18:32: the session
identical up to 8 declarations). DONE 2026-10-11: the merge sweep went 37
of 37 green on the m2-stagger server (b-stagger first; runs
20261011-223751 to 20261012-011230, paused for playtest thirteen; b-spell
red once, green on both reruns, an ADR-027 watch item in spell-cast.md);
fork parity fast-forwarded to f321a52f and both clones' clean-m1
promoted.

- [x] doc complete, rung declared
- [x] engine surface cited or delegated (the re-analyst's reading; the lab
      confirmed the victim's game, the attacker's engine and the relay)
- [x] server logic + T0
- [x] message + validator (same commit): no message change (SpSnippet)
- [x] native hook + T1: TESModPlatform.Stagger (the engine's own start,
      confirmed in the victim's game by b-stagger); T1 none
- [x] TS handler (deathService's narrowed refusal; the snippet's
      callNative fallback for an unbound global)
- [x] T2 green on the final commit (f321a52f, 2026-10-11, the relay
      declared to both games)
- [x] T3 scenario green: b-stagger (thuum 7431108, awaiting Eli's review)
      green twice; HYPOTHESIS left: which stagger the figure plays with its
      staggerMagnitude and staggerDirection unset (playtest fourteen's
      eye), a timed bash's large recoil (not told apart), and the bash's
      stagger (the lab cannot bash by event)
- [x] ledger and suppression registry updated (TESModPlatform.Stagger's
      row, R0, client only; the suppression is deathService's narrowed
      refusal)

## Playtest fourteen (2026-10-12, Eli, parity ef3fb03c)

- No stagger from test 1's power attacks, with or without test 2's shield,
  and the server logged none. Not a server fault: the attacker was rotfern,
  whose race (rotfern.esp RACE 0x0200AA00) carries a staggerOffset of 0.0
  on every attack, power attacks and bashes included, where the Nord's
  power attacks carry 1.0, its bash 0.5 and its power bash 1.5 (ATKD at
  byte 24, CommonLibSSE-NG BGSAttackData::AttackData; read on sky-srv
  2026-10-12). The rule takes the attack's offset from the attacker's
  race, as the engine does, so rotfern's power attacks would not stagger
  in a single-player game either; b-stagger's attacker is a vanilla race.
  The server's hits show the power attack's damage (12.91 against a plain
  swing's 6.62, 23:01:41). Eli, 2026-10-12: "yes give her vanilla values":
  apocrypha sets rotfern.esp's staggerOffsets to the Nord's per attack
  (asked 2026-10-12), then the lab lays the plugin in. Playtest fifteen
  checks both directions: test 2's Nord on rotfern, and rotfern after.
- rotfern.esp patched (apocrypha, 2026-10-12: only the two RACE records'
  ATKD bytes 24-27, the Nord's value per ATKE; CRC32 F57D6BFD), laid into
  the lab (persist-mods, client-mods, both clones' clean-m1 promoted):
  x-rotfern-stagger 20261012-233851 had c1 become rotfern (race 0x0800AA00)
  and power attack c2: the server's "attackpowerstartinplace ... staggers
  it by 0.24" on a 12.99 hit, c2 staggering in its own game (IsStaggering)
  and on c1's screen (the figure took staggerStart). Eli's own install
  needs the same file (the server checks a plugin's size and CRC).

Reverted 2026-10-20 06:23 PDT (Eli, after playtest twenty-six: "given it's
tested now, take stagger from her as well"): the lab now runs rotfern.esp
CRC32 F483303D (99,409 bytes, sha256 790d3b6c1a877fc31de8a487b8bca5fe7f25
3f709f2fcf86de62c8d40053036a), byte-identical to the pre-stagger file of
2026-10-12 (apocrypha; the Nord-values file F57D6BFD is kept as
backups/rotfern.esp.pre-staggerrevert-20261020.bak). Her child unarmed
damage and reach stay as authored. The server checks a plugin by size and
CRC32, so every player's install, Eli's Fenestrate included, needs the
F483303D file from the layer.

## Playtest fifteen (2026-10-13, Eli, parity 11c126b9)

- Passed, both ways: the server's "attackpowerstartinplace on ff000001
  staggers it by 0.24" at 20:06:33 and 20:06:36 UTC, and test 2's power
  attack on test 1 at 20:10:20. Blocked: test 1's power attacks on test 2's
  raised shield at 20:11:08 and 20:11:13, blocked share 0.331, stagger
  0.109.
- Found (small): with test 2's shield raised, its block-and-stagger
  animation shows whole on test 2's own screen and not on the figure on test
  1's.

## A spell's stagger (fork m2-fifteen 4a4c80e1, 2026-10-13)

- A spell's Stagger effect (archetype 33, CommonLibSSE-NG
  include/RE/E/EffectArchetypes.h; Unrelenting Force's push,
  VoiceUnrelentingForceEffect02 and 03) staggers its target by the effect's
  magnitude: the server's spell hit path calls PlayStagger, the weapon
  stagger's tail (the target's game told through TESModPlatform.Stagger,
  every game that sees the target sent the relayed staggerStart). The
  engine's own push never moved a player, because the server decides a
  player's staggers (playtest fifteen, Eli: "does unrelenting force
  ragdoll"; x-uf-ethereal saw no push). ShoutsTest: a shout's hit tells the
  target's game to stagger, and the shouter's figure of it staggers.
- x-uf-push (20261013-231113, by path): c1 shouts Unrelenting Force's three
  words (spell 0x13F3A, two Stagger effects at 1.5) at c2 150 units off.
  The server: "stagger: ff000000's spell 13f3a on ff000001 staggers it by
  1.5"; c1's figure of c2 took the relayed staggerStart; c2 stayed up in its
  own game (dump-state's down false before and after) and did not move (y
  -150.0 on the server); it lost the shout's damage (0.5401 on the server,
  0.5445 in its game). HYPOTHESIS false: the graph's stagger at 1.5 does
  not throw a player; it is a stumble.
- The throw is a later slice, and it is not the stagger's. In the game,
  Unrelenting Force's full shout ragdolls its target: thrown back by
  physics, away from the shouter, and up again after (Eli, 2026-10-13: "more
  than knockdown it's a whole ass ragdoll").
  - Read directly (2026-10-13, the re-analyst on sky-re; lab/pex.py over
    Skyrim - Misc.bsa, nothing left sky-re): Skyrim.esm VoiceUnrelentingForce3
    (SPEL 0x13F3A, the third word only; the first two words' spells carry no
    push) has three effects: VoiceUnrelentingForceEffect03 (MGEF 0x7F82F) at
    1.5, 0xEA075 at 10, VoiceUnrelentingForceEffect02 (0x7F82E) at 1.5.
    0x7F82F's VMAD attaches VoicePushEffectScript with PushForce 15. The
    script's one event is OnEffectStart(Target, Caster), which calls
    Caster.PushActorAway(Target, PushForce). Neither MGEF has an explosion.
    The same script, at other forces, pushes for the dragons' Unrelenting
    Force, the werewolf's knockback and howls, the shield charge, Dawnguard's
    reflecting shield and Dragonborn's spectral dragon.
  - HYPOTHESIS (decompiled; 1.7.104's bodies under the shared Address
    Library ids, as 1.6.1170's .text is wrapped):
    - StaggerEffect::Start (ID 34982) only staggers: the magnitude through
      the mass formula (ID 44009) to the graph's stagger (ID 37710: clamped
      to 1, staggerDirection 0 without a source, no new stagger while one
      plays), about 0.54 for a player of Mass 1;
    - every ragdoll goes through AIProcess::KnockExplosion (ID 39895), which
      Papyrus PushActorAway (ID 56213) calls with the pusher's position as
      the source; a race flagged kNoKnockdowns is staggered instead.
  - Why a player is never thrown here: skymp5-client blanks the Papyrus
    events of effects (docs/apocalypse-options.md 3.1), so the script's
    OnEffectStart never runs in the target's game.
  - Under ADR-031 the throw is not rebuilt. The target's game holds the
    word's effects from the shouter's figure, and the client lets an effect
    on its own player run its script (ADR-029's A1 filter). The vanilla
    script then pushes from the figure's position with the vanilla force.
    The server decides the shout and its hit; the target's game zeroes only
    the damage (be69bf68's fDiffMultHPToPC*).
  - Skyrim Platform's own pushActorAway (CallNative.cpp:344-372) passes the
    target as the pusher, so it would push from the target's own feet; it
    is not the path.
  - The figure's flight on other screens is the slice's hard half: the
    movement relay carries a position, not a ragdoll's pose.

## The staggered cast (playtest twenty-one; the engine alone, 2026-10-18)

Twenty-one's note on the staggered caster ("staggers and yet is still able
to cast") is the engine's own behavior. r-stagger-cast 20261018-074517
(solo, parity ef02c565 with the freeze fix layer): an aggressive bandit
(EncBandit01Melee1HNordM with an Iron Sword) fought the player for 55 s
while the player charged vanilla Firebolt eight times for 3 s each. Four
StaggerPlayer events landed (8.9, 15.4, 26.2 and 33.4 s into the watch);
two of them fell on a charged spell (the charge's start at 24.9 and 31.5 s,
ready at 25.4 and 32.0 s), and both casts still released at key-up (27.9
and 34.5 s) and fired (28.0 and 34.7 s). The graph shows no interrupt: the
stagger plays over the held charge and IsCastingRight stays true until the
release. So a staggered player keeps its charge in Skyrim itself, and the
server's imposed stagger (TESModPlatform.Stagger) doing the same is parity,
not a gap. No fix; the big playtest's item becomes a check that both games
agree with this.
