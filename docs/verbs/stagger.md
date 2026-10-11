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
    fStaggerBlockBase + the mass offset (R the shield's rating, or a drawn
    weapon's type value by ID 18093), at least fStaggerMin, tested by
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
  Shield at Block 20, minus 0.001 x 20 + 0.01 + 0.005 x 20 + 0.001 + 0.06 =
  0.191, leaving 0.049 (a blocked hit always staggers); a plain swing,
  offset 0, none; a shield bash at Block 15 on a player not blocking,
  (15 x 0.01 + 0.5) / (1 x m) x 1 x 0.5 = 0.325 with m 1.0, or 0.13 if the
  bash path takes the player's mass multiplier too (unread); on a blocking
  player, times fStaggerBlockingMult 0: none.
- The victim's own game: HYPOTHESIS that a figure's power attack does not
  stagger the player there (a figure's hit lands nothing in that game,
  x-block-probe), measured below; the engine's gate would stagger a player
  on any hit with stagger above 0.
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
- Side effects: HYPOTHESIS (if the victim's own game staggers its player
  from a figure's hit, that stagger is the attacker's game's verdict and
  needs refusing too; the probe looks for one).

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
  blocked one's 0.049, a plain swing's none, a bash's on a player and none
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

## Status

Doc written 2026-10-10, before any code; blocking's notes (thuum
ghidra/notes/block-formula.md) are the engine reading.

- [ ] doc complete, rung declared
- [ ] engine surface cited or delegated
- [ ] server logic + T0
- [ ] message + validator (same commit)
- [ ] native hook + T1
- [ ] TS handler
- [ ] T2 green
- [ ] T3 scenario green, no HYPOTHESIS tags
- [ ] ledger and suppression registry updated
