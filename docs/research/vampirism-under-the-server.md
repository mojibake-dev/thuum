# Vampirism under the server: how each change happens, what it touches, what the server lacks

Eli, 2026-10-28, 19:4x PDT, on the alternate start (relayed by numidium): "go with B but also in going
with B one needs to scout out how vamirism changes happen. (and if race compatibility is in our
modlst)". numidium answered the second half: RaceCompatibility 2.16 is served at slot 6
(lab/layer/load-order.tsv), every client and the server. This page is the first half, written by
apocrypha before the two race-changing starts of docs/research/alternate-start.md are built: how a
player becomes a vampire on each path, what each path changes, which natives it calls and what the
server has for them, and the rotfern pairing. Static reads are tagged CONFIRMED-S (the bytecode or the
record says so); what needs the game is tagged HYPOTHESIS and has a line in the Dynamic plan at the end
(CLAUDE.md rule 8).

## Sources, all read locally (licensed files stay in lab/.cache, never in a repo)

- RaceCompatibility-AIO-2.16.zip (lab/.cache/mods): its RaceCompatibility.esm, its two script
  variants, "20 Dawnguard Script" and "21 Dawnguard USKP Script", and the USKP override plugin.
- USSEP 4.3.8a's archive (lab/.cache/mods/fenestrate/...): the 32 vampire scripts it ships, among them
  USSEP's own copies of PlayerVampireQuestScript and Dawnguard's DLC1VampireTurnScript,
  DLC1PlayerVampireChangeScript and DLC1PlayerVampireScript. These are the copies a client runs for
  Dawnguard's scripts: USSEP's archive loads after Dawnguard's.
- Skyrim - Misc.bsa of the 1.6.1170 seat (14,026 compiled scripts), pulled off sky-c1 through the guest
  agent in verified 512 KiB chunks (SHA-256 ddb19908dcd5c135b8bba240e8dfcdb95395b569852f715d330396e9c1390b9d,
  equal on both sides), now in lab/.cache/game for every later vanilla-script read: the 74 vampire
  scripts, VampireDiseaseEffectScript first.
- Skyrim.esm, Dawnguard.esm (lab/.cache/game): the races, the disease spell and effect, the quest
  records. rotfern.esp, the standalone fork (~/Code/mods/rotfern-skyrim, CRC32 F483303D): its two
  races and its two list overrides. The served RaceCompatibility scripts, copied off CORE's persist
  tree and hashed here.
- The fork's client (lab/.cache/turbo-fork/skymp5-client/src): sync/appearance.ts and
  services/services/raceMenuService.ts, for what a race change does on a seat.
- Disassembled, not decompiled (chim/.scratch/pexdis.py). The lab's own docs: docs/NATIVES.md (the
  server ledger), docs/verbs/appearance.md, character-creation.md, learned-spells.md,
  papyrus-events.md, docs/MODS.md's RaceCompatibility note.

## One function turns a player, four things call it

Every vanilla and mod path ends in `PlayerVampireQuestScript.VampireChange(Actor)` on the quest
PlayerVampireQuest (Skyrim.esm `000EAFD5`), and every cure in its `VampireCure(Actor)`. The copy a
client runs is RaceCompatibility's, laid loose at Scripts/PlayerVampireQuestScript.pex: loose files
beat archives, so it replaces USSEP's copy from the archive (the vanilla and USSEP copies map the ten
races by name, RaceCompatibility's maps them through two form lists, below). CONFIRMED-S.

`VampireChange(Target)`, in the served copy:

1. `Game.DisablePlayerControls`, the change FX and image-space cross-fade, 2 s.
2. The race: for i over `RaceList` (the quest's property, filled by RaceCompatibility.esm's record of
   the quest with its `PlayableRaceList`), if the target's base race is `RaceList[i]`, remember it as
   `CureRace` and `Target.SetRace(VampireList[i])` (`PlayableVampireList`). One SetRace, by index.
