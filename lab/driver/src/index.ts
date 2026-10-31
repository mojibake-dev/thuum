// thuum lab-driver: the only automation surface inside a lab client.
//
// Runs as a second Skyrim Platform plugin next to skymp5-client and never
// touches mpClientPlugin. On every `tick` (fires in the main menu too, no
// Papyrus allowed there, and HTTP callbacks are delivered in that context) it
// polls lab-api for the next step; the poll is the client's heartbeat. On
// `update` (Papyrus allowed) it executes the pending step and POSTs the
// result. Endpoints are the ones docs/LAB.md pins:
//   GET  {labApiPath}/step?client=<id>      -> 204, or 200 {id, action, args}
//   POST {labApiPath}/step/<id>/result      <- {client, id, ok, data} or {client, id, ok: false, error}
// Settings file next to the bundle: lab-driver-settings.txt (JSON), see
// lab-driver-settings.example.txt. Keep the verbs boring (docs/LAB.md).
//
// UNCONFIRMED until a lab run: takeScreenshot in a retail build, walk through
// AI-driven pathing. Each is tagged below. CONFIRMED: update fires while the
// race menu is open (tap-key steps ran in it, runs 20261003-074730 on).

import * as skyrimPlatform from "skyrimPlatform";
import {
  Actor,
  ActorBase,
  ActorValueInfo,
  blockPapyrusEvents,
  callNative,
  Cell,
  ConstructibleObject,
  Debug,
  Form,
  Game,
  GlobalVariable,
  HttpClient,
  HttpResponse,
  Idle,
  Ingredient,
  ExtraPoison,
  getAnimationVariablesFromActor,
  getExtraContainerChanges,
  Input,
  loadGame,
  NetImmerse,
  ObjectReference,
  Perk,
  Quest,
  Race,
  Shout,
  Spell,
  TESModPlatform,
  Ui,
  Utility,
  Weather,
  WordOfPower,
  WorldSpace,
  hooks,
  on,
  printConsole,
  performAction,
  applyAnimationVariablesToActor,
  settings,
  writeLogs,
} from "skyrimPlatform";

type Step = { id: string; action: string; args?: Record<string, unknown> };

type Config = {
  labApiBase: string;
  labApiPath: string;
  client: string;
  pollMs: number;
  timeoutMs: number;
};

const LOG_NAME = "lab-driver";

function config(): Config | null {
  // Read lazily: settings files load in directory order and may not exist
  // when the top level of this file runs.
  const raw = (settings as Record<string, unknown>)["lab-driver"] as Partial<Config> | undefined;
  if (!raw || typeof raw.labApiBase !== "string" || typeof raw.client !== "string") return null;
  return {
    labApiBase: raw.labApiBase,
    labApiPath: typeof raw.labApiPath === "string" ? raw.labApiPath : "/lab",
    client: raw.client,
    pollMs: typeof raw.pollMs === "number" ? raw.pollMs : 250,
    timeoutMs: typeof raw.timeoutMs === "number" ? raw.timeoutMs : 5000,
  };
}

function log(...args: unknown[]): void {
  try {
    printConsole("[lab-driver]", ...args);
    writeLogs(LOG_NAME, new Date().toISOString(), ...args);
  } catch (_) {
    // logging must never throw into an event handler
  }
}

let pending: Step | null = null;
let inFlight = false;
let sentAt = 0;
let warnedNoConfig = false;
// A screenshot request waits for the file the engine writes; posted later.
let deferred: { step: Step; file: string; startedAt: number } | null = null;
// A craft waits for the player to be in the station's furniture before the
// inventory changes (see the craft verb); then its menu closes a moment later.
let crafting: {
  step: Step;
  ingredients: Array<[number, number]>;
  result: number;
  count: number;
  startedAt: number;
  station: number;
  activatedAt?: number;
  held?: number[];
  removedAt?: number;
  closeAt?: number;
} | null = null;
const CRAFT_WAIT_MS = 15000;
// A race pick presses Down in the open race menu until the player's race is
// the one asked for: the menu sets the race on the player as the selection
// moves, and the order of its list is the menu's, so the step reads the race
// after each press instead of counting presses.
let racePick: { step: Step; race: number; presses: number; max: number; lastAt: number; set?: boolean } | null = null;
const RACE_PICK_SETTLE_MS = 1200;
// The console step types a line into the game's own console the way a player
// does (thuum docs/verbs/console-commands.md, Dynamic plan): the grave key
// opens it, each character is one tapped DirectInput scan code (dinput.h
// DIK_*, US layout: https://learn.microsoft.com/en-us/previous-versions/windows/desktop/ee418641(v=vs.85)),
// Enter runs it, and the grave key closes it again. One key per update, so
// the console's text field sees each as its own press. The lines the console
// printed meanwhile come back with the result: Skyrim Platform's
// consoleMessage event carries every print, the game's own and printConsole's
// (skymp5-client prints the server's ConsoleOutput through it).
const DIK_GRAVE = 0x29;
const DIK_RETURN = 0x1c;
const DIK: Record<string, number> = {
  "1": 0x02, "2": 0x03, "3": 0x04, "4": 0x05, "5": 0x06, "6": 0x07, "7": 0x08, "8": 0x09, "9": 0x0a, "0": 0x0b,
  "-": 0x0c, "=": 0x0d,
  q: 0x10, w: 0x11, e: 0x12, r: 0x13, t: 0x14, y: 0x15, u: 0x16, i: 0x17, o: 0x18, p: 0x19,
  a: 0x1e, s: 0x1f, d: 0x20, f: 0x21, g: 0x22, h: 0x23, j: 0x24, k: 0x25, l: 0x26,
  z: 0x2c, x: 0x2d, c: 0x2e, v: 0x2f, b: 0x30, n: 0x31, m: 0x32,
  ",": 0x33, ".": 0x34, "/": 0x35, " ": 0x39,
};
const CONSOLE_OPEN_MS = 3000;
const CONSOLE_KEY_MS = 40;
const CONSOLE_READ_MS = 2500;
// A quit {via: papyrus} goes this long after its step answered, so the answer is posted before the game exits
const QUIT_DELAY_MS = 300;
let quitAt = 0;
let consoleTyping: {
  step: Step; text: string; keys: number[]; next: number; phase: "open" | "type" | "read" | "close";
  tapped: boolean; at: number; lines: string[]; wasOpen: boolean; match: string;
  // a quit's typing: its step answered before the keys, so nothing is posted after them
  detached?: boolean;
} | null = null;
// The result goes in this long after the ingredients come out, so
// skymp5-client's craft service has every removal before the result: made in
// one frame, the dagger's event once reached it before the leather strip's
// removal, the craft message lacked the strip and the server found no recipe
// (run 20261006-034306-m0-forge, 1.6.1170). The engine's own crafting menu
// does both itself; only this simulation needs the pause.
const CRAFT_SETTLE_MS = 500;
// RE::CraftingMenu::MENU_NAME (CommonLibSSE-NG include/RE/C/CraftingMenu.h:19)
const CRAFTING_MENU = "Crafting Menu";
// A move in flight: the update loop steps the player toward (x, y) at speed units per second until it arrives or time is up.
// A move in flight: the target, the position we last commanded (cx, cy) and
// the speed. The step is taken from the commanded position, not from the
// position read back, because setPosition lands a frame late and reading the
// stale position back halved the speed (run 20261001-230147: 65 units/s of
// the 133 asked; the server's record then reached the target 3 s after the
// scenario's wait had ended).
let moving: { x: number; y: number; cx: number; cy: number; speed: number; last: number; until: number } | null = null;
// A playtest seat's perks (add-perks with keep): perks are the player's game's
// alone (no server path until M5's perk transactions), and every login loads a
// generated save without them (skymp5-client's loadGameService on the
// server's createActor), so the driver adds back any the player lacks every
// PERKS_CHECK_MS for as long as this game runs; a relaunched game starts with
// none kept, and lab-api sends the list again (its poll after a heartbeat gap)
let keptPerks: number[] = [];
let perksCheckedAt = 0;
const PERKS_CHECK_MS = 2000;
// watch-start to watch-stop: the recorder (thuum ADR-031, docs/VERB.md's
// Inventory). Everything this game's engine does to the player and to each
// actor near it at the start, one record shape for both (the player's is
// `self`, the others `actors`, by form id, so one that jumps out of range is
// still followed): the same record from a solo game (a reference,
// lab/references) and from each multiplayer game is what a parity scenario
// diffs. Fields, each [ms since watch-start, ...]:
// - first, last, maxDisplacement, samples: where it was and how far it got;
//   maxStep, maxStepMs: the largest move between two frames and when (a
//   figure put at a teleport's landing moves its whole jump in one frame, a
//   glide a frame's share of it; thuum docs/verbs/cast-teleport.md), a throw
//   its flight; track: [ms, x, y, z] every WATCH_TRACK_MS, at most
//   WATCH_TRACK_MAX, so how far it got by a moment reads off the record (a
//   thrown figure's flight against its move once its player is up, thuum
//   docs/verbs/push.md);
// - health: each change this game saw (a figure's on every change, at most
//   WATCH_HEALTH_MAX: the engine's own damage to a figure shows for a frame
//   or so before the server's ChangeValues sets it, thuum
//   docs/verbs/marksman.md), magicka and stamina on a change at most every
//   WATCH_SELF_MS (a figure holds a million magicka, formView.ts, and a stream
//   drains it, so a figure's falls while it streams in this game, thuum
//   docs/verbs/spell-cast.md);
// - events: every animation event sent to its graph, [ms, name, 1 if the
//   graph took it once every hook had run], from the load-time hooks below
//   (no name list: a list grown one verb at a time is what kept missing
//   pieces, ADR-031);
// - vars: Skyrim Platform's snapshot of its master behavior variables
//   (VAR_* below) on each change, [ms, value], floats on a change of more
//   than VAR_EPSILON at most every WATCH_SELF_MS; bools: the graph variables
//   watch-start names (args.bools), read by name, as before;
// - casts [ms, spell], hits it dealt [ms, target, source, projectile, flags],
//   hits it took [ms, aggressor, source, flags] and effects applied to it
//   [ms, caster, effect], as the engine's events report them (flags: power
//   1, sneak 2, bash 4, blocked 8).
// - launches [ms, projectile, ammo, spell, originX, originY, originZ,
//   angleX, angleZ, power]: every projectile the engine launched for it, as
//   the fork's projectileLaunched event reports Projectile::Launch's data.
type Watched = {
  name: string;
  first: number[];
  last: number[];
  maxDisplacement: number;
  samples: number;
  maxStep: number;
  maxStepMs: number;
  track: number[][];
  health: number[][];
  magicka: number[][];
  stamina: number[][];
  events: Array<[number, string, number]>;
  vars: Record<string, number[][]>;
  bools: Record<string, Array<[number, boolean]>>;
  casts: Array<[number, number]>;
  hits: Array<[number, number, number, number, number]>;
  taken: Array<[number, number, number, number]>;
  effects: Array<[number, number, number]>;
  // the projectiles it launched [ms, projectile, ammo, spell, originX,
  // originY, originZ, angleX, angleZ, power], as the engine launched them
  // (the fork's projectileLaunched event, Projectile::Launch's LaunchData;
  // thuum docs/verbs/marksman.md: the arrow's path identical on both screens)
  launches: Array<[number, number, number, number, number, number, number, number, number, number]>;
  // its projectiles' flights as they start [ms, ammo, x, y, z, angleX,
  // angleZ, power, projectile, spell]: the projectile's first update, its
  // angles after the player's auto-aim (the fork's projectileFlight event;
  // the path the arrow flies). Arrows since m2-arrow-path (ammo set, spell
  // 0); a spell's projectiles since m2-train30-flights (ammo 0, spell set:
  // Scattershock's heading on the observer, docs/verbs/spell-cast.md). The
  // first eight columns are lab-api's pairing (assertions.py _rows(.., 8))
  flights: Array<[number, number, number, number, number, number, number, number, number, number]>;
  // the actions the engine performed for it [ms, action, idle, eventName,
  // type] (the player's only: the platform's hook reports the player's own;
  // thuum docs/verbs/cast-action.md)
  actions: Array<[number, number, number, string, number]>;
  // frame changes [ms, step]: a step past WATCH_FRAME_JUMP_UNITS in one
  // update is a cell's coordinate frame changing under the actor (Embry
  // through the inn's door read as a 50032-unit jump, docs/research/m3
  // readings 2026-10-18), not a move; it is recorded here, `first` and
  // `last` re-based, and maxDisplacement and maxStep left alone
  frameChanges: Array<[number, number]>;
  // whether the actor's 3D was loaded at watch-start and at watch-stop
  // (Papyrus ObjectReference.Is3DLoaded): an actor in an unloaded cell
  // reads motionless; this tells it from one sitting still
  loaded: [boolean, boolean];
  // its heading (GetAngleZ, degrees) every WATCH_TRACK_MS as the track is,
  // [ms, angleZ]; `turned` the net rotation in degrees summed over every
  // frame's change, each wrapped into a half turn (so a spin at any rate
  // under half a turn a frame counts whole), and `headingAtStop` the last
  // heading read: thuum docs/verbs/npc-puppet.md, a copy's spin (playtest
  // thirty's wolves) is many turns where a walk nets under one
  heading: number[][];
  turned: number;
  headingAtStop: number;
};
const WATCH_HEALTH_MAX = 512;
const WATCH_SELF_MAX = 256;
const WATCH_EVENTS_MAX = 4096;
const WATCH_SELF_MS = 50;
const WATCH_TRACK_MS = 250;
const WATCH_TRACK_MAX = 240;
// the most a watch may ask for in {trackMax}: ten minutes at WATCH_TRACK_MS
const WATCH_TRACK_MAX_CAP = 2400;
const VAR_EPSILON = 0.01;
// no actor moves this far in one update (Whirlwind Sprint's longest dash
// spread 2140 units over several reports, docs/verbs/movement-speed.md); a
// larger step is the coordinate frame changing
const WATCH_FRAME_JUMP_UNITS = 5000;
let watching: { startedAt: number; actors: Map<number, Watched>; self: Watched; trackMax: number } | null = null;

// thuum docs/verbs/cell-host.md (the Dynamic plan's x-cell-attach): the
// engine's cell events as this game sees them between cell-events-start and
// cell-events-stop: every cellFullyLoaded with its cell; cellAttach and
// cellDetach counted per cell (they fire per reference, hundreds a cell);
// the player's parent cell sampled every WATCH_TRACK_MS; and isAttached() of
// every cell seen, read at each sample. Decides which cells fire, once each,
// at a load and a shift, and whether isAttached tracks the detach.
type CellSeen = { interior: boolean; attached: Array<[number, boolean]>; attach: number; detach: number; firstAttachMs: number; lastDetachMs: number };
let cellEvents: { startedAt: number; lastSample: number; loaded: Array<[number, number]>; seen: Map<number, CellSeen>; parent: Array<[number, number]> } | null = null;
const CELL_EVENTS_SAMPLES_MAX = 2400; // ten minutes at WATCH_TRACK_MS

function cellSeen(id: number, interior: boolean): CellSeen {
  if (!cellEvents) throw new Error("no cell-events");
  let s = cellEvents.seen.get(id);
  if (!s) {
    s = { interior, attached: [], attach: 0, detach: 0, firstAttachMs: -1, lastDetachMs: -1 };
    cellEvents.seen.set(id, s);
  }
  return s;
}

function trackCellEvents(): void {
  if (!cellEvents) return;
  const now = Date.now();
  if (now - cellEvents.lastSample < WATCH_TRACK_MS) return;
  cellEvents.lastSample = now;
  const ms = now - cellEvents.startedAt;
  if (cellEvents.parent.length >= CELL_EVENTS_SAMPLES_MAX) return;
  const me = Game.getPlayer();
  const parent = me ? me.getParentCell() : null;
  cellEvents.parent.push([ms, parent ? parent.getFormID() : 0]);
  cellEvents.seen.forEach((s, id) => {
    const cell = Cell.from(Game.getFormEx(id));
    const attached = cell !== null && cell.isAttached();
    const last = s.attached.length ? s.attached[s.attached.length - 1][1] : null;
    // a change, or the first reading: the rows stay short over a long walk
    if (last === null || last !== attached) s.attached.push([ms, attached]);
  });
}

on("cellFullyLoaded", (e) => {
  if (!cellEvents) return;
  const ms = Date.now() - cellEvents.startedAt;
  const id = e.cell.getFormID();
  cellSeen(id, e.cell.isInterior());
  cellEvents.loaded.push([ms, id]);
});

on("cellAttach", (e) => {
  if (!cellEvents) return;
  const ms = Date.now() - cellEvents.startedAt;
  const cell = e.refr.getParentCell();
  if (!cell) return;
  const s = cellSeen(cell.getFormID(), cell.isInterior());
  s.attach += 1;
  if (s.firstAttachMs < 0) s.firstAttachMs = ms;
});

on("cellDetach", (e) => {
  if (!cellEvents) return;
  const ms = Date.now() - cellEvents.startedAt;
  const cell = e.refr.getParentCell();
  if (!cell) return;
  const s = cellSeen(cell.getFormID(), cell.isInterior());
  s.detach += 1;
  s.lastDetachMs = ms;
});

// thuum docs/verbs/quest-stage.md (H-56a: does a placement or a walk into
// Riverwood raise the Story Manager's Change Location event, and does the
// SM then start A Lovely Letter 0x74a83?): the platform's locationChanged
// (the player's own, 0x14; residents cross locations all day) and the
// quest start and stop events, logged for the lab's log-count through the
// console tee (lab-console-log). No step and no state: a probe reads the
// lines. A missing form is logged as none rather than thrown.
on("locationChanged", (e) => {
  try {
    const actor = e.actor ? e.actor.getFormID() : 0;
    if (actor !== 0x14) return;
    const oldLoc = e.oldLoc ? e.oldLoc.getFormID().toString(16) : "none";
    const newLoc = e.newLoc ? e.newLoc.getFormID().toString(16) : "none";
    log(`locationChanged actor ${actor.toString(16)} old ${oldLoc} new ${newLoc}`);
  } catch (err) {
    log(`locationChanged: unreadable event (${String(err)})`);
  }
});

// A quest a mod's own script starts and stops twice a second (Reading List's
// RL_DetectionQuest, playtest 38's finding 77; D65) would flood the console
// the probes read: one line per quest and kind per ten seconds, carrying the
// count of the lines it stands for. The first line of a quest is never held,
// so a log-count on "questStart quest 74a83" still reads the start.
const questLineAt = new Map<string, [number, number]>();
function logQuestEvent(kind: string, quest: string): void {
  const key = `${kind} ${quest}`;
  const now = Date.now();
  const seen = questLineAt.get(key);
  if (seen && now - seen[0] < 10_000) {
    seen[1] += 1;
    return;
  }
  const held = seen ? seen[1] : 0;
  questLineAt.set(key, [now, 0]);
  log(held > 0 ? `${kind} quest ${quest} (and ${held} more in the last 10 s)` : `${kind} quest ${quest}`);
}

on("questStart", (e) => {
  try {
    const quest = e.quest ? e.quest.getFormID().toString(16) : "none";
    logQuestEvent("questStart", quest);
  } catch (err) {
    log(`questStart: unreadable event (${String(err)})`);
  }
});

on("questStop", (e) => {
  try {
    const quest = e.quest ? e.quest.getFormID().toString(16) : "none";
    logQuestEvent("questStop", quest);
  } catch (err) {
    log(`questStop: unreadable event (${String(err)})`);
  }
});

