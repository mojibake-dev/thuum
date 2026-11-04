# Verb: npc-fate

DRAFT. Drafted 2026-10-22 (M3's fifth verb, docs/PLAN.md:977, :1052-1053)
from ADR-035 point 6 (docs/DECISIONS.md:1302-1308), ADR-045 (:2297-2377),
the rows npc-puppet carried here (npc-puppet.md:101, :103, :106, :135),
npc-stream (:49, :53-54, :87) and npc-handoff (:14-15), the prior art
(docs/research/m3/tes3mp.md Q6, :214-247; docs/TE-MAP.md:72, leads only) and
a code read of the fork at the puppet worktree's head 67256b72 (train-34,
off parity a76125cb; every fork path below is at that head), the night of
playtest 32 and before any code. The cut (rule 3): the server owns an NPC's
fate: which actor a leveled placement becomes, whether it is dead and where
its body lies, when it comes back, what its body holds. Not here: hits on
and by NPCs (they ride the hit path M1 and M2 built, the server's numbers
through OnHit, OnWeaponHit and OnSpellHit; this verb adds the consequence at
zero health alone); the host's stream (npc-stream); the handoff
(npc-handoff); a script's spawn proposal (ADR-035 point 6's "a client
proposes a spawn", a later slice, npc-spawn); dead-at-start bodies as server
corpses (a second slice, the Inventory's row); the killer's crime (the crime
verb, M4).

## Intent

A leveled placement is one actor on every screen and on the server, a kill
leaves one body where it fell on every screen and across a restart, a body
can be looted once and its loot is the server's, and the actor comes back by
the server's rule at its own placement, never by the engine's cell reset and
never at SkyMP's spawn point.

Roadmap reference: skymp/ROADMAP.md "NPC" (render NPC templates from the
server; death and respawn), skymp-hosting.md:38-39, :213-216.
Milestone: M3   Class: B

## Why now: playtest 32's three readings (2026-10-22, fork parity a76125cb)

1. Two games, two rolls, two brains. Bleak Falls Barrow's entrance bandits
   and its first chamber's draugr (the checklist's place 3) are placements
   whose base is a leveled character (LVLN). WorldState::AttachEspmRecord
   admits NPC_ bases alone (WorldState.cpp:452, `bool isNpc = t == "NPC_"`;
   :461-468 "the server skips base type"), so those placements have no
   record: both games rolled their own actor and ran their own AI, two
   simulations of one dungeon (Eli: "lots of jank from the various
   conflict"). The one plain NPC_ bandit pair (0x39fe2 to 0x39fe5) had
   records and hosted as cell-host says. The forest's wolves showed the
   same split one level up: 0x85547 and 0x85549 are LvlAnimalForestPredator
   0x1e7a0's template chain (its TPLT the LVLN 0x42297) picks through, which the server rolls
   once at player level 0 (MpActor.cpp:1661-1764, kPcLevel :1664;
   LeveledListUtils.cpp:189-199) and the client ignores (formView.ts:163,
   "getLeveledBase crashes too often ATM"): the server's record of 0x85549
   resolved to EncBearCave and dealt a cave bear's 129.9 and 137.0 in one
   blow each while both screens showed a wolf (docs/private/
   playtest-m3-32.md, section 5). Three rolls of one animal: the server's,
   c1's, c2's.
2. SkyMP's player respawn on a bandit. 0x39fe4, killed by a headshot,
   logged "MpActor::RespawnWithDelay ... finally, respawn after 25 seconds"
   (MpActor.cpp:1999-2001): DeathEvent::OnFireSuccess arms RespawnWithDelay
   for every actor (gamemode_events/DeathEvent.cpp:65-70), spawnDelay is 25
   for every record (MpChangeForms.h:117), and the respawn is the player's
   shape (RespawnEvent.cpp:25-32: SendAndSetDeathState(false, teleport),
   full attributes, the base inventory re-added, :1963-1996). The teleport
   names GetSpawnPoint (:1586-1589, :2045-2055): for an id under 0xff000000
   the placement (:2049-2051, GetEditorLocationalData :2056-2102), for a
   copy the record's spawnPoint, the server's default spawn (MpChangeForms.h:
   112-115; playtest 31's 105a35 record, docs/LOG.md's 2026-10-22 entry).
   Where the bandit stood up on screen tonight is the server log's and the
   seats' to read (thuum-magnus read it as the default spawn; the code says
   the placement for its own id; both are named so the probe settles it,
   H6b). Either way the game's rule, the cell reset, is not what ran.
