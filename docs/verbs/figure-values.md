# Verb: figure-values

Drafted 2026-10-18 during playtest twenty-three's wait, from Eli's decision
of the same day (docs/private/decisions-m2-apocalypse.md §6: "figures carry
their player's real base values") and a read of fork parity d5b05e89. Built
the night of 2026-10-19 on fork m2-train-28 (train-28, playtest twenty-five's
evening train) as the sections below say; the lab reads are the stage's.

## Intent

Another player's figure (the PlaceAtMe actor that stands for a remote player
in this game) carries that player's real base Health, Magicka and Stamina,
the maxima the server records, instead of a million, so a script or a reading
in this game sees the number Skyrim would show.

Roadmap reference: none
Milestone: M2 (the class pass's finding, docs/PLAN.md)   Class: B

## Inventory (ADR-031: the action's consequences, before its rung)

The action is "a player looks at, or a script reads, another player's
figure's values". Its consequences in the engine, from the records and the
class pass (x-class-target2 20261018-105815 on train-24; no reference trace
is needed: the engine alone has no figures):

| consequence | seen in | disposition |
| --- | --- | --- |
| a figure's Health, Magicka and Stamina maxima, read by GetActorValue / GetBaseActorValue in any script (Finger of Death's threshold, Nature's Balance's swap, the execute-style spells; ADR-029's default runs them in the caster's game on the figure) | record (the spells' VMAD scripts, docs/research/apocalypse) and x-class-target2 (the caster took its own self-damage branch, 10000 to 1) | imposed: the server's recorded maxima (actor-values' bases 24, 25, 26) set on the figure at spawn and on change |
| the figure's shown health fraction (the server's percentage scaled by the figure's maximum: a bar, a script's percentage test) | ChangeValues (MsgType 16) and UpdateMovement's healthPercentage, applied by setActorValuePercentage against the figure's current maximum | imposed, unchanged: the same percentage now reads as the right absolute number |
| a local hit, arrow or spell of this game draining or killing the figure before the server's number | the million's first job today (formView.ts:316-318 with startDeferredKill) | suppressed, already: attackDamageMult 0 on the figure (formView.ts:303), the AddTarget refusal of Health, Magicka and Stamina effects a figure applies to the player and a figure's enchantments (Skyrim Platform Hooks.cpp:97-98, :123-127, ADR-037 gate 1), HandleHealthDamage dropping figure attackers (Hooks.cpp:174-181, gate 2); HYPOTHESIS for the figure as the VICTIM of this game's own player: the player's own melee and arrows on a figure deal their engine damage locally today and the million absorbs it (hit-cone, marksman); with a real maximum they would move the figure's bar before the server's number: see Suppress |
| a stream's drain on the figure (the caster's magicka, shown on the figure) | spell-cast.md:421-468 (drainMs timed against the relayed cast and the server's clock) | imposed, already the server's |
| a figure dying in this game (IsDead, the death animation) | never today (startDeferredKill, the million) | suppressed: stays never; the server's death (deathService's kill from the record) is the only death |

### Sequences and combinations (ADR-033)

| sequence or combination | probe or scenario | result |
| --- | --- | --- |
| a figure spawned before its player's record arrives (login order, a cell change) | b-figure-values (both orders: c1 then c2, c2 then c1) | |
| the player's maxima change while seen (a Fortify Health effect, actor-values' record changing, a restart restoring them) | b-figure-values (c1 drinks, c2's figure of c1 follows) and b-magic-restart's figure | |
| a stream from c1 on c2's figure, then c2's own bar | b-figure-values (the figure's bar moves only by the server's number) | |
| the player's own melee and arrows on a figure (the victim case) | x-figure-values-hit (c1 hits c2's figure; the figure's Health in c1's game against the server's) | |

## Authority

Rung: R0
Why this rung and not the one above it: the maxima are the server's record
already (actor-values, R0); the figure only renders them. Nothing is computed
on a client; nothing new is reported by one.
What the server validates (R1) or records (R2): nothing new; the record is
actor-values'.
Rate limit / bounds: the bases are bounded by actor-values' validator (finite,
164 indices); the three maxima sent to observers are those three bases.

