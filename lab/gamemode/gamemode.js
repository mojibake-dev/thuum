// thuum lab gamemode: the server-side half of the lab (Track S2).
//
// Loaded by skymp5-server as gamemode.js (its default gamemodePath) with the
// native server bound to `mp`. Upstream's own systems keep handling login,
// spawn, and sync; this file only answers two HTTP RPCs that the server's UI
// port already routes to mp.onHttpRpcRunAttempt (skymp5-server/ts/ui.ts,
// POST /rpc/<name> with body {"payload": ...}):
//
//   labState   {kind: "actor" | "inventory" | "online", profileId}
//              {kind: "time"}: the server's game clock now
//              {kind: "spell", formId}: a spell's effects and their MGEFs as the server resolves them
//              {kind: "cellHost", cell}: who hosts the cell on the server (docs/verbs/cell-host.md)
//              {kind: "ref", actorId}: an actor's record by form id (a hosted NPC's position and health)
//              {kind: "follow", actorId}: whether a game follows that actor out of its hosted cells (npc-handoff)
//              {kind: "fate", actorId}: the server's roll for a game-file actor (npc-fate, ADR-046)
//              {kind: "stream", profileId}: a player's stream counters by message type (npc-stream slice 4)
//   labCommand {kind: "teleport", profileId, cell, pos, rot?}
//              {kind: "give", profileId, baseId, count}
//              {kind: "open-race-menu", profileId}, and the others below
//
// It also listens to one gamemode event, onUpdateAppearanceAttempt (the
// server's verdict on a client's race menu result), so labState can report
// what the server decided (docs/verbs/character-creation.md).
//
// The request and response shapes are the contract in lab/labapi/CONTRACT.md;
// lab-api is the only caller. No auth: the UI port is reachable only inside
// the lab VLAN and from lab-api. No em dash anywhere (rule 11).

"use strict";

const fs = require("fs");
const path = require("path");

// The server runs a temporary copy of gamemode.js (/tmp/skymp5-server*/), so
// __dirname never points at the mounted lab/gamemode; presets live at the
// compose mount (lab/deploy/sky-srv/docker-compose.yml), overridable for tests.
const PRESET_DIR = process.env.LAB_PRESET_DIR || (fs.existsSync("/srv/skymp/gamemode/presets") ? "/srv/skymp/gamemode/presets" : path.join(typeof __dirname !== "undefined" ? __dirname : process.cwd(), "presets"));

function actorFor(profileId) {
  const ids = mp.getActorsByProfileId(Number(profileId)) || [];
  return ids.length ? ids[0] : null;
}

// The effects the server runs on an actor (mp.get's runningEffects, thuum
// docs/verbs/magic-effects.md); null from a server without the property,
// whose mp.get throws on the unknown name (CustomPropertyBinding)
function runningEffects(actorId) {
  try {
    const effects = mp.get(actorId, "runningEffects");
    return Array.isArray(effects) ? effects : null;
  } catch (e) {
    return null;
  }
}

// What the server holds of an actor's shouts (mp.get's shouts, thuum
// docs/verbs/shouts.md): {shouts, wordsKnown, wordsUnlocked} as form ids
// and recoverySecondsLeft; null from a server without the property
function shouts(actorId) {
  try {
    const record = mp.get(actorId, "shouts");
    return record && typeof record === "object" ? record : null;
  } catch (e) {
    return null;
  }
}

function notFound(profileId) {
  return { found: false, profileId: Number(profileId) };
}

// actorId -> {count, raceId, allowed}: every UpdateAppearance the server
// judged since it started (skymp5-server UpdateAppearanceAttemptEvent:
// actor form id, the appearance the client sent, whether it was taken).
// Returning nothing never blocks the event.
const appearanceAttempts = new Map();
mp.onUpdateAppearanceAttempt = (actorId, appearance, isAllowed) => {
  const prev = appearanceAttempts.get(actorId);
  appearanceAttempts.set(actorId, {
    count: (prev ? prev.count : 0) + 1,
    raceId: appearance ? appearance.raceId : null,
    allowed: Boolean(isAllowed),
  });
};