3. Fourteen `RemoveSpell`s: the seven diseases and their trap variants.
4. `VampireStatus = 1`, `VampireProgression(player, 1)` (the stage-one kit: `ABVampireSkills`,
   `ABVampireSkills02`, `AbVampire01` and `01b`, `VampireDrain01`, `VampireRaiseThrall01`,
   `VampireSunDamage01`, the other stages' spells removed), `RegisterForUpdateGameTime(12)`,
   `LastFeedTime = GameDaysPassed`, the global `PlayerIsVampire = 1`.
5. `EnablePlayerControls`; if VC01 (Falion's cure) is past stage 200, VC01 to stage 25;
   `Target.SendVampirismStateChanged(True)`.

`VampireProgression(player, stage)` swaps the stage kits: stage 2 at one day unfed (`AbVampire02`,
`VampireDrain02`, `VampireSunDamage02`, `VampireRaiseThrall02`, `VampireCharm`), stage 3 at two
(`...03` set), stage 4 at three (`...04` set plus `VampireInvisibilityPC`); each stage also moves the
equipped drain spell up with `GetEquippedSpell`/`EquipSpell`. The timer is the quest's
`OnUpdateGameTime`, every 12 game hours: `FeedTimer = GameDaysPassed - LastFeedTime`; the stage steps
only when the player is not in combat, has controls, and is not mid Vampire Lord change; at stage 4 it
unregisters. No faction is added anywhere in the served script: `VampirePCFaction` is only removed (on
a feed and on a cure) and `SetAttackActorOnSight(False)` set there, the Dawnguard-era behaviour.
`VampireFeed()` resets: `VampireFeedReady = 0`, `LastFeedTime = now`, status 1, progression 1, the
faction and attack-on-sight cleared, every crime faction's `SetPlayerEnemy(False)`, the 12 h timer
re-armed. Feeding is reached by the perk fragments (`PRKF_VampireFeedBeds` calls `VampireFeed`,
`StartVampireFeed` and Dawnguard's `PlayerBitesMe`; `PRKF_VampireFeedBedRolls`,
`PRKF_VampireFeedBeds01` call `VampireFeedBedRoll`/`VampireFeedBed`) and Dawnguard's
`DLC1VampireSleepScript`. `VampireCure(Player)` unregisters the timer, removes `VampirePCFaction` and
attack-on-sight, removes 25 spells (`DLC1VampireChange`, the skills, the four `AbVampire` pairs, the
drains, thralls, sun damage, charm, invisibility), finds the player's race in `VampireList[i]` and
`SetRace(RaceList[i])`, sets `PlayerIsVampire = 0`, removes `VampireHuntersSight`,
`SendVampirismStateChanged(False)`. CONFIRMED-S.

### Path A: Live Another Life's "I am a vampire in a secluded lair" (RumorsOfWar stage 15)

`ARTH_LAL_StartQuest.MakePlayerVampire()` (called from the stage's Fragment_18): `VampireChange(Player)`;
the quest's `FeedTimer` property set to 4; wait 2 s; the global `GameHour` set to 19; `VampireFeedReady`
set to 2; `VampireStatus` set to 3; `VampireProgression(Player, 3)`. So the new vampire arrives at dusk,
at stage three, two feeds hungry; its race is the list pair's. The start's kit (vampire armour, a
`LItemVampireWeaponBase` roll, `LootVampireRandom` x3, gold) and the faction `ARTHLALBanditVampireFaction`
are the fragment's own, before the lair MoveTo. CONFIRMED-S.

### Path B: Harkon's bite ("Lord Harkon's Court", stage 9)

`DLC1VampireTurnScript.HarkonBitesPlayer(True)` (USSEP's copy): the fade `DLC1HarkonBiteFadeToBlackImod`;
`ReceiveHarkonsGift(Harkon, IsSeranaGiving=False, PlayStandardBiteAnim=False)`: Harkon plays
`pa_VampireLordChangePlayer` on the player; if the player's race lacks the keyword `Vampire`,
`PlayerVampireQuest.VampireChange(Player)` (the same turn as above), else a 3 s wait; a werewolf is cured
first (`C00.CurePlayer`); then `AddSpell(DLC1VampireChange)`, the Vampire Lord power, and
`AddPerk(DLC1VampireTurnPerk)`. Back in `HarkonBitesPlayer`: `PlayIdle(DLC1PairEnd)`,
`Player.MoveTo(DLC1VQ02PlayerWakeupMarker)`, Harkon back from his lord form
(`SetRace(Harkon, NordRace)`), Harkon to his wake marker, fade in, `DLC1VQ02` stage 40. The declined
branch moves the player to `DLC1VQ02PlayerWakeupMarkerReject` instead and sets stage 30. CONFIRMED-S.

### Path C: the disease, Sanguinare Vampiris

SPEL `DiseaseSanguinareVampiris` (`000B8780`), carried by vampires' drain attacks, has one effect, MGEF
`DisDamageHealthVampire` (`000B8778`), whose script is `VampireDiseaseEffectScript`
(ActiveMagicEffect). `OnEffectStart(target, caster)`: if the target is the player,
`RegisterForUpdateGameTime(1)` and `VampireChangeTimer = GameDaysPassed + 3`. `OnUpdateGameTime`
(hourly): the sunrise message at hour 5 and the sunset message at 19 with cross-fades; when
`GameDaysPassed >= VampireChangeTimer`, unregister and `RegisterForSingleUpdate(10)`. `OnUpdate`: if the
player is out of combat with controls, `VampireSleepMessage` and `PlayerVampireQuest.VampireChange(player)`;
else try again in 10 s. Curing the disease before day three (any cure disease, a shrine) removes the
spell and the effect with it. CONFIRMED-S. A fourth caller, `VampireChangeEffectScript` (an effect that
calls `VampireChange` on start), is the debug spell's.

### The Vampire Lord layer (Dawnguard, after a turn that grants `DLC1VampireChange`)

The power's effect script `DLC1VampireChangeEffectScript.OnEffectStart` disables controls, starts the
tracking quest, casts the FX and adds a perk; `DLC1PlayerVampireChangeScript.InitialShift` sets the
base `SetInvulnerable`, `SetGhost`, `SetRace(DLC1VampireBeastRace)`, adds the float and FX spells,
`Game.SetBeastForm`, preloads and equips the lord's spells by perk; `Revert` reverses it and
`SetRace` back; `DLC1PlayerVampireScript`, the alias on the player, handles `OnRaceSwitchComplete`
(clears ghost and invulnerable; starts or shuts down the tracking), `OnUpdateGameTime` (the Bats
cooldown) and `OnPlayerLoadGame`. Natives beyond the vanilla path: `Game.SetBeastForm`,
`Actor.SetGhost`, `ActorBase.SetInvulnerable`, `Actor.SetActorValue` x3, `RestoreActorValue`,
`DispelSpell`, animation events. CONFIRMED-S.

## What each path changes, against who owns it here

| what | A (LAL) | B (Harkon) | C (disease) | owner in the lab |
| --- | --- | --- | --- | --- |
| race (`Actor.SetRace` to `PlayableVampireList[i]`) | yes | yes | yes | R0 appearance (Appearance.raceId, docs/verbs/appearance.md): the server records a race only on a race-menu close, Playable races only (character-creation.md); a script's SetRace is the seat's alone |
| ability spells (`AbVampire0x`, `ABVampireSkills`, sun damage, the stage sets) | stage 3 set | stage 1 set | stage 1 set | client-local `AddSpell`; the server's learned list never hears it (learned-spells.md: the list is written by the server's own paths) |
| hand spells (`VampireDrain0x`, `VampireRaiseThrall0x`, `VampireCharm`, `VampireInvisibilityPC`) | yes | yes | yes | same, plus the equip rule: "a spell equipped in a hand that the list lacks: the server refuses the equipment and tells the game to remove the spell" (learned-spells.md). A client-turned vampire's drain is removed the moment it is equipped |
| `DLC1VampireChange` power + `DLC1VampireTurnPerk` | no | yes | no | client-local; perks have no server path (Actor.AddPerk missing in the ledger) |
| globals `PlayerIsVampire` (=1/0), `VampireFeedReady` (0..3), `GameHour` (A sets 19) | yes | yes | yes | the clock is the server's; GlobalVariable.SetValue is missing on the server VM and docs/verbs/player-globals.md is the per-player path for globals it lists |
| the 12 h stage timer, `LastFeedTime`, `VampireStatus` | yes (status 3) | yes | yes | quest-script state, client-local |
| factions: `ARTHLALBanditVampireFaction` (A), `VampirePCFaction` removed on feed/cure, `DLC1PlayerTurnedVampire` (NPC turns only) | A | - | - | client-local; thuum-cf: a known, unsynced limit |
| position (B's wake marker) | - | MoveTo | - | the landing-table permit (alternate-start.md) |
| `SendVampirismStateChanged(true)` | yes | yes | yes | an engine native; none of the 111 scripts read here handles `OnVampirismStateChanged`, so its consumer is the engine (HYPOTHESIS on what it drives) |
| diseases removed (14 `RemoveSpell`) | yes | yes | yes | client-local |

## The natives, and what the server has for them

On a seat every one of these is the engine's own and runs. The ledger (docs/NATIVES.md) describes the
server's Papyrus VM, which matters if the server is to perform or mirror a change:

| native | ledger | note |
| --- | --- | --- |
| `Actor.SetRace` | missing | the server's race is Appearance.raceId; no server path changes a live actor's race today |
| `Actor.SendVampirismStateChanged` | missing | engine-side state; client-local is fine |
| `Game.GetFormFromFile` | missing | RaceCompatibility's dispatcher uses it; not on the turn path |
| `Actor.AddSpell`, `RemoveSpell`, `EquipSpell` | delegated | an SpSnippet to the client; R2 by construction |
| `Actor.AddToFaction`, `RemoveFromFaction`, `GetRace`, `SetActorValue`, `RestoreActorValue`, `FormList.GetAt`, `GetSize`, `Form.HasKeyword`, `Game.GetPlayer`, `Utility.Wait`, `VisualEffect.Play` | implemented | |
| `GlobalVariable.SetValue`, `GetValue` | missing | `PlayerIsVampire`, `VampireFeedReady`, `GameHour` |
| `Actor.SetAttackActorOnSight`, `Faction.SetPlayerEnemy`, `Actor.AddPerk`, `RemovePerk`, `HasPerk`, `HasSpell`, `HasMagicEffect`, `GetEquippedSpell`, `GetCombatState`, `SetRelationshipRank`, `SetGhost`, `Game.SetBeastForm`, `ImageSpaceModifier.*` | missing | |
| `Game.DisablePlayerControls`, `EnablePlayerControls`, `Actor.PlayIdle`, `Message.Show`, `Game.IncrementStat`, `ObjectReference.PlaceAtMe` | delegated | |
| `ObjectReference.MoveTo` | gamemode | the permit's shape |
| `Quest.SetStage`, `GetStageDone`, `RegisterForUpdateGameTime`, `ReferenceAlias.GetActorReference`, `Spell.Cast`, `Actor.GetActorBase`, `Race.HasKeyword` | not in the ledger | SP's dump lacks them (the ledger's known gap) |

## What runs on a connected seat today, under the event block (docs/verbs/papyrus-events.md)

The block admits an event to a script if its class chain is SKI_*, or its class is on an admitted
plugin's line of Data/Platform/papyrus-scripts.txt, or it is a named leaf, or (4) it is an ActiveEffect
event with the player as target or caster. Function calls are not events: a chain of calls from an
admitted fragment runs to its end.

- Path A: the LAL plugin would be admitted (its row), so `MakePlayerVampire` and the whole
  `VampireChange` run as direct calls: the race swaps on the seat, the kit lands client-side, the
  globals move. Then nothing more: `PlayerVampireQuestScript.OnUpdateGameTime` is a Skyrim.esm quest
  script, not admitted, so the stage timer never fires; the perk fragments for feeding are function
  calls from the engine's perk entry points, not events, so feeding would run (HYPOTHESIS, H3). The
  other seat sees the old race (R0 record untouched), the own seat shows the vampire race, and the
  first drain equipped is refused and removed by the server (learned-spells rule). CONFIRMED-S except H3.
- Path B: `HarkonBitesPlayer` is a direct call from the admitted fragment, so the turn, the power and
  the perk land client-side; the MoveTo is permitted by the landing table (thuum-cf's first cut refuses
  the whole line, so this is moot until the later slice); Harkon's idles and stages are the NPC
  machinery's (puppet or host, docs/verbs/npc-*.md), HYPOTHESIS H6.
- Path C runs in full today, unplanned: every event of `VampireDiseaseEffectScript` is an ActiveEffect
  event with the player as target, rule (4), so a player bitten by a vampire in the lab's world turns
  three game days later, client-side, with every mismatch of path A and no server knowledge at all.
  CONFIRMED-S for the admission, HYPOTHESIS H2 for the turn observed on a seat. Until vampirism is a
  verb, the cheap guard is the disease itself: a server-side cure of `DiseaseSanguinareVampiris` on
  the record (RemoveSpell delegated), or a layer rule that the vampires' drain lacks the disease
  (a plugin edit, Eli's call), or acceptance as R3.
- The Vampire Lord layer: `DLC1PlayerVampireChangeScript` (quest) and `DLC1PlayerVampireScript`
  (alias) are Dawnguard.esm's, not admitted: `OnUpdate`, `OnRaceSwitchComplete`, `OnAnimationEvent`,
  `OnPlayerLoadGame` are blanked, so a client-side lord form would not revert on its timer or complete
  its race switch handling. HYPOTHESIS H7. Harkon's line is refused in the first cut, so this stays
  theoretical until vampire starts are wanted.

## The rotfern pairing: not applied

`VampireChange` and `VampireCure` pair the lists by index. RaceCompatibility.esm's own lists are the
ten vanilla races in the same order (`PlayableRaceList` `000D62`: Argonian, Breton, Dark Elf, High Elf,
Imperial, Khajiit, Nord, Orc, Redguard, Wood Elf; `PlayableVampireList` `000D63`: their ten vampire
races). rotfern.esp overrides both lists, read today from the standalone fork (CRC32 F483303D, the
plugin the lab serves at slot 81):

- `PlayableRaceList`, 15 entries: the ten vanilla at [0..9], then BretonRaceChild, ImperialRaceChild,
  NordRaceChild, RedguardRaceChild at [10..13], rotfern at **[14]**.
- `PlayableVampireList`, 12 entries: the ten vanilla vampire races at [0..9], BretonRaceChildVampire
  at [10], rotfernRaceVampire at **[11]**.

So the 2026-10-06 reading stands and the fix was never applied: a turn finds rotfern at [14], asks
`VampireList[14]` of a 12-entry list, gets None, and `SetRace(None)` changes nothing (the native's
None case, as MODS.md read it; H1 if anyone wants it seen); a cure of a player whose race is
rotfernRaceVampire finds it at [11] and sets `RaceList[11]`, ImperialRaceChild. The vanilla ten pair
correctly. rotfernRaceVampire also carries the Playable flag (DATA flags 0x54a08943, bit 0) with the
keywords `Vampire` and `ActorTypeUndead`, so it is offered in the race menu and accepted by the server's
race rule; picked there, a later cure lands on ImperialRaceChild. The fix is the one MODS.md names: the
ten vanilla pairs plus the rotfern pair at the same index, [10] in both lists, the four child races
and BretonRaceChildVampire dropped (they are not playable and serve nothing here). Two ways to land it:
Eli edits the plugin at the byte level (chim; the stagger revert's precedent, and a new CRC32 for the
slot's mod-lock), or a build-time patch kind for lab/tools/plugin-patch.py that rewrites a form list's
entries (size-changing, like `drop-record`, which already rewrites group sizes), so the served copy
carries the fix and Eli's source stays his. The patch is the lab's shape; the call is Eli's.

## A layer finding on the way: the served RaceCompatibility scripts are the plain variant

The archive ships two script sets. The served Scripts/PlayerVampireQuestScript.pex (copied off CORE's
persist tree) hashes to the "20 Dawnguard Script" copy (SHA-256 4b5979cc...), not the "21 Dawnguard
USKP Script" copy (08c0f8b8...); GenericRaceController and companionshousekeepingscript are the "20"
copies too, RaceDispatcherScript is identical in both. RaceCompatibility's readme says the USKP set is
for a load order with USKP/USLEEP/USSEP, with RaceCompatibilityUSKPOverride.esp after the patch. The
two PlayerVampireQuestScript variants differ in 537 disassembled lines, all inside `OnUpdateGameTime`,
`VampireProgression`, `VampireCure` and `VampireFeed` (`VampireChange` is identical), which are USSEP's
fixes to those functions carried into the list-based script; the lab's loose "20" copy replaces USSEP's
archive copy, so those fixes are not in play. Record-wise the lab is coherent: USSEP 4.3.8a does not
override PlayerVampireQuest, it does override C00 (the Companions), and RaceCompatibility.esm at slot 6
loads after USSEP at slot 1, so RaceCompatibility's C00 (the list properties) wins and USSEP's C00
changes are lost; the override plugin's only job is the same two quests plus 10 dialogue records, so it
adds nothing in this order. Recommendation to numidium: the row's take should be "21 Dawnguard USKP
Script" and "21 Dawnguard USKP" (a render and a new hash for the three scripts); the vampire reads
below should run on that variant.

## The later slice, if Eli wants vampire starts: what a server-performed turn needs

1. The race as an R0 act: the server sets Appearance.raceId to the pair's vampire race (the lists are
   in the server's own load order through espm: RaceCompatibility's `000D62`/`000D63` at slot 6, as
   overridden by rotfern.esp at slot 81) and broadcasts UpdateAppearance, outside the race-menu path
   and its Playable rule. On the own seat the fork's client already follows: applyAppearanceToPlayer
   puts the race on the base (`TESModPlatform.setNpcRace`, sync/appearance.ts) and
   `raceMenuService.alignRace()` moves the actor to its base's race with the engine's `Actor.SetRace`
   from the update pass (measured for the race-menu case, probe 20261008-015301; HYPOTHESIS H4 for an
   update that arrives mid-world). Other seats apply the base race as they do for any look.
2. The kit: the stage's ability set and hand spells through the server's learned-spells list (so a
   drain equips without refusal), or vampirism's spells left R3 with the equip rule taught the drains.
3. The clock: the server's; path A's `GameHour = 19` is dropped or performed.
4. Progression and feeding: either R3 in the own game, by admitting `PlayerVampireQuestScript` and
   `VampireDiseaseEffectScript` by name (papyrus-admitted.tsv admits by plugin; a Skyrim.esm row would
   admit every vanilla script, so this needs a names-only row kind in lab/tools/papyrus-map.py), the
   Survival precedent (ADR-044 decision 4); or a server timer later. The cure (VC01, Falion) is the
   same function in reverse and needs the same two things.
5. `SendVampirismStateChanged`: client-local, nothing to do.

## Dynamic plan (fill when any tag above is still HYPOTHESIS)

Reads that need the game, one seat each unless noted, on the lab's seats with lab-driver and the
lab-api record reads; a vampire in the lab today is a client-local state, so every read compares three
things: the own seat's `Game.getPlayer().getRace()` (SP console), the server's Appearance.raceId
(lab-api), the other seat's view (`formView`'s race for the actor).

- H1 `SetRace(None)` is a no-op (rotfern at [14]): a rotfern seat, `cqf PlayerVampireQuest VampireChange player`
  (console-commands.md's path) or path C; expect the race unchanged and the stage-one kit present.
- H2 the disease turns a player under the block: a seat bitten (a lab vampire NPC or the console's
  `player.addspell b8780`), `set timescale` high for three game days out of combat; expect
  `VampireSleepMessage`, the vampire race on the own seat only, the server's raceId unchanged, the
  other seat unchanged; then equip VampireDrain01 and expect the server's RemoveSpell snippet.
- H3 perk-fragment feeding runs under the block: as a client-local vampire, feed on a sleeping NPC;
  expect `VampireFeedReady` back to 0 and "Necks Bitten" incremented, with no stage change ever
  (the quest's `OnUpdateGameTime` blanked).
- H4 a server-side raceId change reaches the own seat live: thuum-cf's slice; set raceId on a record
  through the gamemode, expect the other seat's view to change at once and the own actor's race to
  follow its base within the update pass without a reload; a red here is the reload path.
- H5 path A end to end once LAL is laid and the lair line is honoured: the own seat's race, the
  server's record, the other seat, the stage-three kit, `GameHour` 19 on the own clock against the
  server's.
- H6 path B's bite scene with Harkon as an NPC of the lab's world (puppet or host): the idles, the
  fade, the wake marker's permit, stage 40.
- H7 the Vampire Lord form on a client-local vampire: `DLC1VampireChange` cast; expect the race switch
  to the beast race and no revert (the quest's `OnUpdate` blanked), a reload to recover.
- Frida: none needed; these are Papyrus-level and record-level reads.