// The master behavior variables Skyrim Platform reads into
// getAnimationVariablesFromActor's three buffers (uint8 booleans, float32
// floats, uint32 integers), in its index order: the fork's
// skyrim-platform/src/platform_se/skyrim_platform/Magic/AnimVariableMasterGraphIndexes.cpp
// (CreateDefault), the set skymp5-client relays with a cast (thuum
// docs/verbs/spell-cast.md, the concentration pose)
const VAR_BOOLS = ["bEquipOk", "bMotionDriven", "IsBeastRace", "IsSneaking", "IsBleedingOut", "IsCastingDual", "Is1HM", "IsCastingRight", "IsCastingLeft", "IsBlockHit", "IsPlayer", "IsNPC", "bIsSynced", "bVoiceReady", "bWantCastLeft", "bWantCastRight", "bWantCastVoice", "b1HM_MLh_attack", "b1HMCombat", "bAnimationDriven", "bCastReady", "IsAttacking", "bAllowRotation", "bMagicDraw", "bMLh_Ready", "bMRh_Ready", "bInMoveState", "bSprintOK", "bIdlePlaying", "bIsDialogueExpressive", "bAnimObjectLoaded", "bEquipUnequip", "bAttached", "bIsH2HSolo", "bHeadTracking", "bIsRiding", "bTalkable", "bRitualSpellActive", "bInJumpState", "bHeadTrackSpine", "bLeftHandAttack", "bIsInMT", "bHumanoidFootIKEnable", "bHumanoidFootIKDisable", "bStaggerPlayerOverride", "bNoStagger", "bIsStaffLeftCasting", "bPerkShieldCharge", "bPerkQuickShot", "IsBlocking", "IsBashing", "IsStaggering", "IsRecoiling", "IsEquipping", "IsUnequipping", "isInFurniture", "bNeutralState", "bBowDrawn", "PitchOverride", "NotCasting"];
const VAR_FLOATS = ["TurnDelta", "Direction", "SpeedSampled", "weapAdj", "Speed", "CastBlend", "PitchOffset", "SpeedDamped", "Pitch", "VelocityZ", "1stPRot", "1stPRotDamped", "CastBlendDamped", "AimPitchCurrent", "AimHeadingCurrent", "BowAimOffsetPitch", "BowAimOffsetHeading", "MagicAimOffsetHeading", "MagicAimOffsetPitch"];
const VAR_INTS = ["iRightHandEquipped", "iLeftHandEquipped", "i1HMState", "iState", "iLeftHandType", "iRightHandType", "iSyncIdleLocomotion", "iSyncForwardState", "iSyncTurnState", "iIsInSneak", "iWantBlock", "iRegularAttack", "testint", "currentDefaultState"];

function newWatched(actor: Actor, bools: string[]): Watched {
  const pos = positionOf(actor);
  const named: Record<string, Array<[number, boolean]>> = {};
  for (const n of bools) named[n] = [];
  return {
    name: actor.getDisplayName(), first: pos, last: pos, maxDisplacement: 0, samples: 0, maxStep: 0, maxStepMs: -1,
    track: [[0, pos[0], pos[1], pos[2]]],
    health: [[0, actor.getActorValue("health")]], magicka: [[0, actor.getActorValue("magicka")]], stamina: [[0, actor.getActorValue("stamina")]],
    events: [], vars: {}, bools: named, casts: [], hits: [], taken: [], effects: [], launches: [], flights: [], actions: [],
    frameChanges: [], loaded: [actor.is3DLoaded(), false],
    heading: [[0, actor.getAngleZ()]], turned: 0, headingAtStop: actor.getAngleZ(),
  };
}

// the record of a watched actor (the player's own at 0x14), if any
function watchedRecord(id: number): Watched | undefined {
  if (!watching) return undefined;
  return id === 0x14 ? watching.self : watching.actors.get(id);
}
const SCREENSHOT_WAIT_MS = 10000;

// eslint-disable-next-line @typescript-eslint/no-var-requires
const nodeFs = require("fs") as {
  existsSync(p: string): boolean;
  readFileSync(p: string): { toString(enc: string): string; length: number };
  mkdirSync(p: string, o: { recursive: boolean }): void;
  rmSync(p: string, o: { force: boolean }): void;
};
// eslint-disable-next-line @typescript-eslint/no-var-requires
const nodeCrypto = require("crypto") as { createHash(alg: string): { update(d: unknown): { digest(enc: string): string } } };

// RaceMenu's preset folder under the game's folder, where its CharGen natives
// save and load a preset by name (RaceMenu's scripts\source\chargen.psc;
// thuum docs/verbs/racemenu-sync.md)
const RACEMENU_PRESETS = "Data/SKSE/Plugins/CharGen/Presets/";

function form(id: unknown): ObjectReference | null {
  const n = typeof id === "number" ? id : typeof id === "string" ? parseInt(id, 0) : NaN;
  if (!Number.isFinite(n)) return null;
  return ObjectReference.from(Game.getFormEx(n));
}

// hold-key's keys and when to let each go; released in update
const heldKeys: Array<{ code: number; until: number }> = [];
// anim-event's {delayMs} and {delayFrames}: each event is sent from update
// once its time or its frame comes (a Utility.wait continuation never sent
// one: x-figure-cast2 20261014-182025, every delayed start missing from the
// figure's graph)
const delayedEvents: Array<{ due: number; frames: number; targetId: number; name: string }> = [];

// repeat's state: one step performed `times` times at a person's rhythm (thuum ADR-033, the sequence
// rows: a cast again 400 to 700 ms after the last exit, which the lab's one-cast probes never did and
// playtest nineteen did every few seconds), each repetition from update once its time comes, a
// hold-key's hold counted before the gap. The gaps come from a small generator seeded by the step (or
// the clock), so a run's result lists them and a seed gives the same rhythm again.
const REPEATABLE = new Set(["hold-key", "tap-key", "anim-event", "cast", "equip", "draw-weapon", "activate", "figure-action"]);
let repeating: {
  step: Step; inner: Step; times: number; done: number; nextAt: number; gapMin: number; gapMax: number;
  seed: number; startedAt: number; at: number[]; gaps: number[];
} | null = null;

function finishRepeat(c: Config, player: Actor): void {
  const r = repeating;
  if (!r || Date.now() < r.nextAt) return;
  const now = Date.now();
  try {
    const out = run(r.inner, player);
    if (out === DEFERRED || (out && typeof out === "object" && "error" in (out as Record<string, unknown>))) {
      repeating = null;
      const why = out === DEFERRED ? "a step that finishes later" : String((out as Record<string, unknown>).error);
      postResult(c, r.step, { ok: false, error: `repetition ${r.done + 1} of ${r.times}: ${why}` });
      return;
    }
    r.at.push(now - r.startedAt);
    r.done++;
    if (r.done >= r.times) {
      repeating = null;
      postResult(c, r.step, { ok: true, data: { times: r.done, at: r.at, gaps: r.gaps, seed: r.seed } });
      return;
    }
    const held = r.inner.action === "hold-key" ? num((r.inner.args || {}).ms, 0) : 0;
    r.seed = (r.seed * 1103515245 + 12345) & 0x7fffffff;
    const gap = Math.round(r.gapMin + (r.gapMax - r.gapMin) * (r.seed / 0x7fffffff));
    r.gaps.push(gap);
    r.nextAt = now + held + gap;
  } catch (e) {
    repeating = null;
    postResult(c, r.step, { ok: false, error: `repetition ${r.done + 1} of ${r.times}: ${String(e)}` });
  }
}

function sendDelayedEvents(): void {
  const now = Date.now();
  for (let i = delayedEvents.length - 1; i >= 0; i--) {
    const d = delayedEvents[i];
    if (d.frames > 0) {
      if (--d.frames > 0) continue;
    } else if (now < d.due) continue;
    delayedEvents.splice(i, 1);
    const ref = ObjectReference.from(Game.getFormEx(d.targetId));
    if (ref) Debug.sendAnimationEvent(ref, d.name);
  }
}

function releaseHeldKeys(): void {
  const now = Date.now();
  for (let i = heldKeys.length - 1; i >= 0; i--) {
    if (heldKeys[i].until <= now) {
      Input.releaseKey(heldKeys[i].code);
      heldKeys.splice(i, 1);
    }
  }
}

// figure-action's {replay: all}: the player's recorded actions performed on
// a target at their original spacing, from update (thuum
// docs/verbs/cast-action.md: the figure plays the caster's actions as the
// sync will relay them)
// an entry waits for its time (at) or, with frames > 0, that many updates
const scheduledReplays: Array<{ at: number; frames: number; targetId: number; rec: RecordedAction; set: Record<string, unknown>; variables: boolean; delayFrames: number }> = [];

// One action on an actor through the engine's action entry (the fork's
// performAction): the recorded variables first when asked and present (the
// caster's graph as it was when its engine chose the idle), then {set}'s
// named variables, then the action; with delayFrames > 0 the action goes
// that many updates after the variables instead of in the same tick (the
// graph took a start whose variables landed a frame earlier, x-left-firebolt
// 20261015-031632, and refused one sent in the same tick as its want
// variable, x-figure-cast 20261014-142425). What was done, for the step's
// answer and the client log.
function replayOn(target: Actor, rec: RecordedAction, set: Record<string, unknown>, variables: boolean, delayFrames = 0): Record<string, unknown> {
  let applied: boolean | undefined;
  if (variables && rec.variables) applied = applyAnimationVariablesToActor(target.getFormID(), rec.variables);
  for (const [k, v] of Object.entries(set)) {
    if (typeof v === "boolean") target.setAnimationVariableBool(k, v);
    else if (typeof v === "number") target.setAnimationVariableFloat(k, v);
  }
  if (delayFrames > 0) {
    scheduledReplays.push({ at: 0, frames: delayFrames, targetId: target.getFormID(), rec, set: {}, variables: false, delayFrames: 0 });
    const out = { prepared: rec.action, idle: rec.idle, event: rec.eventName, type: rec.type, on: target.getFormID(), applied, set: Object.keys(set), performInFrames: delayFrames, recordedAt: rec.ms };
    printConsole("lab-driver: figure-action", JSON.stringify(out));
    return out;
  }
  // an older Skyrim Platform has no such export: the binding is undefined
  const perform: unknown = performAction;
  if (typeof perform !== "function") return { error: "no performAction in this Skyrim Platform" };
  const taken = (perform as typeof performAction)(target.getFormID(), rec.action, rec.idle, rec.eventName, rec.type);
  const out = { performed: rec.action, idle: rec.idle, event: rec.eventName, type: rec.type, on: target.getFormID(), applied, taken, set: Object.keys(set), recordedAt: rec.ms };
  printConsole("lab-driver: figure-action", JSON.stringify(out));
  return out;
}

function runScheduledReplays(): void {
  const now = Date.now();
  // the entries as they stand at this update: one replayOn adds the frame
  // step of its own action, which must wait for the next update
  for (const s of scheduledReplays.slice()) {
    if (s.frames > 0) {
      if (--s.frames > 0) continue;
    } else if (s.at > now) continue;
    const i = scheduledReplays.indexOf(s);
    if (i >= 0) scheduledReplays.splice(i, 1);
    const target = Actor.from(Game.getFormEx(s.targetId));
    if (target) replayOn(target, s.rec, s.set, s.variables, s.delayFrames);
  }
}

function num(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

// The engine's six time globals, Skyrim.esm form ids (lab/esm.py,
// 2026-10-03): the server's game clock as this client renders it (thuum
// docs/verbs/time.md)
const TIME_GLOBALS: Array<[string, number]> = [
  ["gameYear", 0x35],
  ["gameMonth", 0x36],
  ["gameDay", 0x37],
  ["gameHour", 0x38],
  ["gameDaysPassed", 0x39],
  ["timeScale", 0x3a],
];

function timeGlobals(): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const [name, id] of TIME_GLOBALS) {
    const g = GlobalVariable.from(Game.getFormEx(id));
    out[name] = g ? g.getValue() : null;
  }
  return out;
}

// an actor value as Papyrus reads it: the base (GetBaseActorValue), the
// current value (GetActorValue), the maximum (GetActorValueMax) and the
// percentage of the maximum (GetActorValuePercentage)
function readActorValue(actor: Actor, name: string) {
  return {
    base: actor.getBaseActorValue(name),
    current: actor.getActorValue(name),
    max: actor.getActorValueMax(name),
    percentage: actor.getActorValuePercentage(name),
  };
}

function actorValue(player: Actor, name: string) {
  return { value: player.getActorValue(name), percentage: player.getActorValuePercentage(name) };
}

function describe(actor: Actor) {
  const base = actor.getLeveledActorBase();
  const race = actor.getRace();
  const right = actor.getEquippedObject(1);
  const left = actor.getEquippedObject(0);
  return {
    formId: actor.getFormID(),
    name: actor.getDisplayName(),
    race: race ? race.getName() : "",
    raceId: race ? race.getFormID() : 0,  // lab-api compares raceId (the server's appearance record carries ids)
    sex: base ? base.getSex() : -1,
    isDead: actor.isDead(),
    healthPercentage: actor.getActorValuePercentage("health"),
    equippedRight: right ? right.getFormID() : 0,
    equippedLeft: left ? left.getFormID() : 0,
    // the reference's bounding box (Papyrus GetLength, GetWidth, GetHeight),
    // for the melee reach measurement: the engine's hit test subtracts each
    // actor's forward bound extent (ghidra/notes/melee-reach-1-7-104.md)
    length: actor.getLength(),
    width: actor.getWidth(),
    height: actor.getHeight(),
  };
}

// Other actors within 4096 units, the nearest eight. The Papyrus API has no
// enumeration; findClosestActor at our own position returns ourselves, so
// sample findRandomActor until 32 draws in a row add nobody new (at most 160).
// Twelve draws over a spawn's four or five actors missed one of them about one
// run in twenty: a-restart-persistence 20261022-113744 read "c2 does not see
// c1" with c1's figure 300 units away (thuum-magnus's read of the dumps).
function nearbyActors(player: Actor): Actor[] {
  const found: Actor[] = [];
  const seen = new Set<number>([player.getFormID()]);
  const px = player.getPositionX();
  const py = player.getPositionY();
  const pz = player.getPositionZ();
  for (let i = 0, idle = 0; i < 160 && idle < 32; i++) {
    const other = Game.findRandomActor(px, py, pz, 4096);
    const id = other ? other.getFormID() : 0;
    if (!other || seen.has(id)) {
      idle++;
      continue;
    }
    seen.add(id);
    found.push(other);
    idle = 0;
  }
  return found.sort((x, y) => distanceTo(player, x) - distanceTo(player, y)).slice(0, 8);
}

// the actor nearest the player other than itself (in the lab, the other
// player's figure)
// the NPC a solo reference's place-npc step put down (ADR-031): {other}
// names it, not the nearest actor a random search finds
let placedId = 0;
// the papyrus-log step's hook, removed by {stop: true} or replaced by the next
let papyrusLogId: number | null = null;
// every NPC placed this session (place-npc), oldest first: a watch names
// them all (r-npc-fight's random search missed one of two bandits,
// docs/research/m3 readings 2026-10-18); placedId stays the last for the
// steps that act on one
const placedIds: number[] = [];

function nearestOther(player: Actor): Actor {
  if (placedId) {
    const placed = Actor.from(Game.getFormEx(placedId));
    if (placed) return placed;
  }
  const others = nearbyActors(player).sort((x, y) => distanceTo(player, x) - distanceTo(player, y));
  if (others.length === 0) throw new Error("no other actor nearby");
  return others[0];
}

// A RaceMenu preset's look as one hash: its JSON with keys sorted, the head
// parts as a set of "plugin|FormID" (RaceMenu writes each part's position in
// the NPC's list as its "type", and its own load and save can swap two, run
// 20261007-014139) and the version block left out, so two saves of one look
// compare equal whatever the file's bytes
function lookHash(text: string): string {
  const look = JSON.parse(text) as Record<string, unknown>;
  delete look["version"];
  const parts = look["headParts"];
  if (Array.isArray(parts)) {
    look["headParts"] = parts.map((p) => String((p as Record<string, unknown>)["formIdentifier"])).sort();
  }
  return nodeCrypto.createHash("sha256").update(canonicalJson(look)).digest("hex");
}

function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return "[" + v.map(canonicalJson).join(",") + "]";
  if (v !== null && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return "{" + Object.keys(o).sort().map((k) => JSON.stringify(k) + ":" + canonicalJson(o[k])).join(",") + "}";
  }
  return JSON.stringify(v);
}

// an actor's sex as NiOverride keys its transforms
function isFemale(actor: Actor): boolean {
  const base = ActorBase.from(actor.getBaseObject());
  return base !== null && base.getSex() === 1;
}