const state = {
  actor(payload) {
    const actorId = actorFor(payload.profileId);
    if (!actorId) return notFound(payload.profileId);
    const loc = mp.get(actorId, "locationalData");
    const pct = mp.get(actorId, "percentages") || {};
    const app = mp.get(actorId, "appearance");
    const attempt = appearanceAttempts.get(actorId);
    return {
      hasAppearance: app !== null && app !== undefined,
      raceId: app ? app.raceId : null,
      sex: app ? (app.isFemale ? 1 : 0) : null,
      // the appearance's head parts, sorted: where RaceMenu is present the
      // server derives them from the look (thuum ADR-026)
      headParts: app && Array.isArray(app.headpartIds) ? app.headpartIds.slice().sort((x, y) => x - y) : null,
      appearanceAttempts: attempt ? attempt.count : 0,
      lastAppearanceRaceId: attempt ? attempt.raceId : null,
      lastAppearanceAllowed: attempt ? attempt.allowed : null,
      found: true,
      profileId: Number(payload.profileId),
      actorId,
      x: loc.pos[0],
      y: loc.pos[1],
      z: loc.pos[2],
      rot: loc.rot,
      cell: loc.cellOrWorldDesc,
      isDead: Boolean(mp.get(actorId, "isDead")),
      isOnline: Boolean(mp.get(actorId, "isOnline")),
      healthPercentage: pct.health,
      magickaPercentage: pct.magicka,
      staminaPercentage: pct.stamina,
      // the effects the server runs on the actor, each {effect, source,
      // magnitude, secondsLeft} (docs/verbs/magic-effects.md); null from a
      // server without the property
      effects: runningEffects(actorId),
      // the shouts record and the voice's recovery on the server's clock
      // (docs/verbs/shouts.md); null from a server without the property
      shouts: shouts(actorId),
    };
  },

  inventory(payload) {
    const actorId = actorFor(payload.profileId);
    if (!actorId) return notFound(payload.profileId);
    const inv = mp.get(actorId, "inventory") || { entries: [] };
    return { found: true, profileId: Number(payload.profileId), actorId, entries: inv.entries || [] };
  },

  online() {
    const ids = mp.get(0, "onlinePlayers") || [];
    return { players: ids.map((actorId) => ({ actorId, profileId: mp.get(actorId, "profileId") })) };
  },

  // Who hosts a cell on the server (docs/verbs/cell-host.md): the host
  // table's row for the cell, {found, cell, hosted, actorId, epoch}; a cell
  // the table never granted is {found: true, hosted: false, actorId: 0,
  // epoch: 0}; a server without the property answers found: false
  cellHost(payload) {
    const cell = Number(payload.cell);
    let rows;
    try {
      rows = mp.get(0, "cellHosts") || [];
    } catch (e) {
      return { found: false, cell, error: String((e && e.message) || e) };
    }
    const row = rows.find((r) => Number(r.cell) === cell);
    return {
      found: true,
      cell,
      hosted: row ? Boolean(row.hosted) : false,
      actorId: row ? Number(row.player) : 0,
      epoch: row ? Number(row.epoch) : 0,
    };
  },

  // Whether a game follows an actor into a cell it does not host (npc-handoff's
  // follow, D6): the server's cellFollows row for the actor, {found, actorId,
  // following, player, cell}; an actor nobody follows is {found: true,
  // following: false, player: 0, cell: 0}; a server without the property
  // answers found: false
  follow(payload) {
    const actorId = Number(payload.actorId);
    let rows;
    try {
      rows = mp.get(0, "cellFollows") || [];
    } catch (e) {
      return { found: false, actorId, error: String((e && e.message) || e) };
    }
    const row = rows.find((r) => Number(r.actor) === actorId);
    return {
      found: true,
      actorId,
      following: Boolean(row),
      player: row ? Number(row.player) : 0,
      cell: row ? Number(row.cell) : 0,
    };
  },

  // A player's stream counters (npc-stream slice 4, ADR-050): the server's
  // streamCounters rows {user, player, t, accepted, dropped, foreign}, one per
  // connection and SkyMP message type, kept for the player's actor as {found,
  // actorId, rows: [{t, accepted, dropped, foreign}]}; a server without the
  // property answers found: false
  stream(payload) {
    const actorId = actorFor(payload.profileId);
    if (!actorId) return notFound(payload.profileId);
    let rows;
    try {
      rows = mp.get(0, "streamCounters") || [];
    } catch (e) {
      return { found: false, actorId, error: String((e && e.message) || e) };
    }
    return {
      found: true,
      actorId,
      rows: rows
        .filter((r) => Number(r.player) === actorId)
        .map((r) => ({ t: Number(r.t), accepted: Number(r.accepted) || 0, dropped: Number(r.dropped) || 0, foreign: Number(r.foreign) || 0 })),
    };
  },

  // The server's roll for a game-file actor (npc-fate, ADR-046): its actorFate,
  // {baseId, level, raceId, worn}, as {found, actorId, fated, baseId, level,
  // raceId, worn}; an actor the server rolled nothing for is fated: false; a
  // server without the property answers found: false
  fate(payload) {
    const actorId = Number(payload.actorId);
    let f;
    try {
      f = mp.get(actorId, "actorFate");
    } catch (e) {
      return { found: false, actorId, error: String((e && e.message) || e) };
    }
    return {
      found: true,
      actorId,
      fated: Boolean(f),
      baseId: f ? Number(f.baseId) : 0,
      level: f ? Number(f.level) : 0,
      raceId: f ? Number(f.raceId) : 0,
      worn: f && Array.isArray(f.worn) ? f.worn.map(Number).sort((x, y) => x - y) : [],
    };
  },

  // An actor's record by form id (a hosted NPC's position and health, the
  // freeze's evidence while its cell is unhosted): the same fields as
  // `actor` reads for a player, without the appearance verdicts
  ref(payload) {
    const actorId = Number(payload.actorId);
    const loc = mp.get(actorId, "locationalData");
    if (!loc || !Array.isArray(loc.pos)) return { found: false, actorId };
    const pct = mp.get(actorId, "percentages") || {};
    return {
      found: true,
      actorId,
      x: loc.pos[0],
      y: loc.pos[1],
      z: loc.pos[2],
      rot: loc.rot,
      cell: loc.cellOrWorldDesc,
      isDead: Boolean(mp.get(actorId, "isDead")),
      healthPercentage: pct.health,
      magickaPercentage: pct.magicka,
      staminaPercentage: pct.stamina,
      worn: wornOf(actorId),
    };
  },

  // The server's game clock (docs/verbs/time.md): year, month (from 0), day,
  // hour, daysPassed, timeScale. A server without the clock has no property.
  time() {
    try {
      return { found: true, ...mp.get(0, "gameTime") };
    } catch (e) {
      return { found: false, error: String((e && e.message) || e) };
    }
  },

  // A spell's effects as the server's espm resolves them (lab-api's server.spell): the
  // winning plugin's SPEL (libespm CombineBrowser.cpp:61-72, the last match in load order)
  // with each EFID mapped through that plugin's masters, its EFIT as libespm reads it
  // (Effects.cpp:38-45: magnitude float @0, area u32 @4, duration u32 @8), the CTDAs after
  // it counted (Effects.cpp:46-53), and each MGEF's DATA fields the server's damage path
  // reads (MGEF.cpp:15-54: flags u32 @0x00, archetype u32 @0x40, primaryAV u32 @0x44; the
  // second AV's weight float @0x3C and secondary AV u32 @0x58 when DATA is long enough),
  // its own CTDAs counted. lab-api decides what counts as Health damage, as ApplyEffects does.
  spell(payload) {
    const formId = Number(payload.formId);
    const spel = mp.lookupEspmRecordById(formId);
    if (!spel || !spel.record) return { found: false, formId };
    const effects = [];
    let current = null;
    for (const field of spel.record.fields || []) {
      if (field.type === "EFID") {
        current = { mgef: spel.toGlobalRecordId(u32(field.data, 0)), magnitude: 0, area: 0, duration: 0, conditions: 0 };
        effects.push(current);
      } else if (field.type === "EFIT" && current) {
        current.magnitude = f32(field.data, 0);
        current.area = u32(field.data, 4);
        current.duration = u32(field.data, 8);
      } else if (field.type === "CTDA" && current) {
        current.conditions += 1;
      }
    }
    const mgefs = {};
    for (const effect of effects) {
      const key = String(effect.mgef);
      if (key in mgefs) continue;
      const mgef = mp.lookupEspmRecordById(effect.mgef);
      const fields = (mgef && mgef.record && mgef.record.fields) || [];
      const data = fields.find((f) => f.type === "DATA");
      mgefs[key] = data && data.data.length >= 0x48 ? {
        editorId: mgef.record.editorId,
        flags: u32(data.data, 0x00),
        archetype: u32(data.data, 0x40),
        primaryAV: u32(data.data, 0x44),
        secondAVWeight: data.data.length >= 0x40 ? f32(data.data, 0x3c) : 0,
        secondaryAV: data.data.length >= 0x5c ? u32(data.data, 0x58) : -1,
        conditions: fields.filter((f) => f.type === "CTDA").length,
      } : null;
    }
    return { found: true, formId, editorId: spel.record.editorId, effects, mgefs };
  },
};