## Engine surface

- CommonLibSSE-NG symbol(s): Actor value storage on the actor,
  include/RE/A/ActorValueOwner.h (GetActorValue, GetBaseActorValue,
  SetBaseActorValue; the Papyrus SetActorValue the client uses sets the
  base). Permanent and temporary modifiers: ActorValueOwner's
  GetPermanentActorValue and the RestoreActorValue / DamageActorValue
  pair. No new native: Skyrim Platform's Actor.setActorValue and
  Actor.getBaseActorValue cover it (skyrimPlatform.ts, the codegen).
- Address Library ID(s): none needed (Papyrus natives through Skyrim
  Platform).
- Where the million is set today: skymp5-client/src/view/formView.ts:316-318
  (health and magicka, once per instance, after startDeferredKill);
  formView.ts:303 attackDamageMult 0. Stamina is not set (the base's value
  stands).
- How the server's percentages scale: skymp5-client/src/sync/actorvalues.ts
  :25-46 (getMaximumActorValue, setActorValuePercentage: the fraction
  times the actor's maximum, so whatever maximum the figure holds).
- The server's maxima: skymp5-server/cpp/server_guest_lib/MpActor.cpp
  :2126-2152 GetMaximumValues reads GetRecordedActorValueBase(24, 25, 26)
  (actor-values' record) as the live maxima for its own percentages.
- What observers receive at a figure's spawn: CreateActorMessage props
  (health, magicka, stamina, healthPercentage) are filled only under
  VisitPropertiesMode::All (MpActor.cpp:427-429, GetBaseActorValues.cpp
  :6-22), and All is used only for the owner (PartOne.cpp:922-928, isOwner =
  emitter == listener). ChangeValues (MsgType 16) and the ActorValues record
  (MsgType 40) go to the owning connection alone (MpActor.cpp:898-944,
  :1255-1275, SendToUser). So no message today carries a player's maxima to
  an observer (read on d5b05e89, 2026-10-18).

## Observe (host or acting client sees the intent before the engine acts)

- Hook point: none new. The owning client already reports its bases
  (actor-values' ActorValues message) and its percentages (ChangeValues).
- SP filter: none.
- Data captured: nothing new.
- Side effects of hooking here: none.

## Impose (observers render the server's decision)

- Mechanism: the server includes the three recorded maxima in the figure's
  properties for observers (CreateActor's props under OnlyPublic, when a
  record exists; a property update when the record changes, as every other
  public property travels), and the client sets them on the figure as its
  base values at spawn and on each change, instead of the million; the
  percentage then scales against them. A player with no record yet (a new
  character before its first ActorValues report) keeps the engine's race
  defaults until the record arrives; the million is not set at all.
  BUILT (fork m2-train-28): MpActor::RecordedMaxima (the recorded bases 24,
  25, 26 with the running buffs, GetMaximumValues, once any of the three is
  recorded) fills CreateActor's health, magicka and stamina props under
  OnlyPublic; MpActor::SendMaximaToListeners sends the three as property
  updates (t 7) when the record changes (ActionListener::OnActorValues) and
  when a buff moves a maximum (ApplyAttributeDeltas); formView.ts's
  applyFigureMaxima sets each as the figure's base once per value, restores
  the value and re-applies the fraction it showed before the set (the engine
  keeps the current value across a base change, so the share would jump
  otherwise); the million is gone, startDeferredKill stays.
- Visual without simulation achieved by: the figure's values are set, never
  simulated; regeneration on the figure is the engine's own and is
  overwritten by each percentage, as today.
- Side effects: HYPOTHESIS until b-figure-values: a figure whose base Health
  is set from the million down to its real value keeps its percentage (the
  engine clamps the current value to the new maximum: CK wiki, SetActorValue
  on Health; measure the first frame after the set); startDeferredKill keeps
  a figure at 0 alive (CK wiki, StartDeferredKill: "the actor will not die
  until EndDeferredKill"), so a local path that empties a real Health leaves
  the figure standing, visibly at zero, until the server's percentage puts it
  back (the victim case below).

## Suppress (engine's own behavior blocked on non-hosts)

- What is suppressed: this game's own damage to a figure's now-real values.
  The attacker side is covered (attackDamageMult 0, the AddTarget refusal of
  Health, Magicka and Stamina, the enchantment widening and HandleHealthDamage
  for figures as attackers: ADR-037). The VICTIM side is the open question
  this verb must measure: the local player's melee hit on a figure deals the
  engine's damage to the figure in this game (hit-cone and marksman count the
  server's number separately), and the million absorbed it; with a real
  maximum the figure's bar would fall by this game's number and then jump to
  the server's. HYPOTHESIS: set the figure's damage taken to zero through the
  same shape ADR-037 uses (a HandleHealthDamage drop when the VICTIM is a
  figure, keeping the hit event, the impact, the blood and the stagger), or
  through the engine's own means (the figure's damage resist actor value is
  capped at 80 % by the engine, so not that; an invulnerability flag is not a
  Papyrus value). The x-figure-values-hit probe decides which.
- How: a Skyrim Platform hook (the figure's HandleHealthDamage, vfunc 0x104
  on the figure's Actor vtable, by Address Library id from lab/addr.py, never
  from memory) or a client-side restore of the figure's value on its own hit
  event (worse: a visible dip). BUILT (fork m2-train-28, Hooks.cpp
  FigureHealthDamage on CommonLibSSE-NG's VTABLE_Character[0], vfunc 0x104 as
  include/RE/A/Actor.h:458 numbers it, beside ADR-037's PlayerHealthDamage):
  the damage is dropped when the victim is a figure; the hit event, impact,
  blood and stagger come earlier in the chain and stay. The figure is known
  by the mark skymp5-client puts on every figure at spawn, attackDamageMult
  0 (formView.ts), which no other actor carries; HYPOTHESIS until
  x-figure-values-hit that the mark is tight enough (a summon or a placed NPC
  with that value by some effect would be spared too), with a registry
  native as the follow-up if it is not.
- Release condition: none; figures are never hosted by their observer.
- Side effects: HYPOTHESIS until the probe.

## Message contract

- Message name / numeric type: no new message. CreateActor's existing
  optional props (health, magicka, stamina) filled for observers too, and
  the existing per-property update path for a change (both already in the
  Rust wire schema as optional fields: skymp-wire wire-schema skymp.rs,
  CreateActorMessage props). docs/WIRE.md's contract text gains the
  sentence that these three travel to observers when a record exists.
- Direction: server to every client that sees the actor.
- Fields (name: type, units, bounds): health, magicka, stamina: f32, the
  recorded base maxima, finite, positive (actor-values' bounds).
- Validator rules: unchanged fields; the validator already requires finite
  floats for props. Rule 4 holds: the contract doc and the validator move in
  the commit that fills the fields for observers.
- Idempotency / ordering: a later props update replaces an earlier one; a
  percentage arriving before the maxima scales against the race default and
  is corrected by the next percentage after the maxima land (one frame of a
  wrong bar at most, HYPOTHESIS).
- Contract doc updated: docs/WIRE.md (CreateActor's props for an observer,
  the three maxima, and the property updates that follow them).

## Server

- Where the logic lives: MpActor's property visitor (MpActor.cpp:427) emits
  the three maxima under OnlyPublic when GetRecordedActorValueBase has them;
  the ActorValues handler (actor-values') marks the three dirty so the public
  update path sends them on change.
- DB fields / migration: none; actor-values' record already persists them.
- Restart behavior: the record is restored with the actor, so observers get
  the maxima at the next spawn; b-magic-restart's figure checks it.
- Papyrus natives touched (ledger lines added): none new.

## Client

- SP binding: Actor.setActorValue (existing).
- TS handler: formView.ts's once-per-instance block (316-318) replaced by a
  model read (health, magicka, stamina maxima from props) applied at spawn
  and whenever those props change; the million gone; startDeferredKill and
  attackDamageMult 0 stay.
- Kill switch config key: none (a figure's values are not optional).

## Tests

- T0: the property visitor emits the three maxima under OnlyPublic when a
  record exists and nothing when it does not; a change of base 24 marks the
  public props dirty.
- T1: the Windows build's compile of the native gate (train-28's vfunc
  guard, then train-30's DamageActor replace); a Replace that Gum refuses
  logs critical at install.
- T2: a difftest session where c1 reports bases, c2 receives c1's CreateActor
  with the three maxima (the legacy stack sends none: the divergence listed).
- T3 scenario id: lab/scenarios/b-figure-values.yaml: c2's figure of c1 reads
  c1's recorded Health as its base (the driver's av-read on the nearest other
  actor, against server.actor(c1)'s record), in both login orders; c1's
  Fortify Health potion changes the figure's base within a tick; a stream
  from c1 on c2's figure moves the figure's bar only by the server's number
  (watched(c2).health series against ChangeValues' fractions); a restart
  keeps it. Plus x-figure-values-hit for the victim case (section Suppress).
- Assertions that would fail if the verb silently regressed: the figure's
  base Health equals 1000000 again; the figure's base differs from
  server.actor(c1)'s recorded base by more than 1; a local hit moves the
  figure's health series before the server's percentage does.

## Dynamic plan (fill when any tag above is still HYPOTHESIS)

- Frida script: lab/frida/figure-dent-trace.js, RUN on train-29's stage (x-figure-values-hit-frida 20261020-085705, the hitter's seat; docs/research/frida-reads-train29.md section A). CONFIRMED: the guard works as written (victim 0xff0008f5, attacker 0x14, kAttackDamageMult 0, the engine call dropped) and the bar still moved, because the slot-0x104 vfunc is reached from inside DamageActor 37335 after the write: Health 100 at 37335's entry, 93.83 at its leave, already 93.83 when the vfunc is entered. The vfunc is a post-write notification (ADR-037's caveat). The blocking point is 37335's entry, the gate Skyrim Together uses (docs/TE-MAP.md:62); its parameters, return and side effects are the re-analyst's question before any hook (rule 1): the trace saw args[1] = 0x3, the damage in an XMM register, return 0, and cannot say whether the hit event's dispatch is inside it. The fourteen other handler rows in the run are the client's own writes toward the server's percentage (attacker null, damages 0.75 down to 0.009, frames through SkyrimPlatformImpl.dll: HYPOTHESIS sync/movementApply.ts's quarter-gap damageActorValue), which the guard also silences.
- The static read (the re-analyst on REA, 2026-10-20, docs/research/
  re-37335-and-rune-landing.md, HYPOTHESIS from pseudocode, consistent with
  the trace): 37335 is `bool (Actor* this, float damage in XMM1, Actor*
  attacker in R8, bool killMove in R9B)`, TE's lead exactly; it returns
  IsDead(false) after the damage; the trace's args[1] = 3 is the float's
  dead integer slot. Inside, in order: IsInvulnerable and kIsInKillMove gate
  (return false touching nothing), the essential-down reset, the difficulty
  multiplier, the combat notice and trackedDamage, THE WRITE through 38468
  (which itself calls slot 0x104 after writing: the frame the trace saw),
  whose slot-0x104 body holds the bleedout and the deferred kill, then the
  destructible task. Outside and before the call, in the callers: the
  TESHitEvent, blood and impact, sneak and critical UI; after it: the
  enchantment cast, armor and perk passes, stagger, knockdown, animation
  reactions. So a gate at 37335's entry that returns false for a figure
  victim skips the number, the bleedout and the kill and keeps every visible
  reaction, and covers melee, magic (35086), fall, drowning and the
  explosion pass (ADR-037) in one place. CommonLib does not name 37335; the
  SE id is unknown; the fork's idiom for AE-only ids is a bare REL::ID
  (game/Offsets.h). Hook shape for train-30: replace 37335 through Frida
  Gum's interceptor-replace (the fork's Frida layer; a detour that keeps the
  original callable), the replacement returning false when `this` is a
  figure by the same mark (dynamic form id, kAttackDamageMult 0), else
  calling the original; the slot-0x104 guard then goes, since the write it
  tried to stop happens before it. BUILT 2026-10-20 on fork m2-train30-dent
  e6a8270a: HookHandler::Replace (gum_interceptor_replace, frida-gum
  16.0.19 gum/guminterceptor.h:49-51; the fork's Frida layer had attach-style
  hooks only until this), game/Offsets.h DamageActor REL::ID(37335) AE only
  as PerformAction, the replacement and its install in FridaHooks.cpp
  (InstallDamageActorHook), Hooks.cpp's FigureHealthDamage removed.
  HYPOTHESIS until the hit steps run: the replacement's calling convention
  is the function's (Windows x64, the float second argument in XMM1) and the
  figure's hit reactions stay. T3 for it, landed 2026-10-20 13:38:
  b-figure-values gains three sword hits on c2's figure with
  `c1.watched(c2).rises("health") == 0` (lab-api rises(), the count of the
  rises in the watched health series the driver records, main b7b0429),
  `server.actor(c2).healthPercentage < 0.99` and the bar at the server's
  percentage (scenario 52f06e1e, main 5f64b26; in gate.yaml's pending
  until the dent branch stages, after the spells branch). First run on the
  train stage (fork m2-train-30 44372078 over the fixed layer, b-figure-values
  20261021-003901): the gate holds and the assert's shape was wrong. The
  figure's health in c1's game (steps/032-c1-watch-stop.json, 69 samples,
  100 to 83.65) fell 38 times and rose 30, every rise between 0.009 and
  0.048 health: the figure's own regeneration between the server's reports,
  which the engine runs on a figure as on any actor; the three hits arrived
  as declines of 1.7 down to 0.6 over about 1.4 s each, with no dip of a
  hit's size and no climb-back, and the end values agreed (server 0.8337,
  c1's figure 0.8377). So the dent is gone (CONFIRMED as far as that run
  reads) and the assert becomes `rises("health", 1) == 0`, a rise of a
  point or more (lab-api's rises with a threshold; branch
  scenario-b-figure-values-rises). Two things the run also shows, for the
  record: the figure's bar eases toward the server's value over about
  1.4 s per hit rather than stepping (the observer's apply, worth its own
  read), and the figure regenerates locally between reports (hundredths; a
  figure's healRate at 0 would still it, if ever wanted). The alternative,
  MagicTarget::
  IsInvulnerable's vfunc on Character (37335's first gate), is rejected
  for its reach: invulnerability is read by the magic system too and would
  touch the figure's imposed effects (HYPOTHESIS). T3: x-figure-values-hit
  with the figure's bar unmoved on the hitter's screen until the server's
  number, and the hit event, blood and stagger still seen (the trace's
  stations). Not in train-29: the morning's stage stays the playtested head.
  (the figure's value after a set, the victim case).
- Breakpoint plan for a human session: none.
- Owner: agent (lab probes).

## Status

- [x] doc complete, inventory listed with a disposition per row, rung declared
- [x] engine surface cited or delegated (fork parity d5b05e89, 2026-10-18)
- [x] server logic + T0 (unit/FigureValuesTest.cpp: no maxima before a record, the owner's race bases unchanged, the three property updates on a record, the maxima in a later CreateActor)
- [x] message + validator (same commit: no new message, CreateActor's optional props filled for observers; docs/WIRE.md)
- [x] native hook + T1 (train-28's Hooks.cpp FigureHealthDamage, replaced by train-30's DamageActor gate on fork m2-train30-dent e6a8270a; T1 is the Windows build's)
- [x] TS handler (formView.ts applyFigureMaxima)
- [ ] T2 green (difftest session figure-values: the three property updates declared against the legacy stack)
- [ ] T3 scenario green, no HYPOTHESIS tags (b-figure-values; x-figure-values-hit for the victim case)
- [ ] parity scenario green, or its later list reviewed with it (ADR-031)
- [ ] sequences and combinations green, every checklist item with its scenario (ADR-033)
- [ ] ledger and suppression registry updated
