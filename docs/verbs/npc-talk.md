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
- TS handler: TalkService (the key, the claim, the activation after the promote, the release at
  the Dialogue Menu's close).
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

## Dynamic plan (fill when any tag above is still HYPOTHESIS)

- H-55a: if the menu never opens, a Frida read of the activation on the claimant's seat
  (TESObjectREFR::ActivateRef's entry and the dialogue's start, 37347's first pass on the actor
  after the promote); owner: agent.

## Status

Built 14:53 PDT on fork m3-npc-talk 0d453dc1 (off m3-npc-face 867c4210 with m3-pass-margin 11bf32f3 merged in, so the claim and the margin share the follows table's kinds); probe x-npc-talk-claim by path (38 steps); the T2 session npc-talk.yaml; CI pending.

- [x] doc complete, inventory listed with a disposition per row, rung declared (14:43 PDT)
- [x] engine surface cited or delegated
- [x] server logic + T0 (14:53 PDT, fork m3-npc-talk 0d453dc1: OnActorClaim, PartOne::ClaimActor and ReleaseClaim, cells.rs claim rows; CellHostTest's talk case, cells.rs's claim test)
- [x] message + validator (same commit): ActorClaim 56/64, the budget, the fixtures
- [x] native hook + T1: activatePickRef (a CommonLib call, no id; no T1 needed)
- [x] TS handler: TalkService (npcTalk, talkKey)
- [ ] T2 green
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
