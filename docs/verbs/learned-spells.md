# Verb: learned-spells

Drafted 2026-10-20 (train-30's first row) from playtest twenty-seven's lost
spells. The server half is old (M1: the record's learnedSpells, the equip
gate); this doc gives it a home and fixes the client half. Code on fork
m2-train30-spells (096d2cd8, client only).

## Intent

A player's game knows exactly the spells the server has recorded for that
player, after a launch, a reconnect or a server restart alike, and nothing
the player did not learn through the server.

Roadmap reference: none
Milestone: M2 (train-30)   Class: A

## Inventory (ADR-031: the action's consequences, before its rung)

Not a player's action but the login's apply of a record. What the engine
plays for a spell added or removed on the player: the magic menu's entry,
the hand's equip state, a tome's "learned" notification for a book read
(docs/verbs/console-commands.md's AddSpell path shows none, the snippet is
silent), and for a removed spell the hands emptying. From the code and the
lab's reads (playtest twenty-seven 11:21 PDT; the driver's `known` step;
lab/.cache/wt/reconnect-spells.md, the client read):

| consequence | seen in | disposition |
| --- | --- | --- |
| the server's list of a player's learned spells (the change form's learnedSpells, MpActor::AddSpell and RemoveSpell, written by AddSpell through labCommand or the console, a tome read, Papyrus AddSpell) | server | R0, the record; sent with the own player's CreateActor (MpActor.cpp:432, props.learnedSpells) |
| a spell equipped in a hand that the list lacks: the server refuses the equipment and tells the game to remove the spell (ActionListener.cpp's OnUpdateEquipment, the RemoveSpell snippet) | server | R1 as before |
| the player's own two base spells (the template save's Flames and Healing, the NPC record's list) | engine | never in the record and never removable by Papyrus RemoveSpell (the driver's `known` saw them stay); the engine's |
| the game's spell list at a login: today every added spell removed, then the server's list added, one shot, 1 s after the own CreateActor (remoteServer.ts, sync/spell.ts) | client | REPLACED by the diff below |
| on a reconnect with the game process up (a server restart): the wipe landed and the re-add did not, so the game kept the base two alone until a relaunch (playtest twenty-seven: the server's record intact and sent, no RemoveSpell logged) | lab, T4 | the defect this verb fixes; HYPOTHESIS on its mechanism: removing and adding the same spell in one frame does not stick (the one difference from a launch, which removes nothing) |

### Sequences and combinations (ADR-033)

| sequence or combination | probe or scenario | result |
| --- | --- | --- |
| a launch (save loaded, then the login) | a-restart-persistence's reconnect, b-spells-reconnect's first phase | the list applied, every run so far |
| a reconnect with the game up (a server restart) | b-spells-reconnect (approved 2026-10-20, main 5d292e1): learn Firebolt, restart, reconnect, c1.known(77776) >= 1 | RED by design on the current build; the fix's first stage |
| a spell learned in play (a tome, a console AddSpell) then a reconnect | b-spells-reconnect's learn-spell is the server's AddSpell; a tome read is the same record | |
| the base two spells across all of it | b-spells-reconnect's Flames control | |

## Authority

Rung: R0 for the list (the server's record is the truth); the game's apply
is R3, client-local state that must equal the record.
Why this rung and not the one above it: a spell learned is progression
(ADR-008's quest policy's neighbour); the server already owns it and gates
equipment by it.
What the server validates (R1) or records (R2): the equip gate (R1); the
list itself (R0).
Rate limit / bounds: none new; no wire change.

## Engine surface

- CommonLibSSE-NG symbol(s): none hooked; Papyrus Actor.AddSpell,
  RemoveSpell, HasSpell, GetSpellCount, GetNthSpell through Skyrim
  Platform (the typings' Actor), the same calls the driver's `known` step
  uses. Actor's addedSpells is the list Papyrus walks (include/RE/A/
  Actor.h, the member near :678), which is why the base record's spells
  stay through RemoveSpell.
- Address Library ID(s): none.

## Observe (host or acting client sees the intent before the engine acts)

- Hook point: none; the login message carries the list.
- SP filter: none.
- Data captured: none.

## Impose (observers render the server's decision)

- Mechanism (SP API call, native call, snippet): sync/spell.ts syncSpells
  (fork m2-train30-spells): a listed spell the actor has is left alone, an
  added spell the server does not list is removed, a listed spell the actor
  lacks is added (hasSpell first); remoteServer.ts calls it 1 s after the
  own CreateActor and once more a second later, logging the second pass
  only when it changed something; one console line names the counts and
  the ids that failed (printConsole, the in-game console, which the lab
  reads with a console step).
- Visual without simulation achieved by: the engine's own magic menu.
- Side effects: HYPOTHESIS until b-spells-reconnect is green: that the
  diff lands on a reconnect where the wipe-and-re-add did not.

## Suppress (engine's own behavior blocked on non-hosts)

- What is suppressed: nothing.

## Message contract

- Message name / numeric type: none new; CreateActor's props.learnedSpells
  as before.
- Contract doc updated: not needed.

## Server

- Where the logic lives: MpActor::AddSpell and RemoveSpell (the record),
  MpActor's CreateActor props (the send), ActionListener's equip gate (the
  refusal). Unchanged.
- DB fields / migration: none; learnedSpells stays raw until ADR-043's
  slice converts it (fork m2-formdesc-world does).
- Restart behavior: the record survives; the game's apply after the
  restart is this verb's fix.
- Papyrus natives touched (ledger lines added): none.

## Client

- SP binding: Actor.hasSpell, addSpell, removeSpell, getSpellCount,
  getNthSpell (no native work).
- TS handler: remoteServer.ts (the own CreateActor branch) and
  sync/spell.ts.
- Kill switch config key: none; the apply is the login.

## Tests

- T0: none (client only).
- T1: none.
- T2: none (no wire change).
- T3 scenario id: lab/scenarios/b-spells-reconnect.yaml (approved by Eli
  2026-10-20); a-restart-persistence takes the same assertion once it is
  green (a scenario change, its own commit).
- Assertions that would fail if the verb silently regressed:
  c1.known(77776) >= 1 after the reconnect (the taught Firebolt gone);
  c1.known(77773) >= 1 (the base Flames gone, which would mean the diff
  removed what the engine owns).

## Dynamic plan (fill when any tag above is still HYPOTHESIS)

- The mechanism of the loss (remove then add in one frame) is a lab read if
  the diff alone does not cure it: a console read of the old helpers'
  "removeResult"/"addResult" lines on a reconnect (the client prints them
  to the in-game console; the lab's console step with a match), or a
  Frida count of AddSpell's native on the reconnect.
- Owner: agent (lab probes).

## Status

- [x] doc complete, inventory listed with a disposition per row, rung declared
- [x] engine surface cited or delegated (Papyrus natives through Skyrim Platform; no address)
- [x] server logic + T0: unchanged (M1's record and gate)
- [x] message + validator (same commit): no new message
- [x] native hook + T1: none
- [x] TS handler: sync/spell.ts syncSpells and remoteServer.ts (fork m2-train30-spells 096d2cd8, pipeline 2236 green)
- [x] T2 green: no wire change
- [ ] T3 scenario green, no HYPOTHESIS tags (b-spells-reconnect on the fix's stage)
- [ ] parity scenario green, or its later list reviewed with it (ADR-031): not applicable, no player action
- [ ] sequences and combinations green (ADR-033)
- [x] ledger and suppression registry updated (no native, nothing suppressed)
