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

import {
  Actor,
  ActorBase,
  ActorValueInfo,
  callNative,
  Cell,
  ConstructibleObject,
  Debug,
  Game,
  GlobalVariable,
  HttpClient,
  HttpResponse,
  Ingredient,
  ExtraPoison,
  getAnimationVariablesFromActor,
  getExtraContainerChanges,
  Input,
  loadGame,
  NetImmerse,
  ObjectReference,
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
let consoleTyping: {
  step: Step; text: string; keys: number[]; next: number; phase: "open" | "type" | "read" | "close";
  tapped: boolean; at: number; lines: string[]; wasOpen: boolean; match: string;
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
//   its flight;
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
type Watched = {
  name: string;
  first: number[];
  last: number[];
  maxDisplacement: number;
  samples: number;
  maxStep: number;
  maxStepMs: number;
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
};
const WATCH_HEALTH_MAX = 512;
const WATCH_SELF_MAX = 256;
const WATCH_EVENTS_MAX = 4096;
const WATCH_SELF_MS = 50;
const VAR_EPSILON = 0.01;
let watching: { startedAt: number; actors: Map<number, Watched>; self: Watched } | null = null;

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
    health: [[0, actor.getActorValue("health")]], magicka: [[0, actor.getActorValue("magicka")]], stamina: [[0, actor.getActorValue("stamina")]],
    events: [], vars: {}, bools: named, casts: [], hits: [], taken: [], effects: [],
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
function releaseHeldKeys(): void {
  const now = Date.now();
  for (let i = heldKeys.length - 1; i >= 0; i--) {
    if (heldKeys[i].until <= now) {
      Input.releaseKey(heldKeys[i].code);
      heldKeys.splice(i, 1);
    }
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

// Other actors within 4096 units. The Papyrus API has no enumeration;
// findClosestActor at our own position returns ourselves, so sample
// findRandomActor a few times and keep the distinct others.
function nearbyActors(player: Actor): Actor[] {
  const found: Actor[] = [];
  const px = player.getPositionX();
  const py = player.getPositionY();
  const pz = player.getPositionZ();
  for (let i = 0; i < 12 && found.length < 8; i++) {
    const other = Game.findRandomActor(px, py, pz, 4096);
    if (!other) continue;
    const id = other.getFormID();
    if (id === player.getFormID() || found.some((f) => f.getFormID() === id)) continue;
    found.push(other);
  }
  return found;
}

// the actor nearest the player other than itself (in the lab, the other
// player's figure)
// the NPC a solo reference's place-npc step put down (ADR-031): {other}
// names it, not the nearest actor a random search finds
let placedId = 0;

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
  const pos = positionOf(actor);
  const dx = pos[0] - w.first[0];
  const dy = pos[1] - w.first[1];
  const dz = pos[2] - w.first[2];
  w.maxDisplacement = Math.max(w.maxDisplacement, Math.sqrt(dx * dx + dy * dy + dz * dz));
  const sx = pos[0] - w.last[0];
  const sy = pos[1] - w.last[1];
  const sz = pos[2] - w.last[2];
  const step = Math.sqrt(sx * sx + sy * sy + sz * sz);
  if (step > w.maxStep) {
    w.maxStep = step;
    w.maxStepMs = ms;
  }
  w.last = pos;
  w.samples += 1;
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
    const value = actor.getAnimationVariableBool(name);
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

on("spellCast", (e) => {
  if (!watching || !e.caster) return;
  const w = watchedRecord(e.caster.getFormID());
  if (w && w.casts.length < WATCH_SELF_MAX) w.casts.push([watchedMs(), e.spell ? e.spell.getFormID() : 0]);
});

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
for (const [minId, maxId] of [[0xff000000, 0xffffffff], [0x14, 0x14]]) {
  hooks.sendAnimationEvent.add({
    enter: () => {},
    leave: (ctx) => {
      if (!watching) return;
      const w = watchedRecord(ctx.selfId);
      if (w && w.events.length < WATCH_EVENTS_MAX) w.events.push([watchedMs(), ctx.animEventName, ctx.animationSucceeded ? 1 : 0]);
    },
  }, minId, maxId);
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
        postResult(c, k.step, { ok: false, error: `the console did not open ${CONSOLE_OPEN_MS} ms after the grave key` });
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
    postResult(c, k.step, { ok: false, error: String(e) });
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
    case "known": {
      // thuum docs/verbs/learned-effects.md: the effects this player's engine
      // knows of each ingredient, bit i for effect i, keyed by its decimal
      // form id (lab-api's c.known(id)); a word of power reads 1 when the
      // engine has it unlocked (Game.IsWordUnlocked, docs/verbs/shouts.md);
      // null for a form that is neither
      const ids = Array.isArray(step.args?.ids) ? (step.args?.ids as unknown[]) : [];
      const out: Record<string, number | null> = {};
      for (const id of ids) {
        const form = Game.getFormEx(Number(id));
        const word = WordOfPower.from(form);
        if (word) {
          out[String(Number(id))] = Game.isWordUnlocked(word) ? 1 : 0;
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
    case "arrows": {
      // thuum docs/verbs/marksman.md (playtest thirteen: the target's screen
      // shows two arrows per shot): how many arrow projectiles stand in the
      // player's cell (ArrowProjectile, form type 0x40 PARW, CommonLibSSE-NG
      // include/RE/F/FormTypes.h:204), by SKSE's Cell.GetNumRefs. Only the
      // count: any Papyrus call on a projectile reference aborts (the
      // projectiles step's note)
      const cell = player.getParentCell();
      if (!cell) return { error: "no cell" };
      return { count: cell.getNumRefs(0x40) };
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
          const nearest = Game.findClosestReferenceOfType(base, fx, fy, fz, radius);
          if (!nearest) {
            refs[key] = null;
            continue;
          }
          let lo = 0;
          let hi = radius;
          while (hi - lo > precision) {
            const mid = (lo + hi) / 2;
            if (Game.findClosestReferenceOfType(base, fx, fy, fz, mid)) hi = mid;
            else lo = mid;
          }
          refs[key] = { formId: nearest.getFormID(), distance: hi };
        } catch (e) {
          refs[key] = { error: String(e) };
        }
      }
      return { from: from.getFormID(), refs };
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
      return { skills: out, level: player.getLevel() };
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
      // accelerate) or released ({release: true}): {form}; the current one
      // comes back (Weather.getCurrentWeather)
      if (a.release) {
        Weather.releaseOverride();
      } else {
        const w = Weather.from(Game.getFormEx(num(a.form)));
        if (!w) throw new Error(`no weather ${num(a.form).toString(16)}`);
        w.setActive(true, true);
      }
      const now = Weather.getCurrentWeather();
      return { current: now ? now.getFormID() : 0 };
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
      // and percentage each
      const names = Array.isArray(a.names) ? a.names.map(String) : [];
      const values: Record<string, ReturnType<typeof readActorValue>> = {};
      for (const n of names) values[n] = readActorValue(player, n);
      return { values };
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
    case "watch-start": {
      const bools = Array.isArray(a.bools) ? (a.bools as unknown[]).filter((x): x is string => typeof x === "string") : [];
      const actors = new Map<number, Watched>();
      for (const other of nearbyActors(player)) actors.set(other.getFormID(), newWatched(other, bools));
      watching = { startedAt: Date.now(), actors, self: newWatched(player, bools) };
      return { watching: actors.size };
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
      w.actors.forEach((v, formId) => actors.push({ formId, ...v }));
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
      return { formId: placedId };
    }
    case "draw-weapon":
      // the player's, or with {other: true} the nearest other actor's (a
      // solo reference's NPC)
      (a.other ? nearestOther(player) : player).drawWeapon();
      return "drawn";
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
      const name = typeof a.name === "string" ? a.name : "";
      if (!name) return { error: "no event name" };
      Debug.sendAnimationEvent(a.other ? nearestOther(player) : player, name);
      return "sent";
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
      // where move only sets a position. args: {code, ms}
      const code = num(a.code, 0);
      const ms = num(a.ms, 0);
      if (code <= 0 || ms <= 0) return { error: "hold-key needs code and ms" };
      Input.holdKey(code);
      heldKeys.push({ code, until: Date.now() + ms });
      return "holding";
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
  releaseHeldKeys();
  const me = Game.getPlayer();
  if (me) settleMove(me);
  if (me) finishCraft(c, me);
  if (me) finishRacePick(c, me);
  finishConsole(c);
  if (me) readAfterRest(me);
  trackWatch();
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
on("consoleMessage", (e) => {
  const line = String(e.message);
  if (consoleTyping) consoleTyping.lines.push(line);
  consoleHistory.push(line);
  if (consoleHistory.length > CONSOLE_HISTORY_MAX) consoleHistory.splice(0, consoleHistory.length - CONSOLE_HISTORY_MAX);
});

log("loaded");
