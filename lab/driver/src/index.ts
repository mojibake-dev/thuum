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
  callNative,
  Cell,
  ConstructibleObject,
  Debug,
  Game,
  GlobalVariable,
  HttpClient,
  HttpResponse,
  Input,
  ObjectReference,
  Spell,
  TESModPlatform,
  Utility,
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
  closeAt?: number;
} | null = null;
const CRAFT_WAIT_MS = 15000;
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
const nodeFs = require("fs") as { existsSync(p: string): boolean; readFileSync(p: string): { toString(enc: string): string } };

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
    },
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
    const furniture = player.getFurnitureReference();
    if (furniture) {
      for (const [id, count] of k.ingredients) player.removeItem(Game.getFormEx(id), count, true, null);
      player.addItem(Game.getFormEx(k.result), k.count, true);
      k.closeAt = Date.now() + 2000;
      postResult(c, k.step, { ok: true, data: { result: k.result, ingredients: k.ingredients, furniture: furniture.getFormID(), waitedMs: Date.now() - k.startedAt } });
    } else if (Date.now() - k.startedAt > CRAFT_WAIT_MS) {
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
    case "set-av": {
      // The console's setav on the player: an actor value in this client
      // only (Actor.SetActorValue), such as SpeedMult for movement speed
      // bounds. args: {name, value}
      const name = typeof a.name === "string" ? a.name : "";
      if (!name || typeof a.value !== "number") return { error: "set-av needs name and value" };
      player.setActorValue(name, a.value);
      return { [name]: player.getActorValue(name) };
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
      station.activate(player, false);
      crafting = { step, ingredients, result: result.getFormID(), count: recipe.getResultQuantity(), startedAt: Date.now() };
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

log("loaded");
