// thuum lab gamemode: the server-side half of the lab (Track S2).
//
// Loaded by skymp5-server as gamemode.js (its default gamemodePath) with the
// native server bound to `mp`. Upstream's own systems keep handling login,
// spawn, and sync; this file only answers two HTTP RPCs that the server's UI
// port already routes to mp.onHttpRpcRunAttempt (skymp5-server/ts/ui.ts,
// POST /rpc/<name> with body {"payload": ...}):
//
//   labState   {kind: "actor" | "inventory" | "online", profileId}
//   labCommand {kind: "teleport", profileId, cell, pos, rot?}
//              {kind: "give", profileId, baseId, count}
//
// The request and response shapes are the contract in lab/labapi/CONTRACT.md;
// lab-api is the only caller. No auth: the UI port is reachable only inside
// the lab VLAN and from lab-api. No em dash anywhere (rule 11).

"use strict";

const fs = require("fs");
const path = require("path");

const PRESET_DIR = path.join(typeof __dirname !== "undefined" ? __dirname : process.cwd(), "presets");

function actorFor(profileId) {
  const ids = mp.getActorsByProfileId(Number(profileId)) || [];
  return ids.length ? ids[0] : null;
}

function notFound(profileId) {
  return { found: false, profileId: Number(profileId) };
}

const state = {
  actor(payload) {
    const actorId = actorFor(payload.profileId);
    if (!actorId) return notFound(payload.profileId);
    const loc = mp.get(actorId, "locationalData");
    const pct = mp.get(actorId, "percentages") || {};
    const app = mp.get(actorId, "appearance");
    return {
      hasAppearance: app !== null && app !== undefined,
      raceId: app ? app.raceId : null,
      sex: app ? (app.isFemale ? 1 : 0) : null,
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
};

const command = {
  teleport(payload) {
    const actorId = actorFor(payload.profileId);
    if (!actorId) return notFound(payload.profileId);
    const current = mp.get(actorId, "locationalData");
    mp.set(actorId, "locationalData", {
      cellOrWorldDesc: payload.cell || current.cellOrWorldDesc,
      pos: payload.pos,
      rot: payload.rot || current.rot,
    });
    return { ok: true, actorId };
  },

  give(payload) {
    const actorId = actorFor(payload.profileId);
    if (!actorId) return notFound(payload.profileId);
    const baseId = Number(payload.baseId);
    const count = Number(payload.count || 1);
    const inv = mp.get(actorId, "inventory") || { entries: [] };
    const entries = (inv.entries || []).map((e) => ({ ...e }));
    const hit = entries.find((e) => e.baseId === baseId);
    if (hit) hit.count += count;
    else entries.push({ baseId, count });
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
  return { ok: true, actorId, preset };
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

console.log("thuum lab gamemode loaded: rpc labState, labCommand (teleport, give, set-appearance, set-percentages, kill, respawn)");

// For the unit test only; the server never reads this.
if (typeof module !== "undefined") {
  module.exports = { rpcs, actorFor };
}