function distanceTo(a: Actor, b: Actor): number {
  const dx = a.getPositionX() - b.getPositionX();
  const dy = a.getPositionY() - b.getPositionY();
  const dz = a.getPositionZ() - b.getPositionZ();
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// SKSE's Cell.GetNumRefs and GetNthRef filter on the BASE form's type (skse64
// 2.2.6 PapyrusCell.cpp:25 and :46, ref->baseForm->formType == formType;
// lab/.cache/skse64_2_02_06-unpacked), so a refs-near type names what a
// reference is an instance of, FormTypes.h's base rows (CommonLibSSE-NG
// include/RE/F/FormTypes.h): 0x18 ACTI an activator (:164), 0x2B NPC_ an
// actor (:183), 0x32 PROJ any projectile, an arrow or a rune's grenade (:190),
// 0x33 HAZD a placed hazard (:191). The reference classes, 0x3D REFR to 0x46
// PHZD (:201-210), match no base: the arrows step's 0x40 PARW counted nothing
// for that reason (docs/verbs/marksman.md, x-double-arrow 20261012-022022). A
// refs-near step asked for one answers its 0 with a note naming the base type.
const REFERENCE_CLASS_BASE: Record<number, number> = {
  0x3e: 0x2b, 0x3f: 0x32, 0x40: 0x32, 0x41: 0x32, 0x42: 0x32, 0x43: 0x32, 0x44: 0x32, 0x45: 0x32, 0x46: 0x33,
};
// Base types whose references refs-near counts without listing: Papyrus
// aborts every call on a projectile reference (the projectiles step's note)
const COUNT_ONLY_BASE_TYPES = new Set([0x32]);

// The nearest reference of a base within radius units of (fx, fy, fz),
// Papyrus Game.FindClosestReferenceOfType, its distance narrowed to precision
// units by bisecting the radius (Papyrus reads no position of a projectile
// reference, so the search is the one call that answers); null for none. The
// projectiles and refs-near steps' one search.
function closestOfBase(base: Form, fx: number, fy: number, fz: number, radius: number, precision: number): { formId: number; distance: number } | null {
  const nearest = Game.findClosestReferenceOfType(base, fx, fy, fz, radius);
  if (!nearest) return null;
  let lo = 0;
  let hi = radius;
  while (hi - lo > precision) {
    const mid = (lo + hi) / 2;
    if (Game.findClosestReferenceOfType(base, fx, fy, fz, mid)) hi = mid;
    else lo = mid;
  }
  return { formId: nearest.getFormID(), distance: hi };
}

function positionOf(actor: Actor): number[] {
  return [actor.getPositionX(), actor.getPositionY(), actor.getPositionZ()];
}

function trackWatch(): void {
  if (!watching) return;
  const ms = Date.now() - watching.startedAt;
  watching.actors.forEach((w, id) => {
    const actor = Actor.from(Game.getFormEx(id));
    if (actor) trackWatched(actor, id, w, ms, false);
  });
  const me = Game.getPlayer();
  if (me) trackWatched(me, 0x14, watching.self, ms, true);
}

// One frame of a watched actor's record. The player's own health and
// magicka keep their WATCH_SELF_MS pace (as before the recorder); another
// actor's health is taken on every change (its one-frame engine damage).
function trackWatched(actor: Actor, id: number, w: Watched, ms: number, own: boolean): void {
  const angle = actor.getAngleZ();
  w.turned += ((angle - w.headingAtStop + 540) % 360) - 180;
  w.headingAtStop = angle;
  const lastHeading = w.heading[w.heading.length - 1];
  if (ms - lastHeading[0] >= WATCH_TRACK_MS && w.heading.length < (watching ? watching.trackMax : WATCH_TRACK_MAX)) {
    w.heading.push([ms, angle]);
  }
  const pos = positionOf(actor);
  const sx = pos[0] - w.last[0];
  const sy = pos[1] - w.last[1];
  const sz = pos[2] - w.last[2];
  const step = Math.sqrt(sx * sx + sy * sy + sz * sz);
  if (step > WATCH_FRAME_JUMP_UNITS) {
    if (w.frameChanges.length < WATCH_SELF_MAX) w.frameChanges.push([ms, step]);
    w.first = pos;
    w.last = pos;
    w.samples += 1;
    return;
  }
  const dx = pos[0] - w.first[0];
  const dy = pos[1] - w.first[1];
  const dz = pos[2] - w.first[2];
  w.maxDisplacement = Math.max(w.maxDisplacement, Math.sqrt(dx * dx + dy * dy + dz * dz));
  if (step > w.maxStep) {
    w.maxStep = step;
    w.maxStepMs = ms;
  }
  w.last = pos;
  w.samples += 1;
  const lastTrack = w.track[w.track.length - 1];
  if (ms - lastTrack[0] >= WATCH_TRACK_MS && w.track.length < (watching ? watching.trackMax : WATCH_TRACK_MAX)) {
    w.track.push([ms, pos[0], pos[1], pos[2]]);
  }
  for (const [av, seen] of [["health", w.health], ["magicka", w.magicka], ["stamina", w.stamina]] as Array<[string, number[][]]>) {
    const value = actor.getActorValue(av);
    const last = seen[seen.length - 1];
    if (value === last[1]) continue;
    if (av === "health" && !own) {
      if (seen.length < WATCH_HEALTH_MAX) seen.push([ms, value]);
    } else if (ms - last[0] >= WATCH_SELF_MS && seen.length < WATCH_SELF_MAX) {
      seen.push([ms, value]);
    }
  }
  for (const name of Object.keys(w.bools)) {
    const seen = w.bools[name];
    // "av:Name" is an actor value above zero, not a graph variable: a
    // figure's Invisibility (docs/verbs/self-cast.md: the effect raises it,
    // formView reads it for the name) is the recast row's measure
    const value = name.startsWith("av:") ? actor.getActorValue(name.slice(3)) > 0 : actor.getAnimationVariableBool(name);
    if ((seen.length === 0 || seen[seen.length - 1][1] !== value) && seen.length < WATCH_SELF_MAX) {
      seen.push([ms, value]);
    }
  }
  trackVars(id, w, ms);
}

// The actor's master behavior variables from Skyrim Platform's snapshot, on
// change: a bool or an int on any change, a float on a change of more than
// VAR_EPSILON at most every WATCH_SELF_MS (Speed and the aim angles move
// every frame). The first sample opens every series.
function trackVars(id: number, w: Watched, ms: number): void {
  let snap: { booleans: ArrayBuffer; floats: ArrayBuffer; integers: ArrayBuffer } | undefined;
  try {
    snap = getAnimationVariablesFromActor(id);
  } catch (e) {
    return;
  }
  if (!snap) return;
  const take = (names: string[], values: ArrayLike<number>, float: boolean) => {
    for (let i = 0; i < names.length && i < values.length; i++) {
      const value = values[i];
      const seen = w.vars[names[i]] || (w.vars[names[i]] = []);
      const last = seen[seen.length - 1];
      if (last) {
        if (float ? Math.abs(value - last[1]) <= VAR_EPSILON || ms - last[0] < WATCH_SELF_MS : value === last[1]) continue;
        if (seen.length >= WATCH_SELF_MAX) continue;
      }
      seen.push([ms, float ? Math.round(value * 1000) / 1000 : value]);
    }
  };
  take(VAR_BOOLS, bytesOf(snap.booleans), false);
  const floats = bytesOf(snap.floats);
  take(VAR_FLOATS, new Float32Array(floats.buffer, 0, floats.length >> 2), true);
  const ints = bytesOf(snap.integers);
  take(VAR_INTS, new Uint32Array(ints.buffer, 0, ints.length >> 2), false);
}

// Skyrim Platform hands each snapshot buffer over as a Uint8Array of its
// bytes (skyrim-platform JsUtils.h, AddObjProperty: Napi::Uint8Array), though
// its typing says ArrayBuffer. A float or an int is four of those bytes, so
// the typed view goes over a copy's buffer, never element by element (the
// first lab run, x-recorder 20261014-055628, read single bytes as floats)
function bytesOf(v: unknown): Uint8Array {
  if (v instanceof Uint8Array) {
    const copy = new Uint8Array(v.length);
    copy.set(v);
    return copy;
  }
  if (v instanceof ArrayBuffer) return new Uint8Array(v.slice(0));
  return new Uint8Array(0);
}

function watchedMs(): number {
  return watching ? Date.now() - watching.startedAt : 0;
}

// every projectile the engine launched for a watched actor (the shooter's
// own arrow and the figure's replay alike): the recorder's measure of the
// arrow's path on both screens. No game call here (the event's context).
// Only a Skyrim Platform with the event has it (fork m2-arrow-path):
// subscribing to an unknown event throws (EventManager::Subscribe), and the
// driver must load on parity too, where `launches` stays empty.
try {
  on("projectileLaunched", (e) => {
    const w = watchedRecord(e.shooter);
    if (w && w.launches.length < WATCH_SELF_MAX) {
      w.launches.push([watchedMs(), e.projectile, e.ammo, e.spell, e.originX, e.originY, e.originZ, e.angleX, e.angleZ, e.power]);
    }
  });
} catch (err) {
  printConsole(`lab-driver: no projectileLaunched event on this Skyrim Platform (${err}); launches are not recorded`);
}
try {
  on("projectileFlight", (e) => {
    const w = watchedRecord(e.shooter);
    if (w && w.flights.length < WATCH_SELF_MAX) {
      w.flights.push([watchedMs(), e.ammo, e.x, e.y, e.z, e.angleX, e.angleZ, e.power, e.projectile, e.spell]);
    }
  });
} catch (err) {
  printConsole(`lab-driver: no projectileFlight event on this Skyrim Platform (${err}); flights are not recorded`);
}

on("spellCast", (e) => {
  if (!watching || !e.caster) return;
  const w = watchedRecord(e.caster.getFormID());
  if (w && w.casts.length < WATCH_SELF_MAX) w.casts.push([watchedMs(), e.spell ? e.spell.getFormID() : 0]);
});

// thuum docs/verbs/cast-action.md: the actions the engine performs for the
// player (a hand's attack, ready, release, interrupt; the dual and voice
// ones), with the idle it chose; the reference of what a figure must replay.
// A client without the fork's hook has no such event, and the driver loads
// all the same.
// The player's latest actions, the variables kept, for figure-action's
// replay: a figure playing the caster's own action with the caster's own
// variables, as the sync will relay them (the probes x-figure-action*)
type RecordedAction = { ms: number; action: number; idle: number; eventName: string; type: number; variables?: Parameters<typeof applyAnimationVariablesToActor>[1] };
const recentActions: RecordedAction[] = [];
const RECENT_ACTIONS_MAX = 64;
try {
  on("actionPerformed", (e) => {
    recentActions.push({ ms: Date.now(), action: e.action, idle: e.idle, eventName: e.eventName, type: e.type, variables: e.variables });
    if (recentActions.length > RECENT_ACTIONS_MAX) recentActions.shift();
    if (!watching) return;
    // the player's record: the hook reports the player's own actions, and a
    // Form method cannot be called in this event's context (x-figure-action
    // 20261015-053450: "'Form.getFormID' can't be called in this context")
    const w = watchedRecord(0x14);
    if (w && w.actions.length < WATCH_SELF_MAX) w.actions.push([watchedMs(), e.action, e.idle, e.eventName, e.type]);
  });
} catch (err) {
  printConsole("lab-driver: no actionPerformed event in this Skyrim Platform:", String(err));
}

// A hit's projectile base and its flags (power 1, sneak 2, bash 4, blocked
// 8) ride along: a magic stream's hit event comes twice in a frame
// (skymp5-client hitService.ts drops the second by time, which also drops a
// second hand's hits, docs/verbs/spell-cast.md), and the copies' fields are
// what can tell the double from the other hand.
on("hit", (e) => {
  if (!watching) return;
  const source = e.source ? e.source.getFormID() : 0;
  const projectile = e.projectile ? e.projectile.getFormID() : 0;
  const flags = (e.isPowerAttack ? 1 : 0) | (e.isSneakAttack ? 2 : 0) | (e.isBashAttack ? 4 : 0) | (e.isHitBlocked ? 8 : 0);
  const aggressor = e.aggressor ? e.aggressor.getFormID() : 0;
  const target = e.target ? e.target.getFormID() : 0;
  const dealt = watchedRecord(aggressor);
  if (dealt && dealt.hits.length < WATCH_SELF_MAX) dealt.hits.push([watchedMs(), target, source, projectile, flags]);
  const took = watchedRecord(target);
  if (took && took.taken.length < WATCH_SELF_MAX) took.taken.push([watchedMs(), aggressor, source, flags]);
});

on("magicEffectApply", (e) => {
  if (!watching || !e.target) return;
  const w = watchedRecord(e.target.getFormID());
  if (w && w.effects.length < WATCH_SELF_MAX) {
    w.effects.push([watchedMs(), e.caster ? e.caster.getFormID() : 0, e.effect ? e.effect.getFormID() : 0]);
  }
});

// Every animation event sent to a watched actor's graph (the recorder,
// ADR-031). Two hooks, each filtered in native by its form id range (rule
// 9): the 0xff range, which holds a multiplayer game's figures and a solo
// game's placed NPCs alike, and the player. No name pattern: the list of
// patterns this replaced (stagger*, recoil*, shout*, bow*, Sneak*, MRh_*,
// ...) grew one verb at a time and saw only what a verb already knew to look
// for. The handler returns at once outside a watch, and the driver runs on
// lab clones only. Added at load, before skymp5-client's services add theirs,
// so each sees the name its sender gave: deathService blanks every figure's
// staggerStart, and Skyrim Platform hands later hooks the blanked name.
// Recorded at leave, with whether the graph took the event once every hook
// had run (thuum docs/verbs/stagger.md).
const animationEventRecorder = {
  enter: () => {},
  leave: (ctx: { selfId: number; animEventName: string; animationSucceeded: boolean }) => {
    if (!watching) return;
    const w = watchedRecord(ctx.selfId);
    if (w && w.events.length < WATCH_EVENTS_MAX) w.events.push([watchedMs(), ctx.animEventName, ctx.animationSucceeded ? 1 : 0]);
  },
};
for (const [minId, maxId] of [[0xff000000, 0xffffffff], [0x14, 0x14]]) {
  hooks.sendAnimationEvent.add(animationEventRecorder, minId, maxId);
}
// A cell's own NPC (a plugin's form id, outside both ranges) gets its own
// hook, filtered in native to that one id (rule 9), the first time a
// watch-start names it in {formIds}; the hook stays for the game session
// and records only while that actor is watched (docs/research/m3, the
// 2026-10-17 readings: Riverwood's NPCs showed no events).
const namedEventHooks = new Set<number>();
function hookNamedActor(id: number): void {
  if (id === 0x14 || id >= 0xff000000 || namedEventHooks.has(id)) return;
  hooks.sendAnimationEvent.add(animationEventRecorder, id, id);
  namedEventHooks.add(id);
}
// the actor a step names: {formId}, else the placed NPC (place-npc), else none
// npc-state's gaze and face (npc-stream slice 5, train 54): the fork's Skyrim Platform reads an actor's head-track
// target (HighProcessData's highest set slot) and its face (BSFaceGenAnimationData's strongest expression keyframe and
// whether an override holds it) on the game thread when pollHostedGaze([ids]) asks, and hostedGaze(id) answers the
// last read as [targetFormId, slot, emotionType, emotionValue, exprOverride, exprIndex, exprValue] (PuppetApi.h). The
// getters exist only on builds with train 54 and not in the submodule's typings, so they are reached through the
// module object: on a build without them every field is null and nothing is called; npc-state's own timing is kept,
// so its answer carries the previous poll (null before a first poll) and polls anew
function gazeOf(formId: number): Record<string, number | boolean | null> {
  const none = { gazeTarget: null, gazeSlot: null, emotionType: null, emotionValue: null, exprOverride: null, exprIndex: null, exprValue: null };
  const api = skyrimPlatform as unknown as Record<string, unknown>;
  const read = api["hostedGaze"];
  const poll = api["pollHostedGaze"];
  if (typeof read !== "function" || typeof poll !== "function") return none;
  let last: unknown = null;
  try {
    last = (read as (id: number) => unknown)(formId);
  } catch (e) {
    last = null;
  }
  try {
    (poll as (ids: number[]) => void)([formId]);
  } catch (e) {
    // the next read answers null
  }
  if (!Array.isArray(last) || last.length < 7) return none;
  const num = (v: unknown): number | null => (typeof v === "number" ? v : null);
  return {
    gazeTarget: num(last[0]),
    gazeSlot: num(last[1]),
    emotionType: num(last[2]),
    emotionValue: num(last[3]),
    exprOverride: last[4] === null || last[4] === undefined ? null : Boolean(last[4]),
    exprIndex: num(last[5]),
    exprValue: num(last[6]),
  };
}

// face-keyframes's read (playtest 37's face probe, 2026-10-28): the fork's Skyrim Platform reads an actor's three
// FaceGen keyframe sets (BSFaceGenAnimationData's expression, modifier and phoneme, CommonLib
// RE/B/BSFaceGenAnimationData.h:39-42) on the game thread when pollFaceKeyframes(id) asks, and faceKeyframes(id)
// answers the last read as [expression[], modifier[], phoneme[], override] or null (fork m3-voice-inflight). Reached
// through the module object as gazeOf's getters are, and in their timing: the answer is the previous poll's, and the
// step polls anew, so a sampling probe reads one step behind and a single read is two steps.
function faceOf(formId: number): Record<string, unknown> {
  const api = skyrimPlatform as unknown as Record<string, unknown>;
  const read = api["faceKeyframes"];
  const poll = api["pollFaceKeyframes"];
  if (typeof read !== "function" || typeof poll !== "function") return { available: false };
  let last: unknown = null;
  try {
    last = (read as (id: number) => unknown)(formId);
  } catch (e) {
    last = null;
  }
  try {
    (poll as (id: number) => void)(formId);
  } catch (e) {
    // the next read answers null
  }
  if (!Array.isArray(last) || last.length < 4) return { available: true, read: false };
  const nums = (v: unknown): number[] => (Array.isArray(v) ? v.map((x) => (typeof x === "number" ? x : 0)) : []);
  const phoneme = nums(last[2]);
  // fork m3-face-twelve (2026-10-28, after the control read zero phonemes on a live NPC whose mouth moved): index 4
  // carries every keyframe set of BSFaceGenAnimationData, 0x20 to 0x180 in header order; setsMax names the one that
  // moves while a lip-synced line plays, so the probe finds the lip set without a second build
  const sets = Array.isArray(last[4]) ? (last[4] as unknown[]).map(nums) : undefined;
  return {
    available: true,
    read: true,
    expression: nums(last[0]),
    modifier: nums(last[1]),
    phoneme,
    phonemeMax: phoneme.reduce((m, x) => Math.max(m, x), 0),
    override: Boolean(last[3]),
    ...(sets ? { sets, setsMax: sets.map((v) => v.reduce((m, x) => Math.max(m, Math.abs(x)), 0)) } : {}),
  };
}

function namedNpc(a: Record<string, unknown>): Actor | null {
  const id = num(a.formId) || placedId;
  return id ? Actor.from(Game.getFormEx(id)) : null;
}

// Every menu CommonLibSSE-NG names (the MENU_NAME constants under
// include/RE), so dump-state can say which are open when a player cannot act.
const MENUS = [
  "BarterMenu", "Book Menu", "Console Native UI Menu", "Console", "ContainerMenu", "Crafting Menu",
  "Creation Club Menu", "Credits Menu", "Cursor Menu", "Dialogue Menu", "Fader Menu", "FavoritesMenu",
  "GiftMenu", "HUD Menu", "InventoryMenu", "Journal Menu", "Kinect Menu", "LevelUp Menu", "Loading Menu",
  "LoadWaitSpinner", "Lockpicking Menu", "MagicMenu", "Main Menu", "MapMenu", "MessageBoxMenu", "Mist Menu",
  "Mod Manager Menu", "RaceSex Menu", "SafeZoneMenu", "Sleep/Wait Menu", "StatsMenu", "TitleSequence Menu",
  "Training Menu", "Tutorial Menu", "TweenMenu",
];

function hasSpell(player: Actor, id: number): boolean {
  const spell = Spell.from(Game.getFormEx(id));
  return !!spell && player.hasSpell(spell);
}

// Actor.AddPerk on each perk the player lacks, read back with HasPerk:
// `refused` is one the engine did not take, `missing` a form that is no perk
function addPerks(player: Actor, ids: number[]) {
  const out = { added: [] as number[], had: [] as number[], missing: [] as number[], refused: [] as number[] };
  for (const id of ids) {
    const perk = Perk.from(Game.getFormEx(id));
    if (!perk) {
      out.missing.push(id);
    } else if (player.hasPerk(perk)) {
      out.had.push(id);
    } else {
      player.addPerk(perk);
      (player.hasPerk(perk) ? out.added : out.refused).push(id);
    }
  }
  return out;
}

function keepPerks(player: Actor): void {
  if (!keptPerks.length) return;
  const now = Date.now();
  if (now - perksCheckedAt < PERKS_CHECK_MS) return;
  perksCheckedAt = now;
  const r = addPerks(player, keptPerks);
  if (r.added.length || r.refused.length) log("kept perks added again", JSON.stringify(r));
}

function dumpState(player: Actor) {
  const cell = player.getParentCell();
  const world = player.getWorldSpace();
  const worldOrCell = world ? world.getFormID() : cell ? cell.getFormID() : 0;
  // Other actors nearby (nearbyActors), for lab-api's sees() and view(); the
  // runner matches their positions against the server's record of the
  // other client.
  const px = player.getPositionX();
  const py = player.getPositionY();
  const pz = player.getPositionZ();
  const near: Array<ReturnType<typeof describe> & { pos: number[]; distance: number }> = [];
  for (const other of nearbyActors(player)) {
    const dx = other.getPositionX() - px;
    const dy = other.getPositionY() - py;
    const dz = other.getPositionZ() - pz;
    near.push({
      ...describe(other),
      pos: [other.getPositionX(), other.getPositionY(), other.getPositionZ()],
      distance: Math.sqrt(dx * dx + dy * dy + dz * dz),
    });
  }
  return {
    ...describe(player),
    pos: [px, py, pz],
    rotZ: player.getAngleZ(),
    worldOrCell,
    cellName: cell ? cell.getName() : "",
    magicka: actorValue(player, "magicka"),
    stamina: actorValue(player, "stamina"),
    health: actorValue(player, "health"),
    down: lastRagdollAt > lastGetUpAt,
    // The engine's player controls (Papyrus Game.Is*ControlsEnabled): after
    // a 6-hour wait in the second playtest test 2 could look around but not
    // move, open menus or wait again, which is what DisablePlayerControls'
    // defaults block (docs/verbs/rest.md)
    controls: {
      movement: Game.isMovementControlsEnabled(),
      menu: Game.isMenuControlsEnabled(),
      looking: Game.isLookingControlsEnabled(),
      activate: Game.isActivateControlsEnabled(),
      fighting: Game.isFightingControlsEnabled(),
      sneaking: Game.isSneakingControlsEnabled(),
      camSwitch: Game.isCamSwitchControlsEnabled(),
      journal: Game.isJournalControlsEnabled(),
      fastTravel: Game.isFastTravelControlsEnabled(),
    },
    // and the rest of what can hold a player still with the controls on: an
    // open menu, menu mode, a furniture, the sit and sleep states
    menus: MENUS.filter((m) => Ui.isMenuOpen(m)),
    // the reference under the crosshair, what E acts on (SKSE's GetCurrentCrosshairRef; 0 for none):
    // a probe asserts its aim before a key press (x-npc-talk-prompt v4)
    crosshairRef: Game.getCurrentCrosshairRef()?.getFormID() ?? 0,
    inMenuMode: Utility.isInMenuMode(),
    furniture: player.getFurnitureReference()?.getFormID() ?? 0,
    sitState: player.getSitState(),
    sleepState: player.getSleepState(),
    // the Rested bonus the server grants after a sleep (docs/verbs/sleep.md;
    // Skyrim.esm SPEL 0x000FB981, lab/esm.py)
    rested: hasSpell(player, 0x000fb981),
    afterRest,
    ...timeGlobals(),
    near,
  };
}

// The local player knocked down (m0-death; Eli, 2026-10-04, option a).
// skymp5-client never lets the engine kill the local player, whose single
// player death would reload a save: on the server's death state it ragdolls
// the player and lets through only the "Ragdoll" animation event
// (deathService.ts killWithPush), and on a respawn it sends "GetUpBegin"
// (ressurectWithPushKill). Its own sync takes the player's animation events
// the engine accepted (animation.ts AnimationSource), which is how other
// clients see the fall. So "down" is a Ragdoll the engine accepted on the
// player with no GetUpBegin after it. CONFIRMED: pushActorAway raises an
// accepted "Ragdoll" on the pushed actor, and a respawn's GetUpBegin clears
// it (m0-death green, run 20261004-085303: down after the kill and after a
// server restart, up after the respawn). Filtered
// in native (rule 9): the player's form id, 0x14 as deathService.ts has it,
// and the one event name each.
let lastRagdollAt = 0;
let lastGetUpAt = 0;
hooks.sendAnimationEvent.add({ enter: () => {}, leave: (ctx) => { if (ctx.animationSucceeded) lastRagdollAt = Date.now(); } }, 0x14, 0x14, "Ragdoll");
hooks.sendAnimationEvent.add({ enter: () => {}, leave: (ctx) => { if (ctx.animationSucceeded) lastGetUpAt = Date.now(); } }, 0x14, 0x14, "GetUpBegin");

// The player's attributes as the engine left them after a Sleep/Wait menu,
// read on the first update after it closes: before the server's answer to
// skymp5-client's RestIntent can arrive (a round trip over the network). For
// the rest verb's Dynamic plan (docs/verbs/rest.md): with a lowered rate the
// engine's own recovery tells which time it regenerates over. The menu's name
// is RE::SleepWaitMenu::MENU_NAME (CommonLibSSE-NG
// include/RE/S/SleepWaitMenu.h:16).
let restMenuClosed = false;
let afterRest: Record<string, number> | null = null;
on("menuClose", (e) => {
  if (e.name === "Sleep/Wait Menu") restMenuClosed = true;
});

function readAfterRest(player: Actor): void {
  if (!restMenuClosed) return;
  restMenuClosed = false;
  afterRest = {
    health: player.getActorValuePercentage("health"),
    magicka: player.getActorValuePercentage("magicka"),
    stamina: player.getActorValuePercentage("stamina"),
    healRateMult: player.getActorValue("HealRateMult"),
    at: Date.now(),
  };
}

const DEFERRED = Symbol("deferred");

function postResult(c: Config, step: Step, body: Record<string, unknown>): void {
  const path = `${c.labApiPath}/step/${encodeURIComponent(step.id)}/result`;
  // @ts-ignore older typings lack the callback parameter
  new HttpClient(c.labApiBase).post(path, { body: JSON.stringify({ client: c.client, id: step.id, ...body }), contentType: "application/json" }, (r: HttpResponse) => {
    try {
      if (r.status !== 200) log("result post failed", step.id, r.status);
    } catch (_) {
      // never throw from a callback
    }
  });
}

// a set-stage step waiting for the engine's answer to its latent calls (the step's case in run)
type StageSet = {
  step: Step;
  quest: number;
  before: number;
  wasRunning: boolean;
  asked: number;
  startedAt: number;
  started?: boolean;
  ok?: boolean;
  error?: string;
};
let stageSet: StageSet | null = null;
const STAGE_SET_WAIT_MS = 10000;

function finishStageSet(c: Config): void {
  if (!stageSet) return;
  const k = stageSet;
  const answered = k.ok !== undefined || k.error !== undefined;
  if (!answered && Date.now() - k.startedAt < STAGE_SET_WAIT_MS) return;
  stageSet = null;
  try {
    const q = Quest.from(Game.getFormEx(k.quest));
    const data = {
      quest: k.quest,
      before: k.before,
      wasRunning: k.wasRunning,
      asked: k.asked,
      started: k.started,
      ok: k.ok,
      error: k.error,
      stage: q ? q.getCurrentStageID() : null,
      running: q ? q.isRunning() : null,
      done: q ? q.isStageDone(k.asked) : null,
    };
    if (answered) postResult(c, k.step, { ok: true, data });
    else postResult(c, k.step, { ok: false, error: `no answer from the engine after ${STAGE_SET_WAIT_MS} ms`, data });
  } catch (e) {
    postResult(c, k.step, { ok: false, error: String(e) });
  }
}

function finishDeferred(c: Config): void {
  if (!deferred) return;
  const d = deferred;
  try {
    if (nodeFs.existsSync(d.file)) {
      deferred = null;
      postResult(c, d.step, { ok: true, data: { png_b64: nodeFs.readFileSync(d.file).toString("base64"), file: d.file } });
    } else if (Date.now() - d.startedAt > SCREENSHOT_WAIT_MS) {
      deferred = null;
      postResult(c, d.step, { ok: false, error: `no ${d.file} after ${SCREENSHOT_WAIT_MS} ms` });
    }
  } catch (e) {
    deferred = null;
    postResult(c, d.step, { ok: false, error: String(e) });
  }
}

function finishRacePick(c: Config, player: Actor): void {
  if (!racePick) return;
  const k = racePick;
  if (Date.now() - k.lastAt < RACE_PICK_SETTLE_MS) return;
  try {
    const race = player.getRace();
    const now = race ? race.getFormID() : 0;
    if (now === k.race) {
      racePick = null;
      postResult(c, k.step, { ok: true, data: { race: now, presses: k.presses, set: !!k.set } });
      return;
    }
    if (k.presses >= k.max) {
      // RaceMenu's menu does not move its race list on Down (run 20261007-140054-a-rotfern:
      // 16 presses, the race unchanged), so the pick is made the way the
      // vanilla list would have made it, on the player's base
      // (TESModPlatform.SetNpcRace, as the client's own appearance apply
      // does); the menu's close still sends the result for the server's
      // character creation check to take or refuse
      if (!k.set) {
        const race = Race.from(Game.getFormEx(k.race));
        if (!race) throw new Error(`race ${k.race.toString(16)} is missing`);
        // Actor.SetRace, the game's own live race change (RaceCompatibility's
        // vampire script uses it): the actor and its base both switch, so
        // the player's own game shows the race at once, as the vanilla list
        // did (run 20261007-181613: the base alone left the actor a Nord
        // until a reload, the server having taken rotfern)
        player.setRace(race);
        k.set = true;
        k.lastAt = Date.now();
        return;
      }
      racePick = null;
      postResult(c, k.step, { ok: false, error: `race ${k.race.toString(16)} not reached after ${k.presses} presses (now ${now.toString(16)})` });
      return;
    }
    Input.tapKey(208); // DirectInput Down: the race list's next entry (a-character-creation)
    k.presses++;
    k.lastAt = Date.now();
  } catch (e) {
    racePick = null;
    postResult(c, k.step, { ok: false, error: String(e) });
  }
}

function finishConsole(c: Config): void {
  if (!consoleTyping) return;
  const k = consoleTyping;
  const now = Date.now();
  try {
    if (k.phase === "open") {
      if (Ui.isMenuOpen("Console")) {
        k.phase = "type";
        k.at = now;
        return;
      }
      if (!k.tapped) {
        Input.tapKey(DIK_GRAVE);
        k.tapped = true;
        k.at = now;
        return;
      }
      if (now - k.at > CONSOLE_OPEN_MS) {
        consoleTyping = null;
        if (k.detached) log(`quit: the console did not open ${CONSOLE_OPEN_MS} ms after the grave key`);
        else postResult(c, k.step, { ok: false, error: `the console did not open ${CONSOLE_OPEN_MS} ms after the grave key` });
      }
      return;
    }
    if (k.phase === "type") {
      if (now - k.at < CONSOLE_KEY_MS) return;
      k.at = now;
      if (k.next < k.keys.length) {
        Input.tapKey(k.keys[k.next++]);
        return;
      }
      Input.tapKey(DIK_RETURN);
      if (k.detached) {
        // the game quits at this Enter; its step answered already
        consoleTyping = null;
        return;
      }
      k.phase = "read";
      return;
    }
    if (k.phase === "read") {
      if (now - k.at < CONSOLE_READ_MS) return;
      if (Ui.isMenuOpen("Console") && !k.wasOpen) {
        Input.tapKey(DIK_GRAVE);
        k.phase = "close";
        k.at = now;
        return;
      }
    }
    // The step ends once a console it opened is shut: the menu reads open
    // for a moment after the grave key, and a console step right after
    // then typed into the closing console, so its keys reached the game
    // (x-coc-probe 20261008-190207: "coc riverwoodsleepinggiantinn" opened
    // the inventory)
    if (k.phase === "close" && Ui.isMenuOpen("Console") && now - k.at < CONSOLE_OPEN_MS) return;
    consoleTyping = null;
    const history = k.match ? consoleHistory.filter((l) => l.indexOf(k.match) >= 0).slice(-20) : [];
    postResult(c, k.step, { ok: true, data: { typed: k.text, lines: k.lines, keys: k.keys.length, history } });
  } catch (e) {
    consoleTyping = null;
    if (k.detached) log(`quit: ${String(e)}`);
    else postResult(c, k.step, { ok: false, error: String(e) });
  }
}

function finishCraft(c: Config, player: Actor): void {
  if (!crafting) return;
  const k = crafting;
  try {
    if (k.closeAt !== undefined) {
      if (Date.now() >= k.closeAt) {
        crafting = null;
        callNative("TESModPlatform", "CloseMenu", undefined, CRAFTING_MENU);
      }
      return;
    }
    if (k.activatedAt === undefined) {
      // A player crafts only what it holds: the server's give can reach the
      // client's inventory after the craft step starts, and removing an item
      // it does not hold fires no event, so skymp5-client sent a craft
      // without the leather strip and the server found no recipe (runs
      // 20261006-034306 and 20261006-051325-m0-forge).
      const held = k.ingredients.map(([id]) => player.getItemCount(Game.getFormEx(id)));
      if (k.ingredients.some(([, count], i) => held[i] < count)) {
        if (Date.now() - k.startedAt < CRAFT_WAIT_MS) return;
        crafting = null;
        postResult(c, k.step, { ok: false, error: `ingredients not held ${CRAFT_WAIT_MS} ms after the craft began, before the station: ${JSON.stringify(k.ingredients)}, held ${JSON.stringify(held)}` });
        return;
      }
      k.held = held;
      const station = form(k.station);
      if (!station) throw new Error("no such station");
      station.activate(player, false);
      k.activatedAt = Date.now();
      return;
    }
    const furniture = player.getFurnitureReference();
    if (furniture) {
      if (k.removedAt === undefined) {
        for (const [id, count] of k.ingredients) player.removeItem(Game.getFormEx(id), count, true, null);
        k.removedAt = Date.now();
        return;
      }
      if (Date.now() - k.removedAt < CRAFT_SETTLE_MS) return;
      player.addItem(Game.getFormEx(k.result), k.count, true);
      k.closeAt = Date.now() + 2000;
      postResult(c, k.step, { ok: true, data: { result: k.result, ingredients: k.ingredients, held: k.held, furniture: furniture.getFormID(), waitedMs: Date.now() - k.startedAt } });
    } else if (Date.now() - k.activatedAt > CRAFT_WAIT_MS) {
      crafting = null;
      postResult(c, k.step, { ok: false, error: `not in the station's furniture ${CRAFT_WAIT_MS} ms after activating it` });
    }
  } catch (e) {
    crafting = null;
    postResult(c, k.step, { ok: false, error: String(e) });
  }
}

function run(step: Step, player: Actor): unknown {
  const a = step.args || {};
  switch (step.action) {
    case "dump-state":
      return dumpState(player);
    case "add-perks": {
      // a seat's perks (docs/LAB.md): added now, and with keep: true kept for
      // this game, added again whenever a load drops them (keepPerks); keep
      // with no ids clears the kept list
      const ids = (Array.isArray(step.args?.ids) ? (step.args?.ids as unknown[]) : []).map((x) => Number(x));
      if (step.args?.keep === true) {
        keptPerks = ids;
        perksCheckedAt = Date.now();
      }
      return { ...addPerks(player, ids), kept: keptPerks };
    }
    case "known": {
      // thuum docs/verbs/learned-effects.md: the effects this player's engine
      // knows of each ingredient, bit i for effect i, keyed by its decimal
      // form id (lab-api's c.known(id)); a word of power reads 1 when the
      // engine has it unlocked (Game.IsWordUnlocked, docs/verbs/shouts.md);
      // a spell 1 when the player has it (Actor.HasSpell: playtest twenty's
      // Firebolt, on the server's record and missing from the game's list);
      // null for a form that is none of these
      const ids = Array.isArray(step.args?.ids) ? (step.args?.ids as unknown[]) : [];
      const out: Record<string, number | null> = {};
      for (const id of ids) {
        const form = Game.getFormEx(Number(id));
        const word = WordOfPower.from(form);
        if (word) {
          out[String(Number(id))] = Game.isWordUnlocked(word) ? 1 : 0;
          continue;
        }
        // thuum docs/verbs/perks.md: a perk reads 1 when the player holds it
        const perk = Perk.from(form);
        if (perk) {
          out[String(Number(id))] = player.hasPerk(perk) ? 1 : 0;
          continue;
        }
        if (Spell.from(form)) {
          out[String(Number(id))] = hasSpell(player, Number(id)) ? 1 : 0;
          continue;
        }
        const ingredient = Ingredient.from(form);
        let mask = 0;
        if (ingredient) {
          for (let i = 0; i < 4; ++i) {
            if (ingredient.getIsNthEffectKnown(i)) mask |= 1 << i;
          }
        }
        out[String(Number(id))] = ingredient ? mask : null;
      }
      return out;
    }
    case "globals": {
      // thuum docs/verbs/player-globals.md: the values this player's game
      // holds for global variables named as FormDescs, "<hex id>:<plugin>"
      // (Papyrus Game.GetFormFromFile, so the load order does not matter),
      // keyed by that text (lab-api's c.globalValue(desc)); null for one the
      // game does not have
      const forms = Array.isArray(step.args?.forms) ? (step.args?.forms as unknown[]) : [];
      const out: Record<string, number | null> = {};
      for (const desc of forms) {
        const text = String(desc);
        const at = text.indexOf(":");
        const g = at > 0 ? GlobalVariable.from(Game.getFormFromFile(parseInt(text.slice(0, at), 16), text.slice(at + 1))) : null;
        out[text] = g ? g.getValue() : null;
      }
      return out;
    }
    case "held": {
      // How many of each form this player's game holds (getItemCount), keyed
      // by its decimal form id (lab-api's c.held(id)); null for a form the
      // game does not have. What skymp5-client last received is not
      // readable here: Skyrim Platform's storage is each plugin's own (run
      // 20261006-182714: skymp5-client's "pcInv" never showed in
      // lab-driver's), so that side comes from lab/frida/console-trace.js.
      const ids = Array.isArray(step.args?.ids) ? (step.args?.ids as unknown[]) : [];
      const out: Record<string, number | null> = {};
      for (const id of ids) {
        const f = Game.getFormEx(Number(id));
        out[String(Number(id))] = f ? player.getItemCount(f) : null;
      }
      return out;
    }
    case "look": {
      // thuum docs/verbs/cast-teleport.md: the player's view, pitch (degrees,
      // down is positive) and heading (degrees; the current one when absent),
      // set in this game by ObjectReference.SetAngle, the way Lost Grimoire's
      // teleport marker restores the player's angles (thuum docs/MODS.md).
      // The console's SetAngle goes through the server's teleport, whose
      // angle X the first-person view does not take (x-teleport-probe2
      // 20261012-071906: the same view at 0 and 30 degrees). UNCONFIRMED: a
      // target-location cast then aims down by it.
      const pitch = num(a.pitch);
      const heading = a.heading === undefined ? player.getAngleZ() : num(a.heading);
      player.setAngle(pitch, 0, heading);
      return { pitch: player.getAngleX(), heading: player.getAngleZ() };
    }
    case "look-at": {
      // the player's view turned onto a named actor ({formId}, npc-state's), so a key press acts on it
      // as the player's own would (hold-key 18, E: the player's activation path, which a Papyrus
      // Activate is not, x-npc-talk-prompt 20261023-045446): the heading from this player's head node
      // to the actor's (degrees, 0 north and clockwise, getAngleZ's) and the pitch toward it (degrees,
      // down positive, look's), both set through look's SetAngle. Answers the angles read back and the
      // distance. look's caveat stands: the first-person view may not take the pitch, and at 100 units
      // or less a level view meets a standing actor's head, HYPOTHESIS
      const npc = namedNpc(a);
      if (!npc) return { error: "no placed npc and no {formId}" };
      const node = "NPC Head [Head]";
      const at = (r: Actor) => [
        NetImmerse.getNodeWorldPositionX(r, node, false),
        NetImmerse.getNodeWorldPositionY(r, node, false),
        NetImmerse.getNodeWorldPositionZ(r, node, false),
      ];
      const [ex, ey, ez] = at(player);
      const [tx, ty, tz] = at(npc);
      if ((ex === 0 && ey === 0 && ez === 0) || (tx === 0 && ty === 0 && tz === 0)) {
        return { error: "no head node to aim from or at" };
      }
      const dx = tx - ex;
      const dy = ty - ey;
      const dz = tz - ez;
      const heading = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
      const pitch = (-Math.atan2(dz, Math.hypot(dx, dy)) * 180) / Math.PI;
      player.setAngle(pitch, 0, heading);
      return { formId: npc.getFormID(), distance: Math.hypot(dx, dy, dz), heading: player.getAngleZ(), pitch: player.getAngleX() };
    }
    case "arrows": {
      // thuum docs/verbs/marksman.md (playtest thirteen: the target's screen
      // shows two arrows per shot): how many projectiles stand in the
      // player's cell, by SKSE's Cell.GetNumRefs, which filters on the BASE
      // form's type (REFERENCE_CLASS_BASE's note above): 0x32 PROJ, an
      // arrow's base (Skyrim.esm ArrowIronProjectile 0x0003BE11) as a rune's
      // grenade's, CommonLibSSE-NG include/RE/F/FormTypes.h:190. Until
      // train-30 the step asked for 0x40 PARW, the reference class, and
      // counted nothing (x-double-arrow 20261012-022022). Only the count:
      // any Papyrus call on a projectile reference aborts, so one base's
      // presence is the projectiles step's question
      const cell = player.getParentCell();
      if (!cell) return { error: "no cell" };
      return { count: cell.getNumRefs(0x32) };
    }
    case "projectiles": {
      // thuum docs/verbs/marksman.md: for each projectile base (a PROJ:
      // Skyrim.esm ArrowIronProjectile 0x0003BE11 is the iron arrow's,
      // lab/esm.py), whether this game holds a reference of it within
      // {radius} units of this player, or with {other: true} of the nearest
      // other actor (a figure), and how far the nearest one lies: Papyrus
      // Game.FindClosestReferenceOfType, its radius narrowed down to
      // {precision} units (10 by default). Keyed by decimal form id under
      // `refs`: {formId, distance}, or null for none. Papyrus aborts every
      // call on a projectile reference itself, GetPositionX included ("Bad
      // call result 4", Skyrim Platform CallNative.cpp's kFailedAbort;
      // x-marksman-probe 20261009-224923), so only the search runs. An
      // arrow a figure launched (TESModPlatform.LaunchArrow) is one: the
      // same probe found an iron arrow in each game after the shooter's
      // second shot.
      const ids = Array.isArray(a.ids) ? (a.ids as unknown[]) : [];
      const radius = num(a.radius, 4096);
      const precision = Math.max(1, num(a.precision, 10));
      let from: Actor = player;
      if (a.other) {
        const near = nearbyActors(player).sort((x, y) => distanceTo(player, x) - distanceTo(player, y));
        if (near.length === 0) throw new Error("no other actor nearby");
        from = near[0];
      }
      const fx = from.getPositionX();
      const fy = from.getPositionY();
      const fz = from.getPositionZ();
      const refs: Record<string, { formId: number; distance: number } | { error: string } | null> = {};
      for (const id of ids) {
        const key = String(Number(id));
        const base = Game.getFormEx(Number(id));
        if (!base) {
          refs[key] = null;
          continue;
        }
        try {
          refs[key] = closestOfBase(base, fx, fy, fz, radius, precision);
        } catch (e) {
          refs[key] = { error: String(e) };
        }
      }
      return { from: from.getFormID(), refs };
    }
    case "refs-near": {
      // docs/research/train-29-rows.md row 7c (x-rune-visible: does another
      // player's rune stay in the observer's game once set?): what stands
      // within {radius} units (600 by default) of this player ({from: self},
      // the default) or of the nearest other actor ({from: other}, the
      // figure or placed NPC draw-weapon's {other: true} takes), by base
      // type, through the origin's parent cell with SKSE's Cell.GetNumRefs
      // and GetNthRef (one cell: an exterior radius past the cell's edge,
      // 4096 units square, misses the neighbours). {formTypes: [...]} base
      // types (REFERENCE_CLASS_BASE's note above): each answers {inCell,
      // near, refs: [{formId, baseId, baseType, disabled, deleted, pos,
      // distance}]}, the references within the radius nearest first;
      // COUNT_ONLY_BASE_TYPES (0x32 PROJ) answer {inCell} alone, and a
      // reference whose read aborts under another type is one {index,
      // error} row. {ids: [...]} bases searched the projectiles step's way,
      // Game.FindClosestReferenceOfType bisected to {precision} units (10):
      // `ids`, decimal base id -> {formId, distance}, null for none. lab-api:
      // c.refs_near().count(type) | .has(baseId) | .distance(baseId); the
      // whole answer lands in steps/<n>-<client>-refs-near.json.
      if (a.from !== undefined && a.from !== "self" && a.from !== "other") throw new Error("refs-near: from is self or other");
      const radius = num(a.radius, 600);
      const precision = Math.max(1, num(a.precision, 10));
      const from: Actor = a.from === "other" || a.other === true ? nearestOther(player) : player;
      const cell = from.getParentCell();
      if (!cell) throw new Error("no cell");
      const fx = from.getPositionX();
      const fy = from.getPositionY();
      const fz = from.getPositionZ();
      type NearRef = { formId: number; baseId: number | null; baseType: number | null; disabled: boolean; deleted: boolean; pos: number[]; distance: number };
      type NearRow = NearRef | { index: number; error: string };
      type TypeRows = { inCell: number; near?: number; refs?: NearRow[]; note?: string };
      const types: Record<string, TypeRows> = {};
      const formTypes = Array.isArray(a.formTypes) ? (a.formTypes as unknown[]).map(Number).filter((t) => Number.isInteger(t) && t >= 0) : [];
      for (const t of formTypes) {
        const key = String(t);
        const inCell = cell.getNumRefs(t);
        if (t === 0x3d || t in REFERENCE_CLASS_BASE) {
          const base = REFERENCE_CLASS_BASE[t];
          types[key] = { inCell, note: `reference class ${t}: SKSE filters by the base form's type, ask for ${base === undefined ? "the base's own type" : base}` };
          continue;
        }
        if (COUNT_ONLY_BASE_TYPES.has(t)) {
          types[key] = { inCell };
          continue;
        }
        const refs: NearRow[] = [];
        for (let i = 0; i < inCell; ++i) {
          try {
            const ref = cell.getNthRef(i, t);
            if (!ref) continue;
            const x = ref.getPositionX();
            const y = ref.getPositionY();
            const z = ref.getPositionZ();
            const distance = Math.sqrt((x - fx) * (x - fx) + (y - fy) * (y - fy) + (z - fz) * (z - fz));
            if (distance > radius) continue;
            const base = ref.getBaseObject();
            refs.push({
              formId: ref.getFormID(),
              baseId: base ? base.getFormID() : null,
              baseType: base ? base.getType() : null,
              disabled: ref.isDisabled(),
              deleted: ref.isDeleted(),
              pos: [x, y, z],
              distance,
            });
          } catch (e) {
            refs.push({ index: i, error: String(e) });
          }
        }
        refs.sort((p, q) => ("distance" in p ? p.distance : Infinity) - ("distance" in q ? q.distance : Infinity));
        types[key] = { inCell, near: refs.filter((r) => "distance" in r).length, refs };
      }
      const ids = Array.isArray(a.ids) ? (a.ids as unknown[]) : [];
      const found: Record<string, { formId: number; distance: number } | { error: string } | null> = {};
      for (const id of ids) {
        const key = String(Number(id));
        const base = Game.getFormEx(Number(id));
        if (!base) {
          found[key] = null;
          continue;
        }
        try {
          found[key] = closestOfBase(base, fx, fy, fz, radius, precision);
        } catch (e) {
          found[key] = { error: String(e) };
        }
      }
      return { from: from.getFormID(), pos: [fx, fy, fz], radius, cell: cell.getFormID(), types, ids: found };
    }
    case "poisons": {
      // thuum docs/verbs/magic-effects.md: each poisoned stack in the
      // player's inventory as its game keeps it (Skyrim Platform's
      // getExtraContainerChanges, the extras skymp5-client's inventory sync
      // reads): the item, ExtraPoison's poison and count, and whether the
      // stack is worn in the right or left hand. For where a poison goes and
      // how many hits it lasts.
      const out: Array<{ baseId: number; poisonId: number; count: number; worn: boolean; wornLeft: boolean }> = [];
      for (const entry of getExtraContainerChanges(player.getFormID()) ?? []) {
        for (const list of entry.extendDataList ?? []) {
          const poison = list.find((x) => x.type === "Poison") as ExtraPoison | undefined;
          if (!poison) continue;
          out.push({
            baseId: entry.baseId,
            poisonId: poison.poisonId,
            count: poison.count,
            worn: list.some((x) => x.type === "Worn"),
            wornLeft: list.some((x) => x.type === "WornLeft"),
          });
        }
      }
      return { poisons: out };
    }
    case "graph-vars": {
      // The player's behavior graph variables by name (Papyrus
      // GetAnimationVariableBool/Float/Int): {bools, floats, ints}, each a
      // list of names; a name the graph lacks reads false or 0. For
      // docs/verbs/spell-cast.md: which variables say a hand is casting
      // (IsCastingLeft, IsCastingRight, IsCastingDual are the names to try).
      const names = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
      const bools: Record<string, boolean> = {};
      for (const n of names(a.bools)) bools[n] = player.getAnimationVariableBool(n);
      const floats: Record<string, number> = {};
      for (const n of names(a.floats)) floats[n] = player.getAnimationVariableFloat(n);
      const ints: Record<string, number> = {};
      for (const n of names(a.ints)) ints[n] = player.getAnimationVariableInt(n);
      return { t: Date.now(), bools, floats, ints };
    }
    case "advance-skill": {
      // thuum docs/verbs/actor-values.md: skill experience as play earns it
      // (Papyrus Game.AdvanceSkill), {name: the actor value's Papyrus name,
      // magnitude}
      Game.advanceSkill(String(a.name || ""), num(a.magnitude));
      return { advanced: String(a.name || "") };
    }
    case "skills": {
      // each named skill as SKSE's ActorValueInfo reads it, never through
      // the verb's own natives: {base, xp, legendary} by name, and the
      // player's level (lab-api's c.skill(name) and c.level())
      const names = Array.isArray(a.names) ? (a.names as unknown[]).map(String) : [];
      const out: Record<string, { base: number; xp: number; legendary: number } | null> = {};
      for (const n of names) {
        const info = ActorValueInfo.getActorValueInfoByName(n);
        out[n] = info ? { base: info.getBaseValue(player), xp: info.getSkillExperience(), legendary: info.getSkillLegendaryLevel() } : null;
      }
      // the perk points the engine holds (thuum docs/verbs/perks.md: the server's word under its switch)
      return { skills: out, level: player.getLevel(), perkPoints: Game.getPerkPoints() };
    }
    case "av-table": {
      // thuum docs/verbs/actor-values.md: the engine's actor value list, the
      // AVIF form id of each index 0 to 163 as SKSE's
      // ActorValueInfo.GetActorValueInfoByID answers it (0 for none), so the
      // server's name table joins indices to the AVIF records' editor ids
      const ids: number[] = [];
      for (let i = 0; i < 164; ++i) {
        const info = ActorValueInfo.getActorValueInfoByID(i);
        ids.push(info ? info.getFormID() : 0);
      }
      return { ids };
    }
    case "av-names": {
      // thuum docs/verbs/actor-values.md: the actor value each name finds
      // through SKSE's ActorValueInfo.GetActorValueInfoByName, as its form
      // id (0 for none), so a name table is the game's own, joined to
      // av-table's index to form id: {names}
      const names = Array.isArray(a.names) ? a.names.map(String) : [];
      const ids: Record<string, number> = {};
      for (const n of names) {
        const info = ActorValueInfo.getActorValueInfoByName(n);
        ids[n] = info ? info.getFormID() : 0;
      }
      return { ids };
    }
    case "racemenu": {
      // thuum docs/verbs/racemenu-sync.md: whether RaceMenu's CharGen natives
      // answer (callNative throws when RaceMenu's scripts or skee are not
      // loaded), with CharGen.IsExternalEnabled's answer
      const external = callNative("CharGen", "IsExternalEnabled", undefined) as boolean;
      return { charGen: true, external };
    }
    case "racemenu-save": {
      // the player's look saved as a RaceMenu preset {name}
      // (CharGen.SaveCharacterPreset), or, with {other: true}, the look of
      // the nearest other actor (in the lab, the other player's figure;
      // 0.4.20.0's chargen.psc says the save "Only works on player
      // currently", and this shows what it writes); its size and SHA-256
      // come back, so two saves can be compared. RaceMenu's save answers
      // nothing; the file it leaves is the answer.
      const name = String(a.name || "");
      const target = a.other ? nearestOther(player) : player;
      const path = RACEMENU_PRESETS + name + ".jslot";
      nodeFs.mkdirSync(RACEMENU_PRESETS, { recursive: true });
      nodeFs.rmSync(path, { force: true });
      callNative("CharGen", "SaveCharacterPreset", undefined, target, name);
      if (!nodeFs.existsSync(path)) throw new Error(`SaveCharacterPreset left no ${name}.jslot`);
      const file = nodeFs.readFileSync(path);
      return {
        saved: name,
        bytes: file.length,
        sha256: nodeCrypto.createHash("sha256").update(file).digest("hex"),
        look: lookHash(file.toString("utf8")),
      };
    }
    case "racemenu-load": {
      // a RaceMenu preset {name} from the preset folder applied to the player
      // as RaceMenu's own LoadPreset applies it: every part, RaceMenu's hair
      // color form (0x801 in RaceMenu.esp), then RSM_RequestTintSave
      const name = String(a.name || "");
      const hair = Game.getFormFromFile(0x801, "RaceMenu.esp");
      if (callNative("CharGen", "LoadCharacterPresetEx", undefined, player, name, hair, -1) !== true) {
        throw new Error(`LoadCharacterPresetEx refused ${name}`);
      }
      player.sendModEvent("RSM_RequestTintSave", "", 0);
      return { loaded: name };
    }
    case "racemenu-scale": {
      // a node scaled as RaceMenu's sliders scale one: a NiOverride node
      // transform on the player under the key "thuum" (RaceMenu 0.4.20.0
      // nioverride.psc lines 436 and 490), which RaceMenu's preset carries
      // (its save takes every key but "internal"); {node, scale}, the head
      // by default
      const node = String(a.node || "NPC Head [Head]");
      const scale = Number(a.scale);
      if (!(scale > 0)) throw new Error("racemenu-scale needs a scale above 0");
      const female = isFemale(player);
      callNative("NiOverride", "AddNodeTransformScale", undefined, player, false, female, node, "thuum", scale);
      callNative("NiOverride", "UpdateNodeTransform", undefined, player, false, female, node);
      return { node, scale, engine: NetImmerse.getNodeScale(player, node, false) };
    }
    case "body-morph": {
      // a RaceMenu body morph on the player, as RaceMenu's body sliders set
      // one (NiOverride.SetBodyMorph under the key "thuum", then
      // UpdateModelWeight; 0.4.20.0 nioverride.psc lines 283 and 308), which
      // RaceMenu's preset carries in its bodyMorphs section: {name, value}
      const name = String(a.name || "");
      const value = Number(a.value);
      if (!name || !Number.isFinite(value)) throw new Error("body-morph needs name and value");
      callNative("NiOverride", "SetBodyMorph", undefined, player, name, "thuum", value);
      callNative("NiOverride", "UpdateModelWeight", undefined, player);
      return { name, value: callNative("NiOverride", "GetBodyMorph", undefined, player, name, "thuum") };
    }
    case "racemenu-drop": {
      // what skymp5-client's login reset does to the player's transforms
      // (RaceMenuService.dropTransforms): every key but "internal" taken off
      // node by node through NiOverride, each node updated from its base;
      // the nodes it touched come back
      const female = isFemale(player);
      const touched: string[] = [];
      for (const firstPerson of [false, true]) {
        const nodes = (callNative("NiOverride", "GetNodeTransformNames", undefined, player, firstPerson, female) as string[] | null) || [];
        for (const node of nodes) {
          const keys = (callNative("NiOverride", "GetNodeTransformKeys", undefined, player, firstPerson, female, node) as string[] | null) || [];
          for (const key of keys.filter((k) => k !== "internal")) {
            for (const fn of ["RemoveNodeTransformPosition", "RemoveNodeTransformScale", "RemoveNodeTransformScaleMode", "RemoveNodeTransformRotation"]) {
              callNative("NiOverride", fn, undefined, player, firstPerson, female, node, key);
            }
          }
          callNative("NiOverride", "UpdateNodeTransform", undefined, player, firstPerson, female, node);
          touched.push((firstPerson ? "1st " : "3rd ") + node);
        }
      }
      return { touched };
    }
    case "node-scale": {
      // a node's scale on the player or, with {other: true}, on the nearest
      // other actor: the engine's (NetImmerse.GetNodeScale, third person)
      // and RaceMenu's record under "thuum" (NiOverride.GetNodeTransformScale,
      // nioverride.psc line 439); {node}, the head by default. With other,
      // every actor nearby comes back too (id, base, enabled, 3D, distance,
      // both scales), so a second reference for one player shows. With
      // {morph}, each also reads that body morph under "thuum"
      // (NiOverride.GetBodyMorph, line 286).
      const node = String(a.node || "NPC Head [Head]");
      const morph = typeof a.morph === "string" ? a.morph : "";
      const scales = (target: Actor) => ({
        actor: target.getFormID(),
        engine: NetImmerse.getNodeScale(target, node, false),
        raceMenu: callNative("NiOverride", "GetNodeTransformScale", undefined, target, false, isFemale(target), node, "thuum"),
        ...(morph ? { morph: callNative("NiOverride", "GetBodyMorph", undefined, target, morph, "thuum") } : {}),
      });
      if (!a.other) return { node, ...scales(player) };
      const near = nearbyActors(player).sort((x, y) => distanceTo(player, x) - distanceTo(player, y));
      if (near.length === 0) throw new Error("no other actor nearby");
      const all = near.map((o) => {
        const base = o.getBaseObject();
        return {
          ...scales(o),
          base: base ? base.getFormID() : 0,
          enabled: !o.isDisabled(),
          loaded: o.is3DLoaded(),
          pos: [o.getPositionX(), o.getPositionY(), o.getPositionZ()],
          distance: Math.round(distanceTo(player, o)),
        };
      });
      return { node, ...scales(near[0]), all };
    }
    case "quest-stage": {
      // quests' stages as this seat's game holds them (Papyrus Quest.GetCurrentStageID, IsStageDone, IsRunning;
      // skyrimPlatform.ts's Quest): {quests: [formId, ...], stages?: [n, ...]} answers per quest its current stage,
      // whether it runs, and which of the named stages are done, keyed by the quest's form id as decimal text
      // (docs/verbs/quest-stage.md, memo D55 B: one seat sets a shared quest's stage, the other reads it)
      const ids = Array.isArray(a.quests) ? (a.quests as unknown[]).map((x) => num(x)) : [];
      const stages = Array.isArray(a.stages) ? (a.stages as unknown[]).map((x) => num(x)) : [];
      const out: Record<string, unknown> = {};
      for (const id of ids) {
        const q = Quest.from(Game.getFormEx(id));
        if (!q) {
          out[String(id)] = null;
          continue;
        }
        const done: Record<string, boolean> = {};
        for (const n of stages) done[String(n)] = q.isStageDone(n);
        out[String(id)] = { stage: q.getCurrentStageID(), running: q.isRunning(), done };
      }
      return out;
    }
    case "set-stage": {
      // a quest's stage set in this seat's game, as a quest's own script would (Papyrus Quest.SetCurrentStageID,
      // skyrimPlatform.ts's Quest): {quest, stage, start?}; the seat reports it to the server like any stage its game
      // sets. Both calls are latent: the step answers when the engine does (finishStageSet), with the engine's own
      // true or false and the quest as it then stands, since a stopped quest whose start fails takes no stage
      // (playtest 37, 2026-10-28: A Lovely Letter stayed at 0 and not running after a bare set). {start: true} asks
      // Quest.Start first when the quest is not running
      if (stageSet) return { error: "a set-stage step is still waiting for the engine" };
      const q = Quest.from(Game.getFormEx(num(a.quest)));
      if (!q) return { error: `no quest ${num(a.quest)}` };
      const quest = q.getFormID();
      const asked = num(a.stage);
      const set: StageSet = { step, quest, before: q.getCurrentStageID(), wasRunning: q.isRunning(), asked, startedAt: Date.now() };
      stageSet = set;
      const first: Promise<boolean | undefined> = a.start === true && !set.wasRunning ? q.start() : Promise.resolve(undefined);
      first
        .then((started) => {
          set.started = started;
          // a wrapper from an earlier frame is out of Skyrim Platform's object pool by now ("Invalid
          // _skyrimPlatform_indexInPool", playtest 37 at 05:59Z): the quest is looked up again for the second call
          const again = Quest.from(Game.getFormEx(quest));
          if (!again) throw new Error(`no quest ${quest} after its start`);
          return again.setCurrentStageID(asked);
        })
        .then(
          (ok) => {
            set.ok = ok;
          },
          (e) => {
            set.error = String(e);
          },
        );
      return DEFERRED;
    }
    case "face-keyframes": {
      // an actor's FaceGen keyframes as the engine animates its face (faceOf above): {formId}, else the placed npc;
      // {player: true} for the player. The phoneme set is the mouth: its values move while a lip-synced line plays.
      const target = a.player === true ? player : namedNpc(a);
      if (!target) return { error: "no placed npc and no {formId}" };
      return { formId: target.getFormID(), aiEnabled: target.isAIEnabled(), ...faceOf(target.getFormID()) };
    }
    case "node-rotation": {
      // a node's rotation on a named actor ({formId}, else the npc the probe
      // placed; {player: true} for the player), as the engine holds it after
      // the animation (NetImmerse.GetNodeWorldRotationEuler and
      // GetNodeLocalRotationEuler, skyrimPlatform.ts; third person), for the
      // face probe of playtest 37 (2026-10-28, Eli: the probe before any more
      // head builds): a puppet's head against the live NPC's on its host.
      // Each Euler read reports `filled` false when its out-array came back
      // untouched; beside it, the world vector from the node to {toward} (the
      // head's magic node by default) by the scalar GetRelativeNodePosition,
      // which turns with the head whatever the arrays do. {nodes}: the head
      // and the neck by default. The actor's heading and AI bit ride along.
      const target = a.player === true ? player : namedNpc(a);
      if (!target) return { error: "no placed npc and no {formId}" };
      const nodes = Array.isArray(a.nodes) ? (a.nodes as unknown[]).map(String) : ["NPC Head [Head]", "NPC Neck [Neck]"];
      const toward = String(a.toward || "NPC Head MagicNode [Hmag]");
      const read = nodes.map((node) => {
        const world = [0, 0, 0];
        const local = [0, 0, 0];
        const worldOk = NetImmerse.getNodeWorldRotationEuler(target, node, world, false);
        const localOk = NetImmerse.getNodeLocalRotationEuler(target, node, local, false);
        return {
          node,
          has: NetImmerse.hasNode(target, node, false),
          world: { ok: worldOk, value: world, filled: world.some((v) => v !== 0) },
          local: { ok: localOk, value: local, filled: local.some((v) => v !== 0) },
          toward: [
            NetImmerse.getRelativeNodePositionX(target, node, toward, false),
            NetImmerse.getRelativeNodePositionY(target, node, toward, false),
            NetImmerse.getRelativeNodePositionZ(target, node, toward, false),
          ],
        };
      });
      return {
        formId: target.getFormID(),
        angleZ: target.getAngleZ(),
        aiEnabled: target.isAIEnabled(),
        toward,
        towardHas: NetImmerse.hasNode(target, toward, false),
        nodes: read,
      };
    }
    case "head-parts": {
      // the head parts on the player's base or, with {other: true}, on the
      // nearest other actor's, as the engine lists them (ActorBase
      // getNumHeadParts, getNthHeadPart; HeadPart getType, getPartName):
      // whether a part a look names, an ear of the race's own type, is on
      // the actor after RaceMenu's load (docs/verbs/racemenu-sync.md)
      // With the parts: the base's weight (ActorBase.getWeight; RaceMenu's
      // load writes a preset's weight to it) and, on the player, its tint
      // masks as SKSE lists them (Game.getNumTintMasks and the getNthTintMask
      // three), the list RaceMenu saves a preset's tints from.
      const target = a.other ? nearestOther(player) : player;
      const base = ActorBase.from(target.getBaseObject());
      if (!base) throw new Error("the actor has no base");
      const parts: { id: number; type: number; name: string }[] = [];
      for (let i = 0; i < base.getNumHeadParts(); ++i) {
        const part = base.getNthHeadPart(i);
        if (part) parts.push({ id: part.getFormID(), type: part.getType(), name: part.getPartName() });
      }
      const tints: { type: number; argb: number; texture: string }[] = [];
      if (!a.other) {
        for (let i = 0; i < Game.getNumTintMasks(); ++i) {
          tints.push({ type: Game.getNthTintMaskType(i), argb: Game.getNthTintMaskColor(i), texture: Game.getNthTintMaskTexturePath(i) });
        }
      }
      // the actor's race against its base's: RaceMenu builds its slider
      // list from the actor's (apocrypha, skee's LoadSliders), SkyMP's
      // appearance apply sets the base's; the two can differ until a reload
      const actorRace = target.getRace(); const baseRace = base.getRace();
      return { actor: target.getFormID(), base: base.getFormID(), weight: base.getWeight(),
        actorRace: actorRace ? actorRace.getFormID() : 0, baseRace: baseRace ? baseRace.getFormID() : 0, parts, tints };
    }
    case "global": {
      // a global variable set on this client (GlobalVariable.setValue) and
      // read back: {form, value}. Not the sun: TimeService writes GameHour
      // every frame from the server's clock (docs/verbs/time.md; run
      // 20261007-134550 read 21.4 back a few seconds after setting 12), so a
      // shot at a given hour is scheduled by the clock's formula instead
      // With {file}, form is that plugin's own id (Papyrus Game.GetFormFromFile):
      // a light plugin's runtime id depends on the load order. The solo
      // references mark Survival Mode's new-game prompt as asked
      // (ccQDRSSE001-SurvivalMode.esl, Survival_PlayerHasBeenPrompted 0x8DF;
      // lab/esm.py), whose message box held a solo game's input
      // (r-melee-power-a 20261014-063324)
      const g = GlobalVariable.from(typeof a.file === "string" ? Game.getFormFromFile(num(a.form), a.file) : Game.getFormEx(num(a.form)));
      if (!g) throw new Error(`no global ${num(a.form).toString(16)}${typeof a.file === "string" ? " in " + a.file : ""}`);
      if (a.value !== undefined) g.setValue(num(a.value));
      return { form: g.getFormID(), value: g.getValue() };
    }
    case "weather": {
      // the weather forced on this client (Weather.setActive, override and
      // accelerate) or released ({release: true}): {form}; or read alone with
      // {read: true} (thuum docs/verbs/weather.md's probe x-weather). The
      // current one comes back (Weather.getCurrentWeather) with the outgoing
      // one and the blend's progress (getCurrentWeatherTransition, 1 once
      // settled, HYPOTHESIS until the probe reads it)
      if (a.read) {
        // nothing changes
      } else if (a.release) {
        Weather.releaseOverride();
      } else {
        const w = Weather.from(Game.getFormEx(num(a.form)));
        if (!w) throw new Error(`no weather ${num(a.form).toString(16)}`);
        w.setActive(true, true);
      }
      const now = Weather.getCurrentWeather();
      const out = Weather.getOutgoingWeather();
      return {
        current: now ? now.getFormID() : 0,
        outgoing: out ? out.getFormID() : 0,
        transition: Weather.getCurrentWeatherTransition(),
      };
    }
    case "favorite": {
      // thuum docs/verbs/favorites.md: mark a favorite as the player would in
      // its menus, through the native the client's login marks with
      // (TESModPlatform.SetFavorite): {form, hotkey}, hotkey -1 for none
      const f = Game.getFormEx(num(a.form));
      if (!f) throw new Error(`no form ${num(a.form).toString(16)}`);
      if (callNative("TESModPlatform", "SetFavorite", undefined, f, num(a.hotkey, -1)) !== true) {
        throw new Error(`SetFavorite refused ${num(a.form).toString(16)}`);
      }
      return { marked: true };
    }
    case "favorites": {
      // thuum docs/verbs/favorites.md: each form's favorite state as SKSE
      // reads it (Game.isObjectFavorited, Game.getHotkeyBoundObject over the
      // eight keys), never through the verb's own native: the key it is
      // bound to, -1 for a favorite without one, -2 for none, keyed by its
      // decimal form id (lab-api's c.favorite(id))
      const ids = Array.isArray(step.args?.ids) ? (step.args?.ids as unknown[]) : [];
      const bound: number[] = [];
      for (let k = 0; k < 8; ++k) {
        const f = Game.getHotkeyBoundObject(k);
        bound.push(f ? f.getFormID() : 0);
      }
      const out: Record<string, number> = {};
      for (const id of ids) {
        const f = Game.getFormEx(Number(id));
        out[String(Number(id))] = f && Game.isObjectFavorited(f) ? bound.indexOf(f.getFormID()) : -2;
      }
      return out;
    }
    case "markers": {
      // thuum docs/verbs/map-markers.md: whether each map marker shows on
      // this player's map and allows fast travel, keyed by its decimal form
      // id (lab-api's c.marker(id)); null for a form the game does not have
      const ids = Array.isArray(step.args?.ids) ? (step.args?.ids as unknown[]) : [];
      const out: Record<string, { visible: boolean; canTravel: boolean } | null> = {};
      for (const id of ids) {
        const ref = ObjectReference.from(Game.getFormEx(Number(id)));
        out[String(Number(id))] = ref ? { visible: ref.isMapMarkerVisible(), canTravel: ref.canFastTravelToMarker() } : null;
      }
      return out;
    }
    case "teleport": {
      // skymp5-client's own teleport call; worldOrCell is a Cell or WorldSpace
      // form id, one of the two casts is null by design.
      const target = Game.getFormEx(num(a.worldOrCell));
      TESModPlatform.moveRefrToPosition(
        player,
        Cell.from(target),
        WorldSpace.from(target),
        num(a.x), num(a.y), num(a.z),
        num(a.rx), num(a.ry), num(a.rz),
      );
      return "dispatched";
    }
    case "move": {
      // Motion of the player to an absolute target (x, y, z world units) at
      // `speed` units per second, done as a position step per update tick
      // (setPosition), which carries no physics velocity. The two earlier
      // forms failed in the lab: AI-driven pathing (setPlayerAIDriven plus
      // pathToReference) moved nothing (run 20261001-180643); TranslateTo
      // reached the target but left the player sliding another 280 units
      // after stopTranslation (runs 20261001-205928 to 221557), a Havok
      // quirk of translating the player. The height stays the player's own,
      // so the ground keeps it. CONFIRMED by run 20261001-231903: the server's
      // record went from (0, 0) to (0, -300) in about two seconds at the asked
      // 133 units/s and settled there (rule 2).
      const x = num(a.x), y = num(a.y);
      const dx = x - player.getPositionX();
      const dy = y - player.getPositionY();
      const distance = Math.sqrt(dx * dx + dy * dy);
      const speed = Math.max(1, num(a.speed, 300));
      const duration = num(a.duration_s, 0) > 0 ? num(a.duration_s) : distance / speed;
      moving = { x, y, cx: player.getPositionX(), cy: player.getPositionY(), speed, last: Date.now(), until: Date.now() + Math.max(500, duration * 1500) };
      return { dispatched: true, distance, speed };
    }
    case "plugins": {
      // docs/verbs/light-plugins.md: this game's load order as the engine
      // numbers it, full and light plugins apart, each in order (SKSE's
      // Game.GetModCount/GetModName and GetLightModCount/GetLightModName):
      // the server's light-aware load order must match it
      const full: string[] = [];
      for (let i = 0; i < Game.getModCount(); ++i) full.push(Game.getModName(i));
      const light: string[] = [];
      for (let i = 0; i < Game.getLightModCount(); ++i) light.push(Game.getLightModName(i));
      return { full, light };
    }
    case "settings": {
      // Live values of named settings in the running game, so a verb records
      // the game's own numbers (rule 2): INI settings ("name:Section") through
      // Utility.GetINIFloat, game settings (GMST) through
      // Game.GetGameSettingFloat, integer ones (iName) through
      // Game.GetGameSettingInt.
      const names = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
      const ini: Record<string, number> = {};
      for (const n of names(a.ini)) ini[n] = Utility.getINIFloat(n);
      const gmst: Record<string, number> = {};
      for (const n of names(a.gmst)) gmst[n] = Game.getGameSettingFloat(n);
      for (const n of names(a.gmstInt)) gmst[n] = Game.getGameSettingInt(n);
      return { ini, gmst };
    }
    case "set-gmst": {
      // What a player's console can do (setgs): change a game setting in
      // this client only. A validation verb's negative control: with
      // fCombatDistance raised, the engine itself lands hits from afar and
      // skymp5-client reports them like any other (Game.SetGameSettingFloat).
      // args: {name, value}
      const name = typeof a.name === "string" ? a.name : "";
      if (!name || typeof a.value !== "number") return { error: "set-gmst needs name and value" };
      Game.setGameSettingFloat(name, a.value);
      return { [name]: Game.getGameSettingFloat(name) };
    }
    case "av-call": {
      // thuum docs/verbs/actor-values.md: what a Papyrus actor value function
      // does to the player, the engine as the oracle for the server's own
      // natives: {name, how: set | mod | force | damage | restore, value};
      // base, current, maximum and percentage before and after
      const name = String(a.name || "");
      const value = Number(a.value);
      if (!name || !Number.isFinite(value)) throw new Error("av-call needs name and value");
      const before = readActorValue(player, name);
      switch (String(a.how || "")) {
        case "set": player.setActorValue(name, value); break;
        case "mod": player.modActorValue(name, value); break;
        case "force": player.forceActorValue(name, value); break;
        case "damage": player.damageActorValue(name, value); break;
        case "restore": player.restoreActorValue(name, value); break;
        default: throw new Error(`av-call has no call ${String(a.how)}`);
      }
      return { name, how: a.how, value, before, after: readActorValue(player, name) };
    }
    case "av-read": {
      // the player's actor values by name: {names}; base, current, maximum
      // and percentage each. With {other: true}, the nearest other actor's in
      // this game (a figure's Invisibility, thuum docs/verbs/self-cast.md)
      const names = Array.isArray(a.names) ? a.names.map(String) : [];
      const readAll = (who: Actor) => {
        const values: Record<string, ReturnType<typeof readActorValue>> = {};
        for (const n of names) values[n] = readActorValue(who, n);
        return values;
      };
      if (!a.other) return { values: readAll(player), of: player.getFormID() };
      // with other, every actor nearby comes back too (id, enabled, 3D, pos,
      // values), so lab-api can judge the figure nearest where the server has
      // the other client, as node-scale {other: true} is judged
      // (thuum docs/verbs/figure-values.md, c2.av_of(c1))
      const near = nearbyActors(player).sort((x, y) => distanceTo(player, x) - distanceTo(player, y));
      if (near.length === 0) throw new Error("no other actor nearby");
      const all = near.map((o) => ({
        id: o.getFormID(),
        enabled: !o.isDisabled(),
        loaded: o.is3DLoaded(),
        pos: [o.getPositionX(), o.getPositionY(), o.getPositionZ()],
        values: readAll(o),
      }));
      return { values: all[0].values, of: all[0].id, all };
    }
    case "set-av": {
      // The console's setav on the player: an actor value in this client
      // only (Actor.SetActorValue), such as SpeedMult for movement speed
      // bounds. args: {name, value}; with {other: true}, on the nearest
      // other actor instead, as node-scale picks it: a figure's value in
      // this game only (docs/verbs/spell-cast.md, the school modifiers)
      const name = typeof a.name === "string" ? a.name : "";
      if (!name || typeof a.value !== "number") return { error: "set-av needs name and value" };
      let target: Actor = player;
      if (a.other) {
        const near = nearbyActors(player).sort((x, y) => distanceTo(player, x) - distanceTo(player, y));
        if (near.length === 0) throw new Error("no other actor nearby");
        target = near[0];
      }
      target.setActorValue(name, a.value);
      return { actor: target.getFormID(), [name]: target.getActorValue(name) };
    }
    case "cell-events-start": {
      const me = Game.getPlayer();
      const parent = me ? me.getParentCell() : null;
      cellEvents = { startedAt: Date.now(), lastSample: 0, loaded: [], seen: new Map(), parent: [] };
      return { started: true, parent: parent ? parent.getFormID() : 0 };
    }
    case "cell-events-stop": {
      if (!cellEvents) return { error: "no cell-events-start before cell-events-stop" };
      const ce = cellEvents;
      cellEvents = null;
      const cells: Record<string, CellSeen> = {};
      ce.seen.forEach((s, id) => {
        cells[id.toString(16)] = s;
      });
      return { ms: Date.now() - ce.startedAt, loaded: ce.loaded, cells, parent: ce.parent };
    }
    case "watch-start": {
      const bools = Array.isArray(a.bools) ? (a.bools as unknown[]).filter((x): x is string => typeof x === "string") : [];
      const actors = new Map<number, Watched>();
      for (const other of nearbyActors(player)) actors.set(other.getFormID(), newWatched(other, bools));
      // a solo reference's placed NPC always, which the random search can
      // miss among the wildlife (r-melee-power-a 20261014-064209 watched a
      // fox and a wolf and not the bandit it hit)
      for (const id of placedIds) {
        const placed = Actor.from(Game.getFormEx(id));
        if (placed && !actors.has(id)) actors.set(id, newWatched(placed, bools));
      }
      // the actors a reference names by form id ({formIds}: a cell's own
      // NPCs, which the random search catches in a different set each run),
      // each with its own animation-event hook; a name the game has no
      // actor for is reported, not an error (a schedule may have moved it)
      const named = Array.isArray(a.formIds) ? (a.formIds as unknown[]).map((x) => num(x)).filter((x) => x > 0) : [];
      const missing: number[] = [];
      for (const id of named) {
        const actor = Actor.from(Game.getFormEx(id));
        if (!actor) {
          missing.push(id);
          continue;
        }
        hookNamedActor(id);
        if (!actors.has(id)) actors.set(id, newWatched(actor, bools));
      }
      // the track's cap in samples ({trackMax}, 250 ms each): the default
      // covers a minute, a schedule reference wants more
      const trackMax = Math.min(WATCH_TRACK_MAX_CAP, Math.max(1, Math.floor(num(a.trackMax, WATCH_TRACK_MAX))));
      watching = { startedAt: Date.now(), actors, self: newWatched(player, bools), trackMax };
      return { watching: actors.size, named: named.length - missing.length, missing, trackMax };
    }
    case "watch-stop": {
      if (!watching) return { error: "no watch-start before watch-stop" };
      const w = watching;
      watching = null;
      const ms = Date.now() - w.startedAt;
      for (const [av, seen] of [["magicka", w.self.magicka], ["health", w.self.health], ["stamina", w.self.stamina]] as Array<[string, number[][]]>) {
        seen.push([ms, player.getActorValue(av)]);
      }
      const actors: Array<Watched & { formId: number }> = [];
      w.actors.forEach((v, formId) => {
        const actor = Actor.from(Game.getFormEx(formId));
        v.loaded = [v.loaded[0], actor ? actor.is3DLoaded() : false];
        actors.push({ formId, ...v });
      });
      w.self.loaded = [w.self.loaded[0], player.is3DLoaded()];
      return { seconds: ms / 1000, actors, self: { formId: 0x14, ...w.self } };
    }
    case "equip": {
      const item = Game.getFormEx(num(a.formId));
      if (!item) return { error: "no such form" };
      // a shout goes to the voice slot (Actor.EquipShout; thuum
      // docs/verbs/shouts.md, x-shout-probe), anything else by EquipItem
      const shout = Shout.from(item);
      if (shout) {
        player.equipShout(shout);
        const held = player.getEquippedShout();
        return held && held.getFormID() === shout.getFormID() ? "shout" : { error: "the shout did not equip" };
      }
      player.equipItem(item, false, true);
      return "ok";
    }
    case "cast": {
      // Papyrus Spell.Cast: the spell's effects on the target at once, with
      // no casting animation. With {other: true} the nearest other actor
      // casts it, at the player unless {targetId} names another: a solo
      // reference's NPC acting on the player (ADR-031, reference B)
      const spell = Spell.from(Game.getFormEx(num(a.spellId)));
      if (!spell) return { error: "no such spell" };
      const caster = a.other ? nearestOther(player) : player;
      const target = a.other && a.targetId === undefined ? player : form(a.targetId);
      spell.cast(caster, target);
      return "dispatched";
    }
    case "activate": {
      const ref = form(a.refId);
      if (!ref) return { error: "no such ref" };
      return ref.activate(player, false);
    }
    case "place-npc": {
      // A solo reference's NPC (ADR-031): Papyrus PlaceAtMe of {base}, moved
      // to {x, y, z} from lab-spawn (solo-start's origin) and turned to {rz}
      // degrees, unaggressive unless {aggressive: true} (Aggression 0: it
      // opens no fight of its own), and kept as the actor {other: true}
      // steps and console {other} name. The console's placeatme and a random
      // search named a rabbit instead once (r-melee-power-a 20261014-061237)
      const base = Game.getFormEx(num(a.base));
      if (!base) return { error: "no such base" };
      const npc = Actor.from(player.placeAtMe(base, 1, false, false));
      if (!npc) return { error: "the base placed no actor" };
      npc.setPosition(LAB_SPAWN.pos[0] + num(a.x), LAB_SPAWN.pos[1] + num(a.y), LAB_SPAWN.pos[2] + num(a.z));
      npc.setAngle(0, 0, num(a.rz));
      if (a.aggressive !== true) npc.setActorValue("Aggression", 0);
      placedId = npc.getFormID();
      placedIds.push(placedId);
      return { formId: placedId };
    }
    case "place-ref": {
      // An engine-native reference of an item base (thuum docs/verbs/
      // prop-physics.md, x-prop-launch v2): Papyrus PlaceAtMe of {base} by the
      // player, {count} of them (1), moved to {x, y, z} from lab-spawn when
      // given (place-npc's frame), else left where the engine put it. The
      // console's placeatme never reaches the engine under skymp5-client
      // (consoleCommandsService's schema sends it to the server and returns
      // false; x-prop-launch v1 20261031-071449), so this is the one way to a
      // reference the server does not own; the world cleaner leaves
      // non-actors alone. Returns the reference's form id.
      const base = Game.getFormEx(num(a.base));
      if (!base) return { error: "no such base" };
      const ref = player.placeAtMe(base, Math.max(1, num(a.count, 1)), false, false);
      if (!ref) return { error: "the base placed no reference" };
      if (a.x !== undefined || a.y !== undefined || a.z !== undefined) {
        ref.setPosition(LAB_SPAWN.pos[0] + num(a.x), LAB_SPAWN.pos[1] + num(a.y), LAB_SPAWN.pos[2] + num(a.z));
      }
      return { formId: ref.getFormID(), baseId: base.getFormID(), pos: [ref.getPositionX(), ref.getPositionY(), ref.getPositionZ()] };
    }
    case "npc-puppet": {
      // thuum docs/verbs/npc-puppet.md: the placed or named NPC made a puppet
      // ({puppet: true}) or live again through the fork's Skyrim Platform
      // export setPuppet (m3-npc-puppet's dist, the client's own switch); a
      // platform without the export fails the step rather than guess
      const npc = namedNpc(a);
      if (!npc) return { error: "no placed npc and no {formId}" };
      const setPuppet = (skyrimPlatform as unknown as { setPuppet?: (id: number, puppet: boolean) => boolean }).setPuppet;
      if (typeof setPuppet !== "function") throw new Error("npc-puppet: this Skyrim Platform has no setPuppet (the fork's m3-npc-puppet dist lays it)");
      const done = setPuppet(npc.getFormID(), a.puppet === true);
      return { formId: npc.getFormID(), puppet: a.puppet === true, done, aiEnabled: npc.isAIEnabled() };
    }
    case "npc-pose": {
      // the client's puppet apply in one step (thuum docs/verbs/npc-puppet.md,
      // x-npc-puppet-2's P4): the placed or named NPC moved to {x, y, z} from
      // lab-spawn (place-npc's frame) at {speed} units a second with
      // TranslateTo, turned to {angleZ} with SetAngle, and its graph's Speed
      // and Direction set as the stream's pose sets them
      const npc = namedNpc(a);
      if (!npc) return { error: "no placed npc and no {formId}" };
      const to = [LAB_SPAWN.pos[0] + num(a.x), LAB_SPAWN.pos[1] + num(a.y), LAB_SPAWN.pos[2] + num(a.z)];
      const angleZ = a.angleZ === undefined ? npc.getAngleZ() : num(a.angleZ);
      const speed = Math.max(1, num(a.speed, 200));
      npc.translateTo(to[0], to[1], to[2], 0, 0, angleZ, speed, 0);
      npc.setAngle(0, 0, angleZ);
      npc.setAnimationVariableFloat("Speed", num(a.speed, 0));
      npc.setAnimationVariableFloat("Direction", num(a.direction, 0));
      return { formId: npc.getFormID(), to, angleZ, speed, direction: num(a.direction, 0) };
    }
    case "npc-ai": {
      // thuum docs/DECISIONS.md ADR-035 (proposed), point 4, the puppet
      // probe x-npc-puppet: the placed NPC's AI switched (Papyrus
      // Actor.EnableAI; the engine's Actor::EnableAI, ID 37504, clears its
      // kProcessMe bit, the re-analyst on sky-re, 2026-10-16). Returns the
      // state after
      const npc = namedNpc(a);
      if (!npc) return { error: "no placed npc and no {formId}" };
      npc.enableAI(a.enabled === true);
      return { formId: npc.getFormID(), aiEnabled: npc.isAIEnabled() };
    }
    case "npc-hold": {
      // the named NPC stood still in this seat's game while its AI and dialogue run (Papyrus
      // Actor.SetDontMove; Skyrim Platform's setDontMove, skymp/skyrim-platform's skyrimPlatform.ts:2083),
      // the lever the engine's own scenes stand an actor with: x-npc-talk-claim v4 holds Sven on the host
      // so the guest's crosshair stays on him (npc-ai's EnableAI(false) never stopped his walk,
      // 20261027-230022). Papyrus has no getter for the flag, so held is the value set and two server
      // snapshots apart are the read. Returns the state after
      const npc = namedNpc(a);
      if (!npc) return { error: "no placed npc and no {formId}" };
      npc.setDontMove(a.held === true);
      return { formId: npc.getFormID(), held: a.held === true, aiEnabled: npc.isAIEnabled() };
    }
    case "npc-kill": {
      // the named NPC killed by this seat's own engine (Papyrus Actor.Kill, with no killer or, with
      // {killer: "player"}, this seat's player): no hit report and no number of the server's, the
      // host-made death npc-fate's H5 asks about (the console's kill is the server's own,
      // ConsoleCommands' ExecuteKill). A kill with no killer left Sigrid alive (x-npc-death
      // 20261023-044628); a protected actor dies to the player alone, HYPOTHESIS. Returns the state
      // after; the death can take a frame, so isDead may read false here and true at the next npc-state
      const npc = namedNpc(a);
      if (!npc) return { error: "no placed npc and no {formId}" };
      if (a.killer !== undefined && a.killer !== "player") {
        return { error: `npc-kill's killer is "player" or absent, got ${JSON.stringify(a.killer)}` };
      }
      const killer = a.killer === "player" ? Game.getPlayer() : null;
      npc.kill(killer);
      return { formId: npc.getFormID(), killer: killer ? killer.getFormID() : 0, isDead: npc.isDead() };
    }
    case "figure-spells": {
      // a figure's spell set in this game (ADR-046: a figure carries only what the server gives it, and
      // SPID adds its abilities at the actor's load): the nearest actor with a runtime id that is not this
      // player ({name} picks one by its display name), its added spells (SKSE's Actor.GetSpellCount and
      // GetNthSpell, the actor's own, not its base's), what it holds in each hand and its power slot
      // (GetEquippedSpell 0 left, 1 right, 2 other), and the added spells that are none of those
      // (x-figure-spells)
      const want = typeof a.name === "string" ? a.name : null;
      const me = player.getFormID();
      const fig = nearbyActors(player)
        .filter((x) => x.getFormID() >= 0xff000000 && x.getFormID() !== me && (!want || x.getDisplayName() === want))
        .sort((x, y) => distanceTo(player, x) - distanceTo(player, y))[0];
      if (!fig) return { error: want ? `no figure named ${want} nearby` : "no figure nearby" };
      const added: number[] = [];
      for (let i = 0; i < fig.getSpellCount(); i++) {
        const sp = fig.getNthSpell(i);
        if (sp) added.push(sp.getFormID());
      }
      const equipped = [0, 1, 2].map((src) => fig.getEquippedSpell(src)?.getFormID() ?? 0);
      return {
        formId: fig.getFormID(),
        name: fig.getDisplayName(),
        base: fig.getLeveledActorBase()?.getFormID() ?? 0,
        added,
        equipped,
        extra: added.filter((id) => !equipped.includes(id)),
      };
    }
    case "npc-damage": {
      // the named NPC's health damaged in this seat's own engine (Actor.DamageActorValue), as a fall, a
      // trap or another NPC's blow lands on the host with no hit report for the server: skymp5-client's
      // deferred kill on every viewed actor (formView.ts's startDeferredKill) leaves her alive at the
      // floor, npc-fate's H5 (x-npc-death v4). Answers her health share and isDead after
      const npc = namedNpc(a);
      if (!npc) return { error: "no placed npc and no {formId}" };
      const amount = num(a.amount);
      if (!(amount > 0)) return { error: `npc-damage's amount is a positive number, got ${JSON.stringify(a.amount)}` };
      npc.damageActorValue("health", amount);
      return { formId: npc.getFormID(), healthPercentage: npc.getActorValuePercentage("health"), isDead: npc.isDead() };
    }
    case "npc-state": {
      // the placed NPC as its engine has it, for the puppet probe: whether
      // its AI runs, its package and combat target (form ids, 0 for none),
      // whether it is in combat or staggering, its position, and its head
      // node's world position: two reads apart during an idle tell whether
      // its graph still animates it (EnableAI(false) drops an actor from the
      // animation pass, the same read, HYPOTHESIS)
      const npc = namedNpc(a);
      if (!npc) return { error: "no placed npc and no {formId}" };
      const head = "NPC Head [Head]";
      return {
        formId: npc.getFormID(),
        aiEnabled: npc.isAIEnabled(),
        package: npc.getCurrentPackage()?.getFormID() ?? 0,
        inCombat: npc.isInCombat(),
        combatTarget: npc.getCombatTarget()?.getFormID() ?? 0,
        staggering: npc.getAnimationVariableBool("IsStaggering"),
        // dead in this game, and its health share (playtest 32's "deaths that dont propagate": a
        // puppet's death on the seat that did not make it)
        isDead: npc.isDead(),
        healthPercentage: npc.getActorValuePercentage("health"),
        // what the engine refuses a death for: essential (the actor's own read) and protected (its
        // leveled base's; an alias's protection is not read), x-npc-death's
        isEssential: npc.isEssential(),
        isProtected: npc.getLeveledActorBase()?.isProtected() ?? null,
        // E does nothing on a blocked reference: every relayed puppet sample sets it, the promote
        // clears it (8eafa85d), the Talk prompt's mechanism (x-npc-talk-prompt v3)
        activationBlocked: npc.isActivationBlocked(),
        // the cell the reference stands in in this game (a door's interior after a crossing, npc-handoff)
        cell: npc.getParentCell()?.getFormID() ?? 0,
        // whether this game holds its 3D: a lost actor with no 3D keeps its AI on, nobody's engine running it, so a
        // far seat's copy reads aiEnabled true unloaded (b-npc-handoff-night 092208); "no loaded live copy" is the claim
        is3DLoaded: npc.is3DLoaded(),
        // what this game rolled for it (npc-fate, ADR-046): its race (a leveled pick's clone carries the pick's)
        // and the form ids it wears, one per form across the 32 slots and the two hands' weapon or armor (the
        // server's fate counts the weapon, x-npc-fate-outfit 20261024-061219; a shield is in a slot and the left
        // hand, so a set; a hand's spell or torch is no part of the outfit). Form types from skyrim-platform's
        // FormType: Armor 26, Weapon 41
        raceId: npc.getRace()?.getFormID() ?? 0,
        worn: Array.from(
          new Set([
            ...Array.from({ length: 32 }, (_, i) => npc.getWornForm(2 ** i)?.getFormID() ?? 0),
            ...[0, 1].map((hand) => {
              const held = npc.getEquippedObject(hand);
              const type = held ? held.getType() : 0;
              return held && (type === 41 || type === 26) ? held.getFormID() : 0;
            }),
          ])
        )
          .filter((id) => id !== 0)
          .sort((x, y) => x - y),
        pos: [npc.getPositionX(), npc.getPositionY(), npc.getPositionZ()],
        head: [
          NetImmerse.getNodeWorldPositionX(npc, head, false),
          NetImmerse.getNodeWorldPositionY(npc, head, false),
          NetImmerse.getNodeWorldPositionZ(npc, head, false),
        ],
        // the gaze and the face as this game holds them (npc-stream slice 5, train 54): the previous poll's values,
        // then a new poll, so a claim reads them on a second npc-state (gazeOf)
        ...gazeOf(npc.getFormID()),
      };
    }
    case "papyrus-log": {
      // thuum docs/verbs/word-wall.md's read: every Papyrus event the engine
      // sends to a script on the references in [minSelfId, maxSelfId] (or
      // matching {eventPattern}), printed as it happens through Skyrim
      // Platform's sendPapyrusEvent hook (skyrimPlatform.ts SendPapyrusEventHook:
      // the self id and the event's name; no arguments, a known limit of the
      // hook), so a probe can read which event a wall's trigger raises and
      // when. {stop: true} removes the logger (YAML reads `on` and `off` as
      // booleans, so neither names an argument). The block on Papyrus events
      // (papyrus-events {block: false}) must be lifted first in a connected
      // game, or the engine sends nothing to the script at all
      if (a.stop === true) {
        if (papyrusLogId !== null) hooks.sendPapyrusEvent.remove(papyrusLogId);
        papyrusLogId = null;
        return { logging: false };
      }
      if (papyrusLogId !== null) hooks.sendPapyrusEvent.remove(papyrusLogId);
      const minId = a.minSelfId !== undefined ? num(a.minSelfId) : 0;
      const maxId = a.maxSelfId !== undefined ? num(a.maxSelfId) : 0xffffffff;
      const pattern = typeof a.eventPattern === "string" ? a.eventPattern : undefined;
      papyrusLogId = hooks.sendPapyrusEvent.add(
        {
          enter: (ctx) => {
            printConsole(`lab-driver: papyrus event ${ctx.papyrusEventName} on ${ctx.selfId.toString(16)}`);
          },
        },
        minId,
        maxId,
        pattern,
      );
      return { logging: true, minSelfId: minId, maxSelfId: maxId, eventPattern: pattern ?? null };
    }
    case "papyrus-events": {
      // Skyrim Platform's Papyrus event block. skymp5-client turns it on at
      // its first tick in every connected game (blockPapyrusEventsService.ts),
      // and the SendEvent hook (skyrim-platform FridaHooks.cpp,
      // OnSendEventEnter) then blanks every event a script would receive
      // unless the script's name is on its short list, and blanks OnUpdate
      // for every script. A probe lifts it in a connected game to tell a
      // blocked event from a quest that never runs (x-survival-why
      // 20261020-020729: Survival's 5 s check is RegisterForSingleUpdate,
      // then OnUpdate, and never fires connected). {block: false} lifts the
      // block, {block: true} (the default) restores it. Lab games only; a
      // lifted block lets every vanilla quest script run.
      const block = !(a.block === false || a.block === "false" || a.block === 0);
      blockPapyrusEvents(block);
      return block ? "blocked" : "unblocked";
    }
    case "draw-weapon":
      // the player's, or with {other: true} the nearest other actor's (a
      // solo reference's NPC)
      (a.other ? nearestOther(player) : player).drawWeapon();
      return "drawn";
    case "figure-action": {
      // thuum docs/verbs/cast-action.md: an action performed on the nearest
      // other actor's graph ({other: true}; the player's own otherwise)
      // through the engine's action entry (the fork's performAction), the
      // probe of whether a figure plays a replayed cast action. With
      // {replay} it is the player's own recorded actions, played as the
      // sync will relay them, each with its recorded variables put on the
      // target first (applyAnimationVariablesToActor, the caster's graph as
      // it was when its engine chose the idle) unless {variables: false}:
      // {replay: all} every action of the last {sinceMs} (10 s by default),
      // the first now and the rest at their original spacing, from update;
      // {replay: {action: id}} (or a list of ids) the last one of that
      // BGSAction; {replay: -n} the n-th from the end; {replay: last} the
      // last of all. Without {replay}: the BGSAction {action}, the idle
      // {idle}, the graph event {event} and the input type {type} as given.
      // {set} puts named graph variables on the target after the variables
      // and before the action, as anim-event does. {delayFrames: n} performs
      // each action n updates after its variables instead of in one tick.
      const target = a.other ? nearestOther(player) : player;
      const set = a.set && typeof a.set === "object" ? (a.set as Record<string, unknown>) : {};
      const variables = a.variables !== false;
      const delayFrames = Math.max(0, Math.floor(num(a.delayFrames, 0)));
      const recorded = () => recentActions.map((r) => [r.ms, r.action, r.idle, r.eventName, r.type]);
      if (a.replay === "all") {
        const since = Date.now() - num(a.sinceMs, 10000);
        const recs = recentActions.filter((r) => r.ms >= since);
        if (recs.length === 0) return { error: "no recorded actions to replay", recorded: recorded() };
        const now = Date.now();
        for (const r of recs) scheduledReplays.push({ at: now + (r.ms - recs[0].ms), frames: 0, targetId: target.getFormID(), rec: r, set, variables, delayFrames });
        return { scheduled: recs.map((r) => [r.ms - recs[0].ms, r.action, r.idle, r.eventName, r.type]), on: target.getFormID(), delayFrames };
      }
      let rec: RecordedAction | undefined;
      if (a.replay !== undefined) {
        if (a.replay && typeof a.replay === "object") {
          const want = (a.replay as Record<string, unknown>).action;
          const wants = (Array.isArray(want) ? want : [want]).map((w) => num(w));
          for (let i = recentActions.length - 1; i >= 0 && !rec; i--) if (wants.indexOf(recentActions[i].action) >= 0) rec = recentActions[i];
        } else if (typeof a.replay === "number") rec = recentActions[recentActions.length + a.replay];
        else rec = recentActions[recentActions.length - 1];
        if (!rec) return { error: "no recorded action to replay", recorded: recorded() };
      } else {
        rec = { ms: 0, action: num(a.action), idle: num(a.idle ?? 0), eventName: typeof a.event === "string" ? a.event : "", type: num(a.type ?? 0) };
      }
      return replayOn(target, rec, set, variables, delayFrames);
    }
    case "anim-event": {
      // One animation event on the player's behavior graph (Papyrus
      // Debug.SendAnimationEvent), the way the controls start an attack:
      // "attackStart" swings the right hand, "AttackStartH2HRight" a fist;
      // the engine's hit frame then picks the target itself
      // (ghidra/notes/melee-reach-1-7-104.md). Names as skymp5-server's
      // AnimationSystem.cpp keys them from real clients. UNCONFIRMED: a sent
      // attackStart lands a hit.
      // With {other: true}, on the nearest other actor's graph instead: a
      // solo reference's NPC swinging at the player (ADR-031, reference B)
      // or the other player's figure. {set: {name: value}} first sets those
      // graph variables on the same actor in the same tick (booleans
      // through SetAnimationVariableBool, numbers through
      // SetAnimationVariableFloat), as the engine's own caster sets
      // bWantCastRight in the frame it sends MRh_SpellAimedConcentrationStart
      // (r-spell-stream-a 20261014-081151; thuum docs/verbs/spell-cast.md)
      const name = typeof a.name === "string" ? a.name : "";
      if (!name) return { error: "no event name" };
      const target = a.other ? nearestOther(player) : player;
      const set = a.set && typeof a.set === "object" ? (a.set as Record<string, unknown>) : {};
      for (const [k, v] of Object.entries(set)) {
        if (typeof v === "boolean") target.setAnimationVariableBool(k, v);
        else if (typeof v === "number") target.setAnimationVariableFloat(k, v);
      }
      // {delayMs} sends the event that long after the variables: the
      // engine's caster sets bWantCastRight and sends the start only after
      // the graph has answered it on a later frame (the re-analyst's read,
      // HYPOTHESIS), and a start sent in the same tick was refused
      // (x-figure-cast 20261014-142425)
      // {delayFrames} sends it that many updates later instead, to the
      // frame: bWantCastRight set alone held the figure's graph at iState 10
      // for one frame, and a start 16 ms later came a frame late
      // (x-figure-cast2 20261014-183340)
      const delayMs = typeof a.delayMs === "number" && a.delayMs > 0 ? a.delayMs : 0;
      const delayFrames = typeof a.delayFrames === "number" && a.delayFrames > 0 ? Math.floor(a.delayFrames) : 0;
      if (delayMs > 0 || delayFrames > 0) {
        delayedEvents.push({ due: Date.now() + delayMs, frames: delayFrames, targetId: target.getFormID(), name });
        return { sent: name, to: target.getFormID(), set: Object.keys(set), afterMs: delayMs, afterFrames: delayFrames };
      }
      Debug.sendAnimationEvent(target, name);
      return { sent: name, to: target.getFormID(), set: Object.keys(set) };
    }
    case "combat-spell": {
      // A spell's effects applied as a combat hit (Papyrus
      // Actor.DoCombatSpellApply, CK wiki "DoCombatSpellApply - Actor"): with
      // {other: true} the nearest other actor (a solo reference's placed NPC)
      // applies it to the player, else the player to the nearest other. For
      // ADR-031's references B of the shouts and spells an NPC will not cast
      // on demand (thuum docs/verbs/push.md: Spell.Cast and the console's
      // cast from a placed NPC applied nothing; a Draugr that knew the shout
      // only meleed)
      const spell = Spell.from(Game.getFormEx(num(a.formId)));
      if (!spell) return { error: "no such spell" };
      const other = nearestOther(player);
      const caster = a.other ? other : player;
      const target = a.other ? player : other;
      caster.doCombatSpellApply(spell, target);
      return { applied: spell.getFormID(), caster: caster.getFormID(), target: target.getFormID() };
    }
    case "start-combat": {
      // An NPC opens combat against the player (Papyrus Actor.StartCombat,
      // CK wiki "StartCombat - Actor"): the actor {formId} names, else the
      // placed NPC, else the nearest other. Replaces the console's
      // `startcombat 14`, which paused the game about 3.5 s inside a watch
      // (docs/research/m3, r-npc-fight 20261017-083447)
      const npc = namedNpc(a) ?? nearestOther(player);
      npc.startCombat(player);
      return { actor: npc.getFormID(), inCombat: npc.isInCombat(), combatTarget: npc.getCombatTarget()?.getFormID() ?? 0 };
    }
    case "stop-combat": {
      // start-combat's stop (Papyrus Actor.StopCombat, CK wiki "StopCombat -
      // Actor"): the actor {formId} names, else the placed NPC, else the
      // nearest other, leaves combat while its AI keeps running (playtest
      // 35's "calm": an npc-ai off and on would flip the simulation under
      // test). The answer reads its combat state just after the call
      const npc = namedNpc(a) ?? nearestOther(player);
      npc.stopCombat();
      return { actor: npc.getFormID(), inCombat: npc.isInCombat(), combatTarget: npc.getCombatTarget()?.getFormID() ?? 0 };
    }
    case "play-idle": {
      // One IDLE record played on the player, or with {other: true} on the
      // nearest other actor (Papyrus Actor.PlayIdle, CK wiki "PlayIdle -
      // Actor"): a solo reference's NPC power-attacking the player (ADR-031,
      // reference B) through the game's own PowerAttackForward 0x19B25 or
      // PowerAttackStanding 0x19B26 (Skyrim.esm), since its AI makes no power
      // attack on demand. Returns whether the actor took the idle.
      const idle = Idle.from(Game.getFormEx(num(a.formId)));
      if (!idle) return { error: "no such idle" };
      return (a.other ? nearestOther(player) : player).playIdle(idle);
    }
    case "voice": {
      // The player's voice after a shout (thuum docs/verbs/shouts.md): the
      // recovery its game set at the release (SKSE Actor.GetVoiceRecoveryTime,
      // the variation's recovery time times ShoutRecoveryMult) and the
      // equipped shout's three recovery times (SKSE Shout.GetNthRecoveryTime),
      // through callNative, which needs the .psc declarations SKSE installs.
      // {set: seconds} first sets the game's own recovery
      // (Actor.SetVoiceRecoveryTime), as a player clearing it in its own game
      // would: the server keeps its own (b-shout)
      if (typeof a.set === "number") callNative("Actor", "SetVoiceRecoveryTime", player, a.set);
      const shout = player.getEquippedShout();
      const recovery = callNative("Actor", "GetVoiceRecoveryTime", player) as number;
      const variations: number[] = [];
      if (shout) {
        for (let n = 0; n < 3; n++) variations.push(callNative("Shout", "GetNthRecoveryTime", shout, n) as number);
      }
      return { shout: shout ? shout.getFormID() : 0, recovery, variations, mult: player.getActorValue("ShoutRecoveryMult") };
    }
    case "graph-float": {
      // One of the player's behavior graph floats (Papyrus
      // SetAnimationVariableFloat), {name, value}: the engine sets
      // staggerMagnitude and staggerDirection before its stagger action
      // (thuum docs/verbs/stagger.md), so a probe can set them before its
      // own anim-event staggerStart. Returns the value the graph reads back.
      const name = typeof a.name === "string" ? a.name : "";
      if (!name || typeof a.value !== "number") return { error: "graph-float needs name and value" };
      player.setAnimationVariableFloat(name, a.value);
      return { name, value: player.getAnimationVariableFloat(name) };
    }
    case "craft": {
      // UNCONFIRMED: crafting is a menu in the engine, so the driver reproduces
      // what the engine does to the inventory while the player uses the
      // station: enter the furniture, take the recipe's ingredients out of the
      // player (to no container) and put the result in. skymp5-client's
      // craft service watches exactly those container changes while
      // getFurnitureReference() is set and sends CraftItem; the server owns
      // the outcome (R0). args: {station: <ref form id>, recipe: <COBJ form id>}
      // (lab-api resolves names to ids before the step reaches the driver).
      // The changes wait for the player to be in the furniture (finishCraft):
      // made in the frame of the activation, before the player had entered
      // it, they reached no CraftItem and the server kept the materials (run
      // 20261004-084658-m0-forge).
      const station = form(a.station);
      if (!station) return { error: "no such station" };
      const recipe = ConstructibleObject.from(Game.getFormEx(num(a.recipe)));
      if (!recipe) return { error: "no such recipe" };
      const result = recipe.getResult();
      if (!result) return { error: "recipe has no result" };
      const ingredients: Array<[number, number]> = [];
      for (let i = 0; i < recipe.getNumIngredients(); i++) {
        const ing = recipe.getNthIngredient(i);
        if (ing) ingredients.push([ing.getFormID(), recipe.getNthIngredientQuantity(i)]);
      }
      // The station is activated once the player holds every ingredient
      // (finishCraft): its menu stops skymp5-client's inventory sync while it
      // is open (isBadMenuShown), so a give that had not landed by then never
      // would (m0-forge, run 20261006-055855: held [1, 0] for 15 s)
      crafting = { step, ingredients, result: result.getFormID(), count: recipe.getResultQuantity(), startedAt: Date.now(), station: station.getFormID() };
      return DEFERRED;
    }
    case "race-pick": {
      // thuum docs/PLAN.md M1, rotfern: in the open race menu, the race
      // {race: <form id>, max: presses} by Down presses (finishRacePick)
      const race = num(a.race);
      if (!race) return { error: "no race" };
      racePick = { step, race, presses: 0, max: num(a.max, 20), lastAt: 0 };
      return DEFERRED;
    }
    case "console": {
      // A line typed into the game's console (finishConsole). args: {text,
      // match?}: lower case letters, digits, space and . , - = / only; a
      // command's case does not matter to the console. With {match}, the
      // result's history holds the last 20 lines the console printed since
      // the game started that contain it (skymp5-client logs there)
      // "{other}" stands for the nearest other actor's form id in hex, as
      // the console shows a clicked reference: the other player's figure,
      // whose id exists only at runtime (playtest eleven: moveto on it)
      let raw = typeof a.text === "string" ? a.text : "";
      if (raw.indexOf("{other}") >= 0) {
        const other = nearestOther(player);
        if (!other) return { error: "no other actor near for {other}" };
        raw = raw.split("{other}").join((other.getFormID() >>> 0).toString(16));
      }
      const text = raw.toLowerCase();
      if (!text) return { error: "no text" };
      const keys: number[] = [];
      for (let i = 0; i < text.length; i++) {
        const code = DIK[text.charAt(i)];
        if (code === undefined) return { error: `no scan code for ${JSON.stringify(text.charAt(i))}` };
        keys.push(code);
      }
      if (consoleTyping) return { error: "a console step is still typing" };
      const wasOpen = Ui.isMenuOpen("Console");
      const match = typeof a.match === "string" ? a.match : "";
      consoleTyping = { step, text, keys, next: 0, phase: wasOpen ? "type" : "open", tapped: false, at: Date.now(), lines: [], wasOpen, match };
      return DEFERRED;
    }
    case "quit": {
      // The game's own quit, the console's qqq: the engine's shutdown call out of WinMain, where train-44's thunk
      // tears skymp5-client down first and sends netcode's disconnect (D12-B, x-host-quit). The game exits at the
      // Enter and could answer nothing after it, so the step answers now and its typing goes on detached.
      // {via: "papyrus"}: Debug.QuitGame from the next tick instead, with no menu open: the console's own movie
      // stays alive through the shutdown under qqq, and a GFx movie alive at quit is the re-analyst's reading of
      // 004815's crash in the heap teardown, which a player's quit never has
      if (a.via === "papyrus") {
        if (quitAt) return { error: "a quit is already under way" };
        quitAt = Date.now() + QUIT_DELAY_MS;
        return { quitting: true, via: "papyrus" };
      }
      if (a.via !== undefined && a.via !== "console") return { error: `quit's via is console or papyrus, not ${JSON.stringify(a.via)}` };
      if (consoleTyping) return { error: "a console step is still typing" };
      const wasOpen = Ui.isMenuOpen("Console");
      consoleTyping = {
        step, text: "qqq", keys: [DIK["q"], DIK["q"], DIK["q"]], next: 0, phase: wasOpen ? "type" : "open",
        tapped: false, at: Date.now(), lines: [], wasOpen, match: "", detached: true,
      };
      return { quitting: true };
    }
    case "tap-key": {
      // One key press through the engine's input system (SKSE Input.TapKey,
      // DirectInput scan code). It reaches the race menu (CONFIRMED,
      // exploratory runs 20261003-074730 and -075403: 208 Down picks the
      // next race, 19 R opens "Finish and name your character?"), but not
      // that Ok/Cancel box: 28 Enter, 156 numpad Enter and 203 Left then
      // Enter left it open (runs -075113, -075403). close-menu ends the menu.
      const code = num(a.code, 0);
      if (code <= 0) return { error: "no scan code" };
      Input.tapKey(code);
      return "tapped";
    }
    case "hold-key": {
      // A key held down through the engine's input system (SKSE
      // Input.HoldKey) and released ms later from the update loop: real
      // movement under the controls (W 17 forward, Left Shift 42 sprint),
      // where move only sets a position. args: {code, ms}, or {codes: [..],
      // ms} for keys pressed in the same tick (both attack keys for a dual
      // cast, which the engine takes only when the second press is close to
      // the first; thuum docs/verbs/cast-action.md, P2)
      const codes = Array.isArray(a.codes) ? (a.codes as unknown[]).map((c) => num(c, 0)).filter((c) => c > 0) : [num(a.code, 0)].filter((c) => c > 0);
      const ms = num(a.ms, 0);
      if (codes.length === 0 || ms <= 0) return { error: "hold-key needs code (or codes) and ms" };
      for (const code of codes) {
        Input.holdKey(code);
        heldKeys.push({ code, until: Date.now() + ms });
      }
      return "holding";
    }
    case "repeat": {
      // args (lab-api's scenario.py normalizes them): {times, gapMs: [min, max], step: {action, args}, seed?};
      // the step's result comes when the last repetition is done: {times, at: [ms from the first], gaps, seed}
      if (repeating) return { error: "a repeat is still running" };
      const inner = (a.step || {}) as { action?: unknown; args?: unknown };
      const action = typeof inner.action === "string" ? inner.action : "";
      if (!REPEATABLE.has(action)) return { error: `repeat takes one of ${[...REPEATABLE].join(", ")}` };
      const gaps = Array.isArray(a.gapMs) ? (a.gapMs as unknown[]) : [a.gapMs, a.gapMs];
      const gapMin = Math.max(0, num(gaps[0], 0));
      const gapMax = Math.max(gapMin, num(gaps[1], gapMin));
      const now = Date.now();
      repeating = {
        step, inner: { id: `${step.id}-repeated`, action, args: (inner.args || {}) as Record<string, unknown> },
        times: Math.max(1, Math.min(100, num(a.times, 1))), done: 0, nextAt: now, gapMin, gapMax,
        seed: num(a.seed, now) & 0x7fffffff, startedAt: now, at: [], gaps: [],
      };
      return DEFERRED;
    }
    case "close-menu": {
      // Close a menu through the engine's UI message queue: Skyrim
      // Platform's TESModPlatform.CloseMenu native posts a kHide message for
      // the named menu (skyrim-platform PapyrusTESModPlatform.cpp), as the
      // menu's own close does. For the race menu, whose finish box ignores
      // tapped keys; skymp5-client sends the menu's result when it sees the
      // menu closed (sendInputsService.ts sendAppearance). Called by name:
      // SP 2.9.0's bindings predate the native. args: {name: "RaceSex Menu"}
      const name = typeof a.name === "string" ? a.name : "";
      if (!name) return { error: "no menu name" };
      callNative("TESModPlatform", "CloseMenu", undefined, name);
      return "closing";
    }
    case "screenshot":
      // UNCONFIRMED in a retail build; lab-api also captures from outside the
      // game through the guest agent, which is the path a crashed client needs.
      Debug.takeScreenshot(typeof a.name === "string" ? a.name : "lab");
      return "dispatched";
    case "request-screenshot": {
      // Same call, but the result carries the file as base64 once the engine
      // has written it (UNCONFIRMED: file name and location in a retail build;
      // the game writes <name>.png in its own directory as far as the Papyrus
      // docs say). The update loop finishes this step.
      const name = `lab-${step.id}`;
      Debug.takeScreenshot(name);
      deferred = { step, file: `${name}.png`, startedAt: Date.now() };
      return DEFERRED;
    }
    default:
      throw new Error(`unknown action ${step.action}`);
  }
}

// A solo game (thuum ADR-031's references: the engine alone, no
// skymp5-client in the game) starts at the main menu: Skyrim Platform's
// loadGame builds a save from its template at a place and loads it, as
// skymp5-client does at a login (its LoadGameService), so no save file is
// committed. args: {x, y, z, rz} in game units and degrees, from lab-spawn
// (the server's start point, lab/deploy/sky-srv/server-settings.json:
// [133857, -61130, 14662] in Tamriel 0x3C) unless {worldOrCell} names
// another and the coordinates are absolute; {raceId, name} for the player
// (ChangeFormNpc), else the template's. Run in tick: loadGame is Skyrim
// Platform's, not Papyrus, so the main menu's context allows it.
const LAB_SPAWN = { worldOrCell: 0x3c, pos: [133857, -61130, 14662] };
function soloStart(c: Config, step: Step): void {
  try {
    const a = step.args || {};
    const named = a.worldOrCell === undefined;
    const origin = named ? LAB_SPAWN.pos : [0, 0, 0];
    const pos = [origin[0] + num(a.x), origin[1] + num(a.y), origin[2] + num(a.z)];
    const worldOrCell = named ? LAB_SPAWN.worldOrCell : num(a.worldOrCell);
    const npc: { raceId?: number; name?: string } = {};
    if (a.raceId !== undefined) npc.raceId = num(a.raceId);
    if (typeof a.name === "string") npc.name = a.name;
    loadGame(pos, [0, 0, num(a.rz)], worldOrCell, Object.keys(npc).length ? npc : undefined);
    postResult(c, step, { ok: true, data: { loading: pos, worldOrCell } });
  } catch (e) {
    postResult(c, step, { ok: false, error: String(e) });
  }
}

// Poll and receive in tick: fires in the main menu too, Papyrus forbidden,
// and this is where HTTP callbacks are delivered.
on("tick", () => {
  const c = config();
  if (!c) {
    if (!warnedNoConfig) {
      warnedNoConfig = true;
      log("no lab-driver-settings.txt with labApiBase and client; idle");
    }
    return;
  }
  const now = Date.now();
  if (pending) return;
  if (inFlight && now - sentAt < c.timeoutMs) return;
  if (!inFlight && now - sentAt < c.pollMs) return;
  inFlight = true;
  sentAt = now;
  const path = `${c.labApiPath}/step?client=${encodeURIComponent(c.client)}`;
  // Callback form: promises do not resolve in the main menu (SP 2.9 notes).
  // @ts-ignore older typings lack the callback parameter
  new HttpClient(c.labApiBase).get(path, undefined, (r: HttpResponse) => {
    try {
      // An exception escaping this callback cancels this frame's tick for
      // every plugin, skymp5-client included; never let one out.
      inFlight = false;
      if (r.status === 200 && r.body) {
        const step = JSON.parse(r.body) as Step;
        if (step && typeof step.id === "string" && typeof step.action === "string") {
          // a solo game starts from the main menu, where update never fires
          if (step.action === "solo-start") soloStart(c, step);
          else pending = step;
        }
      } else if (r.status !== 204) {
        log("poll failed", r.status, r.error);
      }
    } catch (e) {
      log("bad step", String(e));
    }
  });
});

// Execute in update: Papyrus is legal here; it does not fire in the main menu.
function settleMove(player: Actor): void {
  if (!moving) return;
  const now = Date.now();
  const ddx = moving.x - moving.cx;
  const ddy = moving.y - moving.cy;
  const remaining = Math.sqrt(ddx * ddx + ddy * ddy);
  const step = Math.min(remaining, moving.speed * Math.max(0, now - moving.last) / 1000);
  moving.last = now;
  if (remaining <= 1 || now >= moving.until) {
    moving = null;
    return;
  }
  if (step > 0) {
    moving.cx += ddx / remaining * step;
    moving.cy += ddy / remaining * step;
    player.setPosition(moving.cx, moving.cy, player.getPositionZ());
  }
}

on("update", () => {
  const c = config();
  if (!c) return;
  finishDeferred(c);
  finishStageSet(c);
  releaseHeldKeys();
  sendDelayedEvents();
  runScheduledReplays();
  const me = Game.getPlayer();
  if (me) settleMove(me);
  if (me) finishCraft(c, me);
  if (me) finishRacePick(c, me);
  finishConsole(c);
  if (quitAt && Date.now() >= quitAt) {
    quitAt = 0;
    Debug.quitGame();
  }
  if (me) finishRepeat(c, me);
  if (me) readAfterRest(me);
  if (me) keepPerks(me);
  trackWatch();
  trackCellEvents();
  const step = pending;
  if (!step) return;
  pending = null;
  try {
    const player = Game.getPlayer();
    if (!player) throw new Error("no player");
    const result = run(step, player);
    if (result === DEFERRED) return;
    postResult(c, step, { ok: true, data: result });
  } catch (e) {
    postResult(c, step, { ok: false, error: String(e) });
  }
});

// Every line the game's console printed since the game started, the last
// CONSOLE_HISTORY_MAX: skymp5-client's own logError and logTrace print only
// there, so a console step can return the ones that match its {match}
const CONSOLE_HISTORY_MAX = 400;
const consoleHistory: string[] = [];
// and every one of them to its own log file (Data\Platform\Logs\lab-console-logs.txt), which lab-api collects
// as <client>-console.log and log-count reads: printConsole reaches no other file, so skymp5-client's
// logTrace lines were missing from every run's logs (x-handoff-door 20261024-013234). writeLogs only writes
// its file, so this handler never sees its own lines
const CONSOLE_LOG_NAME = "lab-console";
on("consoleMessage", (e) => {
  const line = String(e.message);
  if (consoleTyping) consoleTyping.lines.push(line);
  consoleHistory.push(line);
  if (consoleHistory.length > CONSOLE_HISTORY_MAX) consoleHistory.splice(0, consoleHistory.length - CONSOLE_HISTORY_MAX);
  try {
    writeLogs(CONSOLE_LOG_NAME, new Date().toISOString(), line);
  } catch (_) {
    // logging must never throw into an event handler
  }
});

log("loaded");
