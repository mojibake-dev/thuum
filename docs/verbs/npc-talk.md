# Verb: npc-talk

A guest opens dialogue with an NPC in a cell another player hosts (ADR-052, train 55; drafted
2026-10-26 14:43 PDT before code, the plan's D31 C).

## Intent

A player presses E on an NPC any player's seat hosts and the dialogue opens as it does on the
host's seat; every seat hears the NPC's lines (the voice slice) and sees it turn to the talker.

Roadmap reference: none (the quests-and-dialogue milestone M6 owns what a dialogue does)
Milestone: M3   Class: B

## Inventory (ADR-031: the action's consequences, before its rung)

| consequence | seen in | disposition |
| --- | --- | --- |
| the Talk prompt on a puppet (the crosshair text) | playtest 32, 34 | native: the engine shows it on any actor; the native activation block makes E do nothing (train-36) |
| the dialogue's start: the actor turns, faces the player, the greeting plays, the Dialogue Menu opens | playtest 33 (the host's seat), 34 section 2 | native on the claimant's seat after the promote (the actor's AI runs there) |
| the lines said during the dialogue | the voice slice's sink (P7) | relayed: the claimant's engine is the host of the actor, its lines travel as ActorSpeech and the other seats' puppets say them |
| the actor's head and face during the dialogue | slice 5 | relayed in HostedActorState from the claimant |
| the actor's movement to the talker (the dialogue package) | npc-puppet's relay | relayed from the claimant as any host's |
| what the dialogue does: a stage, gold, an item, a follower | M6 | later (M6): no shared effect yet; the Known limits say so |
| the actor's AI ending its package mid-step on the old host | the demote | native on the old host (a handoff's shape) |
| the menu that never opens (a refused dialogue on a just-promoted actor) | HYPOTHESIS H-55a | the lease ends the claim; the probe reads it |

### Sequences and combinations (ADR-033)

| sequence or combination | probe or scenario | result |
| --- | --- | --- |
| E on a puppet, the dialogue opens within 3 s, the host's puppet turns to the talker | x-npc-talk-claim | |
| the menu closed, the actor back to the host's rule within the grace | x-npc-talk-claim | |
| E on a puppet in combat: refused, nothing moves | x-npc-talk-claim | |
| two guests claiming the same actor: the first wins, the second refused | x-npc-talk-two (later) | |
| the claimant walks away mid-dialogue (the cell left): the row ends | x-npc-talk-leave (later) | |
| the host's seat talks to its own NPC as before (no claim) | b-npc-puppet's talk row | |

## Authority

