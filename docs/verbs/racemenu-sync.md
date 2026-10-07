# Verb: racemenu-sync

Eli, 2026-10-06: "i want my friends to be able to make their own hyper
specific characters." SkyMP syncs the vanilla appearance (race, head parts,
tints, face sliders) and nothing RaceMenu adds, so a player's RaceMenu look
(sculpt, overlays, body morphs, node scales, its extra sliders) exists only
in its own game, and only until its next login: every login loads a
generated save, and RaceMenu keeps its data in that save's SKSE co-save.

## Intent

A player shapes its character in RaceMenu once; the server keeps the
result; every client, the player's own included, shows that look after
every login.

Roadmap reference: none (SkyMP's appearance sync stops at vanilla data)
Milestone: Stretch, chosen by Eli 2026-10-06 (docs/PLAN.md)   Class: B (a
player's own data, shown on every client)

## Authority

Rung: R2, bounded. The look is the player's choice, computed by RaceMenu
in the player's game; the server records it and hands it out. It is
client-authored, so untrusted (hard rule 5): the server bounds its size,
checks that every form it names exists in the load order, and that every
sculpt vertex index is below its host's vertex count.
Why not R1: there is no game rule to validate a face against; the bounds
above keep a hostile preset from carrying anything but a look.

## Engine surface

- RaceMenu runs on game 1.6.1170 only. CONFIRMED live 2026-10-06: skee64.dll
  0.4.20.0 (Nexus mod 19080 file 743640, its newest, uploaded 2026-04-19;
  archive SHA-256 e0f5e923... as Nexus's VirusTotal link names it) declares
  SKSEPluginVersionData compatibleVersions [1.6.1170.0] and no version
  independence, and SKSE's loader enables a plugin without independence
  only on a runtime it lists (skse64 2.2.6 src/skse64/skse64/
  PluginManager.cpp, "simple version list"). On sky-c1's Steam game, SKSE
  2.3.1 on runtime 01070680 (1.7.104) logged: `plugin skee64.dll (00000001
  skee 00000001) disabled, incompatible with current version of the game`.
  Nexus has no newer file as of that day (mod updated 2026-04-20). So the
  verb is built and proven on the lab's 1.6.1170 client set (ADR-022,
  ADR-025), and a player who wants RaceMenu plays 1.6.1170 until RaceMenu
  ships a 1.7 build. Its two plugins, RaceMenu.esp and RaceMenuPlugin.esp,
  are full slots (TES4 flags 0x0, not light), so the server's load order
  differs by game version once they are in the 1.6.1170 set.
- Saving and loading a look: RaceMenu's own Papyrus natives, the API it
  gives scripts. RaceMenu 0.4.20.0's scripts\source\chargen.psc (in
  RaceMenu.bsa; read 2026-10-06, never in a repo):
  - line 85: `Function SaveCharacterPreset(Actor akSource, string
    characterName) native global`, "Saves actor preset to
    SKSE\Plugins\CharGen\Presets\%characterName%.jslot", and "Only works on
    player currently / Actor parameter is reserved for future use".
  - line 80: `bool Function LoadCharacterPresetEx(Actor akDestination,
    string characterName, ColorForm hairColor, int flags = 0xFFFFFFFF)
    native global`; its wrapper LoadCharacterPreset (line 76) warns "Loads a
    preset onto the NPC, permanently (DO NOT USE ON NPCs)" and "Hair Color
    form that is provided is modified".
  - lines 56-66: RaceMenu's own LoadPreset for the player passes RaceMenu's
    hair color form (0x801 in RaceMenu.esp) and then sends the mod event
    RSM_RequestTintSave, "Signals to RaceMenu that some internals were
    probably modified and need to be stored into RaceMenu's script
    representation".
  - line 41: `bool Function IsExternalEnabled() native global`, a harmless
    read.
  RaceMenu's public source has the bodies (expired6978/SKSE64Plugins,
  skee64/PapyrusCharGen.cpp lines 268-316, registered at 394-398): the save
  is SaveJsonPreset into Data\SKSE\Plugins\CharGen\Presets\<name>.jslot;
  the load reads SKSE\Plugins\CharGen\Presets\<name>.jslot (then .slot),
  sets the hair color form when one is given, ApplyPresetData(actor, data,
  true, flags) and queues a node update.
- Skyrim Platform reaches any native by class and name with callNative,
  loading the class's script on first use (skyrim-platform
  CallNative.cpp:233-238, VM::ReloadType), so nothing in Skyrim Platform is
  RaceMenu's.