// The armor and weapon form ids an actor's equipment record marks worn, in a
// slot or either hand, one per form and sorted (npc-stream slice 3: a hosted
// actor's hands follow its host's engine): a seat's npc-state worn list counts
// the same (lab-driver: the 32 slots and the two hands' weapon or armor). The
// record marks ammo and a torch worn too, so each form's type comes from the
// server's espm (lookupEspmRecordById's record.type) and only ARMO and WEAP
// stay. null when the server holds no equipment for the id (EquipmentBinding
// throws for a form that is no actor), [] when it wears nothing.
function wornOf(actorId) {
  let eq;
  try {
    eq = mp.get(actorId, "equipment");
  } catch (e) {
    return null;
  }
  const entries = eq && eq.inv && Array.isArray(eq.inv.entries) ? eq.inv.entries : null;
  if (!entries) return null;
  const ids = new Set();
  for (const entry of entries) {
    if (!entry || !(entry.worn || entry.wornLeft)) continue;
    const id = Number(entry.baseId);
    let type = "";
    try {
      const found = mp.lookupEspmRecordById(id);
      type = found && found.record ? String(found.record.type) : "";
    } catch (e) {
      type = "";
    }
    if (type === "ARMO" || type === "WEAP") ids.add(id);
  }
  return Array.from(ids).sort((x, y) => x - y);
}