Rung: R0 for the claim (the server decides who simulates); R3 for the menu itself (the
claimant's own); R2 for the lines and the movement during it (the stream's rungs).
Why this rung and not the one above it: who simulates an actor is the server's one word (ADR-045),
so a claim is its decision; the menu's content is the engine's and nobody else's.
What the server validates (R0): the claimant loaded in the actor's cell and within activation
reach of its record; the actor an NPC (not a player's, no user), alive, not in combat per the
host's last state, unclaimed; one claim per claimant.
Rate limit / bounds: the lease CLAIM_LEASE_MS 120 s (UNMEASURED); the ActorClaim budget 8 then 2 a
second (UNMEASURED).

## Engine surface

- CommonLibSSE-NG symbol(s): PlayerCharacter::ActivatePickRef (include/RE/P/PlayerCharacter.h:544,
  the player's own activation of the crosshair pick); TESObjectREFR::SetActivationBlocked
  (TESObjectREFR.h:464, the puppet's block the promote lifts, train-36); Actor::EnableAI
  (Actor.h:521, the promote).
- Address Library ID(s): none new (the promote is setPuppet's, npc-puppet.md).
- The claim's server side is wire-rules cells.rs (the follows table with a kind per row).

## Observe (host or acting client sees the intent before the engine acts)

- Hook point: skymp5-client's buttonEvent (the Activate key, DxScanCode 18 by default, a settings
  key) with Game.getCurrentCrosshairRef naming a puppet NPC; no engine hook (the activate event
  never fires for a blocked activation).
- SP filter: none needed (one key event).
- Data captured: the puppet's remote id.
- Side effects of hooking here: none (a read of the crosshair).

## Impose (observers render the server's decision)

- Mechanism: the per-actor word (UpdateHoster) flips the claimant's seat live (the reconciler's
  promote) and the host's to a puppet; the claimant then runs PlayerCharacter::ActivatePickRef
  through a new export (activatePickRef) once the actor's AI has ticked, which opens the dialogue
  as the player's own E would.
- Visual without simulation achieved by: the other seats' puppets follow the claimant's stream.
- Side effects: HYPOTHESIS H-55a (the engine opens the dialogue with a just-promoted actor within a
  second), H-55b (ActivatePickRef on a reference that is no longer the pick does nothing).

## Suppress (engine's own behavior blocked on non-hosts)

- What is suppressed: the old host's simulation of the actor for the claim's span (its AI off,
  its reports refused by the gate).
- How: the word and the reconciler (setPuppet true on the old host).
- Release condition: the release message, the lease, the claimant leaving the cell or the server,
  a grant into the cell, the actor's death.
- Side effects: HYPOTHESIS H-55c (the old host's engine ends the actor's package mid-step without
  a visible hitch beyond a handoff's).

## Message contract

- Message name / numeric type: ActorClaim, MsgType 56, wire id 64.
- Direction: client to server, reliable.
- Fields: idx (u32, the actor as the server indexes it), claim (bool: true asks, false releases).
- Validator rules: idx below u32::MAX; the budget 8 then 2 a second (UNMEASURED).
- Idempotency / ordering: a repeated claim on a held actor answers nothing new; a release of a
  claim the sender does not hold is dropped (E_CLAIM_NONE).
- Contract doc updated: docs/WIRE.md (train 55's commit).

## Server

- Where the logic lives: wire-rules cells.rs (claim, release_claim, the lease in tick; the row's
  kind), ActionListener::OnActorClaim (the gates, the words through UpdateHoster, the log
  "[verb:npc-talk]"), PartOne::FlipHostedFlags consulting SimulatorOf per actor so a regrant does
  not flip a claimed or followed actor (ADR-047 and ADR-052's rows survive it) and the lease's
  expiry in TickCellHosts.
- DB fields / migration: none (a claim is not persisted; a restart ends it).
- Restart behavior: no claims after a restart; the cell rule stands.
- Papyrus natives touched: none (activatePickRef is a Skyrim Platform export, logged in the
  suppression registry).

## Client

- SP binding: activatePickRef() (PlayerCharacter::ActivatePickRef on the game thread).
- TS handler: TalkService (the key, the claim, the activation after the promote, the release 3 s
  after the Dialogue Menu's close: the exit line is spoken on the claimant's engine right after the
  close, and a release sent at the close reached the server first, so the line's report was dropped
  as a non-simulator's; playtest 37, Eli: "some tiny greetings are lost too. like the 'alright'
  when i end a convo"; fork m3-pass-promote c7c76870, 2026-10-28; the lease stays the safety net).
- The claimed partner is held still for the claim's life (Actor.setDontMove at the grant, released
  with the claim; fork m3-face-twelve 56300846): playtest 37's wiggle (Eli: "sven and gerdur ... dont
  fully stop for the convo"), the promoted actor's package steering under the claimed dialogue
  (NPC_TurnToWalkLeft180 a second after the promote, 80 units of drift in 20 s, the watcher's puppet
  settling 4 to 6 units behind). HYPOTHESIS on why the engine does not stop a just-promoted partner;
  the client logs the engine's own in-dialogue word at the menu's open. The release also waits for
  the actor's last line to settle (2.5 s, within 10 s of the close; 310c0d77): Orgnar's post-dialogue
  line began 19 ms after the 3 s graced release and was dropped as a non-simulator's (22:04:00Z).
- One activation per claim (fork m3-face-twelve 4fa48629; the re-analyst's read,
  docs/research/m3/re-claimed-dialogue-state.md): playtest 37's finding 19 read the engine's own
  Actor.IsInDialogueWithPlayer() FALSE for a claimant's promoted partner with the menu open and TRUE
  for the host's own. The talking-to-player byte (HighProcessData::talkingToPC, +0x458) is set by
  the first TESNPC::Activate through Actor::SetDialogueWithPlayer and cleared by a SECOND activation
  of an actor whose dialogue already runs (the activation's set-then-clear pair before its speaker
  test); the byte gates the AI's package step (the wiggle), the look at the player (the missing head
  turn) and the voice timing. On the claimant's seat the engine's own E release after the promote and
  our activatePickRef were two. Now activatePickRef runs nothing while the Dialogue Menu is open,
  while the MenuTopicManager's speaker is the pick or while the pick already talks to the player, and
  consumeActivatePress marks the claim's E press done on the ActivateHandler so its release activates
  nothing (H-55e CONFIRMED live on 2ce8b523's dist, 00:21:12Z: the claimant's seat read "is in dialogue with
  the player by the engine" on the first claim; HYPOTHESIS H-55f: the consumed press activates nothing;
  x-npc-talk-claim reads both formally; the Frida plan is in the read).
- Kill switch config key: npcTalk (default on).

## Tests

- T0: wire-rules cells.rs (a claim names the claimant as the simulator, its guards, the release,
  the lease, a grant ends it); CellHostTest (OnActorClaim's words to both seats, the refusal of a
  far or unloaded claimant, the release's word).
- T1: none new (no engine id).
- T2: skymp-wire/difftest/sessions/npc-talk.yaml (a claim accepted and one refused; the legacy
  server knows no 56).
- T3 scenario id: lab/scenarios/b-npc-talk.yaml (after x-npc-talk-claim's read).
- Assertions that would fail if the verb silently regressed: the server's claim line; the
  Dialogue Menu open on the claimant's seat within 3 s of its E (c2.state.menuOpen); the host's
  puppet AI off during the dialogue and on again within the grace after the close; the line
  relayed to the host's puppet.

### The claimed partner's vendor topics (playtest 37, finding 40; 2026-10-28 18:5x PDT)

Eli: "start convo from prisoner no option to shop / doesnt restore even after leaving the cell as prisoner / restored
after rotfern left cell." The re-analyst's read (docs/research/m3/re-claimed-vendor-topic.md): every INFO of the
generic services topic (DIAL OfferServicesTopic, quest DialogueGeneric) is conditioned on the two job factions and on
GetOffersServicesNow, whose engine body reads the actor's cached vendor faction (CommonLib Actor::CanOfferServices
over GetVendorFaction, Actor.cpp:136); the cache is recomputed lazily and at most every 20 s of AI time, from the
actor's factions with vendor hours, conditions and a location test (Orgnar's ServicesRiverwoodSleepingGiantInn: hours
0 to 23, In Cell the inn). HYPOTHESIS H-58a: the claimed dialogue's topic list is built while that cache is empty (a
recompute within the previous 20 s kept nothing for the AI-off puppet, or the recompute at the start fails its cell
test and re-arms the throttle), while the handoff's promote minutes before a talk lets it refill. The package reading
is FALSIFIED by the read: no package field is on the condition's path, and the promoted actor runs a package within
its first AI frame. The fix on fork m3-face-twelve (after ed606faf): ActivatePickRef resets the cache with the
engine's own sentinel (the stamp at -FLT_MAX, Actor.h:671) and asks GetVendorFaction again before the activation,
waiting a frame at most 30 times for a vendor whose faction does not resolve, then opening anyway with the cell and
hour logged. The first live run (c2's platform log, 03:40Z): the wait ran all 30 frames "no vendor faction yet (cell
133c6, hour 5.26)" and the dialogue opened anyway, with the shop topic there: the pin's GetVendorFaction returns the
value it read before recomputing (Actor.cpp:610), and the loop nulled the cache each frame before asking, so it read
null forever while the recompute it forced filled the cache each frame and the menu found it; fixed on m3-face-twelve
after becfd02e (the cache read after the recompute; the wait ends at its first frame). So the mechanism stands by the
outcome and by the forced recompute, not yet by a "resolved" line. H-58b CONFIRMED at T4 by the outcome, 20:41 PDT 2026-10-28 (Eli: "shop worked!", Prisoner claiming Orgnar in the Sleeping Giant
hosted by rotfern on the 0e4942bb dist; the "activatePickRef waits ... vendor faction resolved" lines of c2's platform
log are the evidence, pulled by numidium); the probe x-npc-vendor-claim stays the formal read (c2 claims Orgnar while
c1 hosts the inn, the Dialogue Menu's topics read for the services row).

## Dynamic plan (fill when any tag above is still HYPOTHESIS)

- H-55a: if the menu never opens, a Frida read of the activation on the claimant's seat
  (TESObjectREFR::ActivateRef's entry and the dialogue's start, 37347's first pass on the actor
  after the promote); owner: agent.

### Playtest 36, the turbo day (11:36 PDT 2026-10-28; fork m3-turbo-knobs f5a8f7d1 over 56's stage)
Eli ticked items 1 and 2: "the claiming SEEMS to work but check logs"; "rotfern walked to embershard mine, prisoner was
still talking to sven". The logs: eight claims granted on Sven, Hilde and Sigrid's household, every one released at the
Dialogue Menu's close; one E_CLAIM_HELD pair when test 1 pressed E on Sven under test 2's claim (by design, one claim per
actor). Two findings from the tails. (a) A dialogue of 175 s outlived CLAIM_LEASE_MS 120 s; today the cell's regrant to the
claimant itself (17:56:18Z) had already dropped the claim row (ADR-052 decision 3, cells.rs grant() retains no follow in
the cell), so the only trace was E_CLAIM_NONE at the release; with the lease, or a grant to a third player, the partner
turns into a puppet under the open menu. Fix 8b088be1: the held claim is sent again every 60 s while the menu is open (the
server renews its holder's claim, ClaimVerdict Reclaimed, by design). The grant's drop is an ADR-052 amendment PROPOSED
(B: a claim outranks a grant for its lease; the patch saved in thuum-cf's scratchpad). (b) E on a corpse sent a claim
(E_CLAIM_DEAD, 3 s waited): f5a8f7d1 skips dead actors, a body is the engine's own activation. Unread: two dialogues on
Sven that opened and closed within 400 to 600 ms of the grant (17:55:01Z and 17:55:07Z) before the third stuck; the menu's
early close wants a Frida read with x-npc-talk-cross's cause (HYPOTHESIS H-55a still: a greeting in flight).

## Status

Built 14:53 PDT on fork m3-npc-talk 0d453dc1 (off m3-npc-face 867c4210 with m3-pass-margin 11bf32f3 merged in, so the claim and the margin share the follows table's kinds); probe x-npc-talk-claim by path (38 steps); the T2 session npc-talk.yaml; CI pending.

- [x] doc complete, inventory listed with a disposition per row, rung declared (14:43 PDT)
- [x] engine surface cited or delegated
- [x] server logic + T0 (14:53 PDT, fork m3-npc-talk 0d453dc1: OnActorClaim, PartOne::ClaimActor and ReleaseClaim, cells.rs claim rows; CellHostTest's talk case, cells.rs's claim test)
- [x] message + validator (same commit): ActorClaim 56/64, the budget, the fixtures
- [x] native hook + T1: activatePickRef (a CommonLib call, no id; no T1 needed)
- [x] TS handler: TalkService (npcTalk, talkKey)
- [x] T2 green (ticked 17:02 PDT 2026-10-29 by the pass: train 55's T2 green on the head's own difftest build, LOG 2026-10-27 16:09 PDT, merged to parity 1b866786 2026-10-28T02:25Z)
- [ ] T3 scenario green, no HYPOTHESIS tags
- [ ] parity scenario green, or its later list reviewed with it (ADR-031)
- [ ] sequences and combinations green, every checklist item with its scenario (ADR-033)
- [ ] ledger and suppression registry updated

## Reviewer checklist

As docs/VERB.md's.

## 55's stage read (16:44 PDT, x-npc-talk-claim v6 20261027-233908, GREEN)

The claim end to end on m3-npc-talk c1be67d1: c2's E on Sven's puppet sent
ActorClaim ("claim 13491 (local 13491) sent on E", 23:41:55.264 on c2's
clock), the server granted it ("ff000001 claims 13491 in cell 9731 for a
dialogue; it simulates the actor for the lease"), c2's game ran
activatePickRef on the word 157 ms after the send ("granted:
activatePickRef queued (crosshair 13491)") and the Dialogue Menu opened
(menuOpen true at the read), c1's seat demoted its copy ("puppet 13491" at
the grant); c2 closed the menu, the release went out ("claim 13491 released
at the Dialogue Menu's close"), the server put him back under the cell's
rule ("releases 13491; the cell's rule names ff000000") and c1 was live
again 300 ms later ("live 13491"); c1 hosted 9732 throughout; no E_CLAIM
refusal. H-55a read: the engine opened the dialogue with the just-promoted
actor within the second (the grant to the menu inside the 4 s wait, the
until's first poll already on him). H-55b not exercised (the crosshair
stayed on him, "crosshair 13491"). H-55c read: the old host's demote and
promote drew no refusal and no second word. The premise took six versions
of the probe: a walking resident leaves the crosshair's line between a
judged approach and the press; neither the host's AI switch (77 units a
second after it) nor SetDontMove within five seconds (33) stops him at
once; SetDontMove lets him finish his leg and then holds exactly (x-npc-hold
v2 232956, three to six seconds), so the shape is the hold, eight seconds,
a stillness read, the approach to 70, a crosshair check and E. Promoted as
b-npc-talk (main, its own commit) for 53's gate, 55's deploy having
preceded it. What a dialogue does (quest stages, gold, items, followers)
stays M6 (PLAN.md).

## Train 55 merged (19:26 PDT 2026-10-27)

Fork parity 1b866786, cited by the gate 20261027-234255 (28 runs, two
premise reds answered in its rest) and the chain; the claim's scenario
b-npc-talk (main 4854286, from x-npc-talk-claim v6 233908) plays from 53's
gate on. The Status boxes tick at that gate's green.

## Train 56: the claim as a player lives it (22:11 PDT 2026-10-27; fork m3-pt35-fixes, memo D45 a)

Playtest 35 (docs/private/pt35-read-1.md): Prisoner's granted claim on Hilde
was never released. Two causes. At the server, the movement judge's Follow
verdict replaced the Claim row with a margin follow when Hilde walked from
9732 into 9731 under the claim, a step deeper passed her, and the claim ended
with no ClaimEnded word (zero "ended with its lease" lines; rotfern's later
release met E_CLAIM_NONE). At the client, the Dialogue Menu's close event
never reached onMenuClose, and the E handler returned silently behind
`pending || claimed` for Prisoner's nine presses on Sven. The fixes
(0f007157, ada2ba1f): wire-rules cells.rs accepts the claimant's report into
any cell and the Claim row keeps its kind and lease, naming the new cell
(test a_claim_travels_with_its_actor_across_cells: no pass, no follow, the
host's own report refused, the release and the lease still find it); the
client watches a held claim every update (the word ending it forgets it; the
menu seen open and then closed releases it, event or not; a menu that never
opens releases it after ten seconds; E on another puppet releases the held
one first) and traces every decline of an E. Probe: x-npc-talk-cross (the
claim, Tab out of the dialogue, the release, a second claim on Sven sent and
granted). Still 57's: the voice's later response lines (npc-stream.md).