- CONFIRMED 2026-10-07 (run 20261007-014139-x-racemenu-probe, green, c1 on
  1.6.1170): IsExternalEnabled answered (false); SaveCharacterPreset left a
  3165-byte preset of c1's player when callNative returned; and
  LoadCharacterPresetEx loaded it back (true). A second save matched the
  first except for the order of two head parts (Skyrim.esm 05162F and
  051631 swapped), so two presets compare with head parts as a set. The
  preset's top-level keys for a default look: actor (hairColor,
  headTexture, weight), faceTextures, headParts, modNames, mods, morphs
  (custom, default with 19 morphs and 4 presets, sculpt, sculptDivisor),
  tintInfo, version.
- REFUTED 2026-10-07: the C++ Preset interface. RaceMenu's header for
  plugin authors (0.4.20.0 ModderResource/IPluginInterface.h, lines
  467-492) declares IPresetInterface, but 0.4.20.0 never registers it:
  skee's interface map gets eleven names (public source main.cpp:943-953,
  Override to FormTag), which sit together in skee64.dll's strings at
  0x1e4300 to 0x1e43f8, while "Preset" sits apart at 0x1e563c. In run
  20261007-012410 SKSE handed Skyrim Platform's exchange message to skee's
  listener (skse64.log: the targeted dispatch logs nothing when it finds
  its receiver) and the version asked through the map came back 0. The
  natives built on it (387f9f72) are reverted (35692723).
- Not relied on: a save of another actor. chargen.psc says the save works
  on the player only; the scenario reads a figure through the engine's own
  node scale instead (NetImmerse.GetNodeScale).
- CONFIRMED 2026-10-07, the whole path: c1 scales its head through
  NiOverride under the key "thuum" (a shape the vanilla appearance cannot
  carry), closes the race menu, and the preset RaceMenuService saves
  carries it (the server's record: 8536 bytes, its transforms naming "NPC
  Head [Head]" at 1.6). c2's figure of c1 draws it within 2 s, and after a
  server restart, c1's relaunch (a fresh save, no co-save) and c2's
  reconnect both draw it again (runs 20261007-022013, -022929, -023505,
  -024000, -024452 and a-racemenu's four).
- CONFIRMED 2026-10-07: the load onto a figure leaves the local player's
  own look alone. skymp5-client's figures answer Papyrus GetBaseObject with
  0x7, the local player's base NPC, and RaceMenu's load writes head parts,
  morphs, tints and weight into an actor's base; yet c2's own preset, saved
  before and after c1's look reached its figure, is the same 2932 bytes
  (SHA-256 54d2809f..., run 20261007-034304), so RaceMenu's writes land on
  the figure's own base. a-racemenu asserts it on every run.
- FOUND 2026-10-07 by Eli, after playtest eight: test 2 came back as the
  clean world's orc wearing the playtest's sculpt. The sweep's first run
  restored the server's world (no look recorded for test 2) and restarted
  the server, but did not restart c2's game (the scenario used c1 only), so
  c2 reconnected inside one game. RaceMenu keeps a player's sculpt, its own
  sliders, overrides and transforms in the game's memory and puts them back
  on the head whenever it is rebuilt, so the client showed a look the
  server never had. Fixed in 8a8aa50d: at the player's own CreateActor the
  client takes RaceMenu's additions off (the look saved, the RaceMenu-only
  sections left out, loaded back: RaceMenu's load erases them first,
  PresetInterface ApplyPresetData) before anything of the server's is
  applied, and every CreateActor drops what the service knew of that actor,
  since the server sends its current look right after. a-racemenu checks
  it: c2 scales its own head without closing the race menu, and after its
  reconnect the head is back at 1.0.
- Two early runs (20261007-022013 and -022551) saw c2's figure keep its old
  look after a live preset, though the server relayed it; the cause was not
  found. Since ba000d6a the service applies a look again to a new reference
  as well as a new base and logs a load RaceMenu refuses; every live run
  since applied it (seven, the console traced in five).
- Remote players: skymp5-client builds each remote player's figure on its
  own base NPC (src/sync/appearance.ts applyAppearance:
  `TESModPlatform.createNpc()`), so the load's permanent writes to the base
  ("DO NOT USE ON NPCs") stay with that player. The figure is respawned on
  a new base when its appearance changes (src/view/formView.ts,
  respawnRequired), so the preset is applied again after every spawn.

## Observe

- After the race menu closes, the client saves its player's look
  (CharGen.SaveCharacterPreset) and sends the JSON to the server if it
  changed.
- A preset loaded through RaceMenu's own menu comes out wrong (Eli's
  playtest nine, 2026-10-07, rotfern.jslot): the menu's load goes through
  its sliders, so the skin tone lost its alpha and landed on another color
  (tint 0 88B1C6 at 1.0 against the file's A9C5D8 at 0.94; the body goes
  muddy, the face and body tones part at the neck) and the ear, a head
  part of a type the vanilla menu has no slider for, was dropped; weight
  came through at 50 (an earlier record held 75, unexplained). The sync's
  own load of the same file (CharGen.LoadCharacterPresetEx) gives the
  file's values with the ear (probe x-head-parts). Fenestrate never
  exercised the menu's load: the preset was exported from the character,
  never imported. So at the menu's close the client finds the preset file
  whose morphs equal the saved look's, the one the menu loaded, applies it
  again through CharGen and saves again; that look is sent (fork
  30b1e262). A face shaped by hand matches no file and stays as it is.