// Little-endian reads from an espm field's bytes (a Uint8Array from lookupEspmRecordById).
function view(bytes) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}
function u32(bytes, at) {
  return view(bytes).getUint32(at, true);
}
function f32(bytes, at) {
  return view(bytes).getFloat32(at, true);
}

const command = {
  teleport(payload) {
    const actorId = actorFor(payload.profileId);
    if (!actorId) return notFound(payload.profileId);
    const current = mp.get(actorId, "locationalData");
    const pos = Array.isArray(payload.pos) ? payload.pos : [payload.x, payload.y, payload.z];
    if (pos.some((v) => typeof v !== "number")) return { ok: false, error: "teleport needs pos or x, y, z" };
    mp.set(actorId, "locationalData", {
      cellOrWorldDesc: payload.cell || current.cellOrWorldDesc,
      pos,
      rot: payload.rot || current.rot,
    });
    return { ok: true, actorId };
  },

  give(payload) {
    const actorId = actorFor(payload.profileId);
    if (!actorId) return notFound(payload.profileId);
    const baseId = Number(payload.baseId);
    const count = Number(payload.count || 1);
    // a give of base 0 (a form that is nothing) once reached a player's
    // inventory from a scan that found no form (2026-10-07); an entry that
    // reaches zero or less is dropped, not kept at 0
    if (!baseId) return { ok: false, error: "baseId 0 is no item" };
    const inv = mp.get(actorId, "inventory") || { entries: [] };
    let entries = (inv.entries || []).map((e) => ({ ...e }));
    const hit = entries.find((e) => e.baseId === baseId);
    if (hit) hit.count += count;
    else entries.push({ baseId, count });
    entries = entries.filter((e) => e.baseId && e.count > 0);
    mp.set(actorId, "inventory", { entries });
    return { ok: true, actorId, baseId, count: (hit ? hit.count : count) };
  },
};

