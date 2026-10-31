# Verb: vampirism

Drafted 2026-10-31 from docs/VERB.md (pile item 15 of docs/private/turbo-2-prework.md: "Vampirism as declared state, a design
doc first, then T0; not for Sunday's switches"). From the records (lab/esm.py on Skyrim.esm and Dawnguard.esm, 2026-10-31) and
the verbs that already hold the pieces: player-globals (the quest's globals), quest-stage (ADR-056), appearance and RaceMenu (the
race on the record), magic-effects and spells (the vampire's abilities on the learned set), the time verb (the feed clock).
Nothing is built.

## Intent

A player who becomes a vampire is one on the server: its race, its stage, its powers and its feed clock are the record's, every
seat renders the same creature, and a relaunch or a restart keeps the condition, as the single game's save does.

Roadmap reference: skymp/ROADMAP.md "Vampirism" ("Perks, extras, vampire spells from DLC").
Milestone: M5 (design now; the build after turbo 2)   Class: B

## Inventory (ADR-031: the action's consequences, before its rung)

The single game's path (the records): Sanguinare Vampiris (the disease spell, 0xb8780 on the server's cureSpells list today,
magic-effects.md memo D56) runs three days, then PlayerVampireQuest 0xeafd5's script turns the player: the race swapped to the
race's vampire variant (NordRace 0x13746 to NordRaceVampire 0x88794; the pairs are the ten playable races and their *RaceVampire
records: Imperial 0x13744/0x88844, Breton 0x13741/0x8883c, Redguard 0x13748/0x88846, HighElf 0x13743/0x88840, DarkElf
0x13742/0x8883d, WoodElf 0x13749/0x88884, Orc 0x13747/0xa82b9, Khajiit 0x13745/0x88845, Argonian 0x13740/0x8883a), the globals
set (PlayerIsVampire 0xed06d, VampireFeedReady 0xf69cf, VampireDiseaseApply 0x21cdb), the stage's abilities added (AbVampire01b
0x10f1eb to AbVampire04b 0x10f1e8, AbVampireSkills02 0x10f1e7, the sun damage crVampireSunDamage 0xf5b5d, the drain spells
crVampireDrain02 to 04 0xf5b59 to 0xf5b5b), the powers (Vampire's Seduction, Vampiric Drain, Embrace of Shadows, the sight), the
feed on a sleeping actor resetting the stage, the cure through Falion. Dawnguard adds the Vampire Lord (DLC1VampireBeastRace
0x200283a, the transformation's quests DLC1VampireTutorial 0x201909f and the feed's DLC1VampireFeedStartTime 0x2014cbc).

| consequence | seen in | disposition |
| --- | --- | --- |
| the disease's three days and the turn | engine (the quest script on the seat) | R0 later: the server's clock decides the turn (the disease is a learned spell on the record already; the turn is a stage the server sets, quest-stage.md's shared list) |
| the race swap | engine (the script's SetRace) | R0: the appearance record's race, validated against the pair table (the player's base race to its vampire variant and back), relayed as the appearance is today |
| the stage (1 to 4) and the globals | engine | R0: player-globals' record (PlayerIsVampire, VampireFeedReady), the stage as a server global on the time verb's clock (hours since the last feed) |
| the abilities and powers per stage | engine | R0: added to the record's learned set by the stage's table (the script's lists, read from the quest's VMAD properties or pinned by editor id), relayed as spells are |
| the sun damage and the stat changes | engine (the abilities' effects) | native on every seat that holds the abilities (the figure's seats need the abilities on the figure: magic-effects' relay) |
| the feed on a sleeping actor | engine (the dialogue's script) | R1: the feeder's game reports the feed (the victim asleep, in reach: the server validates), the stage resets |
| the cure | engine (Falion's scene) | R0 later: a quest stage the server takes |
| the face and eyes of the vampire race | engine (the race's head parts) | native from the race on the appearance; RaceMenu's verb keeps the look |
| Nature's Balance (Eli's caveat) | a mod on the lab's load order that changes the vampire's race or abilities | the pair table and the ability lists read from the load order, never pinned, so the mod's changes are the server's |
| the Vampire Lord (Dawnguard) | engine (a second race swap and a new spell set) | later: the same shape with the beast race; not before the human vampire is green |

### Sequences and combinations (ADR-033)

| sequence or combination | probe or scenario | result |
| --- | --- | --- |
| the turn: the race swapped on both seats, the globals, the abilities | b-vampire-turn | |
| a stage up by the clock, a stage down by a feed | b-vampire-stage | |
| a relaunch and a restart keep the race, the stage and the powers | b-vampire-turn | |
| the cure: the race back, the abilities gone | later | |

## Authority

Rung: R0 for the condition (race, stage, globals, abilities: the server's record), R1 for the feed (the feeder's game reports, the
server validates the victim and the reach), R3 for the sight's shader and the HUD notices.
Why this rung and not the one above it: the condition is state every seat must agree on (the figure's race and powers); only the
feed is an act the player's engine sees first.
What the server validates (R1): the victim asleep (the sleep verb's state on the record) and within the activation reach.
Rate limit / bounds: one feed per victim per stage; the stage 1 to 4; the clock the time verb's.

## Engine surface

- Records: RACE (the ten pairs above), QUST PlayerVampireQuest 0xeafd5 (its VMAD properties name the races, the abilities and the
  globals; libespm's VMAD reader is the Papyrus VM's ScriptVariablesHolder), GLOB (above), SPEL (the abilities), the Dawnguard
  records.
- The server: the appearance record (race), player-globals, quest-stage, the learned-spell set (MpActor::AddSpell), the clock.
- Skyrim Platform: Actor.setRace is not exposed; the race travels in the appearance (RaceMenu's verb applies it); Actor.addSpell
  and removeSpell for the abilities; the quest's stage through quest-stage's relay.
- Open reads (the Dynamic plan): whether an appearance with the vampire race applies on a seat without the script's SetRace (the
  RaceMenu verb's path does swap races: RaceMenuPreset carries the race); whether the abilities' sun damage runs from the spell
  alone; what the HUD shows at the turn.

## Observe

- Hook point: the feed: the dialogue's script on the feeder's game (sendPapyrusEvent on PlayerVampireQuest's script, or the
  victim's OnSleepStart); the read decides.
- SP filter: the player as the subject.
- Data captured: {victim: u32}.

## Impose

- Mechanism: the race on the appearance record (relayed as today), the globals through player-globals, the stage through a
  server global on the clock, the abilities through the learned set's relay (AddSpell snippets).
- Side effects: HYPOTHESIS: the race swap through the appearance re-rolls the head; RaceMenu's preset keeps it.

## Suppress

- What is suppressed: the quest script's own turn, stage and race swap on every seat (the quest stays at its start; its stages
  are the server's through quest-stage's shared list).

## Message contract

- No new message: the appearance, the globals, the quest stages and the spells travel as they do; the feed is a quest-stage
  report (ADR-056's shared list) or a new C2S `Feed { victim }` if the read shows no stage carries it.
- Contract doc updated: with the build.

## Server

- Where the logic lives: wire-rules vampirism.rs (the pair table, the stage clock, the feed's rule); PartOne: the turn on the
  disease's third day (the clock), the stage's abilities into the learned set, the race onto the appearance, the globals.
- DB fields / migration: the condition lives in records that exist (appearance, globals, learned spells, quest stages); a `vampire`
  block on the change form (stage, last feed day) would be new: rule 6's migration and restart scenario.
- Restart behavior: the record as saved; the stage clock recomputed from the last feed day.

## Client

- TS handler: none new beyond the appearance's and the spells' (the HUD notice is the engine's own on the stage's ability).
- Kill switch config key: `vampirism` (server).

## Tests

- T0: the pair table from the load order (ten pairs; Nature's Balance's changes if the lab's order carries them), the stage clock,
  the feed's rule.
- T3 scenario id: lab/scenarios/b-vampire-turn.yaml and b-vampire-stage.yaml (after the reads).

## Dynamic plan (fill when any tag above is still HYPOTHESIS)

- x-vampire-turn-read by path: c1 given the disease by the server (AddSpell 0xb8780 through the console), the clock run three
  days (the time verb's lever), the quest's events logged (papyrus-log on PlayerVampireQuest's aliases is not possible: the hook
  filters by reference, so the player 0x14 is the filter), the race read on both seats after; the appearance path tried alone:
  a RaceMenuPreset with NordRaceVampire on c1 and c2's figure read. Owner: agent, after turbo 2.

## Status

- [x] doc complete, inventory listed with a disposition per row, rung declared (a design; the reference trace owed)
- [x] engine surface cited or delegated (the records of 2026-10-31; the reads named)
- [ ] server logic + T0
- [ ] message + validator (same commit)
- [ ] native hook + T1
- [ ] TS handler
- [ ] T2 green
- [ ] T3 scenario green, no HYPOTHESIS tags
- [ ] parity scenario green, or its later list reviewed with it (ADR-031)
- [ ] sequences and combinations green, every checklist item with its scenario (ADR-033)
- [ ] ledger and suppression registry updated