- Under that: RaceMenu's scripts never ran on the SkyMP client. The client
  blocks every Papyrus event but OnUpdate (TESModPlatform.BlockPapyrusEvents,
  Skyrim Platform's hook on the VM's SendEvent blanks the event name),
  excepting SkyUI's SKI_ scripts and one vanilla script. RaceMenu's menu
  reaches the actor through its own scripts' mod events (racemenu.psc:
  OnTintColorChange runs Game.SetTintMaskColor and UpdateTintMaskColors,
  OnHairColorChange, OnTintSave for RSM_RequestTintSave; the slider plugins
  such as RaceMenuMorphsCBBE have their own). Eli (playtest nine): "moving
  the skintone sliders does absolutely nothing". So the sliders were dead,
  the tints and hair color a menu preset load hands back to the UI were
  never applied, and RSM_RequestTintSave (13391501) did nothing. Fork
  d9c940f1: scripts whose name starts with RaceMenu pass the block as
  SkyUI's do; they run the menu, not game state (rule: the server owns
  state, the hook is R3). Measured again once staged: the ear drop on the
  UI load path, the hair color on open, the tints after a menu load.
- With the scripts running, the hair went blonde as the menu opened (Eli,
  playtest nine). racemenu.psc's LoadDefaults runs SaveHair, which marks
  a hair color as the player's own only when it sits on RaceMenu's form
  0x801; SkyMP's appearance apply puts it on a fresh form, so SaveHair
  stored it as not custom, the vanilla slider snapped to the race's hair
  color list's first entry, and LoadHair had nothing to put back. Fork
  cc2a5e94: the client moves the player's color onto 0x801 before
  RSM_RequestTintSave at menu open, fenestrate's sequence. Follow-up
  (apocrypha): SetNpcHairColor should assign the race's hair color list
  form whose RGB matches (TESRace faceRelatedData[sex]->hairColors) before
  creating one, so a plugin's color such as rotfernhair persists in any
  save with no script state.
- The menu-loaded preset is matched by its face sliders (morphs.default and
  morphs.custom as a name to value map, three places), not the whole
  morphs block: RaceMenu's save drops the sculpt vertices a preset did not
  move (448 in the file, 436 saved) and reorders the sliders (fork
  0aaac540).
- CONFIRMED (Eli, playtest nine, 16:18): with cc2a5e94 on his client, a
  preset loaded in RaceMenu's menu then Done records the preset as its
  author made it: appearance skin A6C0D2 (his fenestrate save's own body
  tint), hair 5E6077, weight 50, the ear at index 2; tints EFA9C5D8,
  FF000000 x2, C9430401, 590F0440, FF2F2013; the look 30,476 bytes with
  the ear, 22 custom morphs, one sculpt host. The other seat shows the
  same values. Open after it: his own view reads shiny where the figure of
  her on the other seat does not, same tints, and (Eli) with his seat at
  HDR key 0 and the other at 1, so the key is not what separates the two.
  Not the face maps' binding either: RaceMenu never applies a preset's
  faceTextures (apocrypha, PresetInterface.cpp: parsed and written back,
  read by nothing), so both seats get her maps through the engine's
  texture set path. Next read: RaceMenu's Export Head on the player's
  seat, which writes the face's bound textures and shader values as the
  player renders them, against the figure's.
- The HDR key: bUse64bitsHDRRenderTarget is a lever, not a fix. Side by
  side on the two seats (Eli, playtest nine): at 1 her skin reads glossy
  under the lab's vanilla light, at 0 her own view matched fenestrate
  ("the skin texture looks VERY correct") while the figure on the other
  seat was off for the tint reasons above. The lab keeps 0 (display.ps1
  now says so outright). apocrypha, from the shader source: the detail
  map term scales only the base color by at most 1.6 percent, so CBBE's
  Face Pack did not change the gloss.