command["set-appearance"] = (payload) => {
  const actorId = actorFor(payload.profileId);
  if (!actorId) return notFound(payload.profileId);
  const preset = String(payload.preset || "");
  if (!/^[a-z0-9-]+$/.test(preset)) return { ok: false, error: `bad preset name ${preset}` };
  const file = path.join(PRESET_DIR, `${preset}.json`);
  if (!fs.existsSync(file)) return { ok: false, error: `no preset file ${file}` };
  mp.set(actorId, "appearance", JSON.parse(fs.readFileSync(file, "utf8")));
  // The server only accepts the client's own appearance while the race menu is
  // open for the actor, and keeps the flag until then; with the preset applied
  // the menu is done. The stock client cannot close an open menu on this (a
  // TODO in skymp5-client), so a client sitting in it needs a relaunch; a
  // client logging in afterwards goes straight into the world.
  if (typeof mp.setRaceMenuOpen === "function") mp.setRaceMenuOpen(actorId, false);
  return { ok: true, actorId, preset };
};

// docs/verbs/actor-values.md: an actor value native on a player, run by the
// server's own Papyrus VM (R0) as a script would call it: {profileId, how:
// get | base | max | set | mod | force, name, value}. Answers what the
// native returned (get, base, max) or what the server then reads back as
// the base and current value.
const AV_NATIVES = {
  get: "GetActorValue",
  base: "GetBaseActorValue",
  max: "GetActorValueMax",
  set: "SetActorValue",
  mod: "ModActorValue",
  force: "ForceActorValue",
};
command["papyrus-av"] = (payload) => {
  const actorId = actorFor(payload.profileId);
  if (!actorId) return notFound(payload.profileId);
  const fn = AV_NATIVES[String(payload.how || "")];
  const name = String(payload.name || "");
  if (!fn || !name) return { ok: false, error: "papyrus-av needs how (get, base, max, set, mod, force) and name" };
  const self = { type: "form", desc: mp.getDescFromId(actorId) };
  const call = (f, args) => mp.callPapyrusFunction("method", "Actor", f, self, args);
  if (fn.startsWith("Get")) {
    return { ok: true, actorId, how: payload.how, name, value: call(fn, [name]) };
  }
  const value = Number(payload.value);
  if (!Number.isFinite(value)) return { ok: false, error: "papyrus-av needs a finite value" };
  call(fn, [name, value]);
  const answer = {
    ok: true, actorId, how: payload.how, name, value,
    base: call("GetBaseActorValue", [name]),
    current: call("GetActorValue", [name]),
  };
  // The server's SetActorValue sets its base (docs/verbs/actor-values.md), so a set whose base does not read back
  // is refused, not answered ok: a name the server does not index, or a value it would not take (x-headshot-probe's
  // "Archery" answered ok and changed nothing, 20261018-164202; the skill is Marksman to the server)
  if (payload.how === "set" && !(typeof answer.base === "number" && Math.abs(answer.base - value) < 1e-3)) {
    return { ...answer, ok: false, error: `papyrus-av set ${name} ${value}: the server's base reads ${answer.base} after the set (a name it does not index, or a value it would not take)` };
  }
  return answer;
};

