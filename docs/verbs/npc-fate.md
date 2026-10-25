# Verb: npc-fate

DRAFT. Drafted 2026-10-22 (M3's fifth verb, docs/PLAN.md:977, :1052-1053)
from ADR-035 point 6 (docs/DECISIONS.md:1302-1308), ADR-045 (:2297-2377),
the rows npc-puppet carried here (npc-puppet.md:101, :103, :106, :135),
npc-stream (:49, :53-54, :87) and npc-handoff (:14-15), the prior art
(docs/research/m3/tes3mp.md Q6, :214-247; docs/TE-MAP.md:72, leads only) and
a code read of the fork at the puppet worktree's head 8eafa85d (train-34,
off parity fb6f3f09; every fork path below is at that head), the night of
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

## Why now: playtest 32's three readings (2026-10-22, fork parity fb6f3f09)

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
| the placement resolved to one actor at the cell's attach: the engine picks from the LVLN's entries by level (TESLeveledList::CalculateCurrentFormList, TESLeveledList.h:65; iLevCharLevelDifferenceMax, TESLevCharacter.h:49) and writes ExtraLeveledCreature (originalBase, templateBase; ExtraLeveledCreature.h:23-24) with Actor's kLeveledActor change flag (Actor.h:238) | record, code | imposed: the server rolls once per placement (R0, LeveledListUtils.cpp:71-123) and the game pins the server's base on the engine reference before its own roll (Impose A, H1) or swaps it after (Impose B, H2); both HYPOTHESIS |
| the roll's inputs: the player's level and the zone's bounds (ENCOUNTER_ZONE_DATA minLevel, maxLevel, BGSEncounterZone.h:22-25; the locked zoneLevel, :37), the list's chanceNone or its global (TESLeveledList.h:60, :70, :76) | record, code | imposed: the server's rule (Authority: the first loader's recorded level clamped by the zone; today's level 0 as the alternative); the engine's lock of the zone level at the first attach is H3; the server reading a chance-none global as 100 (LeveledListUtils.cpp:35) against the engine's global value (TESLeveledList.h:60) is a defect to fix with a T0 oracle (H12) |
| an NPC_ whose template chain reaches a LVLN (the forest predators' placed NPC_ 0x1e7a0, its template the LVLN 0x42297; x-npc-fate-roll 232048), rolled per game by the engine and once on the server (templateChain, MpChangeForms.h:119; LeveledListUtils.cpp:189-199) | code, record | imposed: the same pin, with the chain's leaf as the base; the client's dead getLeveledBase path (formView.ts:154-175) retired |
| the actor's inventory and outfit, their LVLI entries rolled by each engine at the reference's load (kLeveledInventory, TESObjectREFR.h:156) and by the server at level 1 (MpObjectReference.cpp:1982-1999, :44) | record, code | imposed: the server's inventory is the body's container (R0, the CONT shape, Server); the engine's own roll on the body never reaches a player: the menu lists the server's list (H4); and the WORN roll matters alive too (playtest 33, 2026-10-23): the headshot's helmet check reads the server's worn list, which each engine's own roll contradicts on screen (seven refusals for a hood nobody saw, docs/verbs/headshot.md), so the roll decision below covers outfits and server-placed 0xff actors, not placements alone |
| the death item (INAM, TESActorBaseData.h:126) rolled at death | record, code | native on the server already (EvaluateDeathItem, MpActor.cpp:1796-1857; AddDeathItem from Kill :1932); nothing new |
| the death on the server's own number: a hit the server computed takes health to zero (SetPercentages, MpActor.cpp:889-897, Kill(aggressor) :896; SetPercentage :855-866), a headshot (PartOne.cpp:2060-2063), a scripted kill (ClaimScriptedKill :1905-1912), the console (ConsoleCommands.cpp:255-268) | code | native: R0 as today; Kill (MpActor.cpp:1911-1933) records isDead, tells the listeners (DeathStateContainer 18) and fires onDeath; this verb changes what onDeath arms (Server) |
| a death the server has no number for: a fall, a trap, an NPC killed by an NPC on the host, a script (the host's engine shows it dead; the host's health report of 0 floors at one point and logs, npc-stream.md:49) | code | suppressed this slice: the record stays alive at the floor and the host's deathStart or TESDeathEvent is counted (Observe, H5); the decision between TES3MP's authority word (R2, tes3mp.md:228-229) and a server-checkable cause is Eli's (Authority); measured 2026-10-22 (x-npc-death 20261023-051540 on parity 7e59c32c): Actor.Kill with the seat's player as killer did nothing to Sigrid 0x13483 on her host (isEssential and isProtected false on both seats), and the cause is the client's by design: formView.ts:323-327 starts a deferred kill on every actor it views with no isMine gate, the host's own live residents included, so no kill by this client's engine lands on a hosted NPC and the floor holds (health 0, alive) until the server's number; the npc-damage read (x-npc-death 20261023-054215): the host held her alive at a health of -128.87% (the engine's deferred kill, StartDeferredKill is the engine's own Papyrus native, FunctionsDump.txt:3863) while her puppet on the other seat, under the same deferred kill, took the relayed number through movementApply.ts:233-247's damageActorValue step and DIED (isDead true, the body in the garden): dead on one screen, standing on the other, playtest 32's "definitely some desynced NPCs" in one measurement; which engine path kills a deferred-kill actor whose AI is off is the Dynamic question below, the fix shape is train-35's (npc-puppet.md: the host's report clamped to [0, 1], the validator refusing outside it, the puppet apply never below a sliver), and the floored host actor itself, alive and acting at -128%, is the decision this row asks of Eli |
| the death played: the death animation or ragdoll (KillImpl's ragdollInstant, Actor.h:468; deathStart, deathEnd events), the kill move, the dying line | trace (owed), code | native on every game, from the server's word: deathService.killActor (deathService.ts:141-153: endDeferredKill then kill) on the engine reference; a puppet's graph ticks (npc-puppet), so the death plays on it (H10); the host's own live actor takes the kill too, Rule A's one declared exception (Authority, H11) |
| the body's resting place: the fall from the standing point by each game's physics; the engine keeps a dead actor where it lies in the save | code | R0 for the standing point at the kill (the record's position, the host's last accepted sample under cell-host's bounds); R2, declared, for where it rolled: each game's fall from that point (H6); a reload places the body at the record's point and kills it at once (Impose), TES3MP's instant death (tes3mp.md:238-240) |
| looting the body: the engine opens a dead actor's ContainerMenu on activation; the take enters the player's engine inventory and is reported (containersService.ts:19-73) | code | imposed: a dead actor's activation runs the CONT branch on the server (occupancy, the "inventory" property, OpenContainer; MpObjectReference.cpp:1544-1569) so TakeItem and PutItem (:642-668) hold and the item moves on the server's record (R0); the body's list applied before the menu opens (H4, H7) |
| the actor's OnDying and OnDeath Papyrus events and the story manager's kill event (quest progress, a clearable location's boss) | record (VMAD) | native on each game that applies the kill, R3 declared: quest state is unsynced until M4's quests verb; the location's cleared state with it (Server: the uncleared reset time alone this slice) |
| the engine's cell reset: after the detach time plus iHoursToRespawnCell (or iHoursToRespawnCellCleared; the zone's kNeverResets, BGSEncounterZone.h:14; gameData detachTime, attachTime, resetTime :34-36; ExtraDetachTime.h; TESObjectCELL's kDetachTime change, TESObjectCELL.h:151) the engine deletes the body, re-rolls the placement and resets inventories (ResetInventory(a_leveledOnly), TESObjectREFR.h:338) | record (the GMSTs), code | suppressed on every game (Suppress, H8): the server resets, the engine never does |
| the respawn: the actor back at its placement after the reset time, a fresh pick from the list (the engine's reset re-rolls a leveled placement: H9a), full attributes, the base inventory | record, code | imposed: the server's schedule on the shared clock (R0, Server), applied in the game as disable, base, enable (Impose, H9) |
| SkyMP's respawn after spawnDelay 25 s at GetSpawnPoint with the base inventory re-added (MpActor.cpp:1935-2007; DeathEvent.cpp:65-70; MpChangeForms.h:117) and the respawn of a dead record at load (MpActor.cpp:820-824; PartOne.cpp:375-378 for players) | code | suppressed for game-file actors: the fate's schedule replaces the timer and the load-time respawn; players keep theirs (m0-death) |
| the loader's skips: dead-at-start placements (kStartsDead, TESObjectREFR.h:177; WorldState.cpp:471-480, "TODO: Load dead references") and initially disabled ones (:492-507) | code | later: a second slice makes a dead-at-start placement a server corpse (Bleak Falls' floor bodies are lootable content); this slice keeps them skipped, their loot each game's own, named as a gap |
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
  (counted, never applied, H5). R3, declared: each game's death camera and
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
- Side effects of hooking here: HYPOTHESIS (the death event's timing against
  the host's last sample; the sighting read's cost at 64 entries).

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
- Side effects: HYPOTHESIS (H1, H2, H4, H6, H9, H10, H11).

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
through while the npcFate switch is off (since 3aabd51e, 22:46 PDT, only
when the settings file says false: the pin held at T3, x-npc-fate-pin v3
GREEN 053914) or the reference is unfated. No Papyrus native is added (the exports are
Skyrim Platform's, as setPuppet is); docs/NATIVES.md unchanged. The lab
reads the server's side through mp.get(refrId, "actorFate").

Registry, train-42 (20:54 PDT), the deaths: on the server, the player path's
25 s wall respawn never touches a game-file actor (RespawnWithDelay's branch
schedules the fated respawn instead), and the server's number floors at one
point for an essential base, or a protected one not under a player's hand
(MayDie). On every seat, a game-file body's activation is blocked at the
death (deathService; a dead puppet promoted at a handoff keeps it,
puppetService 32dffbda), so the engine's own loot menu never opens: the
server's OpenContainer with default processing is the one that does; the
engine's own cell-reset resurrection of a corpse on a re-entry
(re-npc-roll.md section 9, the 19286 path) is undone by the view's
two-second re-apply of the record's death. Registry, train-43 (23:56 PDT, fork m3-train-43 962fc913, stacked on 42,
built ahead of Eli's D17): the hands. A third detour, on the container-path
adder 16128 (re-npc-roll.md section 11: InitLeveledItems' per-entry roll
14751 carries no owner; this adder does, the outfit argument null on the
container path), drops a fated owner's engine-rolled WEAP rows (the base's
weapon list, section 10) and writes the fate's worn weapons in their place
once per init pass, then lets the original tag them as the engine would;
the dresser 418622 equips the server's weapon as its own best pick, so no
forced equip and nothing to re-evaluate. Gold and loot rows stay the
engine's (the corpse's menu is the server's inventory). CONFIRMED at T3
(00:31 PDT): x-npc-fate-outfit v3 GREEN on 43's stage 962fc913 (run
20261024-072041), the worn equality whole on both Embershard bandits at 20 s
and again at 60 s (0xB6FE4: IronWarAxe 0x13790, hide boots 0x13910, studded
cuirass 0x1B3A2, bandit gauntlets 0x6F39B, the WIC cloak 0xE00DB79; 0xB6FDB:
hide boots, SteelSword 0x13989, ArmorBanditCuirass2 0x10594D), the races
79684 and 79688 equal to the fates; x-npc-fate-pin v3 GREEN on the same
stage (072444). Declared gaps: the sleep outfit (above); a protected base under a player's over-time damage (a poison, a
cloak: ModifyActorValuePercentage carries no aggressor) keeps its point,
the hit's own number kills it (HYPOTHESIS whether any over-time effect
reaches an NPC's health that way at all); the cleared hours and the
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
- Side effects: HYPOTHESIS (H8; a mod's own cell-reset scripts, if any,
  reading the GMST).

## Message contract

Built, the server half (train-41, fork m3-train-41 818287c3, 2026-10-23 15:05
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
roll (ADR-049 decision 1). The client half followed the same day (below). CI: pipeline 2783 GREEN on 510f190c (16:47 PDT), the server with its unit tests (NpcFateTest included) and the Windows client with the detours. A placement whose
chain ends at an LVLN with no pick (the server's chance-none) keeps the
head as its pin today, HYPOTHESIS until the engine's behavior for it is read.


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
  train (597bb9dc the wire, dd285ad9 the server, 6e827918 the client). The
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

Built, the deaths (train-42, fork m3-train-42 645f9344 the server, 95abf0dc
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
leaves the shared world alive. Then (d908abca, 20:46 PDT): the hours are
the master's GMST iHoursToRespawnCell, 240 (record 0xD3646; the cleared
0xD3647 is 720, for the quests verb; numidium's esm.py read on sky-srv),
through libespm when the world has the master, the setting first, the
compiled 72 last (D13, T0 pins 240); MpActor::Respawn is the one funnel that
clears the body's stamp and its due entry (the console's Resurrect and the
lab's respawn-ref pass there), so the next death counts from its own day.
008c8883 fixes the Catch2 chained comparison both builds of 645f9344
refused. A contract change (21:35 PDT): the gamemode's per-actor spawnDelay
times players alone now; a game-file actor's body keeps to the reset clock
whatever spawnDelay says, so upstream's two integration tests that killed
the mudcrab 0xDC558 with spawnDelay 0 and waited a millisecond
(test_isdead, test_partial_location_save) moved to npcRespawnHours 0.0001
in their settings and a wait spanning one sweep; a gamemode wanting an
instant respawn calls the console's Resurrect or the lab's respawn-ref. Owed: the JSON round-trip T0 and MayDie against a master flag, the
restart scenario as b-npc-fate (rule 13, after x-npc-death holds), the
cleared hours (the quests verb), kNeverResets zones (libespm reads no ECZN:
every cell resets). The lab's grammar (numidium, lab main eb4592aa):
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
  and respawn-ref {formId} (lab/gamemode/gamemode.js:421-431's shape), the
  server's own kill (ConsoleCommands.cpp:255-268's ExecuteKill) by id; the
  scenario's kills are the person's (a bow), the probes' these.
- Settings: `npcFate` (the kill switch), per server, beside npcEnabled
  (ADR-035 point 9, the run's own setting); off is today's behaviour, every
  path above untouched.

Built, the death report's judge (train-44, fork m3-train-44 dd285ad9,
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
three; 3 (a script's kill is the server's to run, scripted-effects.md) and
any other code refused. Then MpActor::Kill with the killer, the death's
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
commit after 53b9fd65): the game hosting the trigger's cell forwards a
reference's activation of itself as an Activate with caster and target the
same (activationService), and the server notes it where and when
(OnActivate's first branch: the reporter must host the cell, nothing is
activated), so a death within 512 units and 5 s of it checks as a hazard;
ActorDeathTest's hazard case drives that path. Still the floor: bear traps,
break-away floors, oil pools and falling lamps fire with no activation at
all (TrapBear, TrapBreakAwayBase, TrapExplosiveGas: OnTriggerEnter or OnHit
straight to the hit, the explosion or the hazard). HYPOTHESIS, two: that the
engine's death event for a trap kill carries no killer (ProcessTrapHit,
darts, flames and hazards set no blame actor; Papyrus's akKiller is typed
Actor; but a non-actor killer in the native event would make Skyrim
Platform drop deathStart altogether, EventHandler.cpp L413-447, and the
report would never leave the host: the lab's plate run decides, Arvel's
plate in Bleak Falls Temple the natural read); and the
fall bound (200 units within 4 s is a plausibility floor, not the engine's
damage rule, which ran on the host; x-npc-fall-report reads a drop the
engine kills at). MEASURED (x-npc-fall-report v3 20261025-012351 on 44
6cdc2b35, 18:26 PDT, numidium's read): the host's engine killed the lifted
wolf by a 4000-unit fall (mid-fall at z 12741, dead at hp -675 under the
deferred kill), the floor report went out, and the server took it by "a
drop of 3813 units in the host's samples", killed the record and scheduled
the 240 h reset; dead on the record and both seats; the bound of 200 held
with room. Committed as lab/scenarios/b-npc-death-report.yaml (main
3c6c54e). The hazard's evidence stays the one HYPOTHESIS.
Nightly 20261025-124620 red on the roll, not the report (numidium's
agent, 11:5x PDT): the subject 0x85547 came up a SKEEVER (EncSkeever
0x23ab7, race 78337; the gate's green had EncWolf 0x23abe, 78346), one
entry in five of its level-1 list, and the lifted skeever never fell: two
seconds after the lift it stood on the ground 441 units off at health 1,
where the wolf had been mid-fall, so nothing reached the floor and nothing
was reported (no report line, no E_DEATH_*). Why a small creature stays
down is a HYPOTHESIS (the engine re-grounding a size-0 race, or skymp's
teleport moving the actor with a null cell where CommonLib's SetPosition
passes the parent). The scenario now asserts the species as a premise
(main e6a62fb), so the roll's red reads at the prelude; the fix owed is a
wolf-only subject (a direct EncWolf or deer placement near the forest,
esm.py), since a one-in-five premise red is no gate scenario.
Done (13:03 PDT): the subject is the fixed EncWolf 0x82717 (base EncWolf
itself, numidium's esm.py read; its pair 0x82716 and the leveled predator
0x82718 culled from a park at square (22, -20)), x-npc-fall-report v4 GREEN
20261025-195607 on parity 6cdc2b35 promoted unchanged into
b-npc-death-report (main c5eb498); the premises are the engine's (c1 runs
the wolf, c2 puppets it, raceId 78346). The nightly's four reds all read
and their scenarios green again (fix-m3-nightly 193214, 4 of 4).

Built, the roll's level rule (train-44 e3b39ac8, 16:30 PDT; the memo's D2,
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
under 0xff000000. Train-46 (fork m3-train-46 fe1ee08f) keys it on the base
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

## Client

Built, the deaths' client half (95abf0dc, 20:39 PDT): formView binds a dead
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
NPC_ as a container (ContainerMenu). HYPOTHESIS until the lab: H4 (the menu
lists the server's items), H6 (the body at the record's point on a reload),
H9 (Resurrect, then the late re-roll), H10 and H11 (the kill on a puppet
and on the host's actor).

Built, the client half (train-41, fork m3-train-41 8535e336, 2026-10-23 15:23 PDT),
behind the npcFate switch, off by default: Skyrim Platform's fate table and
two Frida Gum detours (the leveled roll wrapper 14752 answering the server's
NPC_ as the one CALCED_OBJECT; since 17:24 PDT, 1a3a91c4, the outfit-array
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
inside the update tick (0a10f977, 20:18 PDT: the handler itself writes only
the table, which has to hold the fate before a loading screen's attach, and
a Papyrus native in a message handler is the fault that broke every teleport
on train-40; the two exports queue game-thread tasks of their own); formView skips the
equipment apply for engine references under the switch (the engine dresses
them; figures and 0xff copies keep the apply). HYPOTHESIS, the detours and
the re-roll, until x-npc-fate-roll's five observations; then the switch
turns on in the lab's settings and the parity read (both seats' species and
worn items equal to the server's record) ticks ADR-046 decision 1. Known
cost of the first slice: at a login every fated neighbour the engine already
rolled is re-rolled once (no base compare through the clone's template yet).


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
  server (no fate arrives, nothing pins, the view behaves as on fb6f3f09).

Built, the death report's sender (train-44 6e827918, 16:18 PDT):
DeathReportService sends ActorDeath at deathStart (the kill itself; deathEnd
waits for the ragdoll to settle and the server's windows run from the kill)
for a game-file actor this game simulates (HostService.isMineLocal) whose
death is not the server's own word (DeathService.takeServerKill marks the
kills it plays, consumed by the report that asks): cause 4 with the killer's
remote id when the engine names an actor, else 0 (the server picks any
evidence it has); the body's position; one logLab line per report. Not
reported: the player's own death, a figure's or a copy's (0xff ids), a
puppet's (another game simulates it). The floor (17:51 PDT, fork
m3-train-44 6cdc2b35, after x-npc-fall-report 20261025-004503 fell 4000
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
- T3 scenario ids, committed (01:16 PDT, main 7135b4be, one commit each,
  rule 13): lab/scenarios/b-npc-death.yaml (the death's travel on both
  seats through the viewer's return, the restart and the host's relaunch:
  x-npc-death v3 GREEN 080218) and lab/scenarios/b-npc-loot.yaml (the corpse
  as the server's container: x-npc-loot GREEN 064648); lab/scenarios/b-npc-respawn.yaml (the body
  standing again at its placement after the reset hours across a restart,
  rolled anew, on both seats: x-npc-respawn v3 GREEN 081548; main 26db4afd,
  01:21 PDT). The sketch below (b-npc-fate.yaml,
  the Barrow's bandits with a bow and the restart) stays the fuller scenario
  for the verb's close.
  lab/scenarios/b-npc-death-report.yaml (main 3c6c54e, 2026-10-24 18:28 PDT,
  its own commit): the host's floor report of a fall taken by the server's
  own samples' drop and the death on both seats, from x-npc-fall-report v3
  GREEN 20261025-012351 on 44 6cdc2b35 (the host's engine drops a hosted
  predator 4000 units through its console; "a drop of 3813 units in the
  host's samples; the server records the death"). The NPC fight's reports
  read inside b-npc-death's and b-cell-host's runs (the log's "accepted" or
  "already dead" lines); a trap's death is the open HYPOTHESIS and no claim.
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
  health is a HYPOTHESIS on the roll; a body flung past 512 units reads
  E_DEATH_UNCHECKED.
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
touches no outfit: the outfit detour's site is in doubt (HYPOTHESIS raised:
16155 may be reached from a caller other than 16072, or 16072's entries were
hidden by the refs filter; the hook counts decide). The counts (16:49 PDT): initOutfitItems and addWornOutfit n 0 in both legs, their hooks attached, while outfitEquip ran 65 times (47 on other actors) and the outfit-shaped rolls returned to SkyrimSE.exe+0x236d7c and +0x23a37a; so the outfit detour's site (16072) is FALSIFIED for 1.6.1170 and the real site is an RE read (re-npc-roll.md section 8, commissioned). The species half of the pin stands on observations 1 and 2; the worn asserts of x-npc-fate-pin stay red until the outfit detour moves. The leg's frida step
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
inventory template bit is a HYPOTHESIS. The probe x-npc-fate-outfit (lone
seat, tgm, the trace live 15 s before the load) runs on them; esm.py wants
an achrs-in command (its near lists REFRs alone).
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
actor from the inventory the init built (HYPOTHESIS: how it hooks in).
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
built unless one of those hooks re-filters (HYPOTHESIS; the source is
powerof3's Spell-Perk-Item-Distributor if the re-analyst needs the sites).

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

x-npc-fate-pin v2 (20:18 PDT, for train-41's stage on 0a10f977): two legs,
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

x-npc-fate-pin v2 on 41's stage (0a10f977; run 20261024-052150, 22:33 PDT):
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
detours inert; its trace on the results site). Then v3 GREEN (22:46 PDT, run 20261024-053914, 10 of 10): leg 1 as before (three runs now); leg 2, c2 parked over square 31,-17 at z 25000 landed in one attempt and stood at about 12,946 absolute after the wait (above the forest's 10,700: no fall-through), no late line while parked or after stepping in, both species 78346 on c2's engine, "pinned 85547 to" once. The species half of ADR-046 decision 1 holds at T3 on both seats and both paths; npcFate flipped on by default (3aabd51e); the worn half is x-npc-fate-outfit v3's read on the Embershard bandits. A finding outside the fate:
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
applies the property (the seam, 55e64a94; Resurrect on an engine
reference, 95abf0dc), and 61ffa74e adds the mirror of the dead bind: a
dead engine reference whose record the server explicitly says is alive is
resurrected on the two-second read (a seat that reconnects after the
sweep binds a corpse), the server saying a game-file actor's life
explicitly in CreateActor (props.isDead false, within the contract); a
record never dead says nothing, so ADR-038's predicted deaths stand. The
confirming read is x-npc-respawn's (both seats alive after the restart).

41's restage on 3aabd51e, npcFate on by default (23:17 PDT): x-npc-fate-pin v3
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
with lab driver 9aecd2aa; run 20261024-062856, 23:34 PDT): the ARMOR is
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
of the inventory's leveled roll is train-43 (962fc913, 23:56 PDT: the 16128
detour, Suppress); D17 asks Eli whether it comes before playtest 34.

42's stage on 61ffa74e (00:00 PDT): x-npc-loot GREEN (064648): kill-ref,
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
logged. Fix (m3-train-42 5ee047df, merged forward into 43 d2210492):
resurrectActor, a Skyrim Platform export running the engine's own Resurrect
(A/Actor.h:369) with the AI on in one game-thread task (a puppet demoted
again after it, a live actor unblocked), in place of the Papyrus call whose
order against the puppet's demote the two queues never fixed; the client's
engine branch calls it and logs "resurrect <id> (puppet <bool>) queued" to
the console tee. HYPOTHESIS (rule 2) that Resurrect under AI off after an
AI-on death is the engine's refusal; the rerun decides, with c1's state at
the read. x-npc-death v2 (070022) held the death on both seats through the
viewer's return and the restart (the body bound widened to 32 units each
way for the ragdoll's settle, v3).

43's stage on 962fc913 (00:31 PDT): x-npc-fate-outfit v3 GREEN (072041): the
worn equality whole, the weapons included (above, Suppress); x-npc-fate-pin
v3 GREEN (072444), both legs. ADR-046 decision 1 holds at T3 for everything
the outfit and the inventory roll govern: species, armor, cloak and weapon,
on both seats and both paths.

43's restage on d2210492 (01:15 PDT): x-npc-death v3 GREEN (080218): the
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

x-npc-respawn v3 GREEN (01:21 PDT, run 20261024-081548 on 43 d2210492, god
mode re-armed after the reconnects): alive on the record and both seats
after the restart, the species equal to the fate on both, c2 running the
revived predator with c1's puppet 50 units behind. On d2210492 every fate
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
m3-train-41 7ec13787 (forward 42 28c4861c, 43 de9d048e): rerollActor
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
parity 6cdc2b35 (gate set 20261025-015916-gate-m3-train-44, eighteen green;
T2 green), the clones promoted; D2 settled as A2 party-mean, the default.
Open after the merge: the hazard evidence's lab read (a trap death), the
encounter zone clamp (docs/research/m3/encounter-zones.md), the fuller
b-npc-fate scenario; the quit crash is cell-host's row.

- [ ] doc complete, inventory listed with a disposition per row, rung declared
- [x] engine surface cited or delegated (the roll sites 14374, 14752, 16129 and 16155 by `just addr` with the lab's Frida counts, re-npc-roll.md sections 1 to 8; the attach re-roll's caller 19231 and its gate, section 9, REA; the death path, death-path.md; the CommonLib lines named per field; 22:47 PDT)
- [x] server logic + T0 (the first slice: the one roll at the first loader's level, fateLevel on the record, the fate pass ahead of the engine's ring at the square change, the pin, the respawn re-roll; fork m3-train-41, CI green 2783 on 510f190c and 2793 on 740ab970 with NpcFateTest, 17:19 PDT); the death half on fork m3-train-42 1d09fa04 (the body's stamp, the sweep on the game clock, the master's 240 h, the respawn funnel, the engine's essential and protected rule, the corpse as a container; five T0 cases; CI GREEN on 5352af64 and again on 61ffa74e (23:11 PDT, the mirror rule and the explicit life flag), 21:44 PDT: the unit binary, upstream's integration tests under the reset clock, the Windows client)
- [x] message + validator (same commit) (ActorFate 51, wire id 59, its validator, fixtures, C++ struct and client type in one commit, fork m3-train-41 a891e6a6; ActorDeath 52, wire id 60, its validator and per-host budget, two fixtures, fork m3-train-44 597bb9dc, the C++ struct dd285ad9 and the client type 6e827918, 2026-10-24)
- [ ] native hook + T1
- [x] TS handler (ActorFateService keeps every fate and re-rolls a reference the engine already holds when its fate is new; formView's engine-dressed rule; behind npcFate, off by default until x-npc-fate-pin; 0a10f977: the late path's lookups in the update tick, not the message handler; 3aabd51e: npcFate on unless the settings file says false, both readers, after the pin's green; the deaths' client half 95abf0dc: the dead bind with its two-second re-check, the corpse's inventory and activation block, the engine's Resurrect at the respawn, the corpse branch of the container flow; DeathReportService 6e827918, train-44: the host's death report at deathStart; 6cdc2b35: read from the health floor under the deferred kill, the ear that hears a fall)
- [x] T2 green (33 sessions identical with the declared divergences at de9d048e, the index compared as identity, the declarations naming forms; 09:55 PDT)
- [x] T3 scenario green (20:13 PDT, 2026-10-24: the gate set 20261025-015916-gate-m3-train-44 on 6cdc2b35, all eighteen green on their last runs, b-npc-death-report 024748 among them, the death report's fall at T3; before it 09:55 PDT: the gate set 20261024-155001-gate-m3-train-43 on de9d048e, all sixteen green on their last runs, b-npc-death 162453, b-npc-loot 163014, b-npc-respawn 163304 with the re-roll; T2 green at de9d048e; gate-cite's five checks pass; HYPOTHESIS tags remaining: the over-time damage path's aggressor, the engine's reason for refusing Resurrect under AI off, named in Suppress) (x-npc-fate-pin v3 GREEN 053914, 060646, 072444: the species on both seats and both paths; x-npc-fate-outfit v3 GREEN 072041 on 43's stage 962fc913: armor, cloak and weapon whole on both Embershard bandits; ADR-046 decision 1 at T3; committed: b-npc-death, b-npc-loot and b-npc-respawn (main 26db4afd); every fate and death probe green on 43 d2210492; 43's T2 and a gate set with the nine plus the seven committed scenarios run tonight for the merge's citation; by path, awaiting the stages: x-npc-death, x-npc-loot and x-npc-respawn on 42; b-npc-fate written after x-npc-death holds, rule 13)
- [ ] parity scenario green, or its later list reviewed with it (ADR-031)
- [ ] sequences and combinations green, every checklist item with its scenario (ADR-033)
- [ ] ledger and suppression registry updated

## Reviewer checklist

1. Is the rung right, and is the reason for not going one rung higher real?
   (The roll, the death, the body's point, the respawn and the loot R0; the
   host's death report R1 since train-44, 2026-10-24: ActorDeath, checked by
   the server's own evidence; a hazard death's evidence the one HYPOTHESIS,
   refused and counted until the lab's trap run; the fall checked by the
   host's samples.)
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