- The server takes one look per race menu it opened, before or after the
  appearance that closes it, as SkyMP takes an appearance only while the
  menu it opened is open (ActionListener::OnUpdateAppearance); any other
  is refused with E_RACEMENU_CLOSED in the log. Lab, 2026-10-07: test 2
  changed its hair color in a race menu it opened itself; SkyMP dropped the
  appearance, which carries the hair color, while the look went through,
  and test 1 showed the look on the old color. Known limit: a look that
  arrives before an appearance the race rule refuses (E_APPEARANCE_RACE)
  stays recorded; the race itself stays the validated one.
- What the sync's own load leaves on a player, measured (probe
  x-head-parts, run 20261007-133253, rotfern's preset 1957f4aa on a player
  carrying Eli's appearance record): the preset's head parts replace the
  base's by type, the race's own ear (type 104) included; the weight goes
  to the preset's (50 from 75); the skin tone tint goes to the preset's
  (A9C5D8 at 0.94 from SkyMP's FF88B1C6); all three survive a race menu
  the server opens and the driver closes (Ui close), and the other client's
  figure shows the ear and the hair color. RaceMenu's saved look keeps its
  tints under "tintInfo" (a look with "tints" absent is not a look without
  tints). HYPOTHESIS: Eli's own record (weight 75, tint 0 FF88B1C6, both
  SkyMP's appearance values, after he loaded the preset in RaceMenu's UI
  and pressed Done) comes from the vanilla menu's commit on Done writing
  its own slider state over what the preset set mid-menu; the driver
  cannot press through the name box, so the T4 check is: load the preset
  in the UI, Done, then head-parts on the base.
- A figure's base cannot be read for its parts: it answers GetBaseObject
  with 0x7, the local player's base (head-parts {other} returns the local
  player's own parts). A figure's look is judged by eye or by the look
  record. A figure takes the look's head parts but keeps SkyMP's appearance
  for skin and hair color: RaceMenu writes tints to the local player only
  (PresetInterface ApplyPresetData, the player == actor check).
- Rotfern's shine (Eli, 2026-10-07: "the texture is also way too shiny",
  not so on fenestrate, which never ran an ENB before the character was
  done; apocrypha's file dates agree). Measured: it is the specular term
  (A/B on sky-c1 with the head mesh at specular strength 0 against the
  original 3.0 at glossiness 30, same place, minutes apart: matte against
  sharp white highlights on the lit side of the face; the body did not
  read shiny). Every file is byte-identical to fenestrate's (apocrypha:
  head mesh, all four maps, the texture set record), so the cause is in
  the render stack. HYPOTHESIS: bUse64bitsHDRRenderTarget, 1 on fenestrate
  and 0 in the lab (the template's launcher wrote the lab's SkyrimPrefs.ini
  from its own hardware detect; display.ps1 edited only size and windowed
  keys), so bright specular clipped to white before tonemapping. The probe
  x-hdr (runs 20261007-143101 key 1 at game hour 11, 20261007-170xxx key 0
  at hour 14) showed a matte face both times, inconclusive: the figure
  stood in profile with the sun off the face, and carried the clean world's
  orc skin tone under the rotfern parts. The lab now sets the key to 1 on
  every clone (display.ps1, fenestrate's value) and Eli judges the face in
  playtest nine; next if it stays shiny: apocrypha's 32-bit head_msn.dds
  (the 24-bit R8G8B8 map has no D3D11 format), then weather and an
  interior, from the player's own view.

## Impose

- After a login, the server sends each player's stored look to its own
  client and to every client that shows that player; each loads it
  (CharGen.LoadCharacterPresetEx, every part) onto that actor. The
  player's own loads as RaceMenu's LoadPreset does: RaceMenu's hair color
  form, then RSM_RequestTintSave; a figure's hair color stays its
  appearance's.
- Caveats from RaceMenu's source and scripts:
  - The load writes to the actor's base NPC for good: every remote player
    has its own (see the engine surface).
  - Head parts are keyed by "plugin|FormID" and sculpt blocks by the head
    part's chargen .tri path: every client needs the same load order and
    the same loose meshes, or entries are skipped silently.

## Suppress

- Nothing.

## Message contract

- Its own message, RaceMenuPreset, both ways, not SkyMP's property
  replication: UpdateProperty is capped at 65 KiB on the wire (wire-schema
  TABLE), and a sculpted head can carry more. Client to server: `preset`,
  the .jslot JSON, within the transport's 256 KiB from a client (wire-
  transport Limits max_from_client). Server to client: `actor` (the server
  id of the player it belongs to) and `preset`. The cap is set once a real
  sculpted preset is measured in the lab; compression (deflate) only if
  that measurement needs it.

