# Verb: word-wall

Drafted 02:4x PDT 2026-10-31 from docs/VERB.md (pile item 11 of docs/private/turbo-2-prework.md; M4's "word walls
teach through the server's shout record", docs/verbs/shouts.md:453-454; Eli, playtest fourteen: "leave it in
dungeons"). From a code map of the fork at parity dc3ec679. Nothing of it is built.

## Intent

A word wall teaches its word into the server's shout record of the player who reads it, so the word is known on every
login and by every console read, and the engine's own learning on the seat is the server's word's echo.

Roadmap reference: skymp/ROADMAP.md "Shouts" ("Learning words of power. Possibility to limit the study of words of
power").
Milestone: M4   Class: B

## Inventory (ADR-031: the action's consequences, before its rung)

The action is a player approaching a word wall: the wall's trigger, the word's glow and chant, the camera pull, the
word learned (Game.TeachWord), the HUD notice; later the unlock with a dragon soul (Game.UnlockWord). The records:
the wall's trigger (an ACTI or a trigger box with the WordWallTrigger script: unread), the WOOP (the word) and the
SHOU (its three words, libespm SHOU.cpp:8-24; no WOOP reader).

| consequence | seen in | disposition |
| --- | --- | --- |
| the trigger as the player nears the wall | engine (the wall's script on the seat; its event, OnTriggerEnter or a self-activation, unread) | observed: the host's or the player's own report (the Dynamic plan reads which) |
| the chant, the glow of the word, the camera pull | engine | native on the reading player's game; the other game sees the wall's glow by its own engine when the server's record says so (HYPOTHESIS; the read) |
| Game.TeachWord on the seat (the word known, the HUD notice "Word of Power learned") | engine (the script) | suppressed as state: the server's record is the word's truth (R0); the seat's own TeachWord stands only as the echo; a login re-teaches from the record (ShoutSnippets.cpp:28-55, Form.SetPlayerKnows silent) |
| the word's unlock with a soul | engine (the player's menu) | later: a transaction (the soul count on the record) |
| a second player reading the same wall | engine | native on its game; its own record (each player's) |

### Sequences and combinations (ADR-033)

| sequence or combination | probe or scenario | result |
| --- | --- | --- |
| the wall read by the host, the word on the record and after a relaunch | b-word-wall | |
| the same wall read by the guest after the host (its own record) | b-word-wall | |
| a restart between the read and the login | b-word-wall | |

## Authority

Rung: R0 for the record (the server writes the word), R1 for the report (the reading player's own game reports the
wall and the word; the server validates the wall's WOOP against the game files and the player's reach to the wall), R3
for the chant and camera.
Why this rung and not the one above it: the trigger is the player's own game's (its camera and chant), so the report is
the player's; the word is the game files' and the record is the server's.
What the server validates (R1): the wall reference exists and is a word wall (its script or its WOOP link from the
game files), the player within reach of it (the activation rule's distance), the word one of the wall's SHOU's three,
not known already (a repeat is idempotent).
Rate limit / bounds: one report per wall per player; a budget of 2 then 1 a second.

## Engine surface

- The server: ShoutRecord.h:11-36 {shouts, wordsKnown, wordsUnlocked} on the change form (MpChangeForms.h:181-184),
  its API MpActor.cpp:1425-1472; written by the console alone (ConsoleCommands.cpp:499-527: TeachWord, UnlockWord,
  AddShout, the type check "SHOU"/"WOOP" :513, RecordShoutEntry :517); the seat told by ShoutSnippets.cpp:9-26
  (Actor.AddShout, Game.TeachWord, Game.UnlockWord) and at login :28-55 (SetPlayerKnows, silent); read by
  ActionListener.cpp:1236-1250 and wire-rules shouts.rs:88.
- libespm: SHOU's three SNAM (word, spell, recovery; SHOU.h:15-34, SHOU.cpp:8-24); no WOOP reader (shouts.md:250
  overstates it); no reader of the wall's trigger.
- Skyrim Platform natives: Game.teachWord :2893, Game.unlockWord :2896, Game.isWordUnlocked :2850, Actor.addShout
  :2081, Shout.getNthWordOfPower :3384; the `known` lab step reads isWordUnlocked (driver index.ts:1505-1521).
- The wall's script in the engine: WordWallTrigger (vanilla; its event and its call of TeachWord unread: the
  Dynamic plan).
- CommonLibSSE-NG: none needed.

## Observe

- Hook point: the seat's own game: either Skyrim Platform's sendPapyrusEvent hook on the wall's OnTriggerEnter (rule
  9: the filter on the wall's script name), or a native hook on Game.TeachWord's Papyrus native (the word taught, the
  one funnel); the read decides.
- SP filter: the player as the triggering actor; the script by name.
- Data captured: {wall: u32, word: u32}.
- Side effects: HYPOTHESIS: the seat's own TeachWord fires the HUD notice before the server's word; harmless when the
  server accepts (the same word), wrong when it refuses (a forged word): the refusal re-reads the record to the seat
  (ShoutSnippets' login path).

## Impose

- Mechanism: the record written (RecordShoutEntry as the console does), the seat told as the console path tells it
  (ShoutSnippets: TeachWord, which the seat already did, idempotent).
- Visual without simulation achieved by: the engine's own chant on the reading seat.
- Side effects: none.

## Suppress

- What is suppressed: nothing on the seat (its TeachWord stands as the echo); a refused report is undone by the
  record's re-read.

## Message contract

- Message name / numeric type: WordWall, C2S, reliable, `{ wall: u32, word: u32 }`, MsgType after the pile's others;
  validator: both never 0, a budget of 2 then 1 a second. SCHEMA_VERSION bumped with it.
- Idempotency / ordering: a known word is a no-op.
- Contract doc updated: docs/WIRE.md with the build.

## Server

- Where the logic lives: wire-rules shouts.rs gains the wall rule (the word in the wall's SHOU, the reach, the
  repeat); PartOne's handler writes the record (RecordShoutEntry) and tells the seat; the Papyrus natives TeachWord,
  UnlockWord, IsWordUnlocked, AddShout implemented on the server (ledger lines, R0) so a script's wall on the server
  could teach too (shouts.md:267-270); libespm gains a WOOP reader and the wall's link (the REFR's script property
  naming its WOOP, or the ACTI's).
- DB fields / migration: none (ShoutRecord exists).
- Restart behavior: the record as saved.
- Papyrus natives touched (ledger lines added): TeachWord, UnlockWord, IsWordUnlocked, AddShout (implemented, R0).

## Client

- SP binding: the hook above (an event or a native hook) as a `wordLearned {wall, word}` event.
- TS handler: wordWallService.ts sends WordWall; the login's record apply as today.
- Kill switch config key: none (a fix of the record's truth).

## Tests

- T0: the wall rule (the word in the wall's shout, a stranger's word refused, the repeat idempotent, the reach); the
  handler writing the record; the natives.
- T2: a session with a WordWall accepted.
- T3 scenario id: lab/scenarios/b-word-wall.yaml: c1 walks to Bleak Falls' wall (Unrelenting Force's second word
  "Fus"? the wall teaches the first unknown word of its shout; the lab reads the record), the `known` step true after
  the chant on c1 and after a relaunch; c2 reads the same wall, its own record; a restart keeps both. Probe x-word-wall
  by path first (the trigger's event, the chant's duration, the TeachWord's timing).
- Assertions that would fail if the verb silently regressed: a word known on the seat and not on the record after a
  relaunch.

## Dynamic plan (fill when any tag above is still HYPOTHESIS)

- x-word-wall-read by path: c1 at Bleak Falls' word wall (its reference by lab/esm.py on the cell), Skyrim Platform's
  papyrus-events step recording the wall's events as c1 nears it (OnTriggerEnter? OnActivate?), the `known` step before
  and after, c1's console for the HUD notice line; a Frida read of Game.TeachWord's native if the event carries no
  word. Owner: agent.

## Status

- [ ] doc complete, inventory listed with a disposition per row, rung declared (the reference trace owed)
- [x] engine surface cited or delegated (the code map of 2026-10-31; the wall's script read owed)
- [ ] server logic + T0
- [ ] message + validator (same commit)
- [ ] native hook + T1
- [ ] TS handler
- [ ] T2 green
- [ ] T3 scenario green, no HYPOTHESIS tags
- [ ] parity scenario green, or its later list reviewed with it (ADR-031)
- [ ] sequences and combinations green, every checklist item with its scenario (ADR-033)
- [ ] ledger and suppression registry updated
