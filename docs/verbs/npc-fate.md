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
HYPOTHESIS) answers the server's NPC_ as the one pick; InventoryChanges::
InitOutfitItems (16072, CommonLibSSE-NG's binding) adds the server's worn
list tagged as the outfit's items and rolls nothing. Both pass every call
through while the npcFate switch is off (the default until x-npc-fate-roll)
or the reference is unfated. No Papyrus native is added (the exports are
Skyrim Platform's, as setPuppet is); docs/NATIVES.md unchanged. The lab
reads the server's side through mp.get(refrId, "actorFate").

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
- Direction: server to client only. No client message is new: the roll, the
  death and the respawn are the server's; the host's death report (Observe
  1) rides npc-stream's HostedActorState when it lands, as a flag the server
  counts (a field no event fills is dropped before merge, npc-stream.md's
  rule), and the roster's engine base rides ActorSightings (below).
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

## Client

Built, the client half (train-41, fork m3-train-41 8535e336, 2026-10-23 15:23 PDT),
behind the npcFate switch, off by default: Skyrim Platform's fate table and
two Frida Gum detours (the leveled roll wrapper 14752 answering the server's
NPC_ as the one CALCED_OBJECT; InventoryChanges::InitOutfitItems 16072
adding the server's worn list tagged ExtraOutfitItem and skipping the roll),
the exports setActorFate, clearActorFate, setActorFateEnabled, rerollActor
(the engine's re-roll 37323 on the game thread) and actorFateCount, every
id from re-npc-roll.md's table by `just addr`, every structure offset a
CommonLibSSE-NG header line; ActorFateService keeps every fate and re-rolls
a reference the engine already holds when its fate is new (a login's
neighbours, a cell attached ahead, a respawn): one pop; formView skips the
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
- T3 scenario id: lab/scenarios/b-npc-fate.yaml (written by hand after the
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
re-analyst's section 8 reads the load-time path. Leg 2 was void (the
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

## Status

DRAFT 2026-10-22, the night of playtest 32, before any code and before the
reference trace; nothing built, nothing run. Decided 2026-10-23 (ADR-046,
decision 1, Eli: "i want the servers roll pushed to both"): the server's roll
of a leveled or placed NPC's outfit and look is imposed on every engine, the
host's included, so the roll covers outfits and 0xff placements and the
headshot verdict matches the screens. Still for Eli, one ADR (its number to
be assigned): the death's authority shape (a or b, Authority); the roll's
level (the first loader's or 0); the respawn's pick (re-roll or keep); the
ActorFate message against the existing deltas alone; formVersion 2 or 3.

- [ ] doc complete, inventory listed with a disposition per row, rung declared
- [ ] engine surface cited or delegated
- [ ] server logic + T0
- [ ] message + validator (same commit)
- [ ] native hook + T1
- [ ] TS handler
- [ ] T2 green
- [ ] T3 scenario green, no HYPOTHESIS tags
- [ ] parity scenario green, or its later list reviewed with it (ADR-031)
- [ ] sequences and combinations green, every checklist item with its scenario (ADR-033)
- [ ] ledger and suppression registry updated

## Reviewer checklist

1. Is the rung right, and is the reason for not going one rung higher real?
   (The roll, the death, the body's point, the respawn and the loot R0; the
   host's death report counted R2 until Eli's shape; the fall R2 declared.)
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