// A player's staff rank (thuum docs/verbs/console-commands.md: 0 player,
// 1 moderator, 2 admin, 3 owner), which the server's console table reads; the
// property staffRank is the server's (fork m1-console). A server without it
// refuses the set, and the answer says so.
command["staff-rank"] = (payload) => {
  const actorId = actorFor(payload.profileId);
  if (!actorId) return notFound(payload.profileId);
  const rank = Number(payload.rank);
  if (!Number.isInteger(rank) || rank < 0 || rank > 3) {
    return { ok: false, error: "staff-rank needs rank 0 (player), 1 (moderator), 2 (admin) or 3 (owner)" };
  }
  mp.set(actorId, "staffRank", rank);
  return { ok: true, actorId, rank: mp.get(actorId, "staffRank") };
};

// A spell the player learns from the server (thuum docs/verbs/spell-cast.md:
// a fire-and-forget spell no new character knows): the server's own Papyrus
// Actor.AddSpell, the path a script takes, which records the spell on the
// server and has the player's game learn it (PapyrusActor.cpp AddSpell, the
// learned spells a SpellCast's equipment check reads). spellId is the
// record's form id, read from the masters with lab/esm.py, never from memory.
// learned is AddSpell's answer: true when the player learns it now, false
// when it knew it already or the record is no spell.
command["learn-spell"] = (payload) => {
  const actorId = actorFor(payload.profileId);
  if (!actorId) return notFound(payload.profileId);
  const spellId = Number(payload.spellId);
  if (!Number.isInteger(spellId) || spellId <= 0) return { ok: false, error: "learn-spell needs spellId, a form id" };
  const self = { type: "form", desc: mp.getDescFromId(actorId) };
  const spell = { type: "espm", desc: mp.getDescFromId(spellId) };
  const learned = mp.callPapyrusFunction("method", "Actor", "AddSpell", self, [spell, false]);
  return { ok: true, actorId, spellId, learned: learned === true };
};

// A console command run on the server as the player would type it
// (mp.executeConsoleCommand, fork m2-fifteen: the console verb's own path,
// the player's rank checked, its reply sent to its game; thuum
// docs/verbs/console-commands.md), for a playtest seat's setup such as its
// shouts and words (playtest fifteen, Eli: on the server, not keystrokes in
// a game). name is the command (addshout, teachword, unlockword, ...); args
// as a client sends them: the player itself 0x14 (20), a form id a number.
command.console = (payload) => {
  const actorId = actorFor(payload.profileId);
  if (!actorId) return notFound(payload.profileId);
  if (typeof mp.executeConsoleCommand !== "function") return { ok: false, error: "this server has no executeConsoleCommand" };
  const name = String(payload.name || "");
  const args = Array.isArray(payload.args) ? payload.args : [];
  if (!/^[A-Za-z]+$/.test(name)) return { ok: false, error: "console needs name, a command's letters" };
  if (!args.every((a) => Number.isInteger(a) || typeof a === "string")) {
    return { ok: false, error: "console args are integers or strings" };
  }
  mp.executeConsoleCommand(actorId, name, args);
  return { ok: true, actorId, name, args };
};

// The server sends the client SetRaceMenuOpen and takes one UpdateAppearance
// from it while the menu is open: the race menu a new character gets, opened
// for a recorded one. The stock client shows the menu; closing it is the
// client's (lab-driver tap-key: R, then Enter for the name).
command["open-race-menu"] = (payload) => {
  const actorId = actorFor(payload.profileId);
  if (!actorId) return notFound(payload.profileId);
  if (typeof mp.setRaceMenuOpen !== "function") return { ok: false, error: "this server has no setRaceMenuOpen" };
  mp.setRaceMenuOpen(actorId, true);
  return { ok: true, actorId };
};