## Server

- Rust, wire-rules: the bounds (size, well-formed JSON object, only the
  .jslot's top-level keys, head parts and forms named by "plugin|FormID"
  present in the server's load order). Sculpt vertex indices are recorded
  unvalidated (the server has no .tri files; rule 5: R2, bounded).
- C++ core: the preset in the player's change form (`raceMenuPreset`,
  absent in older records and read as none). Sent to the player's own
  client after a login (the map-markers login hook), and to every client
  that gets CreateActor for that player, right after it; a new preset goes
  to the player's listeners.

## Client

- Skyrim Platform: nothing of its own; callNative reaches CharGen.
- skymp5-client RaceMenuService (b0219fee, ba000d6a, 8a8aa50d): on the race menu's close,
  SaveCharacterPreset on the player into RaceMenu's Presets folder, read
  back, sent if it changed. On RaceMenuPreset from the server, the JSON
  written to that folder and LoadCharacterPresetEx on the player or on
  that player's figure, again whenever the figure's reference or base
  changes, a refused load logged once. A login (the player's own
  CreateActor) takes RaceMenu's additions off the player before anything
  of the server's is applied, so a look only the server holds survives
  it. RaceMenu is there when CharGen's natives answer, asked once;
  `raceMenuSync: false` turns it off.
- Lab-driver: `racemenu` (CharGen answers), `racemenu-save {name, other?}`
  (a save, its size and SHA-256), `racemenu-load {name}` (a load onto the
  player as RaceMenu's LoadPreset does it), so a scenario can shape a look
  without dragging sliders.

## Tests

- T0: the Rust bounds (sizes, keys, forms) and the change form round trip;
  the login and CreateActor sends.
- T3 on 1.6.1170 (`a-racemenu`, d61647d): c1 scales its head as RaceMenu's
  sliders do and closes the race menu; c1's head and c2's figure of c1 draw
  at 1.6 and c2's own look is unchanged; the server restarts, c1 relaunches
  and c2 reconnects; the same three again. The figure judged is the
  enabled one with 3D where the server has c1 (c.node_scale_of).

## Order of work

1. RaceMenu into the lab's 1.6.1170 set (thuum 1b4b741, after the merge
   sweep): its menu shows on both clones, and m0-appearance, a-rotfern,
   a-character-creation and smoke still pass there.
2. Saving and loading confirmed (run 20261007-014139, CharGen through
   callNative; the C++ Preset interface refuted and reverted).
3. The two-client probes and a-racemenu green (runs above); T2 green.
4. Playtest eight on 1.6.1170 passed (2026-10-07): sculpted looks of
   24,463 and 41,332 bytes, so the 192 KiB cap stands. The merge sweep and
   the merge next.

## Status

- [x] doc complete, rung declared
- [x] engine surface cited (CharGen's natives through callNative,
      confirmed by run 20261007-014139 and the two-client runs; no
      HYPOTHESIS left)
- [x] server logic + T0 (fork m1-racemenu 0f516e0f: wire-rules
      `racemenu`, the change form's raceMenuPreset, OnRaceMenuPreset, the
      login send and the send with a figure; unit/RaceMenuPresetTest.cpp
      green in fork pipeline 864, 287 test cases; the difftest session
      racemenu, 547cf113, for T2)
- [x] message + validator (same commit, a2ff7c53: RaceMenuPreset, MsgType
      39, wire id 47, SCHEMA_VERSION 8; cap 192 KiB until a measured
      preset; validate_server split out, so a burst of presets at a login
      is not rate-limited on the client)
- [x] native hook: none of ours; RaceMenu's CharGen natives through
      callNative (387f9f72's TESModPlatform natives reverted, 35692723);
      T1: no harness, the probe
- [x] TS handler (684f933b, CharGen since b0219fee: RaceMenuService)
- [x] T2 green (2026-10-07, `just test-proto m1-racemenu`: the smoke,
      attributes across a restart, and all 14 difftest sessions, racemenu
      among them, legacy against wire identical)
- [x] T3 scenario green, no HYPOTHESIS tags (a-racemenu, d61647d, green in
      runs 20261007-033048, -033403, -033726 and -035046; Eli's review
      pending; T4 playtest eight passed, the cap stays 192 KiB)
- [x] ledger and suppression registry updated (no NATIVES rows: CharGen
      is RaceMenu's and never runs on the server; nothing suppressed)