3. Loot that reached the record. The Long Bow 0x3b562 and the iron arrows
   0x1397d taken from the dead bandit's body reached the player's server
   record: her later equip and shots passed the checks that refuse an item
   the record lacks (ActionListener.cpp:943-948, "inventory does not contain
   item"; marksman's quiver rule). The path this read finds for a take is
   the client's TakeItem on the body's id (containersService.ts:19-73) into
   MpObjectReference::TakeItem, which refuses an activator that does not
   occupy the reference (:656-668), and ProcessActivateNormal sets an
   occupant for CONT and FURN bases alone (:1544-1569, :1584-1600; no NPC_
   branch). How the bow entered the record is therefore H7: the log of the
   take (a "doesn't occupy" line or none) decides whether a path this read
   missed carried it or the setup's give did. The corpse's own inventory on
   the server exists either way: EnsureBaseContainerAdded builds it from
   the NPC_'s items and outfit through the template chain
   (MpObjectReference.cpp:2001-2056; GetInventoryObjects :1959-1980;
   GetOutfitObjects :1929-1957) and rolls every LVLI entry on the server at
   level 1 (AddContainerObject :1982-1999; kPlayerCharacterLevel :44); the
   death item (INAM) is rolled at the kill (MpActor.cpp:1796-1857, level 1;
   AddDeathItem :1766-1772 from Kill :1932). Each game's engine rolls the
   same lists again for the engine reference it holds (the save's
   kLeveledInventory, TESObjectREFR.h:156), so the body's menu may list a
   third inventory (H4).

## Inventory (ADR-031: the action's consequences, before its rung)

The action is "a leveled placement becomes an actor, is killed, lies, is
looted, and comes back". The records (lab/esm.py: the ACHR's NAME and its
XEZN, the NPC_'s TPLT chain and ACBS flags, the LVLN's LVLO, LVLD, LVLF and
LVLG, the INAM death item, the OTFT, the ECZN's DATA, the two GMSTs below),
the code read above, and a reference trace that does not exist yet and is
owed before the build: r-dungeon-death (the recorder in a solo client in
Bleak Falls Barrow's first chamber: the roll at the attach, a bow kill, the
loot, the body across a save and reload, the body across a cell reset with
the local clock advanced), kept as lab/references/dungeon-death-a.json and
reviewed like a scenario.

| consequence | seen in | disposition |
| --- | --- | --- |
| the placement resolved to one actor at the cell's attach: the engine picks from the LVLN's entries by level (TESLeveledList::CalculateCurrentFormList, TESLeveledList.h:65; iLevCharLevelDifferenceMax, TESLevCharacter.h:49) and writes ExtraLeveledCreature (originalBase, templateBase; ExtraLeveledCreature.h:23-24) with Actor's kLeveledActor change flag (Actor.h:238) | record, code | imposed: the server rolls once per placement (R0, LeveledListUtils.cpp:71-123) and the game pins the server's base on the engine reference before its own roll (Impose A, H1) or swaps it after (Impose B, H2); H1 CONFIRMED: the 16128 detour answers before the engine's roll (npc-roll.js v2 on x-npc-fate-outfit v2 20261024-002544; x-npc-fate-pin v3 072444); H2 retired as the unused fallback |
| the roll's inputs: the player's level and the zone's bounds (ENCOUNTER_ZONE_DATA minLevel, maxLevel, BGSEncounterZone.h:22-25; the locked zoneLevel, :37), the list's chanceNone or its global (TESLeveledList.h:60, :70, :76) | record, code | imposed: the server's rule (Authority: the first loader's recorded level clamped by the zone; today's level 0 as the alternative); the engine's lock of the zone level at the first attach is H3; the server reading a chance-none global as 100 (LeveledListUtils.cpp:35) against the engine's global value (TESLeveledList.h:60) is a defect to fix with a T0 oracle (H12) |
| an NPC_ whose template chain reaches a LVLN (the forest predators' placed NPC_ 0x1e7a0, its template the LVLN 0x42297; x-npc-fate-roll 232048), rolled per game by the engine and once on the server (templateChain, MpChangeForms.h:119; LeveledListUtils.cpp:189-199) | code, record | imposed: the same pin, with the chain's leaf as the base; the client's dead getLeveledBase path (formView.ts:154-175) retired |
| the actor's inventory and outfit, their LVLI entries rolled by each engine at the reference's load (kLeveledInventory, TESObjectREFR.h:156) and by the server at level 1 (MpObjectReference.cpp:1982-1999, :44) | record, code | imposed: the server's inventory is the body's container (R0, the CONT shape, Server); the engine's own roll on the body never reaches a player: the menu lists the server's list (H4); and the WORN roll matters alive too (playtest 33, 2026-10-23): the headshot's helmet check reads the server's worn list, which each engine's own roll contradicts on screen (seven refusals for a hood nobody saw, docs/verbs/headshot.md), so the roll decision below covers outfits and server-placed 0xff actors, not placements alone |
| the death item (INAM, TESActorBaseData.h:126) rolled at death | record, code | native on the server already (EvaluateDeathItem, MpActor.cpp:1796-1857; AddDeathItem from Kill :1932); nothing new |
| the death on the server's own number: a hit the server computed takes health to zero (SetPercentages, MpActor.cpp:889-897, Kill(aggressor) :896; SetPercentage :855-866), a headshot (PartOne.cpp:2060-2063), a scripted kill (ClaimScriptedKill :1905-1912), the console (ConsoleCommands.cpp:255-268) | code | native: R0 as today; Kill (MpActor.cpp:1911-1933) records isDead, tells the listeners (DeathStateContainer 18) and fires onDeath; this verb changes what onDeath arms (Server) |
| a death the server has no number for: a fall, a trap, an NPC killed by an NPC on the host, a script (the host's engine shows it dead; the host's health report of 0 floors at one point and logs, npc-stream.md:49) | code | suppressed this slice: the record stays alive at the floor and the host's deathStart or TESDeathEvent is counted (Observe, H5); the decision between TES3MP's authority word (R2, tes3mp.md:228-229) and a server-checkable cause is Eli's (Authority); measured 2026-10-22 (x-npc-death 20261023-051540 on parity 03e7d163): Actor.Kill with the seat's player as killer did nothing to Sigrid 0x13483 on her host (isEssential and isProtected false on both seats), and the cause is the client's by design: formView.ts:323-327 starts a deferred kill on every actor it views with no isMine gate, the host's own live residents included, so no kill by this client's engine lands on a hosted NPC and the floor holds (health 0, alive) until the server's number; the npc-damage read (x-npc-death 20261023-054215): the host held her alive at a health of -128.87% (the engine's deferred kill, StartDeferredKill is the engine's own Papyrus native, FunctionsDump.txt:3863) while her puppet on the other seat, under the same deferred kill, took the relayed number through movementApply.ts:233-247's damageActorValue step and DIED (isDead true, the body in the garden): dead on one screen, standing on the other, playtest 32's "definitely some desynced NPCs" in one measurement; which engine path kills a deferred-kill actor whose AI is off is the Dynamic question below, the fix shape is train-35's (npc-puppet.md: the host's report clamped to [0, 1], the validator refusing outside it, the puppet apply never below a sliver), and the floored host actor itself, alive and acting at -128%, is the decision this row asks of Eli |
| the death played: the death animation or ragdoll (KillImpl's ragdollInstant, Actor.h:468; deathStart, deathEnd events), the kill move, the dying line | trace (owed), code | native on every game, from the server's word: deathService.killActor (deathService.ts:141-153: endDeferredKill then kill) on the engine reference; a puppet's graph ticks (npc-puppet), so the death plays on it (H10); the host's own live actor takes the kill too, Rule A's one declared exception (Authority, H11) |
| the body's resting place: the fall from the standing point by each game's physics; the engine keeps a dead actor where it lies in the save | code | R0 for the standing point at the kill (the record's position, the host's last accepted sample under cell-host's bounds); R2, declared, for where it rolled: each game's fall from that point (H6); a reload places the body at the record's point and kills it at once (Impose), TES3MP's instant death (tes3mp.md:238-240) |
| looting the body: the engine opens a dead actor's ContainerMenu on activation; the take enters the player's engine inventory and is reported (containersService.ts:19-73) | code | imposed: a dead actor's activation runs the CONT branch on the server (occupancy, the "inventory" property, OpenContainer; MpObjectReference.cpp:1544-1569) so TakeItem and PutItem (:642-668) hold and the item moves on the server's record (R0); the body's list applied before the menu opens (H4, H7) |
| the actor's OnDying and OnDeath Papyrus events and the story manager's kill event (quest progress, a clearable location's boss) | record (VMAD) | native on each game that applies the kill, R3 declared: quest state is unsynced until M4's quests verb; the location's cleared state with it (Server: the uncleared reset time alone this slice) |
| the engine's cell reset: after the detach time plus iHoursToRespawnCell (or iHoursToRespawnCellCleared; the zone's kNeverResets, BGSEncounterZone.h:14; gameData detachTime, attachTime, resetTime :34-36; ExtraDetachTime.h; TESObjectCELL's kDetachTime change, TESObjectCELL.h:151) the engine deletes the body, re-rolls the placement and resets inventories (ResetInventory(a_leveledOnly), TESObjectREFR.h:338) | record (the GMSTs), code | suppressed on every game (Suppress, H8): the server resets, the engine never does |
| the respawn: the actor back at its placement after the reset time, a fresh pick from the list (the engine's reset re-rolls a leveled placement: H9a), full attributes, the base inventory | record, code | imposed: the server's schedule on the shared clock (R0, Server), applied in the game as disable, base, enable (Impose, H9) |
| SkyMP's respawn after spawnDelay 25 s at GetSpawnPoint with the base inventory re-added (MpActor.cpp:1935-2007; DeathEvent.cpp:65-70; MpChangeForms.h:117) and the respawn of a dead record at load (MpActor.cpp:820-824; PartOne.cpp:375-378 for players) | code | suppressed for game-file actors: the fate's schedule replaces the timer and the load-time respawn; players keep theirs (m0-death) |
| the loader's skips: dead-at-start placements (kStartsDead, TESObjectREFR.h:177; WorldState.cpp:471-480, "TODO: Load dead references") and initially disabled ones (:492-507) | code | BUILT 2026-10-29 (fork m3-dead-placed 965790df, playtest 38's finding 65: a Bleak Falls floor body with different loot per screen): a dead-at-start placement loads as the server's corpse, dead on the record with no death event, no death item and no respawn (MpActor::MarkPlacedDead; RespawnWithDelay yields), its loot the corpse path's one roll, lootable by every seat; T0 NpcExists's floor-body case (0x3b9ea). x-dead-placed-loot (v1 by path 2026-10-29 13:57 for the pass train's stage) RAN twice on 2026-10-30: v1 20261030-130152 red on its own premise (both E_ACTIVATE_REACH lines were the probe's activations of 0xc3b1d from 10,423 units, each engine opening its own corpse menu and rolling its own gold; the loader's claims all held) and v2 20261030-133512 GREEN with each seat approached to the body (0xc3b1d dead on the record and in both engines, each seat's ContainerMenu open on it, no E_ACTIVATE_REACH, no "doesn't exist", no "no actor record loads for it"). Of the two open points (settled 19:26 PST 2026-11-02): no death event and no death item on a starts-dead actor CONFIRMED from 133512's logs, read after the run since no claim carried it (the server's only lines for c3b1d are the dropped health-0 sample, "the record is dead, the report dropped", and ProcessActivate with two players, no "died at day" and no EvaluateDeathItem line; c1, its host, wrote no "death report" and no "cause on" line); whether the watcher's bind leaves the engine's own corpse pose stays HYPOTHESIS, 133512's 031-c2.png showing the open Skeleton menu (1 gold) with the body out of frame behind the menu's blur, so a body-framed screenshot before the open and the `== 0` log-count are v3's to add; v2 kept the skeleton (no dressed body yet). Initially disabled placements stay skipped.; the review of m3-pass-train-1 (18:19 PDT): a host's live sample of a placed corpse stands nothing (DiedAgo is nothing for it, so the old no-grace branch had stood it on the first sample above a point) unless the server accepted a reanimate hit on it within MpActor::kReanimateWindowMs 10 s (9ced8083; NpcFateTest's case), the gate that keeps a cast the only stand-up |
| the puppet's deferred kill and million health (formView.ts:313-319) and a puppet's death shown from the relay (movementApply.ts:75) | code | imposed as today: a puppet's isDead is the server's word; the view's "don't spawn dead actors" (formView.ts:75-79) changes for an engine reference, which binds and takes the death (Client) |
| the killer: the engine's myKiller (Actor.h:654, GetKiller :550) set by KillImpl's attacker; the server's kill names none (GetDeathStateMsg :1608-1636 carries isDead alone; deathService.killActor(actor, null)) | code | later: the crime verb (a townsperson's death with a killer is a bounty); this slice's kills stay killer-less in the engine, named |
| headshot's predicted death on a figure (deathService.ts:107-118, ADR-038) | code | native as is; an NPC target's kill is the server's through ClaimHeadshot (PartOne.cpp:2060-2063), no prediction |

### Sequences and combinations (ADR-033)

| sequence or combination | probe or scenario | result |
| --- | --- | --- |
| two kills in one cell at a person's rhythm (the second body down within seconds of the first), both bodies on both screens | b-npc-fate | |
| the kill by each input: a bow from the non-host (the person's way, b-headshot's steps), a melee swing, Flames; by the host's own player on its live actor (H11) and by the non-host on a puppet (H10) | b-npc-fate (the bow, non-host); x-npc-fate-melee (host, melee and spell) | |
| interrupted: the actor killed mid-attack and mid-furniture (a draugr rising from its coffin, a bandit on a chair) | x-npc-fate-furniture | |
| both seats hitting one actor: one death, one body, the loot taken once | b-npc-fate | |
| after a login (the newcomer sees the body), a cell change (leave past the engine's unload and return: the body stays), a server restart (the body stays), a relaunch of the host (the body on the new host's engine) | b-npc-fate | |
| the respawn: none inside the reset time (b-npc-fate's negative); the actor back at its placement when the server's clock has passed the deadline (the server started with its time setting past the death's day) | b-npc-fate; x-npc-fate-respawn | |
| the roll under two levels: c1 at level 1 loads the cell first, c2 at level 30 arrives: one species on both screens; the reverse order | x-npc-fate-roll | |

## Authority

Rung: R0 for the fate (the roll, the death, the body's point, the respawn, the loot); R1, R2 and R3 as follows.
- R0: the roll, the death, the body's standing point, the respawn and the
  body's inventory. R1: the host's reports the server checks already (a hit
  by a hosted NPC under the hit rules; the body's point as the last movement
  sample under cell-host's bounds). R2, declared: the death pose and where
  the body rolled, as each game's physics plays them, and the host's
  deathStart or TESDeathEvent report of a death the server did not decide
  (counted, never applied, H5); and, since ADR-062 decision 2 (slice 1b,
  2026-11-03), a host-run script's kill reported as cause 3: the host's
  word, recorded and applied as the death, never validated (not MayDie, not
  the body's distance to the record: owner checks, ADR-063 decision 4). R3,
  declared: each game's death camera and
  kill move choice, the dying line's audio, the Papyrus and story-manager
  events a kill fires in that game.
- Why not R1 for the roll: a game's roll cannot be validated into one roll;
  two games roll two species (observation 1). TES3MP has one visitor roll and
  the server keep it (tes3mp.md:62, :225-226); ours is the server's since it
  holds the records and the evaluator (LeveledListUtils) and waits for
  nobody. The roll is the placement's, kept in its record, so a restart, a
  handoff and a late joiner all see the same actor; the model is ADR-035's
  primary copy (Bharambe, Pang and Seshan, "Colyseus", NSDI 2006).
- Why not R2 for the death (TES3MP's authority word, ProcessorActorDeath,
  tes3mp.md:228-229): the server computes every number that reaches an NPC
  from a player (ADR-028, ADR-035 point 6), so it knows when health is zero;
  taking a host's word would let a host kill its cell's actors by saying so
  (rule 5). The cost is H5's gap, a death the server has no number for. Two
  shapes for Eli, one ADR (its number to be assigned): (a) this slice's
  default, the server's number alone kills, the gap counted; (b) a host's
  death report accepted as R1 when the server can check its cause (a fall:
  the sample's height change; a trap: an activation the server saw; an NPC
  against an NPC: a hit the host reported through OnHit with both ids, which
  the server numbers); the rest refused and logged, ADR-039's shape.
  2026-10-23: Eli asked for a mixed trust model instead ("npc's health hits
  0, by any damage, that death propagates?"), drafted as ADR-048 (PROPOSED,
  docs/DECISIONS.md): option A is (a), B is (b), C adds the rung R1h, a
  host's death from a cause the server has no number for accepted under
  plausibility checks and logged, a player's hit staying the server's
  number, with a trustLevel setting (friends, strict) and C-ii on NPC-only
  fights. D1 of the playtest-34 memo waits on it; train-42 builds the
  answer.
- Why the respawn is the server's and not the engine's: the engine's reset
  runs per game on each game's clock and detach times, so two games would
  reset one cell at two moments, each re-rolling (observation 1 again, every
  ten game days). The server has the clock (ADR-021, docs/verbs/time.md:85-96)
  and the records.
- The roll's level: the server's rule is the level of the player whose
  arrival loads the placement (the first loader, cell-host's election
  order), read from that player's actor-value record (ActorValueRecord.h:41,
  docs/verbs/actor-values.md), clamped by the zone's minLevel and maxLevel
  when the cell has an encounter zone; the alternative is today's level 0,
  every entry allowed (LeveledListUtils.cpp:48, the header's comment :17-18).
  Eli's choice; the engine's own inputs are H3 until the probe reads them.
- Rate limit / bounds: none from clients (every message here is the
  server's); the roll once per placement until its respawn; the respawn
  deadline in game days from the death, never under the GMST's hours; a
  body's point within cell-host's movement bounds.

The body's rest (ADR-067). A corpse is a physics object under the prop rule
(ADR-063 decision 1, ADR-067 decision 4): one mover simulates the ragdoll,
the engine that simulated the actor at its death (PartOne::SimulatorOf at
the kill; none at the death, and the first simulator to report inside the
window claims it), the at-rest pose is that mover's own final sample, every
other seat places its corpse at it, and the server's record, the loot reach
(E_ACTIVATE_REACH measures from the record, playtest 42's F6) and every
later check use it. Rung R2: the owner computes the ragdoll, the server
records the rest. For bodySettleMs after the recorded death (server
setting, default 15000, WorldState::bodySettleMs) the owner's movement
reports for the dead actor are accepted inside the movement bounds, applied
to the record (SetPos, SetAngle) and relayed to the listeners as a live
hosted actor's are; a report from any other seat is refused with
E_BODY_NOT_OWNER, said once a minute per sender and body. The body is at
rest when two accepted samples in a row agree within 2 units and 2 degrees
(MpActor::kBodyRestUnits, kBodyRestDegrees) or when the window ends
(PartOne::TickBodies, every second, and the movement path's own check);
the resting sample goes to the other games reliably (the prop rule's final
sample, ADR-058) and the record saves at once; from then every movement
report for the body is refused with E_BODY_AT_REST (once a minute per
sender and body) until a later claim (a drag or a push: the prop claim, a
later slice; TODO). A resurrection (MpActor::Respawn: the fate's respawn,
the host's engine's stand-up, a reanimate's, the lab's respawn-ref) clears
the rest. A dead actor's movement report is a body sample and never a
stand-up: the stand-up reads the health the host samples
(OnHostedActorState), and the movement path reads neither healthPercentage
nor isDead from the message. A body dead since before this process or
placed dead has no window on this server and keeps the host's samples as
before (TODO: its rest at load, with the prop claim; the rest state is not
persisted, no schema change). Lab reads: labState kind ref carries
bodyAtRest and bodyRestAt (the TickDeaths clock in ms, 0 while not at
rest); the lines "[verb:npc-fate] body <id> settling under <owner>: (x, y,
z)" at the first accepted sample, "[verb:npc-fate] body <id> at rest at (x,
y, z) after N ms, M samples" once, and the two refusals by code. T0:
ActorDeathTest's six BodyRest cases (fork branch adr067-corpses-srv).
HYPOTHESIS, the lab's to prove with the client half: that the owner's
engine reports the dead reference's position following its ragdoll until
it rests (today's client stops a dead actor's movement reports, so the
record kept the death point in F4 and F6); that the ragdoll rests within
the 15 s window on Bleak Falls' slope; that two agreeing samples at the
host's cadence are the rest and not a pause in the air; that a watcher
placing its corpse at the relayed rest shows the body where the owner's
lies.
Reading rules from the fresh review (2026-11-03): the rest decision is cadence-sensitive (two agreeing samples at the client's
130 ms cadence would call a creep under about 15 units a second rest; if the lab shows the owner's final body position drifting from
the record's rest, the fix is a dwell held across samples spanning about 500 ms, not a count); and the owner's samples that land
during the 3 s pending-death phase move the record as LIVE hosted samples and are not body samples, so a rest line reading "0 samples;
the settle window ended" with the record already at the ragdoll's place is that phase, not a missing client half (a follow-up may
start the window at BeginPendingDeath); the same line with the record still at the death point means the owner's client sent no dead
samples.

The watcher's corpse (ADR-067 by ADR-065's path; fork branch
adr067-corpses-client, the client half, 2026-11-03; the natives
adr065-sys1-native 2ea234cd). Rung R2: a render of the owner's rest,
nothing simulated on the watcher. The at-rest moment above is the trigger
of docs/verbs/change-form.md's pipeline: the owner's sender
(sendInputsService.sendMovement) keeps sampling its dead hosted actor at
the 130 ms cadence until two consecutive samples agree within 2 units and
2 degrees or 15 s pass, sends the rest sample reliably and stops for that
body; at that moment ChangeFormService.onBodyAtRest calls the native
TESModPlatform.SerializeChangeForm(refr) through callNative (a Papyrus
static answering a JSON string: "" on a refusal, the reason in the
platform log as "[verb:change-form] SerializeChangeForm refused <id>:
<reason>"; else the record's formType, flags, version, bodyHex (the whole
record's bytes, lowercase hex), fnv1a over those bytes and the remap rows
{offset, formId, index}, the u32s read back unsigned since Papyrus Int is
signed) and sends ONE reliable ChangeForm (MsgType 72: epoch from
HostService.epochForActor, the cell's host epoch; formId the shared load
order's id; formType; flags; version; body as hex; fnv1a; remap) when its
fnv differs from the last ChangeFormAck (73) for the form. No epoch (no
hosted cell names the actor's): the message is held and sent at the next
grant or the five-second pass; an unacked message is re-sent with a fresh
epoch every five seconds up to three tries, then given up; the ack clears
it. A watcher receiving ChangeFormApply (74, served with the actor's word,
at a cell's load and after an owner's record is acked) holds the record
until its copy is dead here. The kill is deferred (Actor.Kill and
KillSilent queue a type-10 task and the actor is alive at the native's
return, docs/research/adr062/papyrus-native-entries.md:73), so
deathService's kill (the death word's or the bind's silent kill, both
kept) marks the record and the service applies it as the kill lands,
tried every update for 3 s, through TESModPlatform.ApplyChangeForm(refr,
bodyHex, flags, version, "offset:formId:index,...") by callNative (a JSON
string back: applied, reason "at <step>: ..." when not, fnvPatched, the
diagnostics kept for the lab line), once per received record, keyed by
the body's FNV-1a computed on the client (the apply message carries no
hash); a record re-served for a body still laid and dead here is not
re-applied; the bind's record applies on the owner's own seat too (a host
relaunch must not re-record every corpse at its spawn); a kill by the word
on the seat that simulates the actor drops a held record (its own engine's
death stands). The engine's own load lays the body in the owner's pose at
the owner's place (read 1's GREEN 20261103-210713: 1,150 units in one
call, within 5 units). Nothing else moves a dead copy: movementApply's
one-shot setPosition to the host's sample is gone; formView's bind keeps
its coordinate move (the apply moves the body anyway, and the owner's
early dead samples then come from the record's spot); the bind's
zero-force push is skipped when a record is held for or laid on the body
(a given-up apply stands for nothing and the push runs as before). No
SetPosition of the service's own, no SetMotionType, no second kill. The
client declares no typing of its own for the natives (callNative by name;
the codegen's skyrimPlatform.ts is the native branch's regeneration); a
platform without them logs one line and the sender's tick goes on. Lab
lines, [verb:npc-fate]: on the owner "body <id> at rest on this engine
after N ms: (x, y, z); M units from the first dead sample, two samples
agree|the settle window ended", "changeform <id> sent: <bytes> bytes, fnv
<hex>, <n> remap rows, at rest (x, y, z); epoch E[, try N]", "changeform
<id> held: no hosted cell names the actor's; sent at the next grant (...)",
"changeform <id> unacked after 3 tries, given up" and "changeform <id> not
serialized: ..."; on the watcher "corpse <id> record held until the kill"
(a record ahead of any kill here), "corpse <id> applied from the record:
fnv <hex>, <n> rows remapped; patched fnv <hex>, <when>, N ms after the
record came; <the native's diagnostics>", "corpse <id> not applied:
<reason> (attempt i of 5, <when>); <diagnostics>", "corpse <id> record
dropped: held N ms, the copy never died here" and "body <id>: no push,
the change-form record laid it". HYPOTHESIS, the lab's to prove: that the
owner's engine reports the dead reference's position following its ragdoll
until it rests (the rest line's distance reads 0 if not, the record then
the death point's, and the fallback is the pelvis node's position through
NetImmerse); that the record applied as the kill lands lays the body with
no fall (change-form.md's read 2); that a record whose cell is not the
copy's moves it (read 3).

## Engine surface

RE read 2026-10-23 (the re-analyst, docs/research/m3/re-npc-roll.md, every
id by `just addr`, pseudocode tagged HYPOTHESIS, vtable slots and bytes
CONFIRMED-STATIC): a placed NPC_ whose template is an LVLN is rolled once in
TESObjectREFR::InitItemImpl at the reference's load, by a resolver that
rolls the list (the per-reference wrapper 14752 over CalculateCurrentFormList
with GetCalcLevel's per-game rotating level offset), clones a TESNPC from the
placed base, copies the pick into it, writes ExtraLeveledCreature and swaps
the base with SetObjectReference; a save's change form skips the roll, a
cell reset re-rolls through 37323. The outfit is rolled separately by one
equipper (418622) at the actor's first biped init or middle-high entry and
at every ResetInventory, its picks tagged ExtraOutfitItem{outfit}, the tag
suppressing the roll (HasOutfitItems) and keying AddWornOutfit and
RemoveOutfitItems; Papyrus SetOutfit never rolls. Train-41's path (the
report's recommendation): a detour on 14752 answering the server's pick for
a fated reference, a detour on 16072 adding the server's worn list tagged
and skipping the roll, the engine's own re-roll for a late fate, no base
swap of our own; today's applyEquipment leaves HasOutfitItems false, so the
next dressing redresses the engine's picks over the server's (the flap). The
five lab observations before it ships are the report's section 7; the Frida
plan its section 5 (lab/frida/npc-roll.js).

- CommonLibSSE-NG symbol(s), the leveled record and its roll:
  include/RE/T/TESLevCharacter.h:10-18 (TESBoundAnimObject, TESLeveledList,
  TESModelTextureSwap; FORMTYPE LeveledNPC), :49 (GetLevDifferenceMax,
  iLevCharLevelDifferenceMax); include/RE/F/FormTypes.h:184 (LeveledNPC,
  LVLN), :193 (LeveledItem, LVLI); include/RE/T/TESLeveledList.h:15-24
  (LEVELED_OBJECT: form, count, level), :27-37 (CALCED_OBJECT), :44-50 (LVLF
  flags), :60 (GetChanceNone: the global's value or chanceNone), :65
  (CalculateCurrentFormList(a_level, a_count, a_calcedObjects, a_arg5,
  a_usePlayerLevel)), :69-76 (entries, chanceNone LVLD, llFlags LVLF,
  numEntries LLCT, chanceGlobal LVLG); include/RE/T/TESLevItem.h:9-16, :45;
  include/RE/T/TESActorBaseData.h:15-44 (ACTOR_BASE_DATA flags: kRespawn
  1 << 3 at :25, kUnique :27, kPCLevelMult, kUsesTemplate), :69-71 (level,
  calcLevelMin, calcLevelMax), :113 (Respawns()), :117-122 (GetLevel), :126
  (deathItem INAM), :128-129 (baseTemplateForm TPLT, templateForms);
  include/RE/T/TESActorBase.h:62 (IsLeveled); include/RE/T/TESNPC.h:229
  (CopyFromTemplateForms), :281-282 (defaultOutfit, sleepOutfit).
- The placed reference's roll result and its base: include/RE/E/
  ExtraLeveledCreature.h:11-25 (originalBase +0x10, templateBase +0x18;
  kLeveledCreature); include/RE/E/ExtraDataTypes.h:219 (kLeveledCreature
  0x2D), :220 (kLeveledItem 0x2E), :318 (kLeveledItemBase 0x90), :204
  (kLevCreaModifier 0x1E), :188 (kStartingPosition 0x0E), :286
  (kEncounterZone 0x70); include/RE/E/ExtraLeveledItem.h:8-21,
  ExtraLeveledItemBase.h:10-23, ExtraLevCreaModifier.h:8-33 (kEasy to
  kNone); include/RE/E/ExtraDataList.h:148-176 (GetByType, HasType, Remove);
  include/RE/T/TESObjectREFR.h:74-80 (OBJ_REFR: objectReference, angle,
  location), :137-160 (ChangeFlags: kBaseObject 1 << 7 at :147,
  kLeveledInventory 1 << 27 at :156, kEncZoneExtra :158; the save persists a
  base swap, which is the Impose B lead), :332 (SetObjectReference, vfunc
  84, "sets flag 24 if the object has destructibles"), :383-384
  (GetBaseObject), :411 (GetObjectReference), :495-498 (data +0x40,
  parentCell, loadedData, extraList +0x70).
- Death, disable, starting position: include/RE/A/Actor.h:156-191
  (BOOL_BITS: kProcessMe :160, kDead 1 << 11 at :170, kSetOnDeath :182),
  :193-227 (BOOL_FLAGS: kEssential :214, kProtected :215), :229-243
  (ChangeFlags: kLifeState :234, kLeveledActor 1 << 18 at :238), :245-256
  (RecordFlags: kStartsDead 1 << 9 at :252), :345 (IsDead, vfunc 099), :368
  (KillDying 0AA), :369 (Resurrect(a_resetInventory, a_attach3D) 0AB), :438
  (SetActorStartingPosition 0F0), :468 (KillImpl(a_attacker, a_damage,
  a_sendEvent, a_ragdollInstant) 10E), :524-525 (GetActorBase), :550
  (GetKiller), :621 (SetLifeState), :654 (myKiller +0x100), :665
  (editorLocation +0x138); include/RE/A/ActorState.h:7-17 (ACTOR_LIFE_STATE:
  kAlive 0, kDying 1, kDead 2, kUnconcious 3, kRecycle 5, kRestrained 6,
  kEssentialDown 7, kBleedout 8); include/RE/T/TESObjectREFR.h:165-205
  (RecordFlags: kDeleted :171, kStartsDead TESNPC :177, kPersistent :181,
  kInitiallyDisabled :182, kRespawns 1 << 30 at :204), :256-258
  (GetEditorLocation1, GetEditorLocation2), :278-280 (GetStartingAngle,
  GetStartingLocation, SetStartingPosition vfunc 54), :337 (Disable 89),
  :338 (ResetInventory(a_leveledOnly) 8A), :353 (IsDead 99), :374
  (Enable(a_resetInventory)), :393-394 (GetEditorLocation), :442
  (IsDisabled), :447 (IsInitiallyDisabled), :451 (IsMarkedForDeletion), :453
  (IsPersistent), :467 (SetEncounterZone); include/RE/E/
  ExtraStartingPosition.h:11-32 (FILE_POS_ROT pos, rot; location);
  include/RE/T/TESForm.h:50-104 (RecordFlags: kDeleted :62, kPersistent :73,
  kDisabled :75, kIgnored :78), :108-117 (InGameFormFlag:
  kRefPermanentlyDeleted :116), :325 (IsDeleted), :353 (formFlags +0x10).
- The reset and the clock: include/RE/B/BGSEncounterZone.h:8-28
  (ENCOUNTER_ZONE_DATA: kNeverResets 1 << 0 at :14, minLevel :22, maxLevel
  :25), :30-40 (ENCOUNTER_ZONE_GAME_DATA: detachTime, attachTime, resetTime
  :34-36, zoneLevel :37), :53 (kZoneFlags change 1 << 1), :78-79 (data,
  gameData); include/RE/E/ExtraEncounterZone.h (zone); include/RE/E/
  ExtraDetachTime.h (time +0x10); include/RE/T/TESObjectCELL.h:103
  (encounterZone +0x160), :151 (kDetachTime change 1 << 30), :261
  (cellDetached); include/RE/C/Calendar.h:66-81 (GetDaysPassed :70,
  GetHoursPassed :73, GetTimescale :80), :91-94 (gameDaysPassed +0x28,
  timeScale +0x30, midnightsPassed, rawDaysPassed). No header names the two
  cell respawn settings; they are GMSTs, iHoursToRespawnCell and
  iHoursToRespawnCellCleared, read from the master with lab/esm.py (the
  server reads a GMST by its form id, libespm GMST.h and ActionListener.cpp:
  2538-2550's idiom), never from this doc: UESP's Respawning page gives 240
  and 720 hours and the Creation Kit wiki's Encounter Zone page the
  kNeverResets semantics; both numbers are UNREAD here.
- Address Library ID(s): UNKNOWN for the roll site (RE-1), the reset (RE-3)
  and the dead-at-load placement (RE-4). Leads only, from the map (docs/
  TE-MAP.md:72, rule 1's caution :13-21): Actor::AddDeathItems 37198 (TE
  gives remotes no loot) and SetNoBleedoutRecovery 38533. TE-MAP has no
  leveled-actor row: TE never syncs the roll (its party leader's game is
  the world), so there is no lead for RE-1.
- If UNKNOWN: to delegate to the re-analyst at the build's start (REA on
  sky-re, the default since 2026-10-18); the six tasks are in the Dynamic
  plan. Hypothesis blocks pasted here when they return.

## Observe (host or acting client sees the intent before the engine acts)

- Hook point: no client intent exists for a fate; the server's own events
  are the verb's. Two observations of the games, both reports, neither an
  authority: (1) a death the server did not decide, from SKSE's death event
  (Skyrim Platform sinks deathStart and deathEnd, EventHandler.h:36, :43 per
  npc-stream.md:243; ADR-034: the event first) on an actor the host runs,
  sent as the host's word and counted (H5); (2) the engine's own roll of a
  fated reference, read from ExtraLeveledCreature at the roster's sighting
  (HostService.reportSightings, every 2 s; docs/WIRE.md:232-256) so the
  server logs every mismatch between its roll and the engine's (the pin's
  oracle, H1 and H2).
- SP filter (minSelfId / maxSelfId / eventPattern): the death event is a
  sink, no hook; the sighting's base read is a native per reference on the
  roster's cadence (rule 9: nothing per frame). The one native hook this
  verb may need, Impose A's pin at the roll site, filters on the fate table
  in native (a reference with no fate falls through to the engine).
- Data captured: (1) the dying actor's id, the killer's id if the event
  names one, the server's record state at that moment (alive at the floor
  or dead); (2) refr id, the engine's resolved base, the fate's base.
- Side effects of hooking here: the death report's race with the host's last
  sample is the 3 s grace's (b-npc-death-report 195607); the roster's base
  read per sighted reference every 2 s (64 at most) is rule 9's accepted,
  unmeasured cost.

## Impose (observers render the server's decision)

- Mechanism (SP API call, native call, snippet), the roll, two shapes:
  - A, the pin before the roll (preferred: no visible swap). The game holds
    the fate (refr id, base) before the cell attaches, and a native hook at
    the engine's roll site (RE-1) answers the server's base for a fated
    reference instead of rolling. The fate must arrive ahead of the attach:
    the server sends ActorFate for the placements of the ring the player is
    about to load (the engine loads 5x5 where the server subscribes 3x3,
    npc-handoff.md's reach note; the server sees the crossing in the
    movement reports) and, for an interior, at the door's activation it
    already handles (MpObjectReference.cpp:1499-1543). H1: that the roll
    site is one hookable function run at the attach and that the fate can
    be there first in both cases.
  - B, the swap after the roll (the fallback, visible once). A new Skyrim
    Platform native sets the reference's base to the fate's
    (TESObjectREFR::SetObjectReference, vfunc 84, TESObjectREFR.h:332),
    rewrites ExtraLeveledCreature's templateBase (ExtraLeveledCreature.h:24;
    ExtraDataList::GetByType, ExtraDataList.h:148-160) and refreshes the
    3D through the Papyrus pair disable then enable (skyrimPlatform.ts:1883,
    :1886). Cost: a pop, the engine's pick shown for the relay's lag before
    the server's replaces it, on every attach of a cell whose fates arrived
    late. H2: that the engine accepts a base swap on a live actor (the
    save's kBaseObject change flag says swaps are an engine notion,
    TESObjectREFR.h:147; what else the virtual touches is RE-2).
  - C, named and declined: disable the engine's placement and PlaceAtMe the
    server's pick, the copies model; it loses the reference's linked refs,
    aliases and scripts (ADR-035's reason to keep references; a coffin's
    draugr is an ambush with linked markers).
  No Papyrus native sets a base (skyrimPlatform.ts lists getBaseObject
  :1899, getLeveledActorBase :2082, placeAtMe :1965, none the inverse), so
  both A and B are natives in Skyrim Platform, the puppet detours' shape
  (FridaHooks.cpp:1097).
- The death: DeathStateContainer 18 to the actor's listeners as today (the
  client's path exists end to end: remoteServer.ts:811-860 to
  deathService.applyDeathState :83-97 to killActor :141-153, endDeferredKill
  then Actor.kill on the engine reference); the view binds a dead engine
  reference and applies the death instead of returning (formView.ts:75-79
  changed for ids under 0xff000000). A puppet's graph ticks, so its death
  animation plays with AI off (H10); the host's live actor takes the same
  kill, the one write Rule A admits (ADR-045 point 4; a player's own death
  is taken the same way, deathService.ts:141-148), the engine running
  KillImpl for its own actor (H11).
- The body on a reload: the reference placed at the record's point and
  killed at once (the same path), so it falls where it stood (H6); TES3MP's
  instant death at the end of the animation, collision off (tes3mp.md:
  238-240) is the better shape and needs RE-4 (the engine's dead-at-load
  placement: SetLifeState(kDead) or KillImpl with ragdollInstant).
- The respawn: the record alive with a fresh pick, at the placement, full
  attributes, the base inventory; in the game: disable, the base set (A's
  table updated or B's native), enable with a_resetInventory
  (TESObjectREFR::Enable(bool), TESObjectREFR.h:374; the Papyrus pair,
  skyrimPlatform.ts:1883, :1886), which re-initializes the actor and its
  inventory (H9); the server sends the respawn as DeathStateContainer with
  isDead false and the teleport to the placement (GetDeathStateMsg
  :1608-1636, the shape that exists), plus the new base through ActorFate.
- The loot: the server's "inventory" property then OpenContainer at a dead
  actor's activation (the CONT branch's two sends, MpObjectReference.cpp:
  1553-1559); the client applies the list to the body before it activates
  it (onOpenContainerMessage, remoteServer.ts:172-185; the actor exclusion
  at formView.ts:472-481 lifted for a dead engine reference) so the menu
  lists the server's items (H4).
- Visual without simulation achieved by: nothing simulated on any client
  for the fate; the engine plays the death and the loot menu it already has.
- Side effects: CONFIRMED: H1 (072444), H4 (x-npc-loot 064648), H6
  (x-npc-corpse-drift 211727), H9 (x-npc-respawn 064950; b-npc-respawn
  154953), H10 and H11 (x-npc-death-guest 103226, x-npc-death-host 095847);
  H2 retired.

## Suppress (engine's own behavior blocked on non-hosts)

Registry, train-41 (15:26 PDT): the engine's two rolls are suppressed on a
fated reference and replaced by the server's, through Skyrim Platform's
detours (FateHooks.cpp, fork m3-train-41): the per-reference leveled roll
wrapper (Address Library 14752 by `just addr`, the re-analyst's read,
held three times in the lab) answers the server's NPC_ as the one pick; the
outfit-array resolver (16155, re-npc-roll.md section 8; first 16072, which
the lab showed to be the late path alone) adds the server's worn list
tagged as the outfit's items under every inventory init and rolls nothing;
the sleep outfit stays the engine's (a declared gap). Both pass every call
through while the npcFate switch is off (since cc21ae6f, 22:46 PDT, only
when the settings file says false: the pin held at T3, x-npc-fate-pin v3
GREEN 053914) or the reference is unfated. No Papyrus native is added (the exports are
Skyrim Platform's, as setPuppet is); docs/NATIVES.md unchanged. The lab
reads the server's side through mp.get(refrId, "actorFate").

Registry, train-42 (20:54 PDT), the deaths: on the server, the player path's
25 s wall respawn never touches a game-file actor (RespawnWithDelay's branch
schedules the fated respawn instead), and the server's number floors at one
point for an essential base, or a protected one not under a player's hand
(MayDie). On every seat, a dead body is never activation-blocked past the ragdoll's settle (the one named exception: deaths2, fork
f6405a77, on the system-1 merge branch, keeps a body that died while flagged a puppet in the puppet state for ragdollSettleMs 4 s, so
on a non-host seat a fresh body cannot be looted for about 4 s, until "body <id>: released from the puppet state after the ragdoll";
numidium's review of m3-system1 on 2026-11-03, item 4), and from that release the rule holds in full (the rule
since 2026-10-28, playtest 37's findings 58 and 62; train-42 blocked a
game-file body at the death and puppetService f8c32c2d kept the block
through a dead promote, on the assumption that the server's OpenContainer
activation with default processing opens a blocked body: it never did, every
corpse that opened was the engine's own activation of an unblocked one, and
a body demoted again after a host flip opened to no E press): the engine's
own loot menu opens on E, the activate hook reports it, the server answers
the record's inventory and OpenContainer, and the view lays the server's
list under the open menu (memo D52 B); a server-made NPC copy (a 0xff id
with an NPC base) is a corpse to the server too (IsCorpse keyed on
IsCreatedAsPlayer, not the id's range: the dead necromancer ff00000a's E was
dropped with no line); a dead body is released from the puppet state on
every seat (the native promote's dead branch: block lifted, AI left off,
flag cleared) and the fate's resurrect turns the AI on for the call whatever
the flag; the
engine's own cell-reset resurrection of a corpse on a re-entry
(re-npc-roll.md section 9, the 19286 path) is undone by the view's
two-second re-apply of the record's death. Registry, train-43 (23:56 PDT, fork m3-train-43 02c001ca, stacked on 42,
built ahead of Eli's D17): the hands. A third detour, on the container-path
adder 16128 (re-npc-roll.md section 11: InitLeveledItems' per-entry roll
14751 carries no owner; this adder does, the outfit argument null on the
container path), drops a fated owner's engine-rolled WEAP rows (the base's
weapon list, section 10) and writes the fate's worn weapons in their place
once per init pass, then lets the original tag them as the engine would;
the dresser 418622 equips the server's weapon as its own best pick, so no
forced equip and nothing to re-evaluate. Gold and loot rows stay the
engine's (the corpse's menu is the server's inventory). CONFIRMED at T3
(00:31 PDT): x-npc-fate-outfit v3 GREEN on 43's stage 02c001ca (run
20261024-072041), the worn equality whole on both Embershard bandits at 20 s
and again at 60 s (0xB6FE4: IronWarAxe 0x13790, hide boots 0x13910, studded
cuirass 0x1B3A2, bandit gauntlets 0x6F39B, the WIC cloak 0xE00DB79; 0xB6FDB:
hide boots, SteelSword 0x13989, ArmorBanditCuirass2 0x10594D), the races
79684 and 79688 equal to the fates; x-npc-fate-pin v3 GREEN on the same
stage (072444). Declared gaps: the sleep outfit (above); a protected base
under a player's over-time damage (a poison, a cloak:
ModifyActorValuePercentage carries no aggressor) keeps its point, the hit's
own number kills it (HYPOTHESIS whether any over-time effect reaches an
NPC's health that way at all, read by x-npc-overtime, v1 by path 16:32 PDT
2026-10-29, unrun: c1 hosts Riverwood under TGM, learns Flame Cloak 0x3AE9F
by the server console and stands by a held Hilde 0x35534 for 25 s with no
swing; the read is the record's healthPercentage after the 25 s of the cloak
beside her, falling below 0.95 with zero OnWeaponHit lines, the claim, or
staying at 1.0, which reads red there rather than moot; the aggressor named
"By caster" in the server log is recorded); the cleared hours and the
never-resets zones (Server).

- What is suppressed, on every game (host and puppet alike, since the fate
  is nobody's game's): the engine's cell reset of a server-owned placement
  (the body deleted, the placement re-rolled, inventories reset); the
  engine's own roll where the pin answers (A) or its result (B); SkyMP's
  RespawnWithDelay and load-time respawn for game-file actors on the
  server; the view's refusal to bind a dead actor.
- How: the reset, two switches named lazy and tagged H8: every encounter
  zone's kNeverResets set at runtime (BGSEncounterZone.h:14; persisted by
  the kZoneFlags change, :53) and the two GMSTs raised to their maximum on
  every client (the driver's set-gmst shows Skyrim Platform can; the
  engine's path for a cell without a zone takes the GMST, UESP's reading:
  H8), so no game ever resets a cell and the server's schedule is the only
  reset; the fallback if H8 falls is the re-apply at every cellAttach (the
  fate table re-imposed: the base and the death), which makes a reset
  harmless and visible for one frame. The server side: DeathEvent's
  OnFireSuccess (DeathEvent.cpp:65-70) and ApplyChangeForm's respawn
  (MpActor.cpp:820-824) branch on the actor's kind: a game-file actor's
  death schedules a fate, a player's arms RespawnWithDelay as today.
- Release condition (host handoff, cell unload): none; the fate is the
  server's, so a handoff changes nothing and an unload drops nothing (the
  record keeps the body). The switches stay for the session.
- Side effects: the engine's reset is held off by kNeverResets and the two
  GMSTs at maximum; no run has waited the vanilla 240 h, the re-impose
  fallback is unbuilt, and a mod's own reset script is unsynced by design
  (the layer ships none).

Known limits: The death report's race with the host's last sample is the
3 s grace's (b-npc-death-report 195607); the roster's base read per sighted
reference every 2 s (64 at most) is rule 9's accepted, unmeasured cost. The
engine's reset is held off by kNeverResets and the two GMSTs at maximum; no
run has waited the vanilla 240 h, the re-impose fallback is unbuilt, and a
mod's own reset script is unsynced by design (the layer ships none). A chain
rolling chance-none pins its head where vanilla would show nothing that
visit; the resident is always present, the engine's own answer unread. SPID
7.3.0's Outfit Manager sits in the equipper's frame on every seat; with no
Outfit or Item line in the layer it dresses from the pin's inventory, and a
layer adding such lines reopens the read (layer-stage's check).

## Message contract

Built, the server half (train-41, fork m3-train-41 2d1a71f6, 2026-10-23 15:05
PDT, stacked on m3-train-40; ADR-049 PROPOSED, D2 to D5 at option A): the
ActorFate message (MsgType 51, wire id 59, server to client, reliable:
fates of {refrId, baseId, level, worn}, at most 64 entries and 32 worn each,
wire-validate's check_fates with a test and a proptest, the JSON family's
51 and its fixtures, the C++ struct and the client type); the server's roll
at the first loader's level (WorldState::fateLoaderLevel around the fate
pass's chunk loads, the chain and the outfit alike, fateLevel on the change
form as an optional field, formVersion kept); the fate pass
(PartOne::SendFates at every square change: the squares three out that the
player has not been sent, their chunks loaded first so the actors there are
rolled before any engine rolls them, one message per 64 actors); the pin
(MpActor::GetFateBaseId, the chain's first leveled pick, else the placed
base); the respawn's re-roll at the record's level with the fate sent to
every user. unit/NpcFateTest covers the pass, the level, the pin and the
record. The ordering (16:07 PDT, after pipeline 2781's 0 == 25): the fate
pass runs at a player's square change ahead of the grid's own 3x3 loader
(WorldState::onSquareChange from MpObjectReference::SetPos, before
ForceSubscriptionsUpdate), so the ring is rolled at the player's level
before any of it is loaded or subscribed; an actor this process rolled
without a fate (loaded by the grid before any pass, a login's own square)
rolls anew at the pass's level (MpActor::RollFateIfUnrolled: chain and
outfit, not from a save, not dead), while a record from a save keeps its
roll (ADR-049 decision 1). The client half followed the same day (below). CI: pipeline 2783 GREEN on fa9874f4 (16:47 PDT), the server with its unit tests (NpcFateTest included) and the Windows client with the detours. A chain rolling
chance-none pins its head where vanilla would show nothing that visit; the
resident is always present, the engine's own answer unread.


- Message name / numeric type: ActorFate, new, S2C: the next MsgType and
  wire id at the commit, in table order (ADR-012; wire-schema lib.rs:
  440-507, TABLE and WIRE_IDS 59; id = MsgType + 8, :509-510): MsgType 53
  and wire id 61 after npc-stream's HostedActorState 51 and 59
  (npc-stream.md's contract) and npc-handoff's ActorHandoff 52 and 60
  (npc-handoff.md's), one lower for each that has not landed. SCHEMA_VERSION
  up by one (lib.rs:35, 17 today). Cap 64 bytes (Teleport's 64, :469).
  ReliableOrdered on channel 0, the grant's (wire-transport channels.rs:26),
  since a fate must not overtake the ActorFate before it for the same id;
  the client handles either order against CreateActor (the table is read at
  bind and at the pin).
- Direction: ActorFate server to client only: the roll, the death and the
  respawn are the server's. One client message since train-44 (2026-10-24,
  ADR-048's B, Eli's D1 "jump right to B"): ActorDeath (MsgType 52, wire id
  60, C2S, reliable, once per death, R1), the host's report that a game-file
  actor it simulates died of something the server has no number for: refrId
  u32, cause u8 (0 unknown, 1 fall, 2 hazard, 3 script, 4 an actor's hit),
  killer u32 (cause 4's actor, else 0), pos Vec3; validator
  check_actor_death (the id in range, the cause at most 4, a finite point in
  the world) and a per-host budget of six at once, one a second
  (E_VAL_RATE); two fixtures; the C++ struct and the client type in the same
  train (54798208 the wire, e7950b98 the server, faeb232a the client). The
  server's checks are the Server section's (OnActorDeath); WIRE.md carries
  the contract. The roster's engine base rides ActorSightings (below).
- Fields (name: type, units, bounds), in the family's JSON form (`"t": 53`):
  refrId u32 (the placement's own id, under 0xff000000, nonzero); base u32
  (the rolled NPC_'s form id, nonzero); dead bool; worldOrCell u32
  (nonzero); pos Vec3 and rot Vec3 (the body's standing point and heading,
  degrees; finite, in the world); respawnDaysPassed f32 (the server's clock
  value at which the actor returns, docs/verbs/time.md's daysPassed; 0 for
  none; finite, not negative). Rust sketch, wire-schema skymp.rs, the
  CellLoaded idiom (:1423-1440):

  ```rust
  wire_struct! {
      /// MsgType 53, thuum's (docs/verbs/npc-fate.md, ADR-035 point 6):
      /// server to client, reliable, R0 output: a placement's fate.
      /// Idempotent per refr_id, later wins. Reason codes: `E_VAL_RANGE`
      /// (refr_id 0 or at 0xff000000 and above, base 0, world_or_cell 0,
      /// respawn_days_passed under 0), `E_VAL_NONFINITE`,
      /// `E_VAL_OUT_OF_WORLD`.
      pub struct ActorFate {
          /// `"t": 53`.
          #[serde(default)]
          pub t: MsgT<53>,
          pub refr_id: u32,
          pub base: u32,
          pub dead: bool,
          pub world_or_cell: u32,
          pub pos: Vec3,
          pub rot: Vec3,
          pub respawn_days_passed: f32,
      }
  }
  ```

- ActorSightings 50, widened (npc-puppet's roster, skymp.rs:1465-1480;
  WIRE.md:232-256): each ActorSighting gains `base: u32`, the engine's
  resolved base for the sighted reference (0 when the engine has none);
  check: 0 or a nonzero form id; the server logs a mismatch against the
  fate and changes nothing (R2). SCHEMA_VERSION covers it in the same bump.
  Dropped before merge if the lab never needs it (rule 4's dead-field test).
- Validator rules (wire-validate, the same commit, rule 4): check_fate in
  validate_server, the shape both sides (lib.rs:579; check_host :437-443 and
  the Teleport arm :606-611 are the idiom): refr_id nonzero and under
  0xff000000, base and world_or_cell nonzero (E_VAL_RANGE); every float
  finite (E_VAL_NONFINITE); pos in the world (E_VAL_OUT_OF_WORLD);
  respawn_days_passed at or above 0 (E_VAL_RANGE); a proptest
  fate_never_panics (:1606-1608's shape); the sighting's base 0 or nonzero.
  C++: ActorFateMessage (skymp5-server/cpp/messages, HostGrantMessage.h's
  shape), sent from WorldState's fate scheduler and from the subscription's
  CreateActor path; two wire-json fixtures; `just wire-header-check` passes.
- Idempotency / ordering: idempotent per refr_id, later wins; the respawn's
  ActorFate (dead false, the new base) after its DeathStateContainer on the
  same reliable path; a fate for a reference the game has not attached is
  held in the table until the attach or the next fate.
- CreateActor 33, DestroyActor 25, DeathStateContainer 18, Teleport 20,
  OpenContainer 21 and the "inventory" property (UpdateProperty 7): bytes
  unchanged (lib.rs:456-482). CreateActor's baseId already
  carries the server's base (PartOne.cpp:984-987) and its isDead the record
  (:990-992; skymp.rs:1169); the view reads them against the engine
  reference (Client).
- Contract doc updated: yes, in the same commit (WIRE.md's World family
  line and a section in ActorSightings' shape, :232-256).

## Server

Built, the deaths (train-42, fork m3-train-42 4a345953 the server, 3cb843a8
the client, 2026-10-23 20:39 PDT), independent of ADR-048's D1 and held from
the merge until Eli's answer: the death stamps the record with the server's
game day (MpChangeFormREFR::fateDiedAt, optional, formVersion kept; the
five-field Fate struct below reduced to the one stamp the deadline needs,
the rest derivable or bookkeeping); RespawnWithDelay's game-file branch
schedules the fated respawn for every caller (the death event, the load,
the stray hit), so no 25 s timer touches a game-file actor;
PartOne::TickFateRespawns sweeps the due set once a second against the
installed game clock (a sweep, not the one wall timer below: the rest and
sleep verbs jump GameDaysPassed and a timer set at the death would miss the
jump); the hours are WorldState::FateRespawnHours, the npcRespawnHours
setting when set, else the executable's compiled iHoursToRespawnCell 72
(re-npc-roll.md section 9; the master's GMST value is a read owed, T0 5);
the respawn stands the record at its placement (GetEditorLocationalData
through SendAndSetDeathState's teleport), attributes full, the roll fresh
regardless of the death item (D3 A, the engine's reset), the fate sent
again and isDead false broadcast; a unique base stays dead (the engine's
rule), essential and protected per MpActor::MayDie in both percentage paths
(essential never dies, protected dies to a player's hand alone); a dead
game-file actor is a container (IsCorpse shares the CONT branch's body:
occupancy within 512, the record's inventory, OpenContainer, TakeItem and
PutItem on the server). T0 (NpcFateTest): the body lies inside the window
and stands at its placement past it, rolled anew, its fate sent; the corpse
opens as a container and the take is the server's; the broadcast case
leaves the shared world alive. Then (69a8a972, 20:46 PDT): the hours are
the master's GMST iHoursToRespawnCell, 240 (record 0xD3646; the cleared
0xD3647 is 720, for the quests verb; numidium's esm.py read on sky-srv),
through libespm when the world has the master, the setting first, the
compiled 72 last (D13, T0 pins 240); MpActor::Respawn is the one funnel that
clears the body's stamp and its due entry (the console's Resurrect and the
lab's respawn-ref pass there), so the next death counts from its own day.
e6da24ec fixes the Catch2 chained comparison both builds of 4a345953
refused. A contract change (21:35 PDT): the gamemode's per-actor spawnDelay
times players alone now; a game-file actor's body keeps to the reset clock
whatever spawnDelay says, so upstream's two integration tests that killed
the mudcrab 0xDC558 with spawnDelay 0 and waited a millisecond
(test_isdead, test_partial_location_save) moved to npcRespawnHours 0.0001
in their settings and a wait spanning one sweep; a gamemode wanting an
instant respawn calls the console's Resurrect or the lab's respawn-ref (without inPlace the fated, teleporting shape since 2026-11-03; with inPlace the Resurrect-like one). Owed: the JSON round-trip T0 and MayDie against a master flag, the
restart scenario as b-npc-fate (rule 13, after x-npc-death holds), the
cleared hours (the quests verb), kNeverResets zones (libespm reads no ECZN:
every cell resets). The lab's grammar (numidium, lab main 80c350dd):
`c1: kill-ref {formId, killer?}` (the console verb's Kill as the seat's
console) and `c1: respawn-ref {formId, inPlace?}`; asked: npcRespawnHours
in the scenario's server block, for the sweep's own read.

- Where the logic lives:
  - The loader. WorldState::AttachEspmRecord (WorldState.cpp:427-690) admits
    a LVLN base: `isLeveledNpc = t == "LVLN"` beside isNpc (:452), rolled to
    one NPC_ by LeveledListUtils::EvaluateListRecurse (LeveledListUtils.cpp:
    71-123; the chance-none global read as the global's value once H12's fix
    lands, :35) at the Authority's level, the MpActor created with the pick
    as its base (:677) and the placement's own base kept in the record. A
    deferred change form (:719, changeFormsForDeferredLoad) is consulted
    before the roll: a saved fate wins, so LoadForm never re-rolls and
    ApplyChangeForm's "baseId should never change" (MpObjectReference.cpp:
    1227-1232) holds; LoadChangeForm (WorldState.cpp:217-240) reads the base
    from baseDesc as today, which is the pick. The NPC_-with-LVLN-template
    case keeps EnsureTemplateChainEvaluated (MpActor.cpp:1661-1764) with the
    Authority's level in place of kPcLevel 0 (:1664); its leaf is the base
    the fate sends. Dead-at-start and disabled placements stay skipped
    (:471-480, :492-507; the Inventory's later row).
  - The death. MpActor::Kill unchanged (:1911-1933). DeathEvent::
    OnFireSuccess (DeathEvent.cpp:65-70) and MpActor::ApplyChangeForm's
    respawn (:820-824) branch: a game-file actor (its id under 0xff000000,
    IsCreatedAsPlayer false, :1545-1548) gets a fate scheduled, never
    RespawnWithDelay; players as today. The death's standing point is the
    record's position at the kill (the host's last accepted sample).
  - The schedule. One WorldState list of due fates, the reloot scheduler's
    shape (WorldState::RequestReloot :317; MpObjectReference's
    nextRelootDatetime, :1150-1184), keyed by game time: the deadline is the
    death's daysPassed plus the GMST's hours over 24, read from the server's
    clock (wire-rules clock.rs through the bridge, docs/verbs/time.md:94-96;
    labState's time.daysPassed is the same number). The clock is a pure
    function of wall time and the settings (time.md:85-91), so a game-time
    deadline converts to one wall-time timer at scheduling and a restart
    recomputes it from the record; a zone's kNeverResets means no deadline.
    The cleared time (iHoursToRespawnCellCleared) waits for the quests verb
    (the location's cleared state is engine quest state); this slice uses
    the uncleared hours for every cell, named.
  - The respawn. At the deadline: a fresh pick (Eli's choice between re-roll,
    the engine's reset behaviour, H9a, and keep), the record alive at the
    placement (GetEditorLocationalData, :2056-2102; never ChangeForm().
    spawnPoint), attributes full, the base inventory rebuilt (RelootContainer
    :927-934: baseContainerAdded false then EnsureBaseContainerAdded), the
    SweetCantDrop keep as RespawnWithDelay's (:1979-1996); ActorFate and
    DeathStateContainer out.
  - The corpse. ProcessActivateNormal takes a dead actor with an actor
    activator through the CONT branch's body (:1544-1569: occupancy within
    kOccupationReach 512, EnsureBaseContainerAdded, the "inventory" property,
    SendOpenContainer, the destroy and disable sinks), so TakeItem and
    PutItem (:642-668) hold their occupant check and move the item on the
    server (OnTakeItem, ActionListener.cpp:1232-1260). A live actor's
    activation is unchanged (dialogue is the host's engine's).
- DB fields / migration (rule 6): MpChangeFormREFR gains `std::optional<
  Fate> fate` (MpChangeForms.h, beside shoutRecord and playerGlobals'
  idiom, :167-175: absent in older records, read as "no fate"): placementBase
  FormDesc (the LVLN or the NPC_ as placed), rolledAtDaysPassed f64,
  diedAtDaysPassed f64 (0 alive), respawnAtDaysPassed f64 (0 none),
  respawnCount u32; the body's point is the record's position and angle,
  the death flag isDead (:93), the rolled base baseDesc (:76). ToTuple, the
  JSON reader and writer and ActorTest.cpp (:177's note) in the same
  commit. formVersion stays 2 (ADR-043 decision 2: an added optional field
  re-encodes nothing); Eli may ask for 3. The restart-persistence scenario
  is b-npc-fate's restart leg (Tests), a-restart-persistence's shape.
- Restart behavior: a dead fated actor loads dead (no respawn at load for
  game-file ids), at the record's point, its deadline recomputed from the
  stored game time; a fate past due at load respawns at once; a live fated
  actor keeps its pick. Rolls never repeat across restarts (the loader's
  deferred-form rule above).
- Papyrus natives touched (ledger lines added): none new; Actor.Kill,
  KillSilent and Resurrect stand as the ledger has them (docs/NATIVES.md:
  201-202, :223; headshot.md:151 has the server's Actor.Kill at R0). The lab
  gamemode gains two labCommands for probes, kill-ref {formId, killerProfileId}
  and respawn-ref {formId} (lab/gamemode/gamemode.js's respawn-ref: since 2026-11-03 the fate's own RespawnFated through the server's respawnFated property, the sweep's wire with tTeleport; inPlace stands him where he fell; the lever skips the sweep's eligibility, and a placed corpse it stands up keeps placedDead, so that body's next death never schedules a return, numidium's review of m3-system1-r3 5e0e975b), the
  server's own kill (ConsoleCommands.cpp:255-268's ExecuteKill) by id; the
  scenario's kills are the person's (a bow), the probes' these.
- Settings: `npcFate` (the kill switch), per server, beside npcEnabled
  (ADR-035 point 9, the run's own setting); off is today's behaviour, every
  path above untouched.

Built, the death report's judge (train-44, fork m3-train-44 e7950b98,
2026-10-24 16:10 PDT; ADR-048's B, Eli's D1 "jump right to B", 15:49 PDT):
ActionListener::OnActorDeath takes a host's ActorDeath for a game-file actor
when the reporter simulates it (PartOne::SimulatorOf: the cell's host or
ADR-047's follower), the actor is alive and may die (MpActor::MayDie: an
essential never, a protected one to a player's hand alone, so never by a
report), the body lies within 2048 units of the record, and the cause named
checks against what the server saw: cause 4 by a hit from the named killer
the server numbered within 3 s (MpActor::NoteHitBy, stamped at every weapon
and spell hit the server numbers, a self cast excepted), 1 by a drop of 200
units in the host's own movement samples within 4 s (MpActor::RecordHeight
at every hosted sample, DropTo the highest minus the body's), 2 by an
activation within 512 units of the body within 5 s (the listener's recent
activations, NoteActivation at every first activation), 0 by any of the
three; 3 (a host-run script's kill) taken as the host's word since ADR-062
decision 2 (R2 above; before it refused as the server's to run, which
scripted-effects.md's own kills still are), any other code refused. Then
MpActor::Kill with the killer, the death's
travel as every death's. A refusal is one warn a minute per actor with its
code (E_DEATH_OFF, NO_ACTOR, PLAYER, NOT_HOST, IMMORTAL, FAR, NO_KILLER,
UNCHECKED, SCRIPT, CAUSE), a report for an actor already dead an info line
(the server's own kill got there first, the expected race). A report naming
a player's hit is checked as any actor's (the server numbered that hit): the
engine's number outran the server's and the death stands on both screens
(the gameplay-first rule); a strict mode refusing a player's hand is one
line if Eli wants it. Setting npcDeathReports, default true; false restores
A. T0 unit/ActorDeathTest, five cases (Tests 8). The hazard evidence as
first built was unreachable (17:05 PDT, an agent's read of the vanilla
scripts, digital-apple/TESVScripts, and the CK wiki): every trigger script
activates itself (TrapTriggerBase L239, PressurePlate L21, Tripwire L18
`activate(self as objectReference)`), the engine forwards that activation to
the trap with the plate as the activator (CK wiki, Reference, Activate
Parents: "this reference will be activated by the reference which acted as
the activate parent, not the originally activating NPC"), and the client
reported only activations whose action reference was the player or a hosted
actor, so no trap ever reached OnActivate. Since the restage's head (the
commit after 576c3cde): the game hosting the trigger's cell forwards a
reference's activation of itself as an Activate with caster and target the
same (activationService), and the server notes it where and when
(OnActivate's first branch: the reporter must host the cell, nothing is
activated), so a death within 512 units and 5 s of it checks as a hazard;
ActorDeathTest's hazard case drives that path. Still the floor: bear traps,
break-away floors, oil pools and falling lamps fire with no activation at
all (TrapBear, TrapBreakAwayBase, TrapExplosiveGas: OnTriggerEnter or OnHit
straight to the hit, the explosion or the hazard). Two, the trap half
HYPOTHESIS and the fall half MEASURED below: that the engine's death event
for a trap kill carries no killer (ProcessTrapHit, darts, flames and hazards
set no blame actor; Papyrus's akKiller is typed Actor; but a non-actor
killer in the native event would make Skyrim
Platform drop deathStart altogether, EventHandler.cpp L413-447, and the
report would never leave the host: the lab's plate run decides, Arvel's
plate in Bleak Falls Temple the natural read, x-npc-trap-report by path
since 2026-10-24 22:50 and never run, its placeholders PLATE_REF,
PLATE_X/Y/Z and the victim's id unfilled, so it cannot run as written until
numidium's esm.py fills them); and the fall bound (200 units within 4 s is a
plausibility floor, not the engine's damage rule, which ran on the host;
x-npc-fall-report reads a drop the engine kills at). MEASURED
(x-npc-fall-report v3 20261025-012351 on 44 8efabb10, 18:26 PDT, numidium's
read): the host's engine killed the lifted wolf by a 4000-unit fall
(mid-fall at z 12741, dead at hp -675 under the deferred kill), the floor
report went out, and the server took it by "a drop of 3813 units in the
host's samples", killed the record and scheduled the 240 h reset; dead on
the record and both seats; the bound of 200 held with room. Committed as
lab/scenarios/b-npc-death-report.yaml (main 3c6c54e). The hazard's evidence
is the trap half's open read above (x-npc-trap-report).
Nightly 20261025-124620 red on the roll, not the report (numidium's
agent, 11:5x PDT): the subject 0x85547 came up a SKEEVER (EncSkeever
0x23ab7, race 78337; the gate's green had EncWolf 0x23abe, 78346), one
entry in five of its level-1 list, and the lifted skeever never fell: two
seconds after the lift it stood on the ground 441 units off at health 1,
where the wolf had been mid-fall, so nothing reached the floor and nothing
was reported (no report line, no E_DEATH_*). The scenario now asserts the
species as a premise
(main e6a62fb), so the roll's red reads at the prelude; the fix owed is a
wolf-only subject (a direct EncWolf or deer placement near the forest,
esm.py), since a one-in-five premise red is no gate scenario.
Done (13:03 PDT): the subject is the fixed EncWolf 0x82717 (base EncWolf
itself, numidium's esm.py read; its pair 0x82716 and the leveled predator
0x82718 culled from a park at square (22, -20)), x-npc-fall-report v4 GREEN
20261025-195607 on parity 8efabb10 promoted unchanged into
b-npc-death-report (main c5eb498); the premises are the engine's (c1 runs
the wolf, c2 puppets it, raceId 78346). The nightly's four reds all read
and their scenarios green again (fix-m3-nightly 193214, 4 of 4).

Built, the roll's level rule (train-44 1d8efca5, 16:30 PDT; the memo's D2,
Eli: "some way to calculate a middle ground?"): PartOne::FateRollLevel gives
the fate pass its level by the npcRollLevel setting: "loader" (the first
loader's own level, ADR-049's A), "party-mean" (the default: the mean,
rounded down, of the levels of the players within the fate ring's three
squares in the loader's world or cell, the loader among them, or of every
player online when no near one has a record), "party-min" (the lowest of the
same), or a number for everyone (a designed difficulty, the dedicated
server's shape); clamped at 1; the respawn's re-roll keeps the record's
level (D3); the encounter zone's clamp stays ADR-049's owed read. The pick
among the three is a settings line, not a build. T0 unit/NpcRollLevelTest
(Tests 9).

Playtest 34's finding (2026-10-25, numidium's read): two SERVER-MADE
bandits in Bleak Falls Temple, carried in the world since a lab placement
(0xff000004 and 0xff000005, base EncBandit01Melee2HBerserkNordM 0x3de6f,
profileId -1), died to rotfern's headshots and stood again 25 s later by
the players' RespawnWithDelay, while the game-file bandit 0x39fe4 beside
them lay for the reset hours as designed: IsFateRespawned required an id
under 0xff000000. Train-46 (fork m3-train-46 53bd5959) keys it on the base
instead (every actor that is not a player's; IsCreatedAsPlayer is a 0xff id
with base 0x7 or below), so a server-made NPC's death schedules the reset
clock and its respawn stands it at its spawn point (SendAndSetDeathState's
GetSpawnPoint; GetEditorLocationalData has nothing for a 0xff id), and a
host's death report for it is judged like a game-file actor's. T0:
NpcFateTest's case (a change form with an NPC base loaded under a 0xff id,
killed, found on the reset clock with its day stamped). For the playtest
numidium restored a copy of the world without the two records
(playtest-m3-34b-rotfern-20261025T2217Z).

The same two bandits explain the playtest's second finding, test 2 taking
no damage inside the temple it hosted: in 15 minutes of log no OnHit line
names ff000004 or ff000005 as an aggressor, and no refusal either, while
the game-file bandit 0x39fe4 beside them, hosted by the same seat, hit
test 1 four times (applied). The path: OnHit's weapon branch needs the
weapon in the aggressor's record's hands (equipment.inv.HasItem), and a
miss ended at a spdlog::debug line, silent in the lab's log. A server-made
copy is dressed by the host's engine from the base's own roll (npc-puppet's
Rule A: the server's equipment is never applied to a hosted actor), while
the record holds the server's roll (EnsureBaseContainerAdded at the fate
level or 1), and nothing pins the two the way a game-file actor's fate pins
its hands (ADR-049, train-43), so every swing of theirs carried a weapon
the record's hands lacked and was dropped. Nothing in the path refuses a
hosted NPC's hit on its own host's player (target 0x14 resolves to the
sender's actor); test 2 was shot at by nobody else. Train-46 makes the
drop visible: E_HIT_WEAPON at info level once a minute per actor, the hit
still dropped (the server's number needs the server's weapon). The dress
is OWED as a design line: a server-made copy takes the server's equipment
once at its creation on every game, the host's included (its identity, as
the fate pin is for a game-file actor), and Rule A holds from then on; a
client change, its own train. A probe of a hosted game-file actor hitting
its own host's player (the server's OnWeaponHit line on the host's own
actor) belongs to the next stage. The playtest itself then showed the path
live (numidium's read): after its host handover (ff000000 took 371de at
epoch 2 at 22:36:48Z) the campfire bandit 0x39fe2, hosted on rotfern's own
game, hit rotfern's player at 22:38:08Z, "39fe2 hits ff000000 with 13985
for 13.70 damage, health 1 -> 0.86", applied; the probe x-host-own-hit (by
path) confirms it under the lab's eyes and is the scenario candidate.
Rotfern then killed 39fe4 by three plain hits and 39fe2 by a headshot
(ClaimHeadshot, head bare), both "died at day 1.8113; the body lies until
day 11.8113"; across the server restart of 22:46:59Z both bodies stayed
dead on their 240 h clocks (ApplyChangeForm's respawn of a dead actor
yielding to the fate), their records moved by a few units (the host
re-settling them). Eli's section 5 notes on the bodies, to read from the
client logs at the session's end and build on the next train: the non-host
cannot interact with a body (a dead puppet keeps the native demote's
activation block, which the promote lifts for the host alone; the engine's
container menu never opens); when the host loots, the body loses all its
clothes (the equipment update on a dead actor, or the engine's strip; a
read); after a cell reload both seats can; rotfern could not take armor
where test 2 could; test 2 does not see the cape rotfern placed (a dropped
or placed item's sync).

The strip has a mechanism in code (CONFIRMED by its fix: train-47's
resetBaseFirst false; x-body-loot v5 20261028-072219 as b-body-loot, the
worn set kept after the host's loot; no strip in playtests 35 to 38): the
body's inventory is laid in by applyInventory
(modelApplyUtils.ts, ignoreWorn true) at the host's loot, and applyInventory
begins with resetBase, which, the first time this game session meets the
reference's BASE id, calls TESModPlatform.resetContainer on the base and
removeAllItems on the reference before diffing the server's list in: the
engine's worn set goes out and comes back unworn, so the corpse stands in
its underwear from the first loot (sync/inventory.ts resetBase; basesReset
keyed by base id, so each of the campfire pair's bases strips once). The
same resetContainer on an NPC_ base shared by many placements (the Enc
bandits') clears that base's own inventory list for every actor of it
spawned later in the session, a latent hazard the CONT path never had. The
row for the next client train: a dead engine reference takes the server's
list as a diff alone (no base reset, no removeAllItems), its worn items
left in place; the pin already makes the worn sets equal, so the diff is
the loot rows. The non-host's failed interaction and rotfern's refused
takes wait on the server's lines (E_ACTIVATE_REACH; "doesn't occupy ref",
PutItem's and TakeItem's throw when the taker is not the body's occupant).
The likelier reading of both (CONFIRMED: one occupant plus the server's
missing release, LOG 2026-10-25 16:06 PDT; x-body-release v2 235731 every
claim held; superseded by D52 B's shared containers): a body is a
container, and a container has ONE occupant at a time within 512 units
(CheckIfObjectCanStartOccupyThis: "occupant is another object and is
nearby" refuses, every other case opens), held until that player's closing
activation clears it or the player is destroyed or disabled; the refused
player gets no OpenContainer and so no menu and no message, and a take by
anyone but the occupant throws "doesn't occupy ref". The non-host's
"can't interact" while the host held or had left the body, and rotfern's
refused takes while test 2 held it, are that rule seen twice. The
server's own lines name every corpse activation that reached it
("MpObjectReference::ProcessActivate 39fe4 - <reason> (activationSource =
...)"). Whether a body keeps the single-occupant rule, tells the second
player, or admits both is a design item for the post-playtest memo (the
rule is upstream's for every container), not a train-47 fix.
CONFIRMED by the lines (numidium, 16:06 PDT): 28 ProcessActivate lines on
39fe2 from 22:37Z; rotfern took the body at 22:38:32 ("no occupant"),
its closing activation 3.4 s later read "occupant is already this object"
(the first-activation path), test 2 was refused five times in 22:38:41 to
:43 ("occupant is another object and is nearby") and got the body only at
22:42:40, once rotfern stood out of range ("occupant is too far away"),
after which rotfern was refused in turn; no "doesn't occupy ref", no
TakeItem, PutItem or DropItem line in 22:37 to 22:59Z. The cause is a
server defect, not the rule: ProcessActivateSecond releases the occupant
for a CONT and a FURN base and falls through for a corpse (an NPC_ base
that IsCorpse shares with the CONT branch's OPEN but not its CLOSE), so a
body's occupancy is never released by its looter's closing activation and
clears only by distance, disable or destroy. The fix is one condition
(the corpse joins the CONT release) with a T0 case: BUILT as train-46's
fourth commit (c40a36a3, 16:09 PDT, numidium's call: one CI cycle against a
second server train's T2 and gate), ActorDeathTest's case opening, closing
and admitting the next player with its OpenContainer. The strip and the
cape left no server line: client-side, as read above. The ice wolf's 0
damage on rotfern against 10 a bite on Alvor (numidium's section 5 read)
is god mode: "ConsoleCommands: ff000000 god mode on" at 22:59:59.798Z,
the TGM branch zeroing the number before the same log line; no formula
question (a creature's unarmed damage is its race's, times the target's
armor penalty, never zero).

Section 3's leads from the code (the verdicts: (1) the host dropped its own
archer's arrows (LOG 2026-10-26 15:43 PDT), fixed in 53, x-npc-archer 032303
GREEN as b-npc-archer; (2) finding 68 (LOG 2026-10-29 13:39 PDT); (3) to (5)
moved to npc-puppet, the voice and face slices, npc-handoff): (1) "NPC bow
animations on one screen only": the host's
AnimationSource relays every event the actor's graph took (sync/
animation.ts, movement-controller events aside) and the puppet replays an
attack event through allowedAnims, so the relay is not the gap. Two
candidates: the puppet's graph refusing a bow draw on an AI-off actor whose
movement step the detour skips (melee attacks replay; a draw holds a state
the combat controller owns), or ammo: the fate's worn list is the server's
equipment with a Worn flag (FateOf, PartOne.cpp), the outfit's rows, never
the base inventory's arrow stack, which each engine rolls itself, so a
puppet should hold arrows of its own roll unless that roll came empty. The
read: an archer's npc-state on both seats (worn and inventory, the AMMO
rows) and the puppet seat's "block anim" console lines at the host's
bowAttackStart. (2) "arrows need
re-equip after load": the player's own ammo across a relaunch, the
equipment restore's worn flag for AMMO; a client read of applyEquipment's
filterWorn against an arrow stack. (3) sitting NPCs jerky indoors: the
furniture row (npc-puppet.md). (4) face animations and voice lines not
propagating: dialogue on a puppet, known. (5) Hilde stuck at her door and
the smith's daughter leaving in place after the handoff: the session's
logs at the end (numidium's agent).

GREEN AT T3, both (18:42 PDT): the corpse's release (x-body-release v3
20261026-012319 on 46's stage: c1's loot and close, then c2 admitted at
once, two "no occupant" lines and never "another object"; committed as
b-npc-body-release, main a43d655e) and the protected floor (x-npc-protected
v3 20261026-012622: six bear hits on Jenassa logged "health 0.01 -> 0",
the number before MayDie's floor, her record and c1's engine alive, no
death line of hers; committed as b-npc-protected, main 6f9a7957). The
earlier runs' reds were the probes' (a bare close-menu, a mod's start-up
box, a claim too broad by the bear's own death, a hostile taking the
god-mode player). Train-46 MERGE-READY by citation and MERGING on Eli's
"Merge now" (gate 20261026-001639 eighteen of eighteen, T2 green).

AMENDED FOR D52 (12:06 PDT 2026-10-30, main 330124b, the scenario alone):
b-npc-body-release's claims counted the single-occupant check's lines
("ProcessActivate 39fe4 - no occupant", twice), and memo D52's shared
containers (e3fa27a6, c1de7167; the pass union b8a9d4c6) moved a corpse's
open and close onto containerOccupants, which write nothing but "N players
in the container now" at a second concurrent occupant; the check is
furniture's alone now (MpObjectReference.cpp:1965). The scenario went red
three times in the union's sweep (20261030-164127: 184852, 185123, 185329)
with the activation working. The shape is unchanged (c1 loots and closes,
then c2 is admitted at once); the claims read D52's path: each seat's
admission as the server's OpenContainer at the client's handler line
("waiting for 'ContainerMenu open' (a corpse)", a log-count step) with the
ContainerMenu open in a dump-state; c1's release as its handler's "menu
closed" and "sent ActivateMessage" lines (the closing activation
ProcessActivateSecond's corpse branch takes); the release's effect as the
server's silence at c2's join (no "[0-9]+ players in the container now":
c1 stands inside the 512-unit occupation reach, so a c1 left in the set
would make c2 the second occupant and log it); kept: no "occupant is
another object", no E_ACTIVATE_REACH, the body dead on the record. Two
seats in one body at once is x-shared-chest's read (D52's probe), not this
scenario's.

BUILT AHEAD, train-47 (fork m3-train-47 ea2d6431, client TS, stacked on
train-46; built ahead does not merge): (1) applyInventory takes
resetBaseFirst, and the view's dead-body apply passes false, so a game-file
body's inventory lands as a diff alone, its worn set in place; (2) a
server-made copy this game hosts takes the server's equipment ONCE at its
first apply (FormView.hostDressed), its hands the record's, Rule A after.
Probes to write for its stage: x-body-loot (c1 alone in 371de, 39fe4 killed
by the server, c1 activates the body, the engine's worn set still equal to
the fate's worn list after the loot; the ContainerMenu's opening is the
driver's activate step's return) and a server-made copy's hit landing on
the server with no E_HIT_WEAPON (needs a server-made NPC the lab can place;
how playtest 34's two were made is numidium's to say).

## Client

Built, the deaths' client half (3cb843a8, 20:39 PDT): formView binds a dead
record's engine reference (the copies' "never spawn dead" kept for copies)
and emits applyDeathStateEvent at the bind and every two seconds while the
record is dead and the engine's actor is not (the engine's own cell reset
stands corpses up on a re-entry, re-npc-roll.md section 9); the record's
inventory applies to a dead engine reference (the server's container);
deathService blocks a game-file body's activation at death, as dealWithRef
blocks a CONT's, so the loot menu is the server's OpenContainer with default
processing, the activate hook still reporting; a game-file actor's respawn
is the engine's own Resurrect (inventory and AI reset), the fresh roll
through ActorFate's late path, the placement through the death container's
teleport (onTeleportMessage moves the host's engine reference), the host's
actor unblocked and a puppet kept blocked, in place of RespawnNeededError's
disable-and-delete of the placement; onOpenContainerMessage takes a dead
NPC_ as a container (ContainerMenu). CONFIRMED at the lab, the runs named
under Impose's side effects: H4 (the menu
lists the server's items), H6 (the body at the record's point on a reload),
H9 (Resurrect, then the late re-roll), H10 and H11 (the kill on a puppet
and on the host's actor).

Built, the client half (train-41, fork m3-train-41 035fc671, 2026-10-23 15:23 PDT),
behind the npcFate switch, off by default: Skyrim Platform's fate table and
two Frida Gum detours (the leveled roll wrapper 14752 answering the server's
NPC_ as the one CALCED_OBJECT; since 17:24 PDT, 5351478f, the outfit-array
resolver 16155 under every inventory init, adding the server's worn list
tagged through the engine's own ExtraOutfitItem setter and entry adder and
skipping the roll, in place of InventoryChanges::InitOutfitItems 16072,
which the lab showed to be the late path alone), the exports setActorFate,
clearActorFate, setActorFateEnabled, rerollActor (the engine's re-roll 37323
on the game thread, for a leveled pick), redressActor (the outfit stripped,
the server's list added tagged, worn again, for a plain base) and
actorFateCount, every
id from re-npc-roll.md's table by `just addr`, every structure offset a
CommonLibSSE-NG header line; ActorFateService keeps every fate and re-rolls
a reference the engine already holds when its fate is new (a login's
neighbours, a cell attached ahead, a respawn): one pop, its engine lookups
inside the update tick (3d224c08, 20:18 PDT: the handler itself writes only
the table, which has to hold the fate before a loading screen's attach, and
a Papyrus native in a message handler is the fault that broke every teleport
on train-40; the two exports queue game-thread tasks of their own); formView skips the
equipment apply for engine references under the switch (the engine dresses
them; figures and 0xff copies keep the apply). The detours and the re-roll
CONFIRMED by x-npc-fate-roll's five observations: 1 and 2 held three times
(232048, 234133, 235610), 4 for the site (x-npc-fate-outfit v2 002544), 3
read as the attach re-roll 37323 (000244), 5 NOT HELD (every load re-rolls,
so the pin applies at every load); the switch on by default since cc21ae6f,
and the parity read (both seats' species and worn items equal to the
server's record) ticked ADR-046 decision 1 at T3 (x-npc-fate-pin v3 053914,
060646, 072444; x-npc-fate-outfit v3 072041). Known cost of the first slice:
at a login every fated neighbour the engine already rolled is re-rolled once
(no base compare through the clone's template yet).


- SP binding: Impose A's pin, a native table `setActorFate(refrId, baseId)`
  and `clearActorFate(refrId)` consulted by the roll-site hook (RE-1); Impose
  B's `setBaseObject(refr, base)` on the CommonLib virtual (TESObjectREFR.h:
  332) with the ExtraLeveledCreature rewrite; a read `getLeveledBaseOf(refr)`
  for the roster (ExtraLeveledCreature.templateBase, else the base). The
  puppet detours' export shape (FridaHooks.cpp:1097; skyrimPlatform.ts and
  Definitions.txt together, the Formatting check's lesson, reviewer item 11).
- TS handler: FateService (new, ClientListener): holds the fate table from
  ActorFate; FormView consults it at the engine bind (formView.ts:132-137)
  and pins or swaps when the engine's base differs (the respawnRequired
  shape at :177-185, today the copies'); the view binds a dead engine
  reference and emits applyDeathStateEvent (formView.ts:75-79 changed);
  deathService.resurrectActor for a non-player no longer throws
  RespawnNeededError (:155-166): the respawn is disable, base, enable on the
  reference; onOpenContainerMessage applies the body's inventory before the
  activation (remoteServer.ts:172-185; formView.ts:472-481's actor exclusion
  lifted for a dead reference); HostService.reportSightings adds the base;
  cellAttach re-applies the table (the fallback suppression). The GMST and
  kNeverResets switches at login (SpApi, once).
- Kill switch config key: the server's `npcFate`; the client follows the
  server (no fate arrives, nothing pins, the view behaves as on a76125cb).

Built, the death report's sender (train-44 faeb232a, 16:18 PDT):
DeathReportService sends ActorDeath at deathStart (the kill itself; deathEnd
waits for the ragdoll to settle and the server's windows run from the kill)
for a game-file actor this game simulates (HostService.isMineLocal) whose
death is not the server's own word (DeathService.takeServerKill marks the
kills it plays, consumed by the report that asks): cause 4 with the killer's
remote id when the engine names an actor, else 0 (the server picks any
evidence it has); the body's position; one logLab line per report. Not
reported: the player's own death, a figure's or a copy's (0xff ids), a
puppet's (another game simulates it). The floor (17:51 PDT, fork
m3-train-44 8efabb10, after x-npc-fall-report 20261025-004503 fell 4000
units and fired nothing): every viewed actor carries the engine's deferred
kill (formView startDeferredKill, "the server's death is the only death"),
so the deaths B exists for, a fall, a trap, a blow whose engine damage
outran the server's, leave the actor at or under zero health and alive,
with no death event at all; deathStart was the wrong ear. The service now
polls every hosted game-file actor's health twice a second
(HostService.hostedActorRemoteIds, getActorValuePercentage) and reports the
first time it reaches the floor, once per visit there, cause 0; the
server's acceptance kills the record, its isDead comes back, killActor
ends the deferred kill and plays the death, and the deathStart that follows
is the server's own word (takeServerKill). deathStart stays for an actor
the deferred kill did not hold.

## Tests

- T0 (skymp5-server unit, the esm-backed shape CellHostTest and NpcExists
  use), NpcFateTest:
  1. LoaderAdmitsLeveledPlacement: a world over the master loads a placement
     whose base is a LVLN (a Bleak Falls Barrow id read with lab/esm.py; the
     wolves' 0x85547 for the template case): a record exists, its base is one
     of the list's entries (libespm LeveledListBase.h:22-39), its fate holds
     the placement's base; a second LoadForm with the saved change form keeps
     the base (no re-roll), and GetChangeForm round-trips through JSON.
  2. RespawnAtPlacementAfterReset: kill a fated actor at daysPassed D (the
     clock set through the time settings; read the clock before the arming
     call, tick half inside and seconds past: the margins lesson of
     CellHostTest); before D plus the GMST's hours over 24: isDead true, the
     position the body's, no "respawn after" log; after: isDead false,
     position equal to GetEditorLocationalData's, never ChangeForm().
     spawnPoint's, attributes full, the base inventory present, the pick
     re-rolled or kept per Eli's choice.
  3. DeathPersistsAcrossLoad: kill, save the change form, load it into a new
     WorldState: isDead true, the point kept, the deadline kept, no respawn
     at load (the game-file branch of MpActor.cpp:820-824).
  4. CorpseIsAContainer: a dead fated actor activated by a player within
     reach sets the occupant and sends "inventory" and OpenContainer;
     TakeItem moves an item to the player's inventory; PutItem back; a live
     actor's activation sets no occupant.
  5. GmstsReadFromMaster: the two hours come from the loaded GMSTs, not
     constants (a world without them refuses to schedule and logs).
  6. ChanceNoneGlobal (H12): a list with a LVLG rolls by the global's value.
  7. FateMessageShapes: the C++ ActorFateMessage serializes to the two
     fixtures; validate_server accepts them and refuses refr_id 0,
     0xff000000, base 0 and a negative deadline (Rust, wire-validate's
     tests).
  8. ActorDeathTest (train-44, the death report): the fall by the host's
     samples, a report from a game that does not simulate the actor refused,
     the killer's hit checked against the hits the server numbered, the
     hazard's activation, the refusals (a script, an unnamed cause, a body
     far from the record, the setting off) and a dead actor's report as
     nothing.
  9. NpcRollLevelTest (train-44, the memo's D2): the four npcRollLevel rules
     on three players, a lone loader, a loader without a record.
- T1: the natives resolve on the seat (`just addr` for RE-1's id once named;
  the virtuals through RTTI, no literal) and the pin or swap logs its line
  per fated reference; no host-less T1 exists in the fork, so the proof is
  the seat's, as npc-puppet's was.
- T2: `just test-proto`'s 33 difftest sessions stay identical between the
  legacy and the wire stacks; none holds a leveled actor or an NPC death by
  design (the fakeclient never kills), so the fate's bytes are proved by the
  fixtures and a new session npc-fate.yaml later (a fated placement's
  CreateActor then ActorFate, both stacks byte-equal). The legacy server
  without npcFate must produce today's output for every existing session.
- T3 scenario ids, committed (01:16 PDT, main ed9a9d7a, one commit each,
  rule 13): lab/scenarios/b-npc-death.yaml (the death's travel on both
  seats through the viewer's return, the restart and the host's relaunch:
  x-npc-death v3 GREEN 080218) and lab/scenarios/b-npc-loot.yaml (the corpse
  as the server's container: x-npc-loot GREEN 064648); lab/scenarios/b-npc-respawn.yaml (the body
  standing again at its placement after the reset hours across a restart,
  rolled anew, on both seats: x-npc-respawn v3 GREEN 081548; main 40faee46,
  01:21 PDT). The sketch below (b-npc-fate.yaml,
  the Barrow's bandits with a bow and the restart) stays the fuller scenario
  for the verb's close.
  lab/scenarios/b-npc-death-report.yaml (main 3c6c54e, 2026-10-24 18:28 PDT,
  its own commit): the host's floor report of a fall taken by the server's
  own samples' drop and the death on both seats, from x-npc-fall-report v3
  GREEN 20261025-012351 on 44 8efabb10 (the host's engine drops a hosted
  predator 4000 units through its console; "a drop of 3813 units in the
  host's samples; the server records the death"). The NPC fight's reports
  read inside b-npc-death's and b-cell-host's runs (the log's "accepted" or
  "already dead" lines); a trap's death is the Server section's open trap
  read (x-npc-trap-report) and no claim.
  The trap read's probe, by path for the stage after playtest 34 (22:51
  PDT, a research agent's draft): lab/.cache/probes/x-npc-trap-report.yaml,
  Arvel the Swift's pressure plate and swinging spike wall in Bleak Falls
  Temple (0x371de; UESP's walkthrough lists no other plate in the zone; the
  lever puzzle's darts are a lever puller's activation, the blades and the
  oil fire with no activation at all), a hosted entrance bandit walked onto
  the plate first (prid, moveto to c1 standing 150 units before it, c1
  teleporting past the gate's sweep so the hostile bandit crosses it) and
  set onto the plate's centre as the fallback, the catacomb draugr culled
  first; the reads: c1's "Sent a trigger's own activation", the server's
  "trigger X fired itself in cell Y" and "an activation beside the body",
  the record dead on both seats. Placeholders for every ref id and point
  (UESP publishes Arvel's base 00039646 and ref 00039655 and nothing else):
  numidium's esm.py fills them from the interior's cell-children group.
  Risks named: TrapTriggerBase's acceptableTrigger never fires for an actor
  of the plate's owning faction (read the plate REFR's XOWN first; a skeever
  or a draugr victim if it names the bandits); whether a MoveTo into a
  loaded trigger raises OnTriggerEnter is undocumented (hence the walk
  first); the spike wall's leveled 75 damage against a level-1 bandit's 35
  health is a HYPOTHESIS on the roll, the probe's premise, read by its first
  run (x-npc-trap-report has never run, its placeholders unfilled); a body
  flung past 512 units reads E_DEATH_UNCHECKED.
- T3 scenario id, the sketch: lab/scenarios/b-npc-fate.yaml (written by hand after the
  grammar lands, rule 13; the sketch): two seats under npcEnabled and
  npcFate, the clock at 7.9; c1 connects and teleports to Bleak Falls
  Barrow's first chamber (an interior; the landing read by x-npc-fate-roll),
  c2 follows beside it; wait for the attach; both seats refs-near with the
  base per reference (grammar: refs-near gains each reference's base and
  dead flag; server.ref gains base, isDead it has) and the assertion that
  every fated id's base is equal on c1, c2 and server.ref; c1 is given the
  bow and arrows (b-headshot's steps, papyrus-av Marksman 60, the perk),
  draws, looks at the nearest fated actor and holds the attack key until
  server.ref(id).isDead is true (a repeat step with the assertion as its
  exit, or a fixed count); wait 10; both seats npc-state the id (grammar:
  npc-state gains dead) and assert dead on both, and the body within a bound
  of server.ref's point on both (the fall, H6: the bound is measured by the
  probe first, UNMEASURED until then); c1 activates the body and takes one
  item (the activate step on the id, then console player.additem is NOT
  used: the take is the menu's; the driver's close-menu after) and
  server.inventory(c1).count of that item is 1 while server.ref's inventory
  lacks it; c2 teleports two cells away and back (the body still there on
  c2); server: restart, both reconnect, wait, both npc-state: dead on both
  seats and server.ref(id).isDead true, the point within the bound; c1
  relaunch (the host leaves): c2 hosts, the body stays dead on c2; no
  respawn inside the run: the last read is isDead true; dump-state both.
  The positive respawn is x-npc-fate-respawn: the server started with its
  time settings past the death's deadline (a world copy with the body),
  both seats enter, the actor stands at its placement alive on both and
  server.ref says so.
- Assertions that would fail if the verb silently regressed:
  `c1.refs_near().base_of(id) == c2.refs_near().base_of(id) ==
  server.ref(id).base` (the roll); `server.ref(id).isDead == true` after the
  kill, after the restart and after the host's relaunch (the death and the
  body); `c1.npc_state(id).dead == true and c2.npc_state(id).dead == true`
  (the body on both screens); `abs(server.ref(id).x - x_at_death) < bound`
  (no teleport, no spawn point); `server.inventory(c1).count(item) == 1` after
  the take (the loot's one path); no "RespawnWithDelay" line for the id in
  server.log (the timer gone for game-file actors).

## Dynamic plan (fill when any tag above is still HYPOTHESIS)

x-npc-fate-roll 20261023-232048 (16:46 PDT, numidium's agent reading both
traces of lab/frida/npc-roll.js against re-npc-roll.md section 7): observation
1 HELD (the resolver once per placement at the teleport's cell load, inside
InitItemImpl, never at the biped init 76 ms later or after); observation 2
HELD (the wrapper's out array exactly one NPC_ on all twenty logged rolls:
0x85549 rolled 0x23abe into clone 0xff000840, 0x85547 rolled 0x23ab7);
observation 3 not measurable (the engine's re-roll never ran on either; it
runs through our rerollActor, so x-npc-fate-pin with npcFate on and the
script armed measures it); observation 4 not measurable on predators (no
outfit, defaultOutfit 0); observation 5 not tested (the save restored nothing
for them: the resolver's entry read the placed base again). Corrections:
the placed NPC_ is 0x1e7a0 and its TPLT the LVLN 0x42297 (not the other way);
the wrapper path's fifth argument read 1, 2 or minus one, never the 0 the
read predicted; InitOutfitItems (16072) and AddWornOutfit (19692) were never
entered across 65 outfit-equipper calls while outfit-shaped leveled-item
rolls returned into 16155's item loop, and each fresh clone got
RemoveOutfitItems(none) from InitInventoryIfRequired, which the read said
touches no outfit: the outfit detour's site is in doubt (the doubt raised:
16155 may be reached from a caller other than 16072, or 16072's entries were
hidden by the refs filter; the hook counts decide; FALSIFIED by the counts,
x-npc-fate-roll 232048: 16072 and 19692 n 0 while the outfit rolls returned
into 16155's loop; the load-time site is InitLeveledItems 16129 to 16155,
section 8, REA 17:09 PDT, held step by step on x-npc-fate-outfit v2 002544).
The counts (16:49 PDT): initOutfitItems and addWornOutfit n 0 in both legs,
their hooks attached, while outfitEquip ran 65 times (47 on other actors)
and the outfit-shaped rolls returned to SkyrimSE.exe+0x236d7c and +0x23a37a;
so the outfit detour's site (16072) is FALSIFIED for 1.6.1170 and the real
site is an RE read (re-npc-roll.md section 8, commissioned). The species
half of the pin stands on observations 1 and 2; the worn asserts of
x-npc-fate-pin stay red until the outfit detour moves. The leg's frida step
returns before the hooks are live (the resolver ran 3 s before leg 1's
ready), so a trace of a cell's load needs the game armed from launch or a
15 s wait before the teleport. Also read: 0x85547 died to 0x85549 in a
predators' fight on both legs (the server's number, respawn after 25 s),
and the solo player died to them too; the probes take tgm after connect.
x-npc-fate-roll v2 20261023-234133 (16:54 PDT, numidium's read): observations
1 and 2 held again (one resolver call per placement inside InitItemImpl at
the cell's load; 52 wrapper rolls, one NPC_ each, all at level 1); the 15 s
wait lets the attached leg catch the roll. Observation 5 NOT HELD in
practice: the save carried no clone ("current 0x1e7a0" at every entry) and
the relaunch rolled 0x85547 as a different NPC_ (0x23ab7, then 0x23abe), so
every load is a fresh roll that can change the species: playtest 33's
"different bandits for each", traced in the engine. The pin therefore
applies at every load, and a login's neighbours (loaded by the save before
the connect: PreLoadGame and the roll 0.19 s later, both before the server
saw the connection) take the late path, one re-roll each. Observations 3
and 4 still unmeasurable on predators (no re-roll ran; defaultOutfit 0).
The outfit hooks, narrowed: InitOutfitItems fired twice later on other
actors (the hook works, 16072 is reachable), but the load-time outfit-shaped
rolls bypass it (into +0x23a37a) and AddWornOutfit never fired; the
re-analyst's section 8 reads the load-time path. Section 8 (17:09 PDT,
REA on sky-re): the load-time outfit roll is InventoryChanges::InitLeveledItems
(16129) calling the outfit-array resolver 16155 for defaultOutfit and
sleepOutfit straight out of InitInventoryIfRequired, at the same InitItemImpl
moment as the LVLN roll and before any 3D; 16072 is the late path (418622's,
gated by HasOutfitItems, which gates nothing at the load); 16155 has exactly
those two callers; InitInventoryIfRequired strips every outfit-tagged entry
(RemoveOutfitItems with none) before it rolls, so a pre-tagged list is
removed at the init. The outfit pin therefore moves to a detour on 16155:
for a fated owner, the server's worn list tagged through the engine's own
ExtraOutfitItem setter (11647) and entry adder (16053), returning without
rolling; every other owner falls through; one site covers the load, every
re-init and the late re-dress; a late fate on an unleveled actor goes
through a redress native (RemoveOutfitItems with the outfit, the same adds,
AddWornOutfit). The trace gains 16129, 16155, 16038 and 418622's outfit id
to confirm the chain before the detour ships. Leg 2 was void (the
relaunched game logged in inside the forest, died before its tgm, and
respawned at the spawn; the "no placed 0x85547" was the seat's respawn, not
a chance-none deletion); the rerun teleports to the spawn before the
relaunch. One more face of the split: the server read 0x85547's base health
as 12 for its own pick and 150 in the earlier run, the record following the
server's leaf while a seat showed another species.
Outfitted leveled placements for observation 4 (17:03 PDT, numidium's
agent over Skyrim.esm with lab/esm.py on sky-srv): in Embershard Mine's
interior 0xB6BE6, ACHR 0xB6FE4 (placed NPC_ 0x1AF77 LvlBanditMeleeCommonerM,
TPLT LVLN 0x1A319 whose entries are NPC_s 0x39CF6, 0x39CFF, 0x39D07 at
levels 1, 5, 9, each with DOFT 0xC0197 BanditArmorMeleeShield20Outfit, four
LVLI items; boots and cuirass always roll, gauntlets chance-none 50, the
shield 80) and ACHR 0xB6FDB (0x1B060, LVLN 0x1A323, the Redguard picks),
194 units apart, the stand point the bedroll 0xB6D55's spot (753.8, 5268.7,
8221.1); outside, ACHR 0xB6CE1 in cell 0x9791 (nested LVLN 0x39CFC, zone
0xD9545). Every bandit placement carries XLCM 0 (kEasy). 1nivWICCloaks.esp
overrides 0xC0197 in the served order (a helmet list and a cloak list), so
the server's worn roll must read the override; the DOFT following the
inventory template bit CONFIRMED by the worn equality: the server's list
carried the WIC override's cloak and the engine's matched it
(x-npc-fate-outfit v3 072041: 0xE00DB79 on 0xB6FE4; 062856: 0xE00233D on
0xB6FDB), so the roll reads the override and the DOFT through the chain. The
probe x-npc-fate-outfit (lone seat, tgm, the trace live 15 s before the
load) runs on them; esm.py wants an achrs-in
command (its near lists REFRs alone).
x-npc-fate-roll v3 20261023-235610 (17:04 PDT, numidium's read): clean,
observations 1 and 2 held a third time (one resolver per placement at the
load, skipInit 1, inside InitItemImpl; 47 wrapper rolls, one NPC_ each);
every roll entered fresh ("current 0x1e7a0", level 1), so a matching species
across the two legs was chance, not persistence (over three runs 0x85549
picked 0x23abe five of five, 0x85547 0x23ab7 twice and 0x23abe three times):
the engine rolls at every load, MEASURED. The resolver leads the server's
hosting line by about 4.3 s on both legs (the fate must be on the client
before the attach; the fate pass runs at the square change, ahead). 16072
and 19692 n 0 again; the engine's re-roll ran only on other actors. A lab
fault of numidium's to chase: a trace armed by relaunch {frida} loses its
tail at about 30 s after its load (read such traces to there).
x-npc-fate-outfit 20261024-000244 (17:18 PDT, numidium's read of Embershard
Mine's two bandits on the old hooks): they were not first-rolled at the mine's
load; the engine RE-ROLLED them at the attach through its re-roll 37323 (arg
minus one, from a caller at SkyrimSE.exe+0x2c9ac2 the script did not name),
each from a runtime base it already held (a persistent reference loads with
the game, before the connection), the resolver then picking anew (skipInit 0)
and ResetInventory (37322) following; so each outfit rolled TWICE per bandit
(the resolver's inventory init and ResetInventory's), with different picks,
all through 16155's path (24 rolls returning to its item loop, six lists each,
the WIC cloak list among them), InitOutfitItems and AddWornOutfit never
entered; GetCalcLevel read 6 while the wrapper rolled at 1 (the easy
modifier scales it). Consequences for the pin: a persistent leveled actor's
first roll precedes any fate table, and what the player sees is the
attach-time re-roll, which passes through the leveled wrapper (the 14752
detour answers it) as long as the fate is on the client before the ATTACH,
not the game's load; the outfit answer must hold through ResetInventory's
second roll, which the 16155 detour covers since it sits under every
inventory init; an interior's actors take the late path (the door loads the
cell before the fate arrives). The trace gains the re-roll caller's label
and ResetInventory's returns.
x-npc-fate-outfit v2 20261024-002544 (17:34 PDT, numidium's read with
npc-roll.js v2): section 8's chain HELD step by step for both bandits: the
attach re-roll 37323 from 19231 (arg minus one), the resolver with skipInit
0 and one pick through the wrapper, InitInventoryIfRequired from the
resolver (RemoveOutfitItems with none, fromInit), InitLeveledItems, the
outfit resolver 16155 for 0xC0197 at level 1 returning into InitLeveledItems'
default slot with its six rolls all at the outfit site, then ResetInventory
from 19231 with a second init and a second outfit roll, then the equipper
with the outfit and no InitOutfitItems; both sleep outfits 0, one 16155 per
init; the equipped set is exactly the second roll (the first stripped, as
8.3 predicts). Observation 4 therefore HELD for the site: the 16155 detour
answers inside every init. The one difference from the read: HasOutfitItems
is called from po3_SpellPerkItemDistributor.dll inside the equipper's frame
and SPID issues the armor EquipObject calls (the weapon's is the equipper's
own), so AddWornOutfit counts zero on this load order: SPID dresses the
actor from the inventory the init built.
Consequence: the pin decides what SPID equips as long as SPID dresses from
the inventory; whether SPID's own item distribution adds items on top, and
whether its chance rules differ per game (another split the layer's INIs
would own), is the open row for the parity read. Read (17:44 PDT, numidium
over the seats' five _DISTR.ini files and 1115 SPID logs): no Item, Outfit,
SleepOutfit, Skin or DeathItem line anywhere, every line a Spell or a Perk
at chance 100 (Stealth Detection Fixes' three, Sun Affects' one,
Thaumaturgy's three perks), so SPID's configs cannot dress a bandit
differently on two engines and the pin's worn list is the whole picture as
far as SPID goes; the DLL in the equipper's frame is SPID 7.3.0's Outfit
Manager, installed at startup even with no Outfit lines (hooks on
InitItemImpl, Load3D, ResetInventory, SetOutfit, the inventory filters and
AddWornOutfit, a HasOutfitItems stub), dressing from the inventory the init
built. SPID 7.3.0's Outfit Manager sits in the equipper's frame on every
seat; with no Outfit or Item line in the layer it dresses from the pin's
inventory, and a layer adding such lines reopens the read (layer-stage's
check; the source is powerof3's Spell-Perk-Item-Distributor if the
re-analyst needs the sites).

- The death's Havok handoff, static (23:19 PST 2026-11-01; the re-analyst on sky-re, Ghidra 1.6.1170, for memo D78 "where a body lies on
  every screen"; every id by `just addr`, HYPOTHESIS until the trace): Actor::KillImpl (37896, slot 0x10E) hands every ragdoll-bearing
  actor to Havok synchronously at the kill (AddRagdollToWorld, SetMotionType kDynamic and ToggleConstraints(false) per graph,
  ActionDeathWait performed, collision layer kDeadBip, the death force or the heading times fDeathForceForceMin 35); a_ragdollInstant
  only trades DeathWait plus the 2 s fDyingTimer for ActionRagdollInstant plus no timer. The graph's DeathStop tag calls Actor::KillDying
  (37317, slot 0xAA), which makes the body dynamic again; the dying state ends on the timer through KillImmediate (37735). Every kill
  route reaches slot 0x10E (engine damage, a kill move's KillActorHandler 42838 through Actor::Kill 37316's task 0xA, Papyrus Kill, our
  deathService kill). The only data gate is TESRace::Flag::kImmobile (bit 9 of TESRace+0x108) on the actor's race, read in both
  KillImpl and KillDying: set, no ragdoll and no DeathWait perform, kDead after the timer with Havok untouched. SetLifeState(kDead) and
  KillImmediate reach kDead with Havok untouched and play nothing. The trace to confirm: 37896, 38084, 38089, 77866, 77998, 39419, 37735,
  37612, 42865, 37317 and 38447 through x-npc-death-host v5's sword kill, then once more with bit 9 written into the target's race.
  Consequence for the verb: "bodies lie within a stride" is the engine's own limit (R2 fall per game); same-spot bodies are M4's pose
  replication (D78), not a death-animation switch.

- RE tasks for the re-analyst (REA on sky-re; CommonLib's names as seeds):
  - RE-1, the roll site: where a TESObjectREFR whose base is a TESLevCharacter
    resolves to a TESNPC, writes ExtraLeveledCreature (originalBase,
    templateBase) and sets Actor's kLeveledActor; its inputs (the level it
    uses, the zone's bounds and zoneLevel, iLevCharLevelDifferenceMax;
    TESLeveledList::CalculateCurrentFormList's callers are the seed); whether
    it runs once per placement and persists or at every load; a hookable
    prototype (H1, H3).
  - RE-2, TESObjectREFR::SetObjectReference (vfunc 84): what it touches
    beyond the base and flag 24 (3D, inventory, an actor's base-derived
    caches: race, skin, voice), whether a live actor's swap needs Resurrect or
    a 3D reload, and whether the leveled resolution itself calls it (H2).
  - RE-3, the cell reset: the function that decides a reset at attach from
    the detach time (ExtraDetachTime, TESObjectCELL kDetachTime,
    BGSEncounterZone gameData) and the two GMSTs; kNeverResets' read; the path
    for a cell without a zone; what the reset does to a dead leveled actor
    (the body, the re-roll, ResetInventory(a_leveledOnly)); a suppression
    point if the switches fail (H8, H9a).
  - RE-4, the dead-at-load shape: how a saved-dead actor is placed at load
    without a ragdoll (SetLifeState(kDead), KillImpl's a_ragdollInstant,
    kStartsDead's load path) for the body's reload (H6).
  - RE-5, the corpse menu: the dead-actor branch of a reference's activation
    (ActivateRef, self-cast.md's note) and whether an inventory applied
    before the activation is what the ContainerMenu lists (H4, H7).
  - RE-6, the zone level's lock (ENCOUNTER_ZONE_GAME_DATA zoneLevel at the
    first attach) so the server's level rule can match the engine's (H3).
- Frida script: lab/frida/npc-fate.js (functions by Address Library ID once
  RE-1 and RE-3 name them; the virtuals resolved through the vtable at run
  time): log at the roll site the refr id, the list's id and the pick; at
  SetObjectReference the caller and both bases; at KillImpl the four
  arguments for a server-imposed kill against an engine kill; at the reset
  function the cell and the detach age. Scenario steps that trigger them:
  x-npc-fate-roll (solo: teleport into Bleak Falls Barrow's first chamber,
  refs-near with bases, save, out, `global` GameDaysPassed advanced by the
  GMST's hours over 24 locally, back in: the engine's own reset as the
  baseline, the reference r-cell-reset), x-npc-fate-kill (the bow on a fated
  actor, the body's point on both seats, the take and server.log's take
  lines: H7's read), x-npc-fate-respawn (above).
- Breakpoint plan for a human session (x64dbg): TESLeveledList::
  CalculateCurrentFormList with this the LVLN's form (0x42297, the template of the placed NPC_ 0x1e7a0, for the
  forest), condition: once per attach; watch a_level and a_usePlayerLevel
  and the out array; expected if H1 holds: one call per placement at the
  cell's attach with the player's level, none at a later 3D load; falsified
  by a call at every load (then the pin must answer at every load and A's
  table is consulted each time, which still holds, but the save's
  persistence of the roll is not what keeps it).
- Owner: agent (Frida) for the roll, the kill and the take; Eli (x64dbg) for
  the reset if RE-3 leaves it open.
- The tags, by name: H1 the pin before the roll (the site and the fate's
  arrival ahead of the attach); H2 the swap after the roll and its one pop;
  H3 the engine's roll inputs and the zone level's lock; H4 the body's menu
  lists the server's inventory once applied; H5 the gap of deaths the server
  has no number for, counted by the host's event; H6 the body's resting
  place differs by game within a fall, and H6b where tonight's bandit stood
  up (the placement by the code, the default spawn by the reading); H7 how
  tonight's loot reached the record (TakeItem's occupant check refuses a
  corpse by the code); H8 the reset suppressed by kNeverResets plus the two
  GMSTs; H9 the respawn as disable, base, enable re-initializes the actor,
  H9a the engine re-rolls a leveled placement at its reset; H10 a puppet
  plays its death with AI off; H11 the host's live actor takes the server's
  kill as a player takes its own; H12 the chance-none global read as 100 by
  the server where the engine reads the global.

- Added 2026-10-22 (x-npc-death 054215): which engine path kills a deferred-kill
  actor whose AI is off. On the host (AI on) a health of -128.87% left Sigrid
  standing under StartDeferredKill; her puppet (AI off, the same call made by
  the same view code at its first update) died from the same number applied by
  damageActorValue. Plan: a Frida trace on the puppet seat of Actor::KillImpl
  (the id from `just addr`, never from memory) with its return address and the
  actor's deferred-kill flag read at entry, under an npc-damage of 10000 on the
  host; expected either a KillImpl caller outside the AI pass that skips the
  deferred check, or no KillImpl at all and a graph-side death (the DeathAnim
  event taken on the puppet, as 030603's watch showed once). Until read: the
  puppet apply floors the relayed health (train-35), so the question changes
  nothing a player sees.

x-npc-fate-pin v2 (20:18 PDT, for train-41's stage on 3d224c08): two legs,
one path each. Late (c1): the teleport from the lab spawn (square 32,-15,
five squares out, beyond the fate ring of 3 and the engine's grid of 2)
straight into the forest; the engine rolls at the load and the fate arrives
after it, so the late path re-rolls the clone: "late fate for 85547: reroll
queued" counted at least once in c1's console log, the species equal to the
server's. Ahead (c2): a teleport into the air over square 31,-17 (three
squares from the forest cell: inside the ring, outside the grid; z 25000,
god mode takes the fall), ten seconds for the fates to land in the table,
then the teleport in: the detour pins at the attach's roll, "late fate for
85547" counts zero on c2 and "pinned 85547 to" at least once, the species
equal. Worn lists read, not asserted (the predators wear no outfit; the
outfit claim is x-npc-fate-outfit's). The switch flips to true on 41 when
both legs hold.

x-npc-fate-pin v2 on 41's stage (3d224c08; run 20261024-052150, 22:33 PDT):
the species pin HELD on leg 1: server.fate's raceId 78346 for both predators
(level 1, worn empty: creatures), c1's engine races 78346 for both, "pinned
85547 to" once in the plugin's log. The run went red on its own premise:
no late line, because the fate reached c1's table AHEAD of the attach even
on a five-square teleport (the position report leaves before the engine
finishes loading, and the handler's table write, kept out of the update
tick for this reason, lands during the loading screen), so the run stopped
before leg 2. v3 claims the pin line and reads the late count; rerun
pending. The late path showed at the spawn instead, on the login's
neighbours: "redressed d1faa from the server's roll: 5 of 5 tagged for
outfit 1e608", d1fa9 (4 of 4, outfit c0197), d1f56 (5 of 5, c0197), and
"the base has no default outfit, nothing to redress" for 107d05, 85540 and
107d06: the outfit imposition's late path works on bases with a default
outfit. x-npc-fate-outfit green on the same stage (052632, npcFate off, the
detours inert; its trace on the results site). Then v3 GREEN (22:46 PDT, run 20261024-053914, 10 of 10): leg 1 as before (three runs now); leg 2, c2 parked over square 31,-17 at z 25000 landed in one attempt and stood at about 12,946 absolute after the wait (above the forest's 10,700: no fall-through), no late line while parked or after stepping in, both species 78346 on c2's engine, "pinned 85547 to" once. The species half of ADR-046 decision 1 holds at T3 on both seats and both paths; npcFate flipped on by default (cc21ae6f); the worn half is x-npc-fate-outfit v3's read on the Embershard bandits. A finding outside the fate:
c2's console logged 108 "settle 86111" lines over 19 s with the puppet
2,077 units from its record and the gap never closing. Read (22:50 PDT, an
agent over the run's logs): 86111 died at 05:24:42 UTC to another NPC's hit
under c1's hosting (the server's number), respawned 25 s later on 41's code
(the old wall timer; 42's clock was not on that stage) with the record set
to its placement 2,077 units away; the respawn's container with the
teleport went to the host alone (MpActor::SendAndSetDeathState), and c2, a
viewer that had joined with the record dead and killed its copy in place,
got only RespawnEvent's isDead=false property, which 41's client ignores
for an engine actor. So c2's copy stayed a corpse, movementApply's
`!actor.isDead()` guard skipped every apply (the snap over 1,024 units
included) while the settle print fired on each of c1's samples, until the
cell grant to c2 promoted the corpse live without placing it. The cause is
the deaths' respawn travel, not npc-puppet's settle. 42's client half
applies the property (the seam, 7b311df0; Resurrect on an engine
reference, 3cb843a8), and 5ffd078a adds the mirror of the dead bind: a
dead engine reference whose record the server explicitly says is alive is
resurrected on the two-second read (a seat that reconnects after the
sweep binds a corpse), the server saying a game-file actor's life
explicitly in CreateActor (props.isDead false, within the contract); a
record never dead says nothing, so ADR-038's predicted deaths stand. The
confirming read is x-npc-respawn's (both seats alive after the restart).

41's restage on cc21ae6f, npcFate on by default (23:17 PDT): x-npc-fate-pin v3
GREEN again (060646). x-npc-fate-outfit v3 (061219): the race held for both
Embershard bandits (0xB6FE4 79684, 0xB6FDB 79688, the engine equal to the
fate) and the armor matched the server's roll exactly (0xB6FE4: hide boots
0x13910, studded cuirass 0x1B3A2, 0x6F39E; 0xB6FDB: the four hide pieces
0x13910 to 0x13913), both the ahead path ("pinned b6fe4 to 39cf6", "dressed
b6fe4 from the server's roll inside the outfit roll: 4 of 4 tagged, the
engine's outfit roll skipped") and the late path ("redressed", "late fate
for b6fe4: redress queued"). The one red was the grammar's: the server's
worn list carries the roll's weapon (SteelMace 0x13988, SteelSword 0x13989)
and the driver's worn read the 32 biped slots alone, so the engine's list
lacked the weapon. Decision: npc-state's worn adds the hands' objects
(getEquippedObject 0 and 1, deduplicated against the shield's slot), the
stronger claim; rerun before 42's stage. The outfit half of ADR-046
decision 1 stands on the armor already; the weapon's equality is the rerun's.

x-npc-fate-outfit v3 with the hands in the engine's worn read (41 restaged
with lab driver 4e5d273a; run 20261024-062856, 23:34 PDT): the ARMOR is
pinned on both bandits, exactly, and the race with it; 0xB6FDB matched the
server whole (SteelSword 0x13989, ArmorBanditCuirass2 0x10594D, the WIC
cloak 0xE00233D); 0xB6FE4's armor matched (hide shield 0x13914, studded
cuirass 0x1B3A2, bandit boots 0x6F398 and gauntlets 0x6F39B) while its
weapon did not: the server's IronMace 0x13982 against the engine's
SteelSword 0x13989, and in 061219 the server's SteelMace against the same
engine sword. The weapon is not the outfit's: the NPC_ base 0x39CF6 carries
three CNTO entries (leveled item lists) beside its DOFT, the engine rolls
them at the inventory init through the per-entry LVLI roll (the trace's
14751, "container"), which the 16155 outfit detour never sees, and the
engine equips its own pick over the server's added one (0xB6FDB matched by
chance). So the outfit half of ADR-046 decision 1 holds for what the outfit
governs, the armor and the race (the headshot claim: the helmet you see is
the server's), and the WEAPON is a declared gap of this slice: a bandit's
weapon may differ per screen, the damage the server's either way. The pin
of the inventory's leveled roll is train-43 (02c001ca, 23:56 PDT: the 16128
detour, Suppress); D17 asks Eli whether it comes before playtest 34.

42's stage on 5ffd078a (00:00 PDT): x-npc-loot GREEN (064648): kill-ref,
the corpse's three gold by the console, approach, activate (the hook
reported, the engine's menu blocked), the ContainerMenu on the server's
list, Take All, close: server.inventory(c1) rose by the gold and the body
stayed dead; H4 held (the menu lists the server's items and the take is
the server's). x-npc-respawn (064950): the kill dead on the record and
both seats; the restart at 14.0 with npcRespawnHours 1; both seats alive
again at the placement, hp 1, race 78346 equal to the fate: the respawn
travel held on both seats (the sweep, RespawnFated, Resurrect on the
engine references, the species pinned; H9 held in its shape); red on one
premise alone, the late line, which a re-roll picking the same base never
writes (the fate's key is base and worn) and a changed one may beat the
attach: v2 reads it. x-npc-death (064426) red on its premise: 0x85549
killed 0x85547 within seconds of the cell loading (the server's number
through the host's reports), before any kill-ref; v2 parks c1 three
squares out first, where the fate pass has already loaded the records,
and culls 0x85548 and 0x85549 by kill-ref before the landing (the same
prelude in the respawn's v2); rerun asked. b-host-kill GREEN on this stage
too (cell-host.md).

x-npc-respawn v2 (070508, 42's stage) and its read (00:28 PDT, an agent over
both runs' logs): the sweep respawned the record before anyone had
reconnected, so both seats learned the respawn only from their reconnect's
CreateActor (props.isDead false). c2 won the host grant by 15 ms and
promoted its actor (AI on) 40 ms before its Papyrus Resurrect: alive. c1,
the host at the death (an AI-on death), reconnected as a viewer: its view
demoted the corpse (AI off, activation blocked) and the two-second read's
Resurrect ran on that corpse and did not stand it up; in 064950 c1 won the
grant and both seats came back alive. No message was missed and no error
logged. Fix (m3-train-42 62a4ae6b, merged forward into 43 47637942):
resurrectActor, a Skyrim Platform export running the engine's own Resurrect
(A/Actor.h:369) with the AI on in one game-thread task (a puppet demoted
again after it, a live actor unblocked), in place of the Papyrus call whose
order against the puppet's demote the two queues never fixed; the client's
engine branch calls it and logs "resurrect <id> (puppet <bool>) queued" to
the console tee. That Resurrect under AI off after an AI-on death is the
engine's refusal (rule 2) CONFIRMED in its outcome: resurrectActor with the
AI on stood the body on both seats (x-npc-respawn v2 075756, 'dead before
true, dead after false' on the viewer's puppet; v3 081548 GREEN), and
finding 54 read the same refusal under AI off on a reanimate; the engine's
reason is H-54f's read (Finding 54 below). x-npc-death v2 (070022) held the
death on both seats through the viewer's return and the restart (the body
bound widened to 32 units each way for the ragdoll's settle, v3).

43's stage on 02c001ca (00:31 PDT): x-npc-fate-outfit v3 GREEN (072041): the
worn equality whole, the weapons included (above, Suppress); x-npc-fate-pin
v3 GREEN (072444), both legs. ADR-046 decision 1 holds at T3 for everything
the outfit and the inventory roll govern: species, armor, cloak and weapon,
on both seats and both paths.

43's restage on 47637942 (01:15 PDT): x-npc-death v3 GREEN (080218): the
kill is the server's word on both seats, the body stays through the viewer's
leaving and return, the server's restart keeps it dead at its point (within
32 units, the ragdoll's settle) and the host's relaunch passes the cell with
the body in place; the death travel holds at T3. x-npc-fate-pin v3 GREEN
again (080801). x-npc-respawn v2 (075756): the resurrect held on both
seats, "resurrected 85547 (puppet false, dead before true, dead after
false)" on the host-grant winner and "(puppet true, ...)" on the other,
with "live 85547" after the grant: resurrectActor CONFIRMED at T3, the
hypothesis of the AI-off refusal with it (rule 2: the engine's own reason
stays unread, the outcome is the claim). The run's red was the probe's:
god mode does not survive the server restart any more than a relaunch, so
the revived predators killed c2's player, whose respawn at the spawn lost
the cell before the read; v3 re-arms tgm after the reconnects (numidium).

x-npc-respawn v3 GREEN (01:21 PDT, run 20261024-081548 on 43 47637942, god
mode re-armed after the reconnects): alive on the record and both seats
after the restart, the species equal to the fate on both, c2 running the
revived predator with c1's puppet 50 units behind. On 47637942 every fate
and death probe is green: pin v3, outfit v3 (weapons too), death v3,
respawn v3, loot, with b-host-kill and door v6 beside them.

The gate on 43 (112259, 13 of 16) and the respawn's finding (05:45 PDT):
b-npc-respawn red with the record alive and both seats alive, the fate's
new pick (raceId 78337) against both engines' old species (78346): the
re-roll was never imposed. The read (an agent over 120743): the late path
ran on both seats but took the redress branch every time, because the
client decided "a clone" by the Papyrus getBaseObject, which for a leveled
clone answers ExtraLeveledCreature's originalBase (the placed NPC_, an esm
id), never the clone (Ghidra: the native's callback reads the extra's
+0x10, else data.objectReference); the "rerolled" line had never appeared
in any run, and the two greens had re-rolled the same base. Fixed on
m3-train-41 93ca1ec1 (forward 42 b62c638a, 43 417cb746): rerollActor
decides on the game thread by the engine's own mark (ExtraDataList::HasType
kLeveledCreature): a clone takes the engine's 37323 re-roll through the
detours, any other actor the redress (the body shared on the game thread);
the client calls it for every new fate. The reread is b-npc-respawn on
43's restage: "rerolled 85547 ... toward the fate's <base>" then "pinned
85547 to <base>" on both seats, the species equal.

The deaths' reads, written by path (20:46 PDT; lab/.cache/probes/x-npc-death.yaml,
40 steps, and x-npc-loot.yaml, 22 steps, both loading through
load_scenario): x-npc-death, two seats in the forest,
kill-ref the predator, both seats' npc_state dead within 10 s and
server.ref isDead; c2 two cells off and back, the body still dead on c2;
server: restart, both reconnect, dead on both and server.ref isDead with the
point kept (rule 6); c1 relaunch, c2 hosts, the body stays. x-npc-loot: the
corpse given three gold by labCommand, c1 activates it, the ContainerMenu
opens, Take All, server.inventory(c1) holds the gold and server.ref's does
not. x-npc-respawn: npcRespawnHours 1 in the server block, the kill, restart
with gameHour two hours on, the predator alive at its placement on both
seats and server.ref alive, a new ActorFate in c1's log.

## ADR-050 decision 2, deaths by the engine: the build as mapped (2026-10-26 05:2x PDT, the train after npc-stream)

The decision (docs/DECISIONS.md ADR-050): the server keeps every number a
player deals or takes and delivers it to the simulating host as a CAUSE
through the engine's own hit path; the host's engine reacts and dies by
itself; the deferred kill stays on puppets alone; the host's death report
keeps ADR-048 B's checks and a refusal is corrected through the respawn
path; the 500 ms floor poll retires; the host's health reaches the server
through HostedActorState. A read-only code map (2026-10-26, fork
m3-npc-stream e2ea071a) found the pieces; nothing is built yet, and the
build waits for npc-stream's stage reads and Eli's word on the train.

What stands today (FACT, the map's reads):
- The deferred kill is the engine's own Papyrus native (StartDeferredKill,
  no arguments; no Skyrim Platform detour behind it) armed once per view
  for EVERY actor (formView.ts:396-403, upstream's code with thuum's
  comment; no isMine gate), undone only by DeathService.killActor's
  endDeferredKill then kill (deathService.ts:160-186), never re-armed after
  a resurrect, untouched by the promote and the demote.
- A player's hit on a hosted NPC is numbered by the server (OnWeaponHit,
  ActionListener.cpp:4178-4354: CalculateDamage, NetSetPercentages with
  the aggressor, SetLastHitTakenTime, NoteHitBy) and reaches the host as
  ChangeValues (NetSendChangeValues to GetActorToSendTo, the host), which
  the host applies as a VALUE change (sync/actorvalues.ts damageActorValue:
  no hit event, no attacker, no reaction, and under the deferred kill never
  a death); the server's own SetPercentages kills the record at 0 (MayDie)
  and the host plays that death from the DeathStateContainer. The host's
  engine also applies its own damage for the player's swing (nothing cuts a
  player's engine hit on a game-file NPC; DamageActorReplacement cuts 0xff
  victims with attackDamageMult 0 alone), held alive by the deferred kill
  until the server's number lands.
- The engine's hit path to deliver a number as a cause: Actor::DamageActor
  37335 (game/Offsets.h:41-48, AE only, `(Actor*, float damage, Actor*
  attacker, bool killMove) -> bool isDead`), already Gum-replaced with the
  original kept (FridaHooks.cpp:1108-1116, g_damageActorOriginal), not
  exposed to JS; inside it the write (38468) then HandleHealthDamage
  (vfunc 0x104, 38606), which at health 0 runs 37316: records myKiller and
  queues KillImpl (docs/research/re-37335-and-rune-landing.md:24-68). The
  hit EVENT, blood, impact and the reactions live in its callers (38586
  ProcessHitVictim, 38627), which need a HitData: unread (the RE read owed
  since ADR-031). Skyrim Together applies a remote health as a value delta
  and calls Kill at 0 (te-npcs.md:127-129): the value shape, not the cause;
  TE-MAP.md:62 names 37335 as TE's damage gate.
- The server's death handling: Kill, SendAndSetDeathState (the container
  to the host, isDead to every listener), the fated respawn; OnActorDeath's
  seven refusals and the three evidences (a hit within 3 s, a drop of 200
  units in the host's samples, an activation within 512 units in 5 s);
  a refusal only logs, nothing goes back to the host (no correction path).
- The client's life mirror (formView.ts:547-566, every 2 s, no isMine
  gate) would resurrect an engine death on the host within 2 s if the
  record lagged; the deferred kill is what hides that today.

The build (file by file, in this order; the
engine's two tags, H1 and H2, read below):
1. Skyrim Platform: an export damageActor(actorId, damage, attackerId,
   killMove) through g_damageActorOriginal (the engine's own DamageActor,
   the prototype Offsets.h already carries; no new id), filtered to the
   hosted set (rule 9); the engine writes the health, handles bleedout and
   at 0 records the killer and queues the kill (H1, the death that follows
   raises deathStart with the attacker as the killer, cause 4 with its
   killer in the host's report: REFUTED for the killer, the cause through
   damageActor kills the engine's actor with no attacker recorded and
   deathStart names one only when the engine's own kill move kills (rest3
   161323; 174006), the credit from the server's own number the fix (H-52b,
   x-npc-death-blow v2 181507); the death itself by the cause CONFIRMED
   (x-npc-death-host v5 095847)). DamageActorReplacement extended to cut the
   host's OWN engine damage to a hosted victim when the attacker is a player
   (the value-change chokepoint, ADR-031 point 3: the number is the
   server's; the engine's event, blood and reactions stay).
2. The server: OnWeaponHit and OnSpellHit deliver the number to
   HostOf(target) as a snippet or a message with the attacker (the host's
   id for a player's hit, the aggressor's otherwise) instead of the
   absolute ChangeValues to the host; the record's health still moves by
   the server's number (the floor under the hold rule, hosted_state.rs,
   loses its "until"); SetPercentages' Kill at 0 for a hosted actor defers
   to the host's report (the server stops killing a record whose engine is
   about to) with a timeout that kills it anyway when no report comes
   (H2 on the window, the report's round trip plus the ragdoll, ADR-048's
   3 s hit evidence as the first number: held, the host's report answers the
   pending line within 100 ms under play (playtest 36: b6ce1 17:56:49Z,
   9b0dc 18:13:27Z, b6fdb and b6fe4 18:17Z) and by either order in the lab
   (095847), the server's word firing only where the cause never reached the
   engine (playtest 35's quarter-bar arrows before train 56)); the effects
   path, ClaimScriptedKill and ClaimHeadshot follow the same rule;
   OnActorDeath's refusal is corrected through the respawn path (the host
   told to stand the actor up: resurrectActor's
   message, the one the life mirror sends).
3. The client: the deferred kill armed in ensurePuppet and ended in
   ensureLive (puppetService.ts), never on a hosted live actor; re-armed
   after a resurrect; the life mirror gated to actors this game does not
   host (the host's own engine is still corrected after a REFUSED report:
   x-reanimate-host 125920, a Papyrus kill refused E_DEATH_UNCHECKED, the
   record's alive state stood the body up 1.3 s later through deathService's
   resurrect, as the refused-report correction intends; the mirror's gate and
   the correction are two paths); the floor poll (deathReportService.onUpdate) retired, deathStart
   the one ear; killActor's end-then-kill the puppet's path alone;
   onChangeValuesMessage's health write kept for puppets and figures.
4. Tests: ActorDeathTest and CellHostTest cases for a player's hit reaching
   the host as a cause (the snippet or message with the number and the
   attacker), the record's Kill deferred then taken from the report, a
   refusal corrected by the respawn, no floor poll; NpcFateTest's isDead
   case stands. Lab: x-npc-death v5 (the host's bandit killed by the
   player's hits: one death, the killer named, no floor line, the body on
   both seats), b-npc-fate's claims re-read.
5. Docs: this doc's rows 112 and 121 and the death-report section,
   npc-stream.md's floor sentence, WIRE.md's HostedActorState paragraph,
   research/m3/death-path.md.

The RE read owed before step 1 can be skipped: 37335 is enough for the
number and the engine's death; 38586 (the event and the reactions for a
remote cause) is the richer path and stays a later read, since the host's
engine already plays blood and reactions for the swing it saw.

## ADR-050 decision 3, one NPC path: train 51 as built (13:49 PDT, fork m3-npc-path f552ccc3)

Server (634c2874): MpActor::RollFateIfUnrolled refuses only a player's base
(baseId <= 0x7), so a server-made NPC rolls as a game-file actor does;
PapyrusObjectReference::PlaceAtMe rolls the placed actor before its create
word, at the level WorldState::fateRollLevelAt gives (PartOne::FateRollLevel
with the placer as the loader, else the first player online, else 1), and
logs "PlaceAtMe - <id> (base <base>) fated at level <n>"; PartOne::onSubscribe
sends a fated 0xff NPC's ActorFate to the listener just ahead of its
CreateActor (a game-file actor's rides the ring pass); wire-validate's
check_fates admits a 0xff placement (WIRE.md's ActorFate line). The NPC rules
keyed once on IsCreatedAsPlayer: the death word (isDead true, and the explicit
false at the subscribe) reaches a server-made NPC's copies; a dead NPC's late
swing or cast schedules no player respawn (the fate's clock stands). T0:
NpcFateTest "A server-made NPC is fated at its placement, its fate goes ahead
of its create word, and its death is the server's word to every listener".

Client and Skyrim Platform (f552ccc3): PuppetService is the reconciler, one
function reconcile(localId, mine?, last?) computing the state from (the
server's word, loaded here, dead, kind) and applying it idempotently: live
(the word names this game: markHosted true, the promote once with the
record's last point), puppet (not the word's, with a 3D: the demote once),
released (not loaded here, by the attach set or the 3D, for two polls:
releasePuppet, ADR-051), a figure never. Called from the view's update (the
word as the view read it), the cell attach and detach, a lost form, a
resurrect (the deferred kill re-armed), the combat sink (the demote again
for a drafted puppet) and the two-second poll over the high-process list and
every actor touched; the native flag (Puppets::Is) is the one truth, so a
detach no longer desynchronizes the TS set. The deferred kill is armed here
for every NPC (figures keep the view's), ready for train 52's keying. A
server-made NPC's copy rolls the server's roll inside its placement:
actorFateService keeps a 0xff fate by its remote id, the view arms it by base
right before placeAtMe (the new export armActorFate), and Fates::BindArmed in
the three detours binds it to the copy's own id at the first roll site it
meets ("copy <remote> of <base>: fate armed true", then the outfit detour's
"dressed <id> from the server's roll"). The death word reaches NPC copies
(remoteServer's isDead branch for an NPC copy, movementApply's emit kept).
Activation rung declared: a puppet's own activation of a door or furniture is
R2 (the host's engine uses it; a puppet never reports one, train-47's
survivor); an activation that moves shared state (a container, a door's open
state) is R0 through the existing activate path.

Read by x-npc-copy-fate (38 steps): H-51a CONFIRMED (041406), H-51b
CONFIRMED whole (v2 051619, promoted b-npc-copy-fate 916af5a), H-51c and
H-51d at the gate (20261027-054632 plus 074932, the regression set green;
parity a8d10c99). The four: H-51a the armed fate binds inside placeAtMe on
both seats (the outfit detour meets the new copy before the engine's own
outfit roll); H-51b the host's worn report then matches the record (no
E_EQUIP_REFUSED naming a 0xff actor) and the bandit's swings land
(OnWeaponHit on ff000000, no E_HIT_WEAPON); H-51c the reconciler's regression
set (b-npc-puppet, b-cell-host, b-npc-handoff-door, -cross, -night, -restart)
stays green; H-51d the release grace of 4 s leaves no live window on a
non-host after the late fate's 3D drop (b-npc-handoff-night's claims).

Lab read (2026-10-26 night, 51's stage at numidium's): the first run,
x-npc-copy-fate 20261027-041406 on m3-npc-path 75794bd1, read H-51a
CONFIRMED (both seats "copy ... of 1bcd8: fate armed true", three dress lines
each "from the server's roll inside the outfit roll: 6 of 6 tagged for outfit
c0197", the PlaceAtMe fated line on the server) and H-51b FALSE for a reason
older than the train: the host's faithful hands report was refused,
"inventory does not contain item 13913" (ArmorHideHelmet), because
EnsureBaseContainerAdded rolled each leveled outfit entry TWICE, once into
the worn set (the fate's worn list the clients dress from) and once into
the inventory, so a leveled helmet could be worn by the record and absent
from its inventory. Every leveled outfit could do it: P6 v2's placed-bandit
refusal (npc-stream.md) reads as this, not D19. Fixed on m3-npc-path
a8d10c99 (one roll, its picks added to the inventory; NpcFateTest's placed
case asserts every worn entry is in the inventory). The rerun, v2
20261027-051619 on a8d10c99, GREEN: no E_EQUIP_REFUSED for the copy, the
dress claims matched, and the bandit's swings landed on the host's player
(OnWeaponHit on ff000000, no E_HIT_WEAPON): H-51b CONFIRMED whole. Promoted
unchanged as b-npc-copy-fate (thuum main 916af5a, its own commit), and
b-npc-stream-equipment's placed-bandit lines turned from recorded to
claimed (e42dbca). H-51c and H-51d read on the gate: MERGED to fork parity
a8d10c99 at 08:19Z 2026-10-27, the gate cut at 18 of 25 by sky-c2's RTX
wedge and finished by its rest under D38 B, cited as one
(20261027-054632-gate-m3-npc-path+20261027-074932-gate-m3-npc-path-rest, 29
runs, verdict watch: b-npc-body-release's old point, below); T2 green on
a8d10c99; both clones promoted; the regression set (b-npc-puppet,
b-cell-host, the four b-npc-handoff) green in the gate, so H-51c and H-51d
hold at T3.

### Playtest 36, the turbo day (11:36 PDT 2026-10-28): the engine's deaths under play
Eli's item 5 ticked (its note unfinished: "this "). The server log: four hosted NPCs died by the engine from the server's
number with the killer credited (b6ce1 17:56:49Z and 9b0dc 18:13:27Z "died of an actor's hit ... killer ff000000: ff000000
hit it 88 ms (54 ms) before"; b6fdb 18:17:37Z the same), each "death pending ... its host reports within 3000 ms" answered
within 100 ms. One variant to watch: b6fe4 18:17:18Z "died of unknown at ..., host ff000000, killer ff000000: a hit the
server numbered 54 ms before, the killer ..." (the engine's deathStart named no killer and the server credited its own
pending aggressor, H-52b's path): the credit held, the cause word did not. Bodies: lootable from the killer's seat; the other
seat's E on the same body met "occupant is another object and is nearby" (one looter at a time, the engine's rule).

## Playtest 37's hands and outfit (findings 43 and 46, 2026-10-28; fork m3-fate-dress 9f577d2e)

The host's engine copy of a game-file bandit wielded a weapon its record lacked ("E_HIT_WEAPON: hosted 39fe4 hits
ff000001 with 13983, which its record's hands lack; dropped", 39fe2 with 13985) and a bandit outside stood naked.
The read (the agent's, against the fork and the esm): the server rolls the outfit and the CNTO lists once and puts the
inventory's best weapon in the record's hands (EquipBestWeapon); the AHEAD path pins the engine's roll through the
three detours, but on the LATE path (an interior's actors by construction, a relaunch's or a teleport's neighbours
after fatedSquares is erased at disconnect) RedressOnGameThread strips and re-adds the outfit from the fate and never
re-rolls the CNTO weapon rows, so the engine's own rolled weapon stays beside the server's and the dresser picks by
score (re-npc-roll.md section 11); 39fe2 and 39fe4 are plain NPC_ placements in an interior, 29600 LvlBanditMissile
re-fated after c1's 01:37Z relaunch. Then the host's hands poll reported the engine's weapon, OnUpdateEquipment
refused the whole report (the record's inventory lacked it) and the hit gate dropped every swing. Finding 46 is the
same handler's other side: an accepted report REPLACED the record's worn set, which FateOf reads, so one partial report
(a copy polled before its dressing) shrank the roll to a dagger and every later redress dressed the copy naked, on
every seat, persisted (29600's "1 worn, right 1397e left 0").

Built, server-only (the shape B: the client holds no record inventory for a live NPC and a forced equip lasts one
engine pass): a worn WEAP the record lacks in a HOSTED report is recorded R2 (E_EQUIP_UNKNOWN_WEAPON, one info line,
the item added to the record's inventory so the body holds what it swung) and the hit gate stands unchanged; any other
missing item still drops; the record's worn non-weapon entries a report lacks are kept ("outfit kept for ..."), so a
report never shrinks the fate's worn list; the host's hands poll skips an actor whose 3D is not loaded (HYPOTHESIS that
the dressing precedes the flag, read by b-npc-stream-equipment's claim, drafted and not committed, the file claiming
E_EQUIP_REFUSED and E_HIT_WEAPON zero and nothing on the skip line or E_EQUIP_UNKNOWN_WEAPON while m3-fate-dress
9f577d2e rides the turbo trains unread: a host log-count of the poll's skip line, text on 9f577d2e, with the claim that
every skipped resident reports worn within one poll, 0.5 s, of its first sample and no E_EQUIP_UNKNOWN_WEAPON). T0:
NpcFateTest [NpcFate][HostedEquipment]. Rung note: the wielded weapon's identity
on a hosted game-file actor is R2 where the fate arrived late; the damage number stays the server's. The one-roll
purity returns when RedressOnGameThread strips the engine's non-fate WEAP rows (a platform change, later). The records
already naked in the playtest world heal only by a restore or a respawn. Probe: a placed bandit on c1 after a relaunch,
server.ref(id).worn holding the weapon both seats' npc_state show, no E_EQUIP_REFUSED naming it, its swings logged as
OnWeaponHit, the worn lists equal on both seats.

## A resurrection by the host's engine (playtest 37, finding 48; fork m3-npc-caster fc493be9, 2026-10-28)

Eli: "the necromancer resurrected a skeever, only visible on prisoner ... yea deff add resurrections to thuum's
stack." The host's sampler streams every hosted actor its engine has alive, so a reanimated actor's health went out
and the server's OnHostedActorState set alive false for a dead record and dropped the sample; nothing reports a
stand-up. Built without a wire change: a hosted NPC the record holds dead (IsFateRespawned) whose host samples health
above one point more than kPendingDeathMs (3 s) after its death (RecordDeathAt, DiedAgo) is taken as the host's
engine's resurrection, R2 recorded ("[verb:npc-fate] resurrection by its host's engine"): MpActor::Respawn(false)
clears the death and keeps the inventory, RespawnEvent sends isDead false to every listener, the watcher's formView
turns it into the puppet's Resurrect (game-file ids; a server-made copy's stand-up reaches the record and not its
puppet, formView.ts's dead-word gate under 0xff000000, a known limit). T0: ActorDeathTest (within the grace nothing;
from a non-host nothing; from the host the death cleared and the live word relayed). Reanimate's thrall, Dead Thrall
and a scripted resurrect all ride it. The 0xff death report (a server-made creature's death "by the server's word"
after 3 s because the client never reported a 0xff id and the wire refused the range) is its own commit, fork
m3-death-range a46fa688 (19:3x PDT): ActorDeath's refr_id bound leaves the validator (the id nonzero, the cause 0 to
4; who may report whom stays OnActorDeath's rule: the simulator, a fated actor, alive), the client's gate keeps only the
player's own actor out (the host gate isMineLocal keeps other players' figures out), no schema change; docs/WIRE.md's
row says so. HYPOTHESIS until a placed creature dies on its host under the lab's eyes: x-npc-creature-caster v3 carries
no death leg (its atronach is never killed) and no probe has read a 0xff death report since m3-death-range a46fa688; the
leg to add is c1 killing the placed caster by swings, with the claims server.log_count("death report: ff000002 died") >=
1 and "death by the server's word on ff000002" == 0.

### The non-host's reanimate at T3 (2026-10-30; x-reanimate-host v6 152542 on the union a4541cd0)

GREEN, seven of seven: c2's Reanimate Corpse on Hilde's body (killed by kill-ref, the record dead) reached the server as a player's
cast ("OnSpellCast ff000001 cast 65bd7 ... relayed"), the server sent the cast to the body's host for the engine's own effect
("reanimate 65bd7 by ff000001 on 35534: cast on its host ff000000"), and 7 s later the host's engine stood her up and reported it
("resurrection by its host's engine: 35534 stands again with health 1.000 on ff000000's sample"), the record's death cleared and
the live word to every listener; alive on both seats. Two reads around it: the server's own condition evaluator refused the
effect on the corpse in the same millisecond ("EffectConditionsHold - effect cab63 of 65bd7 by ff000001 at 35534: its conditions
fail; not applied (ADR-039)"), harmless here since the host's engine applies the effect (R2, recorded). CLOSED (13:02 PDT 2026-10-30, a reader agent's
read, its citations checked): no misread. The refused effect is the spell's third, PerkDarkSoulsReanimateEffect 0xcab63, whose
one CTDA is HasPerk(DarkSouls 0x581de) == 1 on the caster (the record's bytes from Skyrim.esm; the other two effects carry
HasKeyword MagicNoReanimate == 0 and ActorTypeUndead == 1 OR IsUndead == 0; no GetDead and no GetLevel on the spell at all, the
level cap being the archetype's magnitude 13 and deadness the archetype's own engine check). HasPerk answers 0 for the magic
caller by design (condition_functions/HasPerk.cpp, ADR-039: no perks server-side before M5), so the rider is refused on every
target and the base effects hold, as unit/EffectConditionsTest.cpp's "Dark Souls rider" case already encodes on a living target.
On a corpse the line is a log line alone: ApplyEffects returns for a dead target before any condition (MpActor.cpp:3776), the
only evaluation is OnSpellHit's hostility loop, and the raise went through CastReanimateOnHost's snippet, which never consults
the evaluator. Follow-up for the next server train touching MpActor's effects (one line and a test case): the refusal line names
no row; append the failing row ("HasPerk(0x581de) == 1 on Target") and add the dead-target case to that test. And the aim: on c2 the mouse step's pitch found the body at 700 to 800 counts for a target 80 units off
and about 120 below the eye (about 13 counts a degree on this seat; the rune probes' 20.2 was another seat's or another frame's).

## Playtest 40's death findings (12:25 PST 2026-11-02; turbo 2 on parity ad1aa50a; numidium's logs at results/playtest-40)

- F3, Eli: "dead things fall on one screen, on the other they freeze and are embedded in the ground." Hod 0x1348a and Faendal
  0x1348c, hosted by c1, killed by rotfern's bow headshots at 20:11:37 and :41; 0x1066df, hosted by c2, killed by rotfern's melee at
  20:10:13. On the guest's seat each puppet died 1.5 to 1.7 s AHEAD of the server's word (the relayed arrow's or the attacker's own
  engine's kill; "body ... released from the puppet state" at 20:11:35.9 against the server's death at :37.68), so the pre-kill
  placement never ran, and two seconds later train 52's restBody moved the dead ragdoll to the host's spot ("rested at the host's
  spot, 118 units away"): the move took, and the body froze into the ground. Fix (fork m4-turbo2-deaths-client 4227a63d, the client):
  a dead body is never moved; the host's distance is logged once ("lies where it fell, N units from the host's (D78 C)"). D78's C
  stands as the rule; the same spot is M4's pose replication.
- F4, Eli: the reanimated Hod "runs and fights correctly" on the host and on the guest "is laying on the ground kind of sliding
  around". The server stood him up at 20:12:20 on c1's sample ("resurrection by its host's engine", 42 s after his death, the reanimate
  accepted 6.5 s before); c2 queued "resurrect 1348a (puppet false)" FIVE times in one tick (five isDead updates while the engine still
  read him dead) and flagged him a puppet 36 ms later (AI off before the engine's get-up); the body stayed lying and slid on the stream
  while every relayed action was refused ("performAction refused on 1348a: attackStart after 15 retries"). Fix (the same client head):
  one resurrect per body per two seconds, and the puppet flag waits 1.5 s after a resurrect. HYPOTHESIS: the engine's get-up completes
  within the grace; if the thrall still lies after it, the read is FateApi's ResurrectActor itself (x-npc-respawn's "did not stand it
  up" has company).
- F5: the thrall's end. Reanimate Corpse's spell ended at 20:13:21 and the engine killed Hod again on his host; the host's report named
  no cause (cause 0, killer 0) and the server refused it ("E_DEATH_UNCHECKED: no hit, drop or activation the server saw"), holding Hod
  alive at one point while c1 had him dead. Fix (fork m4-turbo2-wall-range 9de119b2, the server): MpActor::NoteHostStoodUp at the
  resurrection branch; a host's cause-0 report within kReanimatedEndMs (90 s: Reanimate Corpse and its kin last 60 s) of that stand-up,
  on a body with an accepted reanimate, is the reanimation's end (ActorDeathTest's case: refused without the stand-up, taken within
  the span, refused past it). Dead Thrall has no end but a hit's.
- F6: Alvor hostile ("pissed") after the kills yet working his forge on both screens: the host engine's furniture package against our
  hostility word (the server's package for him read ff000c5e then 1cb09; "ProcessActivate 1c785 - occupant is already this object").
  Recorded, not fixed under the turbo; a read of what the engine does with an angered NPC in a sandbox package when its aggression
  comes from the server.
- F9 (numidium's log read, 12:37 PST): after the 20:19:47Z restart the relaunched host's fresh engine stood two dead NPCs up
  ("1066df stands again ... its death before this process; the record's death cleared", Faendal 1348c at 20:20:35Z), against M3's
  "bodies lie where they died after a relaunch". A body dead since before this server process has no death stamp, and the host's engine
  loads such a corpse alive for a frame before the kill word lands, so its first live sample read as a resurrection. Fix (fork
  m4-turbo2-restart-dead 98f785ce, the server): MpActor::NoteHostSampledDead at a dead sample from the simulator, cleared at the
  stand-up; a live sample stands a body dead before this process only after its host has sampled it dead once, or within a
  reanimate's window (ActorDeathTest's case rewritten: the first live sample stands nothing, a dead then a live one stands it).
  F9's guard keyed on the DEATH's stamp, and x-npc-death-reentry v4 on break 3 (20261103-100946, numidium's read) found the hole:
  a host RELAUNCHED after a death stamped in this process loaded Hilde alive and its first sample stood her up ("35534 stands again
  with health 1.000 on ff000000's sample, 171 s after its death"), the client never having bound the dead record for its own
  hosted copy before reporting; playtest 41's "the dead stay dead across the restart" held only because a server restart keeps the
  clients' engines. Round six on the system-1 merge branch (m3-system1-r2 23fb0c73): the stamp is the HOST's (MpActor::NoteHoster
  from UpdateHoster clears it at every change of host, so a relaunched host or a later joiner must sample the body dead before any
  live sample of its stands it; the refused sample's line at info: "<host>'s live sample (health H) of <id> stands nothing: its game
  has not sampled the body dead (a fresh process, a new host, or the corpse's loading frame); the record stays dead"; an accepted
  reanimate within its window still stands a placed corpse); the client holds a dead word's reports until the engine's copy is dead
  here (the bind), never asks a move for a body, releases at 8 s with a line; a dead record's carried action (the create word's
  lastAction, the late-join replay) is dropped with a line instead of played (100946's watcher played the carried death Ragdoll
  beside the bind's own four events; whether those carry the death sound stays HYPOTHESIS, Eli's ear or a Frida read of the
  sound's play). T0: ActorDeathTest's new case (the host changes; the new host's first live sample stands nothing; its dead then
  live samples stand the body). The lab read is x-npc-death-reentry v4's leg B on the merge head.
  Rounds seven to ten on m3-system1-r2 (c605a8e0; a4a7805c and 817f78d0; f1c954d7; e23bd229; ActorDeathTest 22 cases, each a
  rule's own proof), under numidium's fresh reviews: the stamp is the WITNESS's (host form id plus a process-wide login serial set
  at SetUserActor, plus the sample's time), made by any zero sample of a fate-respawned actor (record dead or alive) and by the
  host's reliable death report (the already-dead branch too), cleared by Respawn and RespawnFated, never by a change of host; a live
  sample stands a dead body only when the same witness stamped it within kPendingDeathMs (3000 ms) before the death, the window
  anchored since round ten at the earlier of the recorded death and the pending death's start (the host's engine dies at the
  DamageCause sent beside BeginPendingDeath and its flip lands within half a second, while TickDeaths records the death 3 to 4 s
  later), any stamp counting for a body dead since before this process; the refusal's line names its gap ("no dead sample from any
  host yet", "the dead sample is another host's", "this host's earlier login", "N ms before the death ... past its 3000 ms window").
  The client sends the alive-to-dead flip reliable (hostedStateService's fellDead) so the stamp lands before the report; a live word
  turns a dead hold back into a placing hold, and a respawn that teleports gives the revived hold the teleport's place as its record
  ahead of the standalone live word (PROVEN on two seats, r3's stage on 5e0e975b: x-respawn-teleport-hold v3 20261103-141513, c2's copy
  of the chicken 0x1066df 3 units from the record at its placement after the fate's own respawn through the lab's respawnFated lever,
  "placed at the record" 1 and "not placed" 0 where the parent would have asked the copy back to the corpse's place 3,200 units away;
  its premise x-essential-bind v2 20261103-141231 held the dead hold's 8 s budget with the copy alive under a typed essential flag). Named for its own round: the server still accepts a dead record's movement and actions. The lab
  read is numidium's evidence stage on e23bd229 (door v21, swap v19, death-reentry v5, death-freeze v3, scene-guest v2.1).
  The guest's half-up body (playtest 41's item 5; x-npc-death-freeze 140538 and 152912 red, 141811 green, on m3-system1-r3),
  read 2026-11-03: a SECOND ragdoll frozen mid-fall. The host's kill move (KillMove1HMStabUpFace, KillMoveD), relayed to the puppet's
  graph as a plain animation event by formView's replayActions, ran the victim animation whose KillActor tag killed the copy about
  2.7 s after the event (HYPOTHESIS on the tag; the timing is the runs'), 3 s before the server's word (the host's own kill move
  killed at its tag only in the green run); formView's 2 s dead check found a dead body under a live record and stood it up; the
  word killed it again; puppetService's release "after the ragdoll's 4.0 s" came 0.75 to 1.0 s into the second fall because
  deadFlaggedSince was stamped at the first death and onResurrected never cleared it; setPuppet(false) with the AI off then left
  nothing ticking the graph and the skeleton stopped where it was (c2's head 12.8 and 54.6 units above the root, identical across
  three reads; the green's head 4.8 below the root after a full settle). The deferred kill was armed and did not hold against the
  kill move's route (KillActorHandler to Actor::Kill to KillImpl), so the graph's door is the puppet's real guard. The rule, as
  ADR-050 decision 2 already says: a puppet's death is the server's word. The fix, two rounds on m3-system1-r3: db0e19a5
  (replayActions drops a KillMove* event for a puppet, "<id>: the host's <event> not replayed on the puppet, a puppet's death is the
  server's word", once per puppet per process; onResurrected cleared deadFlaggedSince), then 7d0d4d7e after numidium's review found
  the clear undone in the same tick (the fate's resurrect is queued past the JS tick and reconcile restamped the still-dead body) and
  the drop missing kill moves by name and by channel: the settle clock is now cleared in reconcile's live path, where the body is
  SEEN alive, and deathService.hookDisableKillMoves is widened to the game-file range with the puppet read inside the hook (the
  animation.ts idiom; the range and the patterns filter in native) for KillMove*, KillingBlow*, 2HWKillMove* and KillWerewolf*, the
  idles' ENAMs less "pa_" (KillMoveD and KillMove1HMStabUpFace seen; the rest in the tree, HYPOTHESIS beyond the two), which covers
  the event relay's mouth too (a creature's events, a humanoid event outside the PerformAction entry); the replay drop stays as the
  cheap first filter with its lab line. What the guest sees: a kill move only on the killer's screen; the victim stands through it
  until the word, then drops with the engine's full death (the figures' precedent; playtest 42's checklist line). The deeper shape,
  a later round with its own read: refusing a puppet's own KillActor kill while the victim animation plays, so the guest sees the
  victim half. Since df9e1009 the puppet handlers cover the whole id range (a server-made NPC's copy is a puppet on the seats that do
  not host it). Carried, not changed (the fresh review of 7d0d4d7e): a one-frame hole if the dead word's update handler ran in the
  very tick the resurrect landed and before the view's update (improbable: the view's update listener is registered first and the
  lab's gap was 3 s; the hole-free shape is clearing the stamp at the word's own kill); and the guest's own kill move on a puppet it
  hits is already touched by the hook (the engine's paired start on the puppet victim is blanked, so no local kill at the tag, while
  the guest's attacker half plays against a victim that never enters the paired state), its look unread, HYPOTHESIS, in
  x-npc-death-guest's frame. Follow-ups from numidium's GO review of df9e1009 (2026-11-03), for a later round: (a) the guest
  player's own kill move on a puppet loses its victim half (0x14 passes the hook, the victim is flagged), so the guest stabs a bandit
  that stays standing or the engine refuses the pair, and whether the guest's graph locks is unread (a Dynamic line; playtest 42's
  item 3 notes); (b) the same tick's reconcile calls startDeferredKill on the still-dead body before Resurrect(true, true) runs, and
  if Resurrect resets inDeferredKill (MiddleHighProcessData, unread) a respawned puppet is left unheld and never re-armed (the
  comment "the next pass" is stale); (c) the figures' handler blanks KillMove* on every 0xff id, so a copy its own host simulates
  loses its victim half on that host; (d) dragon kill grabs carry no pa_ event (Skyrim.esm 0xfdbec Ground_KillMove_Bite_Grapple;
  0xc9a1f to 0xc9a21 to_Flight_Kill_Grab_*), their victim's event name unread, so a dragon grabbing a puppet may still kill the copy
  early (HYPOTHESIS); (e) the hook blanks silently, so the event-relay path and the three new name families have no witness line:
  one logLab per actor in the enter would give probes one. Confirmed by that review: the range and pattern are checked in C++ before
  JS; isPuppet is a set read under a short lock with no game call; a pre-blanked "" cannot match (StartsWith needs at least 8
  characters); all 379 kill-move pa_ idles in the five masters fall inside the four patterns, the nine outside being hugs, feeds and
  quest scenes. Pre-existing and not these rounds: the stand-up pass re-arms the deferred kill on a still-dead body (follow-up b). The read is
  x-npc-death-freeze v4 on db0e19a5 (the re-stage) and v5 (c2's drop line and no resurrect, numidium's) on 7d0d4d7e. First proof on
  two seats (db0e19a5's re-stage): v4 GREEN twice, 20261103-161847 and 162349, both with the mechanism shown: c2's "the host's
  KillMoveShortB not replayed on the puppet" and "... KillMoveShortD ..." one each, "resurrected 13491" 0, the body down; so four
  kill-move names seen in the lab (StabUpFace, KillMoveD, ShortB, ShortD), all KillMove*.
  HYPOTHESIS (the fresh review of x-essential-bind v1 and x-respawn-teleport-hold v2, 2026-11-03, a static read of
  ActionListener.cpp's stamping and standing branches): an actor whose ENGINE refuses the death (an essential base, set by the game
  files or by a typed setessential on the host's seat) answers a server kill with bleedout, so the host's zero sample stamps the body
  as host-sampled dead and its recovery sample stands the record up ("resurrection by its host's engine"): the engine's rule wins over
  the server's kill, which is R2's shape. x-essential-bind v2 records the server's two lines after the dead hold's release (stands
  nothing, resurrection) without claiming either; its run turns this row into a fact or a correction.
  The run (x-essential-bind v2, 20261103-141231, r3's stage on 5e0e975b) corrected it: c2's copy under the typed flag read health
  1.000, not a bleedout zero, so c2 never stamped the body, and its first live sample after the hold's release stood nothing by the
  WITNESS rule ("ff000001's live sample (health 1.000) of 1066df stands nothing: the dead sample is another host's (ff000000); the
  record stays dead", 14:14:14.924Z); no resurrection line followed. So the server's kill held against the engine's essential rule
  on a seat that never sampled the body dead itself: round eight's witness stamp seen in play. An essential actor's engine would
  stand the record up only through its own zero sample first, which this shape never produced; that case stays unread.
- Where the fixes stand (14:44 PST 2026-11-02): F5 MERGED with wall-range (fork parity 4fdb2d31, 21:12Z); F9 MERGED as the R0 train
  m4-turbo2-r0-train (parity 188a8dea, 22:42Z, with skill books; T0 13 of 13, T2 green); F3 and F4 ride the client train
  m4-turbo2-train 11e6b00e (with prop-statics and the settle head), arm two's build, its gate after the arm (Eli's turbo order). The
  reanimate's grace and the never-moved body are read by Eli's eyes in arm two (docs/private/playtest-turbo-2.md, items 1 and 2).

### Playtest 41's deaths, late (17:33 PST 2026-11-02)

- The guest's frozen spider (Eli: "on prisoners screen instead of ragdolling it froze"): the host killed MS13FrostbiteSpiderREF
  0x3a1e1 at 00:46:16Z while it hung in its ambush furniture (its masterAmbushScript never ran on the host, the name parked;
  ADR-062 runs it); on the guest the puppet died by the server's word inside the furniture's idle, no fall, the deaths2 flag keep
  ticking a graph that never left the idle. Fix on the bundle head m4-turbo2-chest 84ef8669 (TS): a killed puppet that has not
  dropped 16 units within 300 ms gets the engine's zero-force push (finding 71's cure), "body <id>: no fall N units after the
  kill, pushed to ragdoll". HYPOTHESIS until x-npc-death-ambush (by path: c1 hosts the Temple and kill-refs the spider in its
  perch, c2's npc-state z under the perch within 4 s).
- The naked headless bandit (Eli: "rotfern just killed a naked headless bandit in bleakfalls"): c1's console at the Temple's load
  (00:34:41Z) queued "late fate ... engine re-roll or redress" for 39fe4, 39fe2 and 39fe1, and c1's equipment report then read
  "1 worn" for 39fe1 against the roll's five. The redress's own lines (FateApi.cpp: "rerollActor(<id>): ...", "redressed <id>
  from the server's roll: N of M", the three warnings) are platform log lines (c1.log), which no copy reached, so whether the
  queued redress ran is unread. Probe x-fate-dress-bleak by path (c1 enters the Temple's entrance hall in a clean world; within
  30 s c1.log names the redress or its refusal for 39fe4; the worn read against the roll when lab-api exposes it). The gate audit's
  class: npc-fate's scenarios read the roll, never the host's rendered actor.

### Playtest 41's crash on c1 (17:56 PST 2026-11-02; 01:51:00Z, numidium's read of C:\lab\evidence\playtest41-c1-crash-20261103T015312Z)

EXCEPTION_ACCESS_VIOLATION at SkyrimSE.exe+070DB20 (`mov rax, [rcx+0x08]`, rcx null); the objects on the stack: Sven 0x13491
(Character), an Iron Dagger 0x1397E (USSEP), the player, BGSEquipSlot 0x13F42, BGSOutfit 0x9D5DF, Helvard 0x19824, a static
NativeFunction of thirteen ints. The platform log's last second: setHosted false for all fifteen hosted actors (the host set
15 to 0 at a release), two redresses with "3D loaded false" (13486, 13485), then "rerollActor(13491): not a leveled clone,
redress instead" and the crash. Eli: "rotfern crashed after npcs were desynced for too long". HYPOTHESIS: the redress's
AddWornOutfit (FateApi.cpp RedressOnGameThread, a_forceUpdate true) on an actor with no 3D reads the model it has not got. The
guard on the bundle head m4-turbo2-chest e742d086 (TS): the late fate runs the platform's re-roll or redress on a loaded actor
alone; an unloaded one waits in actorFateService's pending set ("late fate for <id>: its 3D is not loaded, the redress waits
for the load") and is dressed at its load (the reference's cellAttach, a 1 s poll), forgotten after 120 s. Dynamic plan: the
re-analyst names +070DB20 in 1.6.1170 and its null (the equip path's model read or the outfit's); a Frida trace of the redress on
an unloaded actor on the lab confirms; the platform's own guard (RedressOnGameThread refusing an actor whose Is3DLoaded is
false, logging "redressActor(<id>): no 3D, deferred") is the second half, a platform build.

## Playtest 44's three NPC regressions, read before built (2026-11-03 night; Eli: "fix the regressions first"; three read-only code maps)

### 1c. The body's inventory is the server's record (the longbow take, the arrows)

Facts (canon-3; the fork's lines): the server ALREADY rolls a game-file NPC's inventory into its record: MpObjectReference.cpp
EnsureBaseContainerAdded (:2519-2588) reads CNTO through the template chain (GetInventoryObjects :2477-2497), rolls each LVLI
in AddContainerObject (:2499-2517) with LeveledListUtils::EvaluateListRecurse at the fate's level (:2541-2543, else level 1), the
outfit once into worn (:2560-2576); triggered at Init (MpActor.cpp:2511-2519), RollFateIfUnrolled (:2239-2265) and the respawn
(:2704-2726). What reaches the seats is less: FateOf (PartOne.cpp:84-97) carries refrId, pick, level and WORN alone, no inventory
rows (ActorFateMessage.h:21-42; skymp.rs ActorFateEntry); the platform's three detours (Offsets.h:153-160: 14752, 16155, 16128;
FateHooks.cpp ContainerAddReplacement :373-434) pin WEAP rows only, by design (":357-359 rows that are not weapons stay the
engine's"), and the late path RedressOnGameThread (FateApi.cpp:81-127) strips the outfit only. An interior placement is fated
late by construction (ADR-049 Consequences), so 39fe2's host kept its engine's own container roll (the Long Bow and its arrows),
the loot window listed that copy's inventory (containersService.ts:19-73 sends TakeItem after the engine moved the item; the
body's activation sends the "inventory" property then OpenContainer, MpObjectReference.cpp:2073-2077, :2430-2445, but the menu
lists the engine copy), and the server's RemoveItems threw "Source inventory doesn't have enough" (Inventory.cpp:131-135, caught
by ScampServer.cpp Tick :709-710, no E_ code). OnUpdateEquipment (ActionListener.cpp:1659-2065) drops a worn item the record
lacks (:1835-1843, :2052-2065) EXCEPT a hosted actor's WEAP, which it ADDS to the record with E_EQUIP_UNKNOWN_WEAPON (:1829-1833,
:1966-1978): the record following the engine, R2 where the law says R0. libespm reads LVLI/LVLN/LVLO (LeveledListBase.h:8-45;
COCT unread; chanceNone globals read as 100, LeveledListUtils.cpp:35; the roll's level is the fate's, HYPOTHESIS
re-npc-roll.md:136-137). A refusal's resync exists: ResyncAfterRefusedMove (:854-872).

Rung R0 (the law: the server owns state, inventory transfer is R0; rule 5: a client's report is validated or recorded as
unvalidated, never silently). Design, the smallest: (1) no new roll, EnsureBaseContainerAdded is it and MpChangeForm.inv
(MpChangeForms.h:118) is the record, no migration; (2) FateOf adds the non-worn inventory rows to ActorFateMessage::Fate and
ActorFateEntry gains `inv: Vec<{base_id, count}, cap::FATE_INV>` (check_fates refuses a 0 id or count), fixtures and the C++
struct in one commit with the SCHEMA_VERSION bump (rule 4); (3) setActorFate and Fates::Fate carry inv, ContainerAddReplacement
drops every engine pick for a fated owner and writes inv (the arming at :396-425 exists), RedressOnGameThread also strips the
ExtraLeveledItem rows and re-adds inv (HYPOTHESIS until the probe); (4) OnUpdateEquipment's hosted-WEAP branch becomes a plain
drop (E_EQUIP_UNKNOWN_WEAPON refuses, nothing added); (5) meanwhile TakeItem checks GetItemCount >= count before the event and
refuses E_TAKE_NOT_IN_RECORD with ResyncAfterRefusedMove, no throw; PutItem's twin E_PUT_NOT_HELD. T0: NpcFateTest beside :383
(a refused take, no throw, both resync messages), :947-949 inverted (the engine's axe is NOT added), :187 asserts inv rows in the
fate and after a respawn; PartOne_ActivateTest :791-799 from THROWS to NOTHROW plus the resync; wire-validate tests beside :2719,
fixtures 51-ActorFate regenerated; TemplateInventoryTest unchanged as the guard. Probe (by path after the build): x-fate-inventory,
a late joiner at Bleak Falls kills a bandit and loots it: the take of the record's item granted, E_TAKE_NOT_IN_RECORD 0,
E_EQUIP_UNKNOWN_WEAPON 0, the host's npc-state worn equal to the fate's, on canon-3 the same run reads the leak's lines. Built off
`canon` (2136311f) as m3-canon-fate-inv; the arrows regression ("re-equip her bow or her arrows don't work") rides it: a looted
stack the record lacked resynced the quiver the same way.

BUILT (2026-11-03 night) on m3-canon-fate-inv off `canon` 2136311f, five commits: c9d64b33 the take's E_TAKE_NOT_IN_RECORD and the
put's E_PUT_NOT_HELD with ResyncAfterRefusedMove instead of RemoveItems' throw (T0 green, CI 5226); 4ce1d78b the fate's rows on the
wire (FateInvRow {base_id, count}, ActorFateEntry.inv at cap::FATE_INV 32, the table bound 32 KiB, check_fates refusing a 0 id or
count, SCHEMA_VERSION 35, the two ActorFate fixtures regenerated, the C++ InvRow and FateOf); 4667649a the platform (Fates::Fate.inv,
setActorFate and armActorFate's fourth argument, the container-path detour dropping every engine pick for a fated owner and writing
the fate's worn weapons plus its rows at the arming entry, RedressOnGameThread ending in ReconcileInventoryOnGameThread through
GetInventory, RemoveItem and AddObjectToContainer) and the client (ActorFateEntry.inv, flatInvRows, the applied key, the copy fates,
the codegen); 7c3c9f79 a type; 7cd63e69 the fresh review's eleven findings applied as written (NO-GO on one blocker: FateOf filtered
its rows by the inventory entries' worn flag, which an NPC's entries never carry, the Equipment record holding the worn set, so
every outfit piece and the rolled weapon landed twice; now a base's row is its inventory count less its Equipment worn count, with
the ring-roll T0 asserting it; the detour writes a row less what the copy holds, the base's fixed CNTO rows and the changes made,
since 16128 runs for the leveled rows alone; the reconcile skips the leveled-list bases GetInventory lists and counts at or below
zero; OnTakeItem strips the taker's worn flag as the put does; MpActor::DropItem refuses E_DROP_NOT_HELD with the resync; the tests
assert both resync messages; one arming line per pass, drops at debug; the comments true). Point 4 (the hosted equipment branch as a
plain drop) stays deferred behind the probe. Pipeline 5236 builds both halves. Dynamic (HYPOTHESIS, the review's finding 10): on a
LIVING late-fated actor the reconcile removes the engine's wielded weapon and adds the record's row unequipped, so the hands are
empty until the AI's next pick and the host's interim equipment report records empty hands (E_HIT_WEAPON on a swing meanwhile):
a transient the probe's npc-state read times; if it shows in play, the fix is an equip of the fate's worn weapon after the
reconcile (AddWornOutfit's weapon behaviour unread). Probe x-fate-inventory v1 (by path, sha1 90b98f7b): 10 gold put in 0x39fe2's
record before any seat loads the Temple, c1 enters and hosts, A) c1's copy of 39fe2 and 39fe4 equal the record (gold, the Long Bow),
the detour's "inventory row(s) written" line, E_EQUIP_UNKNOWN_WEAPON 0; B) kill-ref, the body opened, take all: E_TAKE_NOT_IN_RECORD
0, the body's gold moved; C) c1 relaunches and comes back: "inventory of 39fe4 reconciled to the record" (or the detour's line since
the relaunch) and the copy equal again. Runs on 5236's server image and dist alone (both halves changed, SCHEMA 35), the canon
otherwise.

READ (23:10 PST 2026-11-03, 07:10Z 11-04; x-fate-inventory v1b dae397e3, run 20261104-062409 on 5236's image and 18531's dist): leg A held every
claim (the record and the copy equal on the gold and the Long Bow, both 0; "armed 39fe2 from the server's roll at entry 0: 1 engine
pick(s) dropped (1 weapon(s)), 1 of the server's weapons and 0 inventory row(s) written"; E_EQUIP_UNKNOWN_WEAPON 0) and leg B went
RED at the take-all: four "E_TAKE_NOT_IN_RECORD: ff000000 takes 1 of 13985 from 39fe2, whose record holds 0" (the take path's
refusal works as designed; the boots and the dagger moved). Behind the red:
- FINDING 1 (the record): the 10 gold put at step 10 read 0 after the load. Cause in the code: MpActor::Init rolled 39fe2's base at
  level 0 at the server's start, and RollFateIfUnrolled reset the inventory (changeForm.inv = Inventory()) to replace that roll,
  taking the put with it. FIXED on m3-canon-fate-inv c312fd39 (pipeline 5252, server-only): CanRollFate() names the roll's
  preconditions (espm, not from a save, alive, unfated, a base above 0x7); Init rolls nothing for an actor the fate pass will roll
  (the engine's own shape: the base's rows resolve once, at the first load, at the loader's level) and RollFateIfUnrolled lands the
  roll beside what the inventory holds; a saved, dead or player's actor keeps the old rule (a body's first open rolls it). T0:
  NpcFateTest rolls 39fe2 at level 1 after a put of 10 gold.
- FINDING 2, two halves, UNEXPLAINED by reading. (a) The record held no bow and no arrows, though 39fe2's base MS13BanditCampfire02
  0x39fe5 keeps its own rows (ACBS template flags 0x0eff, UseInventory 0x100 unset; CNTO IronDagger 0x1397e x1,
  LItemBanditWeaponArrows 0x39d2f x1, LItemBanditWeaponBow 0x39d2e x1; both lists LVLD 0, LVLF 3, no LVLG; no override in any plugin
  of the load order; all read by lab/esm.py), so the roll gives one bow (eight level-1 entries, LongBow 0x3b562 or HuntingBow
  0x13985) and the arrows; EquipBestWeapon took the dagger (right 1397e, HuntingBow 7 and LongBow 6 outdamage it), so no bow was
  in the record at the roll. The T0 case on c312fd39 is the oracle: it asserts the bow in hand and 1 to 20 arrows after the fate
  pass; red there is the server's own bug, green moves the cause to the lab server's state. One server bug beside it, fixed in
  c312fd39: EvaluateListRecurse passed countMult 1 to a nested list, dropping the entry's count (BaseArrowIron75 x20 gave one arrow
  at most: bandits with one arrow). (b) The engine's copy held two HuntingBows and no arrows at step 16 (before the kill, the copy
  in combat with c1), while the detour's one arming call dropped its one weapon pick and every later entry's picks (picks->clear()
  on each call, "0 inventory row(s) written", the fate's inv empty), the outfit roll was skipped ("dressed 39fe2 ... 3 of 3 tagged
  for outfit 1e608 ... the engine's outfit roll skipped"; the three worn are HideBoots 0x13910, the cuirass 0x10594d and the
  dagger), no quest alias forces 39fe2 (a QUST alias scan of Skyrim.esm: 0 hits for 39fe1, 39fe2, 39fe4), SPID distributes no bow
  (c1-po3_SpellPerkItemDistributor.log), no VMAD on the placement or its bases. The two bows did not pass 16128 as detoured.
  HYPOTHESES, ranked: the clone's leveled rows resolve through a second path 16128 does not cover (an init before the arm, or an
  entry adder of its own) and the count 2 is one roll per init; the combat AI's weapon pick for a Missile class. Dynamic plan:
  a Frida script on 16128 (ContainerAdd), 16129 (InitLeveledItems), 16155 and 14752 with owner 39fe2, logging the ordinal, each
  pick's form id and count, the caller's return address and the thread, from the cell's load to the first npc-state, and the
  owner's InventoryChanges entryList dumped after the load. Until that read, the cure in kind is the record applied at every load
  (RedressOnGameThread's reconcile at the actor's load for every fate, early or late: one path), held back by the crash until its
  fix (802842d9) and BUILT in b763f766 (actorFateService pends a fate whose reference the engine does not hold yet; rerollActor at
  the load; a dead copy reconciled only): the probe's rerun on canon-4's pair reads the copy equal to the record at the load.
- CRASH, HOLD on 1c's dist: c1 crashed three times in a row on 18531 at 06:12:38Z, 06:13:00Z and 06:13:23Z (c1-crash-2026-11-03-
  22-12-38/-22-13-00/-22-13-23.log, copied into 061637's and 062409's artifacts), each about 14 s after a launch inside the
  playtest-relaunch hold, at the login's late fates in Bleak Falls: the platform logs pid1724, pid3888 and pid2060 each end
  "rerolled 380b5 through the engine from pick 55944 (or 5593c) toward the fate's 55942 (3D loaded true before, true after the
  reload)" then "puppet 39fe2: AI off, combat stopped, keep-offset cleared, activation blocked", shortly after "inventory of 39fe2
  reconciled to the record: 1 row(s) and 4 worn, 14 (15) removed, 0 added". The stacks sit on a BSJobs::JobThread with TESObjectWEAP
  and BSFadeNode pointers on them: 12354+0xB5 from 11615+0x10F; 11696+0x38 from 38894+0x54 (EquipObject); 11585+0x16 from
  11593+0xAB at address 0. HYPOTHESIS: the reconcile's RemoveItem of the copy's wielded weapon frees its 3D under a job thread, or
  the engine re-roll's reload races the demote; the re-analyst's static read of the three stacks is below. Nothing of 1c reaches a
  seat before its fix is proven; the canon (apply-off js, no reconcile) is clean of it.
  THE READ (07:28Z 11-04, the re-analyst, static, HYPOTHESIS until the Frida trace; ids by `just addr`, names its own): one chain under
  all three crashes: BSJobs::JobThread, 41380 (a job per actor), 41381 (Actor's UpdateNonRenderSafe vfunc then 39814), 39814 the
  AI process's equip-queue flush (MiddleHighProcessData::itemstoEquipUnequip, include/RE/M/MiddleHighProcessData.h:157, each node
  a QueuedItem holding ObjectEquipParams::extraDataList as a raw pointer, :66, :81-94), then per node UnequipObject (38901, crash
  1: 38934, 38920, 11615 SetCannotWear, 12354 RemoveByType reading a freed list whose data word is 1; draugr 383f7, Ancient Nord
  Greatsword) or EquipObject (38894, crash 2: 11696 IsWorn on a list whose presence word is 3; bandit 39fe2, Long Bow 0x3b562
  beside the Iron Dagger; crash 3: 38929, 38001, 38004 AddWornItem, 16066 the worn-entry merger, 11593, 11585 GetType on a freed
  BSExtraData's vtable; draugr 800a6, Ancient Nord Battleaxe). Not freed: the 3D, the biped, the process. The remover:
  TESObjectREFR::RemoveItem 19689 to 16059 frees an entry's lists at zero count; Actor::RemoveItem 37797 purges queue nodes only
  where the node's list equals the a_extraList passed (the fork passed nullptr, so nodes with a real list survived) and, for a
  removed weapon with no menu open, QUEUES EquipObject of the next-best weapon with a_queueEquip true (39821 allocates the node and
  copies the list pointer); Actor::AddWornOutfit(outfit, a_forceUpdate) forwards its second argument into the same queue flag (the
  fork passed true; the engine's dresser 418622 passes 0). Ranked: 1. the reconcile's RemoveItem of the copy's weapons (each
  removal queues the next-best's list, the loop removes that weapon too and frees it, the next actor-update job reads it; weapons
  in all three, the dagger beside the bow, 14 removed on 39fe2, 1 on each draugr); 2. AddWornOutfit(outfit, true) a line earlier
  queueing every tagged entry; 3. applyEquipment's default queue flag; 4. the 380b5 re-roll (none of its objects on the stacks);
  5. the demote (frees no list). Safe idiom, the engine's own (Actor::SetDefaultOutfit, src/RE/A/Actor.cpp:1016-1029: remove first,
  dress last, nothing queued across a removal; ActorEquipManager.h:19,22's a_queueEquip; InventoryEntryData::IsWorn :50).
  BUILT 802842d9 on m3-canon-fate-inv (pipeline 5255): ReconcileInventoryOnGameThread removes each stack by its own ExtraDataList
  (copied out first) after unequipping a worn stack with the queue off and applied now, the listless remainder with nullptr as
  before; RedressOnGameThread strips, tags, reconciles, then AddWornOutfit(outfit, false); the lines say so ("{} worn stack(s)
  unequipped first", "the record's rows reconciled first, the dress unqueued"). Oracle: three logins into Bleak Falls on that dist
  where 18531 crashed three of three. Dynamic plan (the confirmation): a Frida script on 39821 (enter: actor, the equip flag, the
  item, params->extraDataList, the caller, the thread), 39822 (item, list), 38894 and 38901 (a_extraData, the seventh argument,
  the thread), 39814 (enter and leave, the thread), 19689 (item, count, a_extraList, the caller) and the 0x20 free under it, on a
  login into Bleak Falls with fates on: on 18531 a 39821 node whose list equals a pointer freed under 19689 from RedressOnGameThread
  and then 38894 or 38901 on a job thread with that pointer within a frame; on 802842d9 no node outliving its list. Falsifiers: the
  faulting list never in a 39821 node before the crash; the free from a caller outside RedressOnGameThread; the crash recurring
  with the queue flags at 0 and the reconcile before the dress.
  T0 (07:28Z 11-04): pipeline 5253 (bf4ec042) GREEN with the new case, so a fresh roll of 39fe2 at level 1 does carry a bow in hand and
  the arrows: FINDING 2 (a)'s missing bow is not the roll's code on the new flow; the probe's rerun on this branch's dist (the
  record read at the load) decides whether the lab's old flow (Init's level-0 roll and the reset) or the server's state made it.

### canon-4's merge review (00:05 PST 2026-11-04, 08:05Z 11-04; a fresh read-only agent on fork m3-canon-4 7b6fc953)

GO. The diff against canon 2136311f is exactly the apply head 68173f26 plus the fate head b763f766 (34 files; every one-side file
byte-identical to its branch); MpActor.cpp's hunks are disjoint (ScheduleFateRespawn against CanRollFate, RollFateIfUnrolled, Init,
DropItem); skyrimPlatform.ts is byte-identical to the converter's output over the merged Definitions.txt and FunctionsDump.txt;
setActorFate and armActorFate carry four arguments end to end (Definitions.txt:1806/1808, clientListener.ts:213/215, FateApi.cpp:52-72);
ApplyChangeFormResult is a Papyrus native through callNative; the hook sets are disjoint (ChangeForm's 35928 against the fate's three
detours). Two follow-ups, neither a blocker, both for the round after playtest 45:
- Finding 1 (medium): two imposers of a watcher's corpse inventory with no declared order. The change-form record carries the
  inventory (kInventory, change-forms.md B1), so the apply lays the owner's at-rest inventory and the fate's reconcile lays the
  server's rows; neither re-runs after the other, and in the common late-joiner order (HYPOTHESIS: fates ahead of the attach, the
  detours and rerollActor at cellAttach, the bind kill at the 3D load, the apply as the kill lands) the apply runs second and wins,
  leaving the engine's copy with the owner's engine state at its rest (less its combat consumption, death items and later loot) rather
  than the server's record. Bounded today: the loot window lays the server's list as a diff (formView.ts) and every take is checked
  on the server (TakeItem). Fix: after the apply lays (changeFormService.ts, `rec.laid = true`) call rerollActor(formId), which on a
  dead copy is reconcile-only, so the record's inventory is the last word; the owner declared here: the body's container contents
  are the server's (R0), the body's look and pose the owner's record (ADR-065).
- Finding 2 (low, pre-existing with the apply head alone): the one-resurrect-in-flight mark precedes onStoodUp, so repeated asks
  within 2 s no longer drop a record that arrives meanwhile, and the server never clears a held change-form record at a respawn
  (MpActor.cpp serves whatever is held); the apply's dead premise refuses the bad order. Fix: drop the held record in RespawnFated.
- Note (HYPOTHESIS): the two writers are serialized only by the main thread parking while gameThrQ drains on the OnUpdate thread
  (main.cpp:131; ChangeForm.cpp); the apply's "answered on the main thread" line is the read.
- READ ON CANON-4 (08:41Z 11-04; x-corpse-record v5 42d3e70e, run 20261104-083324, numidium): legs A and B held and no seat froze; leg
  R red on the owner's two claims alone (c1 "applied" plus "not applied" 0, "answered on the main thread" 0): on canon-4 the owner
  re-hosted the street before its apply's premises were met, and changeFormService drops a held record when this seat simulates
  the body and the kill was not the bind's ("changeform 13491: the record dropped, this seat simulates the body", five times), its
  engine's body 0 to 1 unit from the record ("promote gate 13491: the engine at (20265, -46146, -121), the record at (20265, -46147,
  -121)"); on 072601 the apply came before the grant (timing). The owner's case by design, not a regression: the record is for
  watchers. The claim change (the owner's drop with its body within 32 units of the record accepted as the owner's case) is a W4
  for Eli, numidium's ask.

### 1d. The guest's copy of a fighting NPC stood elsewhere (39fe1)

Facts (canon-3): the host samples every hosted actor's reference transform each 130 ms (sendInputsService.ts:114-118, :164-241,
:244-252; movementGet.ts:34-110, so a lunge's root motion is in it; combat changes nothing in the sampler); the server takes an
in-cell hosted move with no E_ code (ActionListener.cpp OnUpdateMovement :271-489, MayMoveActor PartOne.cpp:2645-2661,
MovementValidation.cpp:118-128) and relays it to every listener but the sender; the six hits passed melee_within_reach on the two
RECORDS (:6082-6101), so the host's samples landed on the record during the fight. On the guest the puppet's step is replaced
(PuppetHooks.cpp:214-267: Move(delta, zero) plus locomotion channels from the last sample, stale after 400 ms, Puppets.h:37);
formView.ts:905-976 applies the record on each numMovementChanges change or every 2 s through movementApply.ts:14-129 and translateTo
(:451-596: the follow glide x 1.15, deadband 8/4, setPosition only beyond 1024 units or a vouched jump); nothing re-pulls a puppet
whose samples stop, and these early returns freeze it: dead (:558), Variable10 under -999 (:567, set by a relayed "Ragdoll",
animation.ts:186-198, reset only at GetUpBegin :215-222), isKnockedDown (10 s), isStaleAfterPop (600 ms); a record whose cell
differs from the player's applies nothing (:217-228) and a record cell change destroys the view (:189-199). "pinned 39fe1 to
1bcd8" is the leveled-roll detour pinning the LVLN pick to NPC_ 0x1bcd8 (FateHooks.cpp:119), not a position. A puppet with no form
on the guest (the view destroyed and demoteOnLoss, puppetService.ts:452-454, or the 2 s poll demoting an undescribed high-process
actor :336-362) is AI off and frozen where the engine had it: the Frodnar class (LOG 11-03). Nothing in this path changed between
the 11-02 builds and canon-3 but the bodies' and hold rounds. Hypotheses, ranked: H1 c1 held no live form for 39fe1 (an orphan
puppet; confirm: c1's npc-state constant while server.ref moves, no "settle 39fe1" line); H2 the fate re-roll's Set3D(nullptr)
then Load3D left a ghost mesh where the reference stood (confirm: refs-near within 64 of server.ref each second while the screenshot
shows the body elsewhere; "rerolled 39fe1" in c1's platform log; 1e's bug on a living actor); H3 the reference follows but the
Havok capsule does not (confirm: a Frida read of the charController against the reference; the arrows pass); H4 a relayed Ragdoll
set Variable10 with no GetUpBegin (confirm: "Ragdoll" for 39fe1 in c1's animation lines before the fight); H5 the relay never
reached c1 (confirm: no UpdateMovement for its idx in c1's pcap while HostedActorState lines appear). Probe x-npc-fight-place (by
path): the host fights a Bleak Falls bandit while the guest reads the puppet against the record each second; the claim is the
distance under 128 at every read, the hypotheses' witnesses recorded.

### 1e. The fate re-roll's half-built 3D (the naked, headless khajiit; the host's own live 39fe1)

Facts (canon-3): rerollActor (FateApi.cpp:130-203) on the game-thread task: the clone test extraList.HasType(kLeveledCreature)
(:156, else RedressOnGameThread :160), the pick compare (:172-183, equal = redress alone), else reroll(actor, -1) (:185-186,
Offsets::Fate::ActorReroll 37323, Offsets.h:249), then `if (had3D && !Is3DLoaded) actor->Load3D(false)` (:194-196). NO IsDead
test, NO ResetInventory, NO DoReset3D or Update3DModel, NO AddWornOutfit on the re-roll branch. The engine's own caller of 37323
pairs it with ResetInventory and the trace shows the equipper after (re-npc-roll.md:494; npc-fate.md:1506-1516); nothing in the
platform touches head parts (CommonLibSSE-NG: TESNPC::headParts/numHeadParts TESNPC.h:285-286, faceNPC :275, Actor::DoReset3D
Actor.h:520, Update3DModel :633 through AIProcess::Update3DModel AIProcess.h:191 which needs currentProcess, RESET_3D_FLAGS
kModel/kSkin/kHead/kFace MiddleHighProcessData.h:39-50). The client's lateFate (actorFateService.ts:91-116) guards on is3DLoaded
alone (:101): no dead, puppet or host test, and `applied` is empty after a relaunch, so every fated neighbour the save loaded is
re-rolled or redressed, corpses included (rotfern's 19:22 lines). The record's pick does not change between sessions
(RollFateIfUnrolled refuses fromSave/IsDead/rolled, PartOne.cpp:2238-2265): "pick 37c06 against the fate's 9a549" is the engine's
own fresh roll at the relaunch's load before the fate arrived (ADR-049 measured). x-fate-dress-bleak v1 never ran; x-npc-late-3d
(GREEN 231926) proved Load3D(false) as a non-null pointer, never by its content; lab facts at hand: npc-state is3DLoaded, raceId,
worn (no head-part fact). Hypotheses, ranked: H1 Load3D(false) builds the base model alone and skips the biped pass that builds
skin (the tail), the facegen head and the wear (confirm: after a relaunch beside a killed and a living fated bandit, the
"rerolled" line, npc-state worn.length 0 or 1 against the fate's N, the screenshot headless; fix: after reroll(),
ResetInventory(false) then DoReset3D(false) instead of Load3D, the code's own Disable/Enable as fallback :192-193); H2 a stale
race's skin (confirm: npc-state raceId after the re-roll differs from the fate NPC_'s race; fix: SwitchRace then DoReset3D(true));
H3 a corpse has no process for the pass (confirm: H1's fix heals the living case and not the dead; fix: rerollActor refuses
IsDead() with a line, the body keeps the engine's roll); H4 the redress-alone branch strips a loaded corpse (against it: 29602
took it and only the khajiit broke). Order: the IsDead refusal first (one line, no RE), then H1's two calls behind the probe.
A fact from change-form's read 5 that touches this bug's neighbour: PuppetApi's Promote returns on IsDead (true for kDying as for
kDead) before EnableAI(true), so a puppet released at its death keeps its AI off for good and never completes its death (the engine
ticks fDyingTimer inside the AI update alone); the change-form apply now completes a kDying copy itself (88497c54). Whether the
re-roll's Load3D on such a copy differs from one on a kDead copy is a read for x-fate-dress-bleak v4's corpse leg.
FINDING (x-fate-dress-bleak v4, 20261104-060002 on THE CANON): a respawned LIVING copy is not dressed to its new fate even when the
respawn rolled the same pick: after kill-ref and respawn-ref 39fe4 ("stands again at its placement, rolled anew"), the copy alive
with its 3D, raceId equal, the redress-alone path ran ("the loaded clone is the fate's pick" twice), and c1.npc_state(0x39fe4).worn
was the FIRST visit's dressing [80145, 455576, 455579, 455582] against the server's fresh outfit roll. HYPOTHESIS: the copy's
stand-up (deathService's resurrect, whose inventory reset re-equips the engine's own outfit) lands after the late redress and undoes
it; v5 (sha1 91a85648) records the "resurrect 39fe4" and "redressed 39fe4" counts for the order, runs leg D twice for a pick swap's
odds, and reaches leg E. The fix shape, if the order confirms it: the redress queued behind the resurrect's inventory reset (or the
resurrect told not to reset the inventory a fate dresses), one with 1c's reconcile.
Probe x-fate-dress-bleak v2 (by path): c1 hosts the Temple, kills one campfire bandit, relaunches and comes back: the living
bandit's and the corpse's npc-state (worn against the fate's count, raceId, is3DLoaded), the platform's "rerolled" and
"redressed" lines, screenshots; on canon-3 it reads the bug, on the fix branch it claims the wear.

READ (23:28 PST 2026-11-03, 07:28Z 11-04; x-fate-dress-bleak v5 91a85648, run 20261104-070209 on THE CANON, numidium's read of c1-relaunch-080.log):
leg D held twice but no pick swapped (every leveled list at the Temple has one entry at level 1: LCharBanditOnlyNordM 0x37c28,
LCharBanditMissileNordF 0x1a346, the steps' LCharBanditMissile 0x1e770, the ambush draugr's LCharDraugrMelee* lists, six bands 1, 5,
9, 14, 19, 25; playtest 44's khajiit 29613 (37c06 to 9a549) and the 06:12Z hold's 380b5 (55944 to 55942) swapped at rotfern's level);
the run timed out at 420 s in leg E. The ORDER is read: "rerollActor(39fe4): the loaded clone is the fate's pick 1bcd8 already,
redress alone" and "redressed 39fe4 ... 4 of 4 tagged" at 23:06:44:534, then in the same millisecond "resurrected 39fe4 (puppet false,
AI was off false, dead before true, dead after false)" and two more at :535: the stand-up (Actor::Resurrect(true, true), its inventory
reset re-dressing the engine's own outfit) lands AFTER the redress, so the respawned copy wears the engine's roll, not the fate's
(v4's finding). Beside it "resurrect 39fe4 (puppet false) queued" 33 times per respawn: the live word is applied by every view update,
movement and property message while the engine still reads the copy dead, each tick queueing another stand-up. BUILT on
m3-canon-fate-inv (with 1c and the crash fix): actorFateService.lateFate holds a fate for a copy that is dead here until its stand-up
(the pending poll, PENDING_MAX_MS 120 s; a corpse whose record stays dead keeps its look, the change-form record lays it) and runs
the re-roll or redress on the living copy, the record's last word; FateApi's rerollActor and redressActor refuse a dead actor; and
deathService queues one stand-up per actor (RESURRECT_INFLIGHT_MS 2000, the mark cleared when the word and the engine agree). Probe
v6 (fc546670, server.npcRollLevel 25 so the lists have six picks) reads the swap on the canon (the bug's witness) and on this dist.
REWORKED (23:54 PST 2026-11-03, 07:54Z 11-04; b763f766, in canon-4 7b6fc953): the order is fixed where it happens. resurrectActor's task runs
RedressOnGameThread right after Actor::Resurrect(true, true), in the same task, so the stood-up copy wears the fate over the
engine's reset ("resurrected <id> (... redressed from the fate true)"); the late fate's rerollActor then handles a pick swap on the
living copy. A dead copy is neither re-rolled nor redressed (its look is the record's, ADR-065) but its inventory IS reconciled to
the record in rerollActor and redressActor alike ("the copy is dead here, a corpse keeps its look (no re-roll, no redress); its
inventory reconciled to the record"), 1c's loot on corpses. The JS dead-wait of 552e8dc1 is gone; instead a fate for a reference
the engine does not hold yet waits in pending for its load ("late fate for <id>: not in the engine yet, the redress waits for its
load"), so every loaded copy passes rerollActor once, early or late: one path. The in-flight guard stays.
READ ON CANON-4 (00:41 PST 2026-11-04, 08:41Z 11-04; x-fate-dress-bleak v6 fc546670, run 20261104-082903 on image m3-canon-4-7b6fc953 with dist 18610,
numidium): after the respawn no rerollActor line at all, the claim (the old path's two lines >= 2) red at step 64 before the
equalities. Underneath, a gap in the rework: the respawn's new fate reaches the copy while it is still dead (reconcile-only), the
stand-up then dresses it from the fate, and nothing re-asks, so a fate naming ANOTHER pick leaves the stood-up clone with its old
pick (the swap never runs). Not playtest 44's regressions (no half-built corpse, the loot the record, the apply returning), so a
known limit for playtest 45 and FIXED on m3-canon-4-followups: rerollActor's decision is one game-thread body, RerollOnGameThread
(a dead copy reconciles alone; a clone whose pick is the fate's is redressed alone; otherwise the engine's re-roll and the 3D
reloaded), run by rerollActor's task and by resurrectActor's task right after Actor::Resurrect ("resurrected <id> (... dressed from
the fate true)"). Dress v7 for that head: after a respawn the stand-up's line >= 1 plus the re-roll or redress-alone line >= 1,
then the worn and race equalities.
H1 BUILT (01:04 PST 2026-11-04, 09:04Z 11-04; Eli via numidium, verbatim: "fix the living case before 45"; m3-canon-4-followups c4539d22, the head for
playtest 45): after the engine's re-roll (37323) of a LIVING loaded copy toward the fate's pick, RerollOnGameThread runs the engine's
own rebuild instead of Load3D(false): ResetInventory(false) (TESObjectREFR.h:338, Actor's override A/Actor.h:335; its init rolls
through the detours, the fate's worn), RedressOnGameThread (the record's dress and rows), then Actor::DoReset3D(false) (A/Actor.h:520),
which flags the process's model, skin, head and face passes (RESET_3D_FLAGS, MiddleHighProcessData.h:39-50) for the next update; the
race is the resolver's own SwitchRace (re-npc-roll.md section 1, step 6). The line: "rerolled <id> through the engine from pick A
toward the fate's B (3D loaded true before; the inventory reset, the record dressed, the 3D reset for the process's rebuild)".
HYPOTHESIS until x-fate-dress-bleak v7 (by path, 900d548e: both seats in the Temple, three kill-and-respawn rounds at npcRollLevel
25 each claiming the copy alive with its 3D, the stand-up's dress line, worn == the fate's worn and raceId == the fate's race; the
engine re-roll at least once after the third; leg F the host's own late-load swap through a relaunch; screenshots from both seats
at every read) reads the swapped living copy dressed with a head. The lab driver's npc-state carries faceNode (NetImmerse.HasNode
"BSFaceGenNiNodeSkinned", thuum main), recorded in v7 and claimed in v8 once the rebuilt driver is on the seats.
CRASH ON c4539d22 (02:20 PST 2026-11-04, 10:20Z 11-04; x-fate-dress-bleak v8 bf1c8f36, run 20261104-100832, numidium's read): both seats crashed at the
Temple's login before any claim, the same equip-queue chain as 1c's three (11696 under EquipObject 38894 under the flush 39814 under
the actor-update job 41381, a BSJobs::JobThread; c1 02:10:12 PST reading 0xFFFFFFFFFFFFFFFF, c2 02:10:56; the draugr 383ec, an
Ancient Nord Sword 0x2c66f on the stack), within a second of "rerollActor(383ec): not a leveled clone, redress instead", "inventory
of 383ec reconciled to the record: 1 row(s) and 2 worn, 0 removed, 0 added, 3 kept", "redressed 383ec ... the dress unqueued", on a
copy the detours had dressed and armed at its init 3.07 s before ("1 of the server's weapons and 1 inventory row(s) written"). The
same sequence passed in 092107 with no weapon row ("0 row(s) and 2 worn, 2 kept") and the oracle's logins at party-mean passed
(092409: 22 swaps, 19 redresses on c1). With nothing removed by the reconcile, the freeing step is the redress itself on an already
dressed living copy: Actor::RemoveOutfitItems (the engine's own removal of the tagged worn entries, their lists freed and re-equips
queued), AddWornTagged's re-add and AddWornOutfit, for nothing; b763f766's "every loaded copy passes rerollActor once" made that the
common case at a cell's load. FIXED (the next head on m3-canon-4-followups): RedressOnGameThread compares the copy's worn set
(GetInventory's worn entries) with the fate's worn first; equal, no strip, no re-add, no dress, the inventory reconciled alone (a
no-op when it matches, as 100832's was); a real difference keeps the full redress: the engine's dresser's own idempotence (a tagged
entry skipped, re-npc-roll.md 8.2) by the record. HYPOTHESIS until v8 reads the Temple's load with no crash on both seats; the
equip-queue trace (lab/frida/equip-queue-trace.js) on 100832's pair would name the freed list's remover.
READ ON 3bd97f7c (02:54 PST 2026-11-04, 10:54Z 11-04; dress v8 bf1c8f36, run 20261104-104705, 18674's dist with c4539d22's image, numidium): the
Temple's login at roll 25 SURVIVED on both seats, the first such sample (the three runs before crashed a seat each): the idempotent
redress holds, CONFIRMED there (one sample). The baseline held whole, faceNode TRUE on both seats. D1 red a new way: after the kill
and the fated respawn both seats' copies of 39fe4 read alive, AI on, worn [80148, 111524, 455576, 455579] equal to the fate's, race
79686 the fate's, but is3DLoaded FALSE and so faceNode false, on c1 and c2, 25 s after the stand-up; c2's screenshot 026 shows the
campfire with no bandit: a respawned re-rolled living copy INVISIBLE. Both logs at 02:49:44: the dead copy's reconcile, the init
dress, "pinned 39fe4 to 39d21", "rerolled 39fe4 through the engine from pick 39d11 toward the fate's 39d21 (3D loaded true before;
the inventory reset, the record dressed, the 3D reset for the process's rebuild)", "resurrected 39fe4 (... dressed from the fate
true)". So H1's DoReset3D on a copy that had just stood up drops the model and the process's rebuild never comes for it. FIXED
(the next head): after DoReset3D the model is asked back through the reference's own loader (Actor::Load3D, A/Actor.h:315, the call
x-npc-late-3d 231926 read non-null) now that the inventory and the dress are the record's, and Actor::Update3DModel (A/Actor.h:633,
AIProcess::Update3DModel, which wants the process) runs the flagged skin, head and face passes at once; the line says "reloaded
true, the model passes run true". HYPOTHESIS until v8 reads is3DLoaded and faceNode true after a respawn on both seats.
FACT (10:58Z 11-04; oracle v3 3ce3a89b on 3bd97f7c's pair, run 20261104-105107, GREEN with no crash; numidium's grep): the living
re-roll is EVERY Temple login's, not a respawn's: c1.log holds seven "rerolled ... through the engine" lines at one party-mean login
(02:55:55 PST), e9986 1fd50 to 48de3, 1d219 1ff2e to 1fd50, 380b8 387c4 to 387c8, 39fe1 39d01 to 1bcd8 (44's campfire bandit),
380b5 5593b to 55943, 380b3 48de3 to 48de2, 8009e 38925 to 38920, all "3D loaded true before": the save's late joiner loads its
clones with the engine's own attach re-roll (re-npc-roll.md section 9) before the fates arrive, so each leveled actor's pick differs
from the server's and the late fate re-rolls it on the living loaded copy. On 3bd97f7c those seven would have stood invisible, and
playtest 45 exercises 9f2757a3's rebuild block at every Temple login; so the oracle reruns on 9f2757a3 with each re-rolled copy's
"3D loaded X after; reloaded Y, the model passes run Z" as the witness beside dress v8. This is also 44's 39fe1: the host's own
live bandit re-rolled at the login, naked and headless under Load3D alone.

## Status

DRAFT 2026-10-22, the night of playtest 32, before any code and before the
reference trace; nothing built, nothing run. Decided 2026-10-23 (ADR-046,
decision 1, Eli: "i want the servers roll pushed to both"): the server's roll
of a leveled or placed NPC's outfit and look is imposed on every engine, the
host's included, so the roll covers outfits and 0xff placements and the
headshot verdict matches the screens. Built as recommended (the memo's D2 to
D5: the first loader's level, the re-roll at the respawn, the ActorFate
message, formVersion 2) and, for the deaths, D13 to D16 under the design law
(20:51 PDT). Still for Eli: ADR-048, the death's authority (D1: A, B or
C-ii), which holds train-42's merge; ADR-049's acceptance; any veto of D13 to
D16. 2026-10-24 (Eli's answers, 15:49 PDT, through
numidium): D1 B (built, train-44, this doc's Server and Client), D2 a middle
ground (built as npcRollLevel, party-mean by default), D3 to D10 A, D11 A,
D12 B (built, cell-host's quitting-host row), D13 to D17 A; the merge of 39
to 44 held until 44 is staged and gated ("Hold until built").
MERGED 2026-10-24 22:23 PDT on Eli's "Merge now": trains 39 to 44 on fork
parity 8efabb10 (gate set 20261025-015916-gate-m3-train-44, eighteen green;
T2 green), the clones promoted; D2 settled as A2 party-mean, the default.
Open after the merge: the hazard evidence's lab read (a trap death), the
encounter zone clamp (docs/research/m3/encounter-zones.md), the fuller
b-npc-fate scenario; the quit crash is cell-host's row.

- [x] doc complete, inventory listed with a disposition per row, rung declared (ticked 17:02 PDT 2026-10-29 by the pass: the Inventory's 29 rows each carry a disposition; the Rung paragraph declares R0 for the roll and the death word, R1 for the host's report, R2 for the host's state, R3 for the looks)
- [x] engine surface cited or delegated (the roll sites 14374, 14752, 16129 and 16155 by `just addr` with the lab's Frida counts, re-npc-roll.md sections 1 to 8; the attach re-roll's caller 19231 and its gate, section 9, REA; the death path, death-path.md; the CommonLib lines named per field; 22:47 PDT)
- [x] server logic + T0 (the first slice: the one roll at the first loader's level, fateLevel on the record, the fate pass ahead of the engine's ring at the square change, the pin, the respawn re-roll; fork m3-train-41, CI green 2783 on fa9874f4 and 2793 on 40cf4d70 with NpcFateTest, 17:19 PDT); the death half on fork m3-train-42 59f54e92 (the body's stamp, the sweep on the game clock, the master's 240 h, the respawn funnel, the engine's essential and protected rule, the corpse as a container; five T0 cases; CI GREEN on a7a2374d and again on 5ffd078a (23:11 PDT, the mirror rule and the explicit life flag), 21:44 PDT: the unit binary, upstream's integration tests under the reset clock, the Windows client)
- [x] message + validator (same commit) (ActorFate 51, wire id 59, its validator, fixtures, C++ struct and client type in one commit, fork m3-train-41 2f0e5a84; ActorDeath 52, wire id 60, its validator and per-host budget, two fixtures, fork m3-train-44 54798208, the C++ struct e7950b98 and the client type faeb232a, 2026-10-24)
- [x] native hook + T1 (ticked 17:36 PDT 2026-10-29 by the pass: the roll detours in skyrim-platform FateHooks.cpp on 14374, 14752, 16129 and 16155 by `just addr`, their counts confirmed by lab/frida/npc-roll.js on x-npc-fate-outfit v2 20261024-002544 and x-npc-fate-pin v3 072444; T1 none, Windows-only, the trace is its proof)
- [x] TS handler (ActorFateService keeps every fate and re-rolls a reference the engine already holds when its fate is new; formView's engine-dressed rule; behind npcFate, off by default until x-npc-fate-pin; 3d224c08: the late path's lookups in the update tick, not the message handler; cc21ae6f: npcFate on unless the settings file says false, both readers, after the pin's green; the deaths' client half 3cb843a8: the dead bind with its two-second re-check, the corpse's inventory and activation block, the engine's Resurrect at the respawn, the corpse branch of the container flow; DeathReportService faeb232a, train-44: the host's death report at deathStart; 8efabb10: read from the health floor under the deferred kill, the ear that hears a fall)
- [x] T2 green (33 sessions identical with the declared divergences at 417cb746, the index compared as identity, the declarations naming forms; 09:55 PDT)
- [ ] T3 scenario green, no HYPOTHESIS tags (the template's wording restored and the box unticked 15:52 PDT 2026-10-29 by the pass's inventory, docs/private/hypothesis-inventory-2026-10-29.md: 16 tags with a named read and 18 without stand in this doc; the earlier tick read: T3 scenario green (20:13 PDT, 2026-10-24: the gate set 20261025-015916-gate-m3-train-44 on 8efabb10, all eighteen green on their last runs, b-npc-death-report 024748 among them, the death report's fall at T3; before it 09:55 PDT: the gate set 20261024-155001-gate-m3-train-43 on 417cb746, all sixteen green on their last runs, b-npc-death 162453, b-npc-loot 163014, b-npc-respawn 163304 with the re-roll; T2 green at 417cb746; gate-cite's five checks pass; HYPOTHESIS tags remaining: the over-time damage path's aggressor, the engine's reason for refusing Resurrect under AI off, named in Suppress) (x-npc-fate-pin v3 GREEN 053914, 060646, 072444: the species on both seats and both paths; x-npc-fate-outfit v3 GREEN 072041 on 43's stage 02c001ca: armor, cloak and weapon whole on both Embershard bandits; ADR-046 decision 1 at T3; committed: b-npc-death, b-npc-loot and b-npc-respawn (main 40faee46); every fate and death probe green on 43 47637942; 43's T2 and a gate set with the nine plus the seven committed scenarios run tonight for the merge's citation; by path, awaiting the stages: x-npc-death, x-npc-loot and x-npc-respawn on 42; b-npc-fate written after x-npc-death holds, rule 13))
- [ ] parity scenario green, or its later list reviewed with it (ADR-031)
- [ ] sequences and combinations green, every checklist item with its scenario (ADR-033)
- [ ] ledger and suppression registry updated

Play: BROKEN, playtest 41 (2026-11-02): bodies still freeze on the guest and the resurrection still lies (LOG 15:33 item 5);
Sven's reanimate got up on Prisoner's screen alone (16:12); the dead stay dead across the restart, "but on a cell reentry i hear
their deaths again" (break 2); c1 crashed in Sven's redress on an actor with no 3D (17:51).

## Reviewer checklist

1. Is the rung right, and is the reason for not going one rung higher real?
   (The roll, the death, the body's point, the respawn and the loot R0; the
   host's death report R1 since train-44, 2026-10-24: ActorDeath, checked by
   the server's own evidence; a hazard death's evidence the Server section's
   open trap read (x-npc-trap-report), refused and counted until that run;
   the fall checked by the host's samples.)
2. Does every address come from CommonLib, addrlib, or a Ghidra reference?
   (Headers by file:line; the roll site, the reset and the dead-at-load
   shape UNKNOWN and delegated; TE-MAP's two ids leads only.)
3. Is there any state this verb creates that is not on a rung? (The fate
   record R0; the client's fate table derived from it, R3; the engine's own
   roll before the pin, R2 observed and logged.)
4. Does the validator reject the obvious forgery (wrong owner, out of range,
   too frequent)? (ActorFate is S2C: validate_server's shape checks; the
   sighting's base 0 or a form id; no client rate is new.)
5. Does the restart scenario exist and pass? (b-npc-fate's restart leg and
   T0 3; the fate field optional, absent read as none.)
6. Are the HYPOTHESIS tags gone, and were they cleared by evidence? (H1 to
   H12 against the three probes, the reference and b-npc-fate.)
7. Is the suppression reversible on host handoff? (Nothing to reverse: the
   fate is the server's; the reset switches are session-wide and the server
   resets.)
8. Did the ledger change if a native did? (No Papyrus native; the Skyrim
   Platform natives are exports, listed in Definitions.txt with the TS.)
9. Does the Inventory list every consequence of the reference trace and the
   records, each with one disposition, and does the parity scenario's later
   list match its later rows and nothing more? (The trace r-dungeon-death is
   owed before the build; the two later rows: dead-at-start bodies, the
   killer's crime.)
10. Is every sequence and combination row green (the action again at a
    person's rhythm, each input that performs it, interrupted, both seats),
    and does every item of the playtest checklist have a scenario that does
    it the way a person does (ADR-033)?
11. Was `just fork-lint <fork tree>` clean before each fork push, and is the
    head's GitHub Formatting check green? Parity was red there from 10-15 to
    10-17 on two faults every branch inherited: Hooks.cpp formatted by a newer
    clang-format, and skyrimPlatform.ts edited without Definitions.txt.

MERGED (18:44 PDT, 2026-10-25): train-46 on fork parity c40a36a3 (Eli: "Merge
now"; gate 20261026-001639 eighteen of eighteen, T2 green; thuum main
b5a50371): the server-made actor's death by the NPC rule, E_HIT_WEAPON at
info, the corpse's occupancy released. The body's diff-only inventory and
the hosted copy's dress ride train-47, built ahead on the memo's letters.

## ADR-050 decision 2, deaths by the engine: 52's first stage reads (02:29 PDT 2026-10-27)

x-npc-death-host v3 (20261027-091759, the host kills Sven with seven landed
iron-sword hits, the server's number 1 to 0.02): Sven died on every seat
and the record, but two claims read wrong. (1) "death pending on 13491"
never printed: at one hit point the host's engine's KILL MOVE ended him
(the engine decides a kill move before the damage), 842 ms after the
seventh hit, and the server took the report on its own evidence ("ff000000
hit it 842 ms before (the engine's number outran the server's)"). Both
orders are the design's: the server's number first and the kill waiting on
the report (ADR-050 decision 2's pending death), or the engine first and
the report checked (ADR-048 B); the probes' claim assumed the first and now
accepts either. (2) The bodies lay 326 units apart: c2's rest fired
("rested at the host's spot, 329 units away") and a dead ragdoll takes no
setPosition. Fixed on fork m3-npc-death 8561473a: the puppet is placed at
the host's last sample BEFORE the kill word is applied, while it still
moves (deathService); the rest after death stays as a read. Also read: the
guest-hit path works (x-npc-death-guest v3 091346: ff000001's hits on
13491 reached the server and the record moved 1 to 0.44, four landed hits
of twelve at 7 on a base of 50; eight needed, so the probes swing thirty
and twenty-four times now), and the combat hold (start-combat on the host)
keeps a walking resident in place for the swings, where a judged approach
alone lands three seconds behind him. H-52a (the pre-kill placement puts the
bodies within 200 units) CONFIRMED: x-npc-death-host v5 20261027-095847 on
the restaged 8561473a GREEN, nine of nine claims, the one-number read after
the first swing, the death by either order, the bodies within 200 units on
both axes. The guest's probe reached 0.16 with six landed hits before Sven
fled into his house (v5 095425); v6 arms the guest with a Daedric warhammer
(two landed hits): GREEN 20261027-103226, the guest kills the host's NPC
through the cause path. The headshot probe read the headshot path end to
end on a hosted resident before its own premise held: a level shot from
150 units at Sven, circling the host he fought, took the bystander 1348c
instead and the server killed it on the claimed bow hit ("headshot:
ff000001 kills 1348c with fe01e801 on a claimed bow hit", 103638); v8
holds Sven still with the host's npc-ai lever instead of combat (a shot
needs a still target, a swing an engaged one).

52's gate (gate-m3-npc-death on 8561473a, 10:51Z; 04:46 PDT): b-npc-death
20261027-112539 red on the restart leg, read as a premise, not 52's code.
The record after the restart lay 360 units (y) from the body snapshot. What
moved it: after a restart both games log in again within the same tenth of
a second and the cell's grant is a race (c2 won it in 004553 and 112539, c1
in 061658); in 112539 c2's own game had re-settled the corpse on its cell
reload in leg 2 (from 28 units off the host's body to 63 x, 333 y and 104
lower, down the forest slope; no line of ours on c2 between the kill and
the return, so the engine's physics on the reloaded ragdoll), and as the
new host its samples of its own body became the record under R2
(OnUpdateMovement takes a dead hosted actor's samples; the 65-unit settle
was measured through the same path). 52's server diff writes no position
and its client change for a dead puppet (restBody in place of
applyPuppetPose) moves no dead ragdoll either way. Fixed on main 86d340b
in the scenario's own commit: c2 waits five squares out through the
restart, c1 alone reloads the cell and the step holds for its grant, c2
returns once c1 has it; the claims unchanged (D39 B, D40). A known limit
this run names: a seat that reloads the cell can find the corpse
re-settled by its engine (360 units on a slope here); the pre-kill
placement covers the kill moment only, since a dead ragdoll takes no
setPosition, and a host change after such a reload moves the record to
the new host's body. Playtest 35's known limits carry it; a fix in kind
has no hook, the engine re-settles the body without killing it again.

52's gate's third red (05:07 PDT): b-npc-respawn 20261027-115833, 52's own
code. After the restart the record stood again on schedule ("stands again
at its placement, rolled anew", 12:01:20) while the server loaded, before
any host held the cell; c1 logged in as host at 12:01:26 and bound a
corpse; c2's two-second check resurrected its puppet ("resurrect 85547
(puppet true) queued"), c1's never ran: 52 had put the check's
`!simulatedHere` guard on both directions ("the life check is a puppet's",
354b13c2). The kill direction is the design's (ADR-050 decision 2: the
simulating seat's engine dies from the cause and its report, the check
never kills it); the stand-up is the server's word on every seat, since the
respawn's container reaches the host of the moment and a host that logs in
after the sweep binds a corpse, as the check's own comment already said.
Fixed on m3-npc-death 774bc940 (the check resurrects any copy whose record
says alive and still never kills a simulated one; one condition, tsc clean,
no server, wire or scenario change), pushed when the gate's branch is
clear, then CI, the restage, the probes with b-npc-respawn, and the gate
again (D40: a code red with a fix in hand restages). Named, not fixed: a
LIVE copy on the simulating seat bound to a DEAD record (the engine's own
cell reset standing a corpse up on the host's re-entry, re-npc-roll.md
section 9) is no longer killed by the check while that seat hosts; the
cause path covers deaths happening now, another seat's check covers the
copy when the cell passes, and the reset case waits for a probe before a
rule (a timed bind after the kill move's window, or the server's word on
the host's report of a live actor against a dead record).

52's gate's rest (09:13 PDT): the killer after a lethal single blow. In the
rest's b-npc-death-engine (153601) and its rerun (160510) a Daedric
warhammer's 27-a-hit blow ended Sven, and the host's report said "13491 died
of unknown ..., host ff000000, killer 0: a hit the server numbered 82 ms
before; the server records the death", with his AI on and his combat started
in 160510; the stage's 123746 killed him with the iron sword's small blows
and the report named ff000000. deathReportService on 774bc940 sends
deathStart's killer when the engine names an actor and 0 otherwise, so
H-52b: after a lethal single blow (a kill move, or the one cause that takes
the engine's health to zero) the engine's deathStart names no killer, H1's
edge; CONFIRMED at T3 (x-npc-death-blow v2 20261027-181507, ten of ten: the
report named no killer and the server credited the sword hit it numbered
54 ms before; b-npc-death-blow). The server has the better evidence, its own
number's aggressor on the pending line (R0), so the credit is train 54's
code: on m3-npc-face a9e47e0e a report naming no killer after a hit the
server numbered within the window takes that hit's aggressor as the killer
(ActionListener::OnActorDeath case 0, "the killer {:x} credited from the
server's own number"; MpActor::LastHitBy picks the latest hitter in the
window, MpActor::LastKillerId reads the credit; ActorDeathTest's new case),
read at T3 by x-npc-death-blow on 54's stage (b-npc-death-engine's shape
with the warhammer's kill and the credit line claimed), promoted as
b-npc-death-blow on green. Until 54 merges a strong player's kill records
"died of unknown" on the server (the game shows no kill feed; nothing of the
fate reads the killer yet). b-npc-death-engine proves the engine-named path
with the sword (main 70da78b), as promoted.
Then rest3's 161323 lost the killer with the sword too (the pending line at
16:16:13.677 naming ff000000, the report 77 ms later "died of unknown ...,
killer 0"), where the stage's 123746 had its report 2.3 s after the pending
line as cause 4 with the killer: the engine's own kill move had ended him.
So H1 is REFUTED for the killer: the cause applied through damageActor kills
the engine's actor without recording an attacker, and deathStart names a
killer only when the engine's own kill move kills. The credit from the
server's own number (54, a9e47e0e) is the fix, not an edge. A loosening of
b-npc-death-engine's killer line to the pending line's aggressor (main
895f135) was reverted the same hour (3055859): numidium read it against
rule 13, never turn a scenario green by weakening its assertions, and was
right; the line stays strict. So train 52 ships inside train 54 as one merge
train (ADR-030): m3-npc-face carries m3-npc-death 774bc940 and the credit
a9e47e0e on parity a8d10c99, 54's gate plays every M3 scenario including
b-npc-death-engine's strict line on the build that names the killer from
the server's own number, and parity goes from 51 to 54 with 52's commits
inside. The intermediate parity at 52 is the only thing that goes.
54's stage (10:48 PDT): x-npc-death-blow v1 (20261027-174006, the warhammer)
held every claim but the credit line: the engine's own kill move ended him
first (the hit left the server's number at 0.04, the report came 537 ms
later as cause 4 with the killer, "the engine's number outran the
server's"), so the credit had nothing to do. Which path a lethal blow takes
is the engine's dice (153601, 160510 and 161323 took the server's, the
credit's case; 174006 the engine's). v2 forces the server path's report
shape without a lethal blow: two more sword swings for a numbered hit within
the 3 s window, then the host's own engine takes his health with no
attacker (the lab's npc-damage, Actor.DamageActorValue, as the cause does
when it brings the engine to zero), so deathStart names no killer and the
report says cause 0; the credit then names the hit's aggressor. Its rerun on
54's stage reads H-52b at T3.
H-52b CONFIRMED at T3 (11:19 PDT): x-npc-death-blow v2 20261027-181507 GREEN,
ten of ten, on m3-npc-face a9e47e0e: "[2026-10-27 18:17:52.188] [info] [verb:npc-fate] death report: 13491 died of unknown at (20025, -46299, -147), host ff000000, killer ff000000: a hit the server numbered 54 ms before, the killer ff0000". The report named no
killer (cause 0) and the server credited the sword hit it had numbered
within its window; every other claim of b-npc-death-engine held with it.
Promoted as b-npc-death-blow (main, its own commit). H1 stands refuted for
the killer: the engine names one only when its own kill move kills; the
server's credit covers the rest.

54's gate (12:13 PDT): b-npc-death 20261027-190413 red on the restart leg's
body bounds with the host pinned and holding (c1 hosted 9810 before and
after; c2 five squares out through the restart). The record after the
restart lay 1316 x and 687 y from the body snapshot because c1's own engine
had moved the corpse that far between the kill and the restart, from
(123718, -80883) to (124847, -81527) at the same height (10619.5 to
10618.5), and the record followed its host under R2 (to (125023, -81568) by
the read, so the body was still moving). No ragdoll slides 1300 units on
flat ground; no line of ours on c1 touches 85547 in that window (no settle,
no apply, no placement; "puppet 85547" then "live 85547" 258 ms apart at
the reconnect, the reconciler's flip while the grant arrived). H-54e: a dead
hosted actor's body moves on its host's engine after the kill word, at the
same height, at a walker's pace (10 to 40 units a second by the reads), and
the record follows; read at T3: with the promote leaving a dead actor's AI
off no corpse moves (x-npc-corpse-drift 20261027-211727: one point through
24 reads over four minutes on both seats, across a restart and the
reconnect; b-npc-death green in 55's gate 003911); the mechanism the
promote's EnableAI and EvaluatePackage on a corpse at the flip, the code
read of 12:18 PDT, the fix on parity c85dab3d.
Candidates: the reconciler's puppet flip at
the reconnect feeding the locomotion detour a speed the dead actor's graph
keeps; the engine's own movement controller running on a corpse killed by
the word with its AI on. Dynamic plan: x-npc-corpse-drift (by path, 55's
stage) polls the host's npc-state of the corpse every ten seconds for two
minutes after a kill-ref, then across a restart and the reconnect, both
seats; a drift before the reconnect blames the engine, one after it the
flip. If the drift is real, the rule in kind is R0 after the settle: a dead
record takes its host's samples for a settle window (ten seconds) and then
holds, so the body's place is the server's word wherever a host's engine
takes its copy (55 or later, with its T0 case). The scenario keeps its
fall-point bounds as asserted, since they are what caught the drift, and
adds the restart's own bounds against the record right before it (main
c6899e0, after 0977292 had re-measured the fall-point bounds against that
snapshot and numidium read it against rule 13: a re-measurement that hides
the anomaly weakens the claim). Until H-54e's read the scenario reds on a
drifting corpse, by design. H-54e's read at T3 (14:26 PDT, x-npc-corpse-drift
20261027-211727 GREEN on 55's stage, m3-npc-talk dee28c05 with the promote
fix): the corpse stayed at one point through 24 reads over four minutes on
both seats, c1's at (125306, -81256) and c2's 22 units from it, across the
kill word, a server restart and the host's reconnect (the flip that walked
190413's wolf). With the fix no corpse moves; the flip's mechanism (the
promote's EnableAI and EvaluatePackage on a dead actor) stays the one
candidate the code shows, and the fix closes the path either way. The code read (12:18 PDT): the native promote
(PuppetApi.cpp Promote) lifts the block, calls EnableAI(true) and
EvaluatePackage(false, false) on any actor, dead or alive; at c1's reconnect
the reconciler flipped the dead wolf to puppet and back to live within 258
ms as the grant arrived ("puppet 85547", "live 85547"), so a corpse had its
AI switched on and its package evaluated, and the engine's package walked
the body. That is the candidate the probe's phase b tests (a drift that
starts at the reconnect). The fix is written and held: the promote leaves a
dead actor's AI off (the block still comes off for the loot; the fate's
resurrect turns the AI on when the record stands again), a local commit on
m3-npc-face behind 54's gate, pushed to whichever branch the gate's verdict
sends it to (a restage of 54 on a red rerun, 55's branch on a green).

Train 52 merged inside train 54 (13:43 PDT): fork parity a9e47e0e, the chain
20261027-181833-gate-m3-npc-face plus its rest 202429 (verdict watch), 52's
commits in it: the engine's own deaths from the server's cause (H-52a
confirmed), the life check's stand-up (774bc940), the killer credited from
the server's own number (H-52b confirmed at T3, b-npc-death-blow), the
voice slice, the body placement before the kill. Open on this build: H-54e
(a corpse moving on its host's engine; the promote fix is on 55's branch,
dee28c05, with x-npc-corpse-drift as its read) and the engine's refusal of
Resurrect under AI off (Suppress). b-npc-headshot-host sits pending until
the lab can aim.

H-54e's fix merged (19:26 PDT): the promote that leaves a dead actor's AI
off rode train 55 to parity c85dab3d (dee28c05), read green at T3 by
x-npc-corpse-drift 211727; b-npc-death played green in 55's gate (003911).

## Watch item (2026-10-27, 52's cut gate and restage, ADR-027): b-npc-death

b-npc-death red twice on its restart leg's premise, never on a claim. (1)
20261027-112539 (52's gate on 8561473a): the record after the restart lay
360 units from the body snapshot because the restart's cell grant is a race
between the games' own logins; c2 won it with a corpse its cell reload had
re-settled down the forest slope, and the record followed its host's body
under R2. Fixed on main 86d340b: c2 waits five squares out through the
restart, c1 alone reloads the cell and the step holds for its grant. (2)
20261027-125354 (52's restage on 774bc940): the pinned host held and c2's
teleport back, issued within a second of its login, never settled (the
record written, the game unmoved for 60 s under the server's corrections).
Fixed on main c1f44fb: fifteen seconds between c2's reconnect and the move.
GREEN at 20261027-132954 on 774bc940 with every claim as written. (3)
20261027-141823 (52's gate): the server's god mode is a session flag the
restart forgot, and the pinned-host shape left c1 alone with the forest's
predators for 40 s; 86117 killed it in ten hits and D18's grace passed its
cells to c2 before leg 4 (every death and body claim before it held). Fixed
on main b8c494f: server-console TGM after c1's reconnect, after c2's and
after c1's relaunch. GREEN in the gate's rest at 154008, which played b8c494f
from main at ec7107d. (4) 20261027-190413 (54's gate on a9e47e0e): with
the host pinned and holding, the record after the restart lay 1316 x and
687 y from the body snapshot because c1's own engine had moved the corpse
between the kill and the restart at the same height and the record followed
under R2: H-54e, a finding of the build's or the engine's, read by
x-npc-corpse-drift on the next stage; the scenario kept its fall-point
bounds (they caught it) and gained the restart's own (main c6899e0). GREEN
in the gate's rest at 202429 with every claim as written, the corpse still
this time. The four reds stay the watch item, H-54e open, until the
scenario is green once more in a gate or the nightly and H-54e has its
read; then this section and gate.yaml's entry come out together.

## Train 56: the cause tops the engine up to the server's number (22:11 PDT 2026-10-27; fork m3-pt35-fixes 136ee235)

Playtest 35, Bleak Falls: rotfern's three arrow hits took 39fe2's record 1 to
0.564 to 0.1285 to 0, "death pending ... its host reports within 3000 ms",
no report, and "death by the server's word" at 04:36:37.8 while the engine's
bar stood at a quarter (Eli: "they died early"). The host's console: every
cause arrived and was queued with "attacker ff000000 (local 0)"; the
native's lines: "health 0.564 of 35.0 (engine 35.0 -> 19.7, damaged),
attacker 0", then "engine 31.2 -> 4.5", "24.5 -> 0.0", "18.4 -> 0.0": the
engine moved a quarter of each delta (15.3 asked, 3.8 taken: the
difficulty's multiplier on a player's hit, the attacker unmapped). The
archer probe's causes with an NPC attacker had landed whole. Built: the
client maps the local player's remote id to 0x14 (remoteIdToLocalId has no
form for it); the native reads the value back after DamageActorOriginal and
takes the remainder through the value owner (RestoreActorValue with the
damage modifier, Papyrus DamageActorValue's route, no multiplier), logging
"topped up"; the killer stays the first call's. Probe: x-npc-arrow-death
(the host's bow on a held Sven: the engine's death with the killer or the
credit, no server's word). H-56a (HYPOTHESIS until x-npc-arrow-death runs:
by path 2026-10-27 22:10, unrun, it claims the engine's death report and no
"death by the server's word" and records the "topped up" count; playtest
36's four engine deaths with reports inside 100 ms, item 5 ticked, are the
route under play, not the probe's read; this H-56a is npc-fate's, not
quest-stage's H-56a, answered 2026-10-29): the value-owner route to zero
kills by the engine's own health check as the console's damageav does; the
probe reads the death report.

## Finding 54 (2026-10-28, playtest 37): the reanimated thrall stood on the host alone

Eli: "i think the necromancer resurrected a skeever, only visible on prisoner..." and later "the body stands up only on
rotferns screen and fights neither". The read (21:41 PDT, a code read on the 3f tree with the live logs): the server's
resurrection branch existed (OnHostedActorState: a dead record whose host samples health above one point is respawned
alive, "isDead false" to every listener; the host's ordinary sample is the report), but on the host a dead-promoted
body keeps its AI off (H-54e, PuppetApi.cpp Promote) and under AI off the engine's own Actor::Resurrect from the
Reanimate effect's Start does not take: isDead stays true (x-npc-respawn 070508's finding, the reason
FateApi::ResurrectActor wraps the call in EnableAI(true)), the sampler keeps reading 0, hosted_state_judge drops the
sample as dead, the record stays dead, the watchers' puppets stay bodies and the thrall has no AI anywhere ("fights
neither"). Two more holes: DiedAgo is nullopt for a death before the server's start (nothing stamps a body loaded dead),
so such a body could never be stood up; and a 0xff NPC copy's live word took the players' figures' delete-and-replace
path on the watcher. The logs put the reanimation on c2's engine at 03:54:15Z two seconds after a handoff while c1 was
stale then disconnected, so the screen Eli saw it on is undetermined; the mechanism is the same on either host.

Fix, fork m3-reanimate 1a3dc981 (train m3-turbo-train-3g d384de20): the platform hooks Character's Resurrect
(CommonLibSSE-NG Actor.h:369, vfunc 0AB, written on VTABLE_Character[0] with PlayerHealthDamage's write_vfunc shape;
the player's own vtable is untouched) and, for an actor this seat hosts and not a puppet, enables the AI before the
engine's call and turns it off again only if the body stays dead; the host's sampler sends the dead-to-alive flip
reliable and never swallows it as unchanged; the server counts a death with no stamp of this process as past the grace
(T0 in ActorDeathTest); the watcher routes a server-made NPC copy's live word through resurrectActor.
H-54f, x-reanimate-host's read (by path 2026-10-29 13:55 for the pass train's stage, RUN five times on 2026-10-30: v2
20261030-125920 red on its premise, the Papyrus kill refused E_DEATH_UNCHECKED and the record stood Hilde back up; v3
133744, the driver's Spell.Cast never crossed the client's cast hooks; v4 135637, the bolt hit Sven; v5 145135, the bolt
hit nothing; v6 20261030-152542 GREEN seven of seven on the union a4541cd0, the host's engine standing her up 7 s after the
relayed cast, the record's death cleared, alive on both seats; its claims the server's host-cast line and the record alive
within 15 s, the c1 log-count recorded since v2; settled 19:26 PST 2026-11-02): CONFIRMED in its outcome (x-reanimate-host v6
20261030-152542), the kProcessMe bit (what EnableAI writes) is what blocks Resurrect on an AI-off actor: c2's line
"resurrected 35534 (puppet false, AI was off true, dead before true, dead after false)" (FateApi::ResurrectActor on the
non-host's unflagged, AI-off copy at the live word, the AI enabled around the engine's Resurrect) against x-npc-respawn
070508's refusal with the AI off (the pair 070508 and 075756 read first, above); the bit against the rest of AI-on is still
the static read (Hooks.cpp's comment: 37321 holds no AI check). The c1 log-count of the hook's line, recorded 0 in 152542
(`c1.log_count("resurrect 35534")`), can never read this probe: the hook writes its line only for an AI-off hosted body
entering slot 0AB, the host's kill-ref body kept its AI on (152542 step 20: aiEnabled true, isDead true), and the Reanimate
effect's Start reaches the body through its own function, never through the slot (34750 and 38820 in
docs/research/m3/re-resurrect-hook.md, a static read); the shipped wording is "resurrect <id>: hosted body, AI enabled for
the engine's own resurrection (life state before N, after N)" (ActorState: 2 dead, 0 alive), not the one first written here.
HYPOTHESIS H-54g (the same five runs cannot read it, for the same reason: the record flipped on the host through the
Reanimate effect's own function, so the line's absence names no other owner): nothing else owns Character's slot 0AB
(Hooks.cpp's SKSE lesson); the read is a Papyrus Actor.Resurrect or the console's ResurrectActor on an AI-off hosted body
this seat does not puppet, with a log-count of the shipped line: its presence shows the slot 0AB hook fired, its absence
with the body stood names another owner for the re-analyst. Open: a reanimate inside the 3 s
grace after the kill word is dropped as in flight and the stood-up sample goes once (a re-send while the record says
dead is the follow-up); activation stays blocked on the host's reanimated actor; the engine's a_resetInventory on a
reanimate against the record's kept inventory.

### Reanimation is any player's, on any body (Eli, 23:25 PDT 2026-10-28)

Eli, verbatim through numidium: "anyone should be able to reanimate any corpse, that's Just Gameplay". So a reanimate
cast by any player on any body stands it on every screen whichever seat hosts the body's cell; rotfern's casts on the
bodies in Prisoner's hosted cell (finding 63) are the required case, not the design's gap. The mechanism is the
engine's own path, which the pieces already outline: the server accepts the caster's hit (it did), the relayed cast on
the HOST's seat makes the caster's figure launch the same spell at the body on the host's engine (castSpellImmediate,
with the launch geometry since fork m3-npc-launch-geometry e5bae766), the Reanimate effect runs there, the Resurrect
hook of 1a3dc981 stands the hosted body, the host's sampler reports it alive, the server flips the record and every
puppet stands. Tonight's zero platform lines on c2 say one of three links failed: the relayed projectile never hit the
body on c2, the effect did not apply on the host's engine (the magic model keeps effects the server's),
or the hook never fired (H-54g); Prisoner's
own cast on a body he hosts separates the hook from the rest. If the relayed projectile proves unreliable, the server
tells the host's seat outright to cast the accepted reanimate from the caster's figure at the body (an SpSnippet,
Spell.Cast on the host's engine), deterministic and still the engine's reanimation, with the level cap and the thrall's
duration the engine's on the host; the thrall follows the caster's figure there. The server side stays R0 for the
record's life and R2 for the thrall's behaviour.

### ADR-060: a reanimated NPC is its commander's game's for the effect's life (16:45 PST 2026-11-02)

Playtest 41, Eli, verbatim: "when i killed sven and reanimated him, the animation only played for prisoner even though rotfern
cast the spell" and "weird reanimating sven just puts him back on his normal path"; the decision "and yes go with A". The
snippet above (the server's own Spell.Cast on the body's host, CastReanimateOnHost) ran the Reanimate effect in the HOST's
engine with the caster's figure as the commander: the get-up and the shader played there alone, and a commanded actor whose
commander is a figure (no intent behind it) fell back to its packages. Built on fork m4-reanimate-claim 2dc75ab6 (server
only): the accepted reanimate hit claims the body for the caster's seat (the caster when a user plays it, else the caster's
host) through the cells rule's new commanded claim (wire-rules cells.rs FollowKind::Commanded beside ADR-052's Claim;
claim_commanded with the lease the effect's EFIT duration plus 10 s, 0 for good; release_any_claim at the thrall's death in
PartOne::OnDeathState, the commander's departure in gone(), or the lease in tick()); UpdateHoster is the word, so the caster's
puppet of the body becomes its live actor and the former host's live actor becomes a puppet; the snippet and RelayCast's skip
of the body's host are gone, the former host hears the relayed cast as any cast's look. Lines: "[verb:npc-fate] reanimate
<spell> by <caster> on <body>: <commander> commands it for <N> s (ADR-060)", "<body> died under <commander>'s command: the
claim ends, <simulator> simulates it (ADR-060)", E_COMMAND_UNLOADED. T0: NpcFateTest's reanimate case on the claim (the
caster's seat simulates the body from the hit, both games hear the word, no snippet, the relay reaches the host, the body's
death ends the claim; the host's own cast keeps the body its own), cells.rs's commanded test (the lease, the death, the
departure, a dialogue claim giving way).

HYPOTHESIS H1 (ADR-060): the former host's engine, whose copy of the body is a puppet (AI off) from the grant on, does not
stand its copy by its own effect from the relayed cast; the copy stands by the server's live word and follows the stream.
HYPOTHESIS H2 (narrowed by the platform's code, the same evening): the commander's own engine applies the Reanimate effect at
its hit on the dead puppet before the grant arrives; Hooks.cpp's HostedResurrect gate takes only a hosted body with its AI off
and never a puppet, so the engine's reanimation (38820) runs on the puppet copy with its AI off (finding 54's "stands but gets no
npc"), the grant's promote turns the AI on, and the commander's first live sample stands the record inside the reanimate window
NoteReanimateAccepted opens at the hit. On paper no re-cast at the grant is needed; what the probe reads is the race between
the puppet's deferred kill (a puppet standing against a dead record) and the grant's arrival, one round trip after the hit. HYPOTHESIS H3: the deaths2 client's released-body branch (AI off 4 s through the
ragdoll) races the grant; the reconcile must read the server's word over its own dead branch. Probe x-reanimate-claim (c1
kills a c2-hosted resident, c1 casts Reanimate Corpse at the body: the claim line and the UpdateHoster pair, c1's actor mine
and alive within 3 s, c2's puppet Resurrect, npc-state isDead false on both, the thrall's server distance to c1 shrinking as
c1 walks away, hosting back to c2 at 60 s plus the margin), then b-reanimate-claim in its own commit.

## The non-host's loot at M3's exit (D71, 14:29 PDT 2026-10-30; c-dungeon-enemies on the union b8a9d4c6)

RED three times (210543, 210957 relaunched, 211413 cold) at claim 5's first menuOpen: c2, the puppet seat and the killer, activates
the body and the server admits it (OpenContainer, "onOpenContainerMesage - waiting for 'ContainerMenu open' (a corpse) to be
true" on c2), but the engine never opens the menu and the handler gives up at 15 s and sends the closing activation; the driver's
Activate answered false. c2's body: "promote 39fe4: dead, the block lifted and the AI left off (npc-fate H-54e)" at the death
(14:17:32), nothing of ours touches it after. The host's engine opens the same body (b-npc-body-release's cold run, 18:56). The
scenario also counted the single-occupant lines D52 removed; its claim 5 is amended (its own commit) to read D52's path as
b-npc-body-release's. HYPOTHESIS, the read x-body-open-guest v1 (by path, sha1 e4031424; the server's kill of 0x39fe4 and c2's open;
the host's console kill of 0x39fe2, the engine's death by the host's report, and c2's open; then c2's npc-ai on the body and a third
open) separates: H5, an actor with its AI off takes no activation even dead (then the fix is the AI on at the release once the body
rests, or at the server's OpenContainer, with H-54e's stand-up re-read); H1, the death never completes on a puppet (then the fix is
the kill path's completion on the puppet seat). The scenario is pending (lab/gate.yaml) and M3's exit stays open until the fix's
gate plays it green; playtest 39 carries the guest's loot as a declared limit (playtest 34's state). Noted beside it: after the
death the host kept receiving causes for the dead body from the guest's late swings (c1's "cause on 39fe4: health 0.000 ... attacker
ff000ceb", one per hit for 50 s), the server's OnWeaponHit at 0 -> 0 each time; harmless, a bound for a later train.

The host's own open, read from b-npc-body-release's rest-set reruns (15:03 PDT 2026-10-30; 214710 and 215006, red at step 26, the
scenario pending 428a2ee): c1's engine opened the body's menu itself (menuOpen true at +4 s) and the handler's admission line never
came within the step: on the host the engine's native activation opens the ContainerMenu at once and the game pauses in it, so
onOpenContainerMessage's first `Utility.wait(0.1)` (game time) stalls until the menu closes; the "waiting for 'ContainerMenu open'
(a corpse) to be true" line prints after the close (the first sweep's cold run: 18:56:01.6 the activation, 18:56:08.4 the line),
the checker then finds the menu closed, waits its 15 s and gives up ("gave up waiting ... releasing the occupant"), and only then
sends the closing activation. So on a host the occupant release runs 15 s late, the "menu closed" line never prints, and the
admission line is not a fact of the open's moment. A client defect, not the scenarios' premise: the fix rides the guest-loot train
(the first wait as `Utility.waitMenuMode`, or the checker's loop entered without the game-time wait), the same file as the
guest's open; the two scenarios' host claims (330124b, a8cd208) are re-timed with that train (the admission line after the close,
the closing activation at the close), their reruns the train's gate. Before D52 this delay held the body against the other seat
for 15 s after the looter closed it: playtest 34's "the non-host can't interact with the body" had this second cause beside the
corpse's missing release.

The guest-loot train begun (15:04 PDT 2026-10-30): fork m3-guest-loot off parity b8a9d4c6, first commit 647674ec (tsc clean, local
until the physics train has staged): remoteServer.ts's open-container handler takes its first wait as `Utility.waitMenuMode(0.1)`, so
on the host the checker sees the engine's open menu at once and the close sends the closing activation instead of the 15 s give-up;
the two scenarios' host claims (the admission line within the step, the closing activation at the close) read this behavior as
written. The guest's open (D71) joins the branch once x-body-open-guest v2 names H5 or H1.

D71's read and fix (15:08 PDT 2026-10-30): x-body-open-guest v2 (215922) GREEN, H5 holds. Leg 1 (the server's kill) and leg 2 (the host's
console kill, the engine's death and the host's report): the guest's Activate false, the body dead on c2 and the server, no menu. Leg 3
(npc-ai on the body of leg 2): Activate true, the menu open, the body 45 units off within 5 s (H-54e's walk). Leg 4 (the AI on leg 1's
body): the driver's Activate false yet the menu open, the server's path (the handler's activate with default processing) opening it.
So a released body takes an activation only with its AI on, the player's E and the handler's alike. The fix (fork m3-guest-loot
f3e484b9, tsc clean, unpushed until the physics stage): onOpenContainerMessage switches a dead NPC's AI on before its activate, polls
the menu in menu mode (the open seen while the game pauses), and switches the AI off at the first open or after 2 s, one trace line
each way ("body X: AI on for the server's open (D71)", "body X: AI off again, the menu is open (D71, H-54e)"); the game pauses in the
menu, so nothing walks while it is open, and the bracket bounds the walk to the open's own frames. The promote's dead branch keeps
the AI off (H-54e's no-drift rule). Its probe x-body-open-guest-fix v1 by path (cb798c4c, 73 steps): both kills, the guest's menu
within 4 s with the two lines once per body and the AI off after, then the host's open after the guest's close with its handler line
inside the step (647674ec) and no second occupant counted. The train's gate: c-dungeon-enemies, b-npc-body-release and this probe
(b-body-open-guest promoted on green); M3's exit closes with it.

x-body-open-guest-fix v1 (041249, 21:18 PDT read; the guest-loot stage, m3-guest-loot f3e484b9, dist 14946) RED 1 of 5 at step 28: the
fix fired ("body 39fe4: AI on for the server's open (D71)" at 04:15:38.085, the handler's "waiting for 'ContainerMenu open' (a corpse)"
in the same millisecond), the menu never opened, no later handler line came within the run (the 2 s off line should have), and the
dump read the body's AI off. Two candidates: the enable and the activate in one frame, the engine taking the AI state a frame later
(v2's green read had the lab's npc-ai seconds before a separate activate); or the enable never took (the dump's off with no off line
of ours). The fix's v2 (fork m3-guest-loot, the head after f3e484b9): the AI state logged at the switch, the activate deferred to the
next update callback with the state logged right before it, and the state logged at the off; a read either way. D69's stage takes
the lab while it builds.

The fix's v2 (ca5b93d2) RED twice (22:03 PDT read; x-body-open-guest-fix 045522 cold, 045859 relaunched, step 28 alone): the AI read
TRUE at the switch, the "one update later" line printed in the switch's own millisecond (a once('update') registered inside an update
callback runs in the same pass), so the activate still landed in the enable's frame and the menu never opened; at the dump the AI read
off again (whether by our deadline's off or another hand is the next run's question: the off line's presence in 045522's console).
The server sent OpenContainer each time and logged nothing about the body. v3 (3dc03d98, pushed): a real latent beat between the
switch and the activate (await Utility.waitMenuMode(0.2), which runs while paused), the AI state logged right before the activate,
the off deadline 3 s. In x-body-open-guest v2's green leg the lab's npc-ai had switched the AI on seconds before a separate activate,
so the beat the engine needs is somewhere under five seconds and above a frame. D69's restage takes the lab while v3 builds.

The loop's death (22:06 PDT read, numidium's grep): in 045522 and 045859 the "AI off again, no menu within 2000 ms" line printed in
neither, so the handler's loop never iterated after the activate; the AI's off at the dump is another hand's (unread). Two observations
frame it: the handler's first wait, Utility.waitMenuMode(0.1), resolved on the guest with no menu open (the handler ran 220 ms after
the activation), and in x-prop-push v9's console Skyrim Platform logged "onResult called: Utility.waitMenuMode (call 1)" at the give-up
while the 150 iterations of the loop's Utility.wait(0.1) logged nothing: Utility.wait is Skyrim Platform's own frame wait, waitMenuMode a
VM latent. HYPOTHESIS (the next run's onResult lines decide): a second VM latent from the same handler never resolves on the guest, or
waitMenuMode advances only in menu mode past its first call. v3 (3dc03d98) put the beat on waitMenuMode too and would have hung before
the activate; superseded before any run by v4 (75d6e631, pushed, the restage's head): the beat Utility.wait(0.15), the open-poll back on
Utility.wait(0.1) as the original loop (its 15 s give-up printed on schedule in earlier runs), the first wait alone in menu mode for the
host's open menu. Under the game-time poll a guest's menu, once open, pauses the game and the poll resumes at the close, so the AI's
off for a guest's open lands at the close (nothing walks under the pause). The probe stays cb798c4c.

The fix's v4 (75d6e631) RED twice (22:40 PDT read; 053012 cold, 053335 relaunched, step 28 alone): the activation went out, the AI
switched on ("reads true at the switch"), and the handler never logged again: no "after the wait" line, no error; c2.log's only latent
completion the handler's first waitMenuMode, 58 ms before the switch. With v2's stall two awaits after the switch and v4's at the first
(a game-time Utility.wait), the kind of wait is not the fault: after enableAI(true) on the released body this handler's next await
never resumes, whatever it awaits, while cast-action and npc-stream keep logging. A second pattern, kept: "Trying to get server mods,
attempt 2" after a "Request/parse error ... Could not establish connection" 13 to 15 s after the switch in every run. v5 (d1fefeef,
tsc clean, local until D69's merge): a released body's open runs on the TimersService with no await after the switch (its callbacks
run inside the game's update when the player exists): the switch and its read; a 150 ms timer that activates and logs the activate's
return; a 100 ms poll for the ContainerMenu; at the open the AI off ("AI off again, the menu is open") and a poll for the close that
sends the closing activation ("closing activation sent, the menu closed"); with no open within 3 s the AI off and the closing
activation as the give-up. The other paths keep the async loop, which now has a catch that logs a throw. The probe (x-body-open-
guest-fix v2 by path) and the two pending scenarios (c-dungeon-enemies, b-npc-body-release, their own commits) read the guest's
admission and release through these lines; the host's open, its body never a puppet and its AI on, keeps the generic handler's lines.
D69 merges alone meanwhile (numidium: a restage of 6dbabc7a, its gate always plus b-quest-rumor, b-quest-stage, b-story-arrival plus
watch, T2 beside); the union m3-pass-train-4 is re-cut on v5 after.

The fix's v5 (60f6c296, parity 6dbabc7a merged in) RED twice (00:1x PDT 2026-10-31; x-body-open-guest-fix v2 aba01c6f, 065444 cold,
065821 relaunched, step 28 alone; numidium's read): the timers path ran whole, "AI on for the server's open (D71); reads true at the
switch" at 07:00:20.015, "AI reads true after 150 ms; activating" at .150, "activate returned false" at .151, the 3 s give-up and the
closing activation after; no menu. The one green read of H5 (x-body-open-guest v2 215922, leg 4) had the lab's npc-ai switch the AI on
five seconds and more before the server's open took the body's activate; v1, v2 and v5 all activated within a frame to 150 ms of the
switch. HYPOTHESIS (v6's run decides): the dead actor's process wants more than 150 ms after EnableAI before it takes an activation (the
engine's own promotion of the actor's process, not a flag our switch sets). v6 (m3-guest-loot 19e8c397, pushed 00:09 PDT): the activate
retried every 200 ms for up to 5 s after the switch, each return logged with the body's state ("activate returned <bool> at +N ms
(attempt K; AI, dead, 3D, health)"); the first true, or an open ContainerMenu regardless of the return, starts the menu poll as v5; the
refusals to the deadline switch the AI off ("the activate refused K times over N ms") and release the occupant. The time of the first
true is the measurement; a run of refusals falsifies the hypothesis and sends the read to Actor::ActivateRef (rule 8; the re-analyst
on sky-re, CommonLibSSE-NG TESObjectREFR.h:367 names it). The probe stays aba01c6f.

v6 GREEN (00:5x PDT 2026-10-31; x-body-open-guest-fix v2 aba01c6f, 20261031-074043 on 19e8c397's stage, a cold run; numidium's read):
the engine takes a released body's activation about 2.1 s after its AI is switched on. c2's lines: the switch at 07:43:36.379 ("reads
true at the switch"), nine "activate returned false" at +164, +384, +608, +818, +1027, +1271, +1475, +1690 and +1904 ms, each with
AI true, dead true, 3D true, health 0, then "activate returned true at +2127 ms (attempt 10)", "the ContainerMenu is open" 54 ms later,
the AI off, and "closing activation sent, the menu closed" at the close. MEASURED once; H5's hypothesis stands (the engine's own
promotion of the actor's process after EnableAI, not a flag of ours), the beat between 1.9 and 2.13 s here, the gate's reruns adding
samples. The cost a player feels: a guest's body opens about two seconds after its E; a known limit of this slice, named in the
checklist. A later refinement, if the lag matters at turbo 2: the AI on at the body's release instead of the open, with H-54e's drift
(45 units in 5 s) as its price. M3's exit gate runs on v6 (c-dungeon-enemies, b-npc-body-release, b-npc-loot, b-npc-death-report,
m0-inventory, a-activation-reach, a-sleep, always, watch; T2 beside).
