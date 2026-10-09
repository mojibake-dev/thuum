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
  Input,
  NetImmerse,
  ObjectReference,
  Race,
  Spell,
  TESModPlatform,
  Ui,
  Utility,
  Weather,
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
// watch-start to watch-stop: every frame, how far each actor near us at the
// start has got from where it was (lab-api's c.watched(other)). Actors are
// kept by form id, so one that jumps out of range is still followed.
type Watched = { name: string; first: number[]; last: number[]; maxDisplacement: number; samples: number };
let watching: { startedAt: number; actors: Map<number, Watched> } | null = null;
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
function nearestOther(player: Actor): Actor {
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
  watching.actors.forEach((w, id) => {
    const actor = Actor.from(Game.getFormEx(id));
    if (!actor) return;
    const pos = positionOf(actor);
    const dx = pos[0] - w.first[0];
    const dy = pos[1] - w.first[1];
    const dz = pos[2] - w.first[2];
    w.maxDisplacement = Math.max(w.maxDisplacement, Math.sqrt(dx * dx + dy * dy + dz * dz));
    w.last = pos;
    w.samples += 1;
  });
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
      // form id (lab-api's c.known(id)); null for a form that is no ingredient
      const ids = Array.isArray(step.args?.ids) ? (step.args?.ids as unknown[]) : [];
      const out: Record<string, number | null> = {};
      for (const id of ids) {
        const ingredient = Ingredient.from(Game.getFormEx(Number(id)));
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
    case "projectiles": {
      // thuum docs/verbs/marksman.md: the reference of each projectile base
      // (a PROJ: Skyrim.esm ArrowIronProjectile 0x0003BE11 is the iron
      // arrow's, lab/esm.py) nearest this player within {radius} units
      // (Papyrus Game.FindClosestReferenceOfType), keyed by its decimal form
      // id under `refs`: its position and distance, or null when the game
      // holds none there; `worldOrCell` as dump-state reports it, for
      // lab-api's coordinates (c.projectile(id)). An arrow a figure launched
      // (TESModPlatform.LaunchArrow) is one. UNCONFIRMED: that the search,
      // which walks the loaded cells' references, finds an arrow in flight
      // or stuck where it landed.
      const ids = Array.isArray(a.ids) ? (a.ids as unknown[]) : [];
      const radius = num(a.radius, 4096);
      const px = player.getPositionX();
      const py = player.getPositionY();
      const pz = player.getPositionZ();
      // A Papyrus call that aborts on a projectile throws "Bad call result
      // 4" (Skyrim Platform CallNative.cpp: IFunction::CallResult
      // kFailedAbort; x-bow-race-probe 20261009-224055): each call is
      // caught and named in the answer instead of failing the step.
      const refs: Record<string, { formId: number; pos: number[]; distance: number } | { error: string } | null> = {};
      for (const id of ids) {
        const key = String(Number(id));
        const base = Game.getFormEx(Number(id));
        let ref: ObjectReference | null = null;
        try {
          ref = base ? Game.findClosestReferenceOfType(base, px, py, pz, radius) : null;
        } catch (e) {
          refs[key] = { error: `FindClosestReferenceOfType: ${e}` };
          continue;
        }
        if (!ref) {
          refs[key] = null;
          continue;
        }
        const formId = ref.getFormID();
        try {
          const pos = [ref.getPositionX(), ref.getPositionY(), ref.getPositionZ()];
          const dx = pos[0] - px;
          const dy = pos[1] - py;
          const dz = pos[2] - pz;
          refs[key] = { formId, pos, distance: Math.sqrt(dx * dx + dy * dy + dz * dz) };
        } catch (e) {
          refs[key] = { error: `GetPosition on ${formId.toString(16)}: ${e}` };
        }
      }
      const world = player.getWorldSpace();
      const cell = player.getParentCell();
      return { worldOrCell: world ? world.getFormID() : cell ? cell.getFormID() : 0, refs };
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
      const g = GlobalVariable.from(Game.getFormEx(num(a.form)));
      if (!g) throw new Error(`no global ${num(a.form).toString(16)}`);
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
      const actors = new Map<number, Watched>();
      for (const other of nearbyActors(player)) {
        const pos = positionOf(other);
        actors.set(other.getFormID(), { name: other.getDisplayName(), first: pos, last: pos, maxDisplacement: 0, samples: 0 });
      }
      watching = { startedAt: Date.now(), actors };
      return { watching: actors.size };
    }
    case "watch-stop": {
      if (!watching) return { error: "no watch-start before watch-stop" };
      const w = watching;
      watching = null;
      const actors: Array<Watched & { formId: number }> = [];
      w.actors.forEach((v, formId) => actors.push({ formId, ...v }));
      return { seconds: (Date.now() - w.startedAt) / 1000, actors };
    }
    case "equip": {
      const item = Game.getFormEx(num(a.formId));
      if (!item) return { error: "no such form" };
      player.equipItem(item, false, true);
      return "ok";
    }
    case "cast": {
      const spell = Spell.from(Game.getFormEx(num(a.spellId)));
      if (!spell) return { error: "no such spell" };
      const target = form(a.targetId);
      spell.cast(player, target);
      return "dispatched";
    }
    case "activate": {
      const ref = form(a.refId);
      if (!ref) return { error: "no such ref" };
      return ref.activate(player, false);
    }
    case "draw-weapon":
      player.drawWeapon();
      return "drawn";
    case "anim-event": {
      // One animation event on the player's behavior graph (Papyrus
      // Debug.SendAnimationEvent), the way the controls start an attack:
      // "attackStart" swings the right hand, "AttackStartH2HRight" a fist;
      // the engine's hit frame then picks the target itself
      // (ghidra/notes/melee-reach-1-7-104.md). Names as skymp5-server's
      // AnimationSystem.cpp keys them from real clients. UNCONFIRMED: a sent
      // attackStart lands a hit.
      const name = typeof a.name === "string" ? a.name : "";
      if (!name) return { error: "no event name" };
      Debug.sendAnimationEvent(player, name);
      return "sent";
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
        if (step && typeof step.id === "string" && typeof step.action === "string") pending = step;
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