command["set-percentages"] = (payload) => {
  const actorId = actorFor(payload.profileId);
  if (!actorId) return notFound(payload.profileId);
  const current = mp.get(actorId, "percentages") || { health: 1, magicka: 1, stamina: 1 };
  const next = { ...current };
  for (const k of ["health", "magicka", "stamina"]) {
    if (typeof payload[k] === "number") next[k] = payload[k];
  }
  mp.set(actorId, "percentages", next);
  return { ok: true, actorId, percentages: next };
};

command.kill = (payload) => {
  const actorId = actorFor(payload.profileId);
  if (!actorId) return notFound(payload.profileId);
  mp.set(actorId, "isDead", true);
  return { ok: true, actorId };
};

command.respawn = (payload) => {
  const actorId = actorFor(payload.profileId);
  if (!actorId) return notFound(payload.profileId);
  const spawn = mp.get(actorId, "spawnPoint");
  if (spawn) mp.set(actorId, "locationalData", spawn);
  mp.set(actorId, "isDead", false);
  return { ok: true, actorId, spawn: spawn || null };
};

// A game-file actor killed by the server by form id (npc-fate's death reads): the console verb's Kill
// (ConsoleCommands.cpp ExecuteKill: MpActor::Kill with its killer, the death event and the death item), run
// as the seat's console as `console` runs it (the verb checks the seat's rank). killerProfileId names the
// seat whose actor is the killer; none is a death with no killer.
command["kill-ref"] = (payload) => {
  const actorId = actorFor(payload.profileId);
  if (!actorId) return notFound(payload.profileId);
  if (typeof mp.executeConsoleCommand !== "function") return { ok: false, error: "this server has no executeConsoleCommand" };
  const formId = payload.formId;
  if (!Number.isInteger(formId) || formId <= 0) return { ok: false, error: "kill-ref needs formId, a form id" };
  const args = [formId];
  let killer = null;
  if (payload.killerProfileId !== undefined && payload.killerProfileId !== null) {
    killer = actorFor(payload.killerProfileId);
    if (!killer) return notFound(payload.killerProfileId);
    args.push(killer);
  }
  mp.executeConsoleCommand(actorId, "Kill", args);
  return { ok: true, formId, killer, isDead: Boolean(mp.get(formId, "isDead")) };
};

// A dead game-file actor up again at once by form id (npc-fate's respawn reads, without the reset's hours): at
// its spawn point as respawn puts a player there (locationalData, then isDead false: MpActor::SetIsDead's
// Respawn), or where it fell with inPlace (the console verb's Resurrect does the same).
command["respawn-ref"] = (payload) => {
  const formId = payload.formId;
  if (!Number.isInteger(formId) || formId <= 0) return { ok: false, error: "respawn-ref needs formId, a form id" };
  if (!mp.get(formId, "isDead")) return { ok: false, formId, error: "not dead" };
  const spawn = payload.inPlace ? null : mp.get(formId, "spawnPoint");
  if (spawn) mp.set(formId, "locationalData", spawn);
  mp.set(formId, "isDead", false);
  return { ok: true, formId, spawn: spawn || null, isDead: Boolean(mp.get(formId, "isDead")) };
};

function dispatch(table, payload) {
  const kind = payload && payload.kind;
  const fn = table[kind];
  if (!fn) return { error: `unknown kind ${String(kind)}` };
  return fn(payload);
}

const rpcs = {
  labState: (payload) => dispatch(state, payload),
  labCommand: (payload) => dispatch(command, payload),
};

mp.onHttpRpcRunAttempt = (name, payload) => {
  const fn = rpcs[name];
  if (!fn) return { error: `unknown rpc ${String(name)}` };
  try {
    return fn(payload || {});
  } catch (e) {
    return { error: String((e && e.message) || e) };
  }
};

console.log("thuum lab gamemode loaded: rpc labState, labCommand (teleport, give, set-appearance, open-race-menu, set-percentages, kill, respawn, kill-ref, respawn-ref, papyrus-av, staff-rank, learn-spell, console)");

// For the unit test only; the server never reads this.
if (typeof module !== "undefined") {
  module.exports = { rpcs, actorFor };
}
