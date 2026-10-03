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
// AI-driven pathing, update firing with menus open. Each is tagged below.

import {
  Actor,
  Cell,
  ConstructibleObject,
  Debug,
  Game,
  HttpClient,
  HttpResponse,
  Input,
  ObjectReference,
  Spell,
  TESModPlatform,
  Utility,
  WorldSpace,
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

function num(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
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
    near,
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
      // Game.GetGameSettingFloat.
      const names = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
      const ini: Record<string, number> = {};
      for (const n of names(a.ini)) ini[n] = Utility.getINIFloat(n);
      const gmst: Record<string, number> = {};
      for (const n of names(a.gmst)) gmst[n] = Game.getGameSettingFloat(n);
      return { ini, gmst };
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
    case "craft": {
      // UNCONFIRMED: crafting is a menu in the engine, so the driver reproduces
      // what the engine does to the inventory while the player uses the
      // station: enter the furniture, take the recipe's ingredients out of the
      // player (to no container) and put the result in. skymp5-client's
      // craft service watches exactly those container changes while
      // getFurnitureReference() is set and sends CraftItem; the server owns
      // the outcome (R0). args: {station: <ref form id>, recipe: <COBJ form id>}
      // (lab-api resolves names to ids before the step reaches the driver).
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
      const me = Game.getPlayer();
      if (!me) return { error: "no player" };
      for (const [id, count] of ingredients) me.removeItem(Game.getFormEx(id), count, true, null);
      me.addItem(result, recipe.getResultQuantity(), true);
      return { result: result.getFormID(), ingredients };
    }
    case "tap-key": {
      // One key press through the engine's input system (SKSE Input.TapKey,
      // DirectInput scan code), for menus the server cannot close for the
      // client: the race menu's Done is 19 (R) and the name prompt's accept
      // is 28 (Enter). UNCONFIRMED: a tap reaching Scaleform menus (rule 2).
      const code = num(a.code, 0);
      if (code <= 0) return { error: "no scan code" };
      Input.tapKey(code);
      return "tapped";
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
  const me = Game.getPlayer();
  if (me) settleMove(me);
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
