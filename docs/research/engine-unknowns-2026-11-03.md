# Engine unknowns under shipped verbs: the open HYPOTHESIS tags, by engine system

Read-only census, 2026-11-03 (playtest 41's root-cause plan, W1), of docs/verbs/*.md at thuum 244cb5b2. Scope: the 72
rows docs/research/gate-audit-2026-11-02.md takes from PLAN.md as DONE, MERGED or BUILT (headshot kept: it shipped with
train 27 and M2's close although PLAN.md:179 says NEXT); natures-balance, mod-lock, mount, vampirism,
alchemy-enchanting, script-variables and validation left out. Counts match the gate audit's on the 25 docs re-read;
changes from it: npc-fate +8 (five written on 11-02, three missed: :2495, :2561, :2589), npc-handoff +1 (:755),
papyrus-events +2 (H1a, H1b), push -1 (:389 REFUTED at :417).

## The headline

About 256 tags are open across 59 shipped verb docs, and 27 docs tick the "no HYPOTHESIS tags" box anyway. Not counted
in the 256: 44 claims labelled CONFIRMED-STATIC or CONFIRMED-BY-DECOMPILE (25 in npc-puppet), decompiler reads with no
run behind them, which the root-cause plan returns to HYPOTHESIS. Several of playtest 41's breakages were never tagged:
containers.md has 0 tags after three failed redraw designs, no tag covers the death sound, and the AI's night lock was
never in locks.md's engine table.

## Open tags by engine system

| System | Open | The three most player-visible | Dynamic plan: run or not |
| --- | --- | --- | --- |
| Containers and menus | 5 | npc-fate.md:2495 (H5): a dead body with its AI off may refuse activation, so the guest's loot menu never opens; npc-fate:2589: a dead actor needs more than 150 ms after EnableAI to accept an activation; activation-reach.md:138: a second activation clears an occupant left by a menu that never opened | x-body-open-guest ran (v2 215922, v6 merged 19e8c397), no result written back; the activation-reach probe never ran; containers.md: 0 tags |
| Death, ragdoll and bodies | 28 | npc-fate:2396 (H-56a): a host's bow kill yields the engine's own death report; npc-fate:1412: KillImpl hands every ragdoll to Havok at the kill (D78's pose design rests on it); npc-fate:2474-2481 (H1 to H3): reanimation across hosts | x-npc-arrow-death by path, unrun; :1412 no trace; x-reanimate-claim unrun; stale: :2426 says unrun though x-reanimate-host ran three times (125920, 133744, 135637); :120 says unrun though x-dead-placed-loot v2 went GREEN (133512); no tag for the death sound |
| Props and Havok | 14 | prop-physics.md:191: walking into a cart wheel fires the contact and moves it (F13); :170: the proxy contact fires for Keyframed bodies, so a non-host's touch claims; :350: grabRelease fires only on the holder's seat | x-prop-static by path, unrun; prop-contact.js written (LOG.md:3026), never run; the grab read never ran; only the launch traces ran |
| NPC AI, packages, hand-off and doors | 32 | npc-handoff.md:43 (H1): a promote starts the resident from its last read position (playtest 41's Hod: promoted at the pre-door sample; the fix tagged at :755); :677: Disable holds a puppet-flagged actor (F2's ghost fix); npc-talk.md:317 (H-55a): a greeting already in flight when the claim lands | c-riverwood's claim 2 drafted, unrun (its red 20261101-084608 rewritten into a passing form); x-handoff-hide unrun; x-npc-talk-cross 131626 RED, the tag left as it was |
| Papyrus scripts and the VM | 33 | traps.md:234, :261: a trap hit runs TrapHitBase's Papyrus damage, not the melee path; player-globals.md:270 (H-D51a): the seat's deferred kill swallows Survival's own Kill; quest-stage.md:87: a SetStage replayed at login behaves as on the player who talked | x-trap-path v4 (20261102-131634) green on its premise only; x-player-cold-kill drafted, unrun; quest-stage's box says no scenario is committed (:273) |
| Progression and leveling UI | 9 | leveling.md:133: the engine's own level-up prompt (the attribute pick) fires when XP reaches the threshold the server wrote; perks.md:100: setPerkPoints shows in an open menu; attributes.md:108: the report after a raise lands within 2e-3 | the plan covers the skill hook only; p-level-up 152612 left :133 "unread here" for T4, which failed on 11-02 |
| Magic, effects and casting | 68 | spell-cast.md:1328: the pitch half of a stream's aim ("until the driver can aim down"); :1039: an area effect's targets raise no TESHitEvent, so area streams count nothing; magic-effects.md:174: the hit shader on a figure looks like the engine's own | :1328 cannot be read by the lab; x-area-hit (20261018-135726) fits :1032, the tag never cleared; shouts.md:180 waits on x-tgm-breath5, which ran (162436, five of five) |
| Animation graphs | 10 | cast-action.md:64, :572: a staggered graph refuses the hand's Interrupt (the figure holds its cast about 1.6 s); stagger.md:165: which stagger a figure plays with magnitude and direction unset; stagger.md:56: the formula | x-stagger-cast never ran; b-stagger ran, the formula lines never cleared |
| Equipment and outfits | 6 | npc-fate:2036: AddWornOutfit on an actor with no 3D reads a model it lacks (playtest 41's crash); npc-fate:1918: dressing happens before the 3D flag; poison.md:359: re-applying a figure's equipment can drop its right-hand weapon | :2036 written after the crash, trace to come; :1918's read "drafted and not committed" on 10-28; poison's waits "until the lab reproduces" |
| Locks and activation | 9 | locks.md:122: setLockLevel on a leveled lock and lock(true) on a door with no lock both take; locks.md:274: the Lockpicking Menu unlocks at a full turn; papyrus-events.md:212 (H1b): a blocked activator's press still reaches its script | x-locks-open v1 to v6 ran, the pick leg "beyond the lab's hands"; H1b tagged at design; the night lock never in the engine table |
| Weather and time | 6 | rest.md:69, :87: closing the wait menu races the clock correction; weather.md:88: the override survives a cell change; weather.md:184: the weather step's blend is inert | the rest race has no probe; :88's legs are in b-weather, which runs (the tag is stale) |
| Appearance | 6 | racemenu-sync.md:25: rotfern drawn 2 to 3 times too big after a character switch (OPEN); appearance.md:81: the 1.7.104 overlay pointer and tints; racemenu-sync.md:814: the figure's 3D rebuilt after the look | m0-appearance meant to settle :81 cannot fail (both profiles share one preset) |
| Other (combat 15, figure values 10, the NPC level roll and cell reset 5) | 30 | melee-reach.md:35: a hosted bandit's out-of-reach swing refused, no claim in c-dungeon-enemies; blocking.md:330: any raised shield in the cone blocks an arrow; npc-fate:464-470 (H8): kNeverResets and two settings stop every engine cell reset | none run |

## Status boxes ticked over open tags (27)

- The full wording kept: activation-reach.md:118, actor-values.md:280, appearance.md:205, attributes.md:181,
  cast-action.md:632, cast-teleport.md:301, marksman.md:426, movement-relay.md:87, push.md:268, racemenu-sync.md:757,
  rest.md:323, spell-cast.md:483 (16 open), spell-placed-object.md:353, word-wall.md:201.
- The T3 box ticked with "no HYPOTHESIS tags" dropped from its text: blocking.md:329, damage-flags.md:117,
  god-mode.md:169, headshot.md:250, leveling.md:324, magic-effects.md:484, melee-reach.md:144, player-globals.md:290,
  prop-physics.md:113 (15 open), second-hand.md:204, self-cast.md:281, shouts.md:425, stagger.md:358.
- Separately, PLAN calls npc-puppet and cell-host DONE while their own boxes are unticked (npc-puppet.md:1376,
  cell-host.md:939).

## When the engine reads happened

The decompiler read usually comes before the code and gets tagged. The runtime check (a Frida trace or a probe) is
written "by path" and does not run before the merge. The next engine read comes after a playtest breaks.

- The ContainerMenu redraw: the in-place redraw went into playtest 37 on 10-28; that night finding 59 showed the engine
  never posts the inventory update, and only then was the engine's factory read (LOG.md:2773); the reopen fix was
  rejected; stale rows came back in playtests 37, 40 and 41 (containers.md:138-140); the Frida plan is only now the
  backlog's gate (:155-156). The doc never carried a tag.
- The death sound: finding 61 on 10-28 heard bind-time kills play the death sound and a silent kill was built; on 11-02
  Eli heard "their deaths again" at re-entry (LOG.md:5474) and only then was the trace queued (x-npc-death-reentry,
  LOG.md:5484). The doc takes KillSilent "as the ledger has them" (npc-fate.md:725); NATIVES.md:202 lists it missing.
- The level-up: leveling.md:133 tagged on 10-31, handed to T4 "unread", failed on 11-02 with the box already ticked.
- The redress: the 3D-order question tagged on 10-28 (npc-fate.md:1918), its read never committed; the crash on 11-02,
  its tag written after (:2036, 17:56).
- The night lock and the door hand-off: both written up only after playtest 41 (locks.md:281 at 17:22,
  npc-handoff.md:736-755 at 18:36).
- The one full cycle in order: skill books on 11-02: static read, tag, x-skill-book GREEN 212928, cleared
  (leveling.md:269, :309).
- Tags cleared on paper: on 10-29 the inventory found 196 tag lines with 4 closed in place; two commits about 15 minutes
  apart (e4c87b28 at 17:21, 172f6e1d at 17:34) cut npc-puppet from 40 to 11 and cell-host from 20 to 3 by writing back
  older runs, relabelling decompiler reads CONFIRMED-STATIC and declaring limits, not by new lab evidence. Meanwhile
  tags whose probes did run were never updated (npc-fate.md:120 and :2426, spell-cast.md:1032, shouts.md:180).
