// node --test lab/gamemode: the lab gamemode against a fake `mp`.
"use strict";
const test = require("node:test");
const assert = require("node:assert");

function fakeMp() {
  const props = new Map();
  const set = (id, k, v) => props.set(`${id}.${k}`, v);
  const get = (id, k) => props.get(`${id}.${k}`);
  set(0xff000001, "locationalData", { cellOrWorldDesc: "3c:Skyrim.esm", pos: [1, 2, 3], rot: [0, 0, 72] });
  set(0xff000001, "percentages", { health: 1, magicka: 0.5, stamina: 0.25 });
  set(0xff000001, "isDead", false);
  set(0xff000001, "isOnline", true);
  set(0xff000001, "inventory", { entries: [{ baseId: 0xf, count: 10 }] });
  set(0xff000001, "profileId", 1);
  set(0, "onlinePlayers", [0xff000001]);
  return {
    get,
    set,
    getActorsByProfileId: (pid) => (pid === 1 ? [0xff000001] : []),
    onHttpRpcRunAttempt: null,
  };
}

test("labState actor and inventory", () => {
  global.mp = fakeMp();
  delete require.cache[require.resolve("./gamemode.js")];
  require("./gamemode.js");
  const actor = mp.onHttpRpcRunAttempt("labState", { kind: "actor", profileId: 1 });
  assert.deepStrictEqual([actor.x, actor.y, actor.z], [1, 2, 3]);
  assert.strictEqual(actor.cell, "3c:Skyrim.esm");
  assert.strictEqual(actor.isDead, false);
  assert.strictEqual(actor.healthPercentage, 1);
  const inv = mp.onHttpRpcRunAttempt("labState", { kind: "inventory", profileId: 1 });
  assert.deepStrictEqual(inv.entries, [{ baseId: 0xf, count: 10 }]);
  assert.deepStrictEqual(mp.onHttpRpcRunAttempt("labState", { kind: "actor", profileId: 9 }), { found: false, profileId: 9 });
  assert.deepStrictEqual(mp.onHttpRpcRunAttempt("labState", { kind: "online" }), { players: [{ actorId: 0xff000001, profileId: 1 }] });
});

test("labState time is the server's clock, and absent without one", () => {
  global.mp = fakeMp();
  delete require.cache[require.resolve("./gamemode.js")];
  require("./gamemode.js");
  const clock = { year: 201, month: 7, day: 17, hour: 8.5, daysPassed: 1.02, timeScale: 20 };
  mp.set(0, "gameTime", clock);
  assert.deepStrictEqual(mp.onHttpRpcRunAttempt("labState", { kind: "time" }), { found: true, ...clock });
  mp.get = (id, k) => {
    throw new Error(`mp.get is not implemented for '${k}'`);
  };
  const none = mp.onHttpRpcRunAttempt("labState", { kind: "time" });
  assert.strictEqual(none.found, false);
  assert.match(none.error, /gameTime/);
});

test("labCommand teleport and give", () => {
  global.mp = fakeMp();
  delete require.cache[require.resolve("./gamemode.js")];
  require("./gamemode.js");
  const t = mp.onHttpRpcRunAttempt("labCommand", { kind: "teleport", profileId: 1, cell: "3c:Skyrim.esm", x: 100, y: 200, z: 300 });
  assert.strictEqual(t.ok, true);
  assert.deepStrictEqual(mp.get(0xff000001, "locationalData"), { cellOrWorldDesc: "3c:Skyrim.esm", pos: [100, 200, 300], rot: [0, 0, 72] });
  assert.strictEqual(mp.onHttpRpcRunAttempt("labCommand", { kind: "teleport", profileId: 1, cell: "3c:Skyrim.esm" }).ok, false);
  const g1 = mp.onHttpRpcRunAttempt("labCommand", { kind: "give", profileId: 1, baseId: 0x12eb7, count: 1 });
  assert.strictEqual(g1.count, 1);
  const g2 = mp.onHttpRpcRunAttempt("labCommand", { kind: "give", profileId: 1, baseId: 0xf, count: 5 });
  assert.strictEqual(g2.count, 15);
  assert.deepStrictEqual(mp.get(0xff000001, "inventory"), { entries: [{ baseId: 0xf, count: 15 }, { baseId: 0x12eb7, count: 1 }] });
});

test("labState reports appearance, and the new commands change state", () => {
  global.mp = fakeMp();
  mp.set(0xff000001, "appearance", { raceId: 79683, isFemale: true, headpartIds: [0x51631, 0x51505, 0x5162f] });
  mp.set(0xff000001, "spawnPoint", { cellOrWorldDesc: "3c:Skyrim.esm", pos: [9, 9, 9], rot: [0, 0, 0] });
  delete require.cache[require.resolve("./gamemode.js")];
  require("./gamemode.js");
  const a = mp.onHttpRpcRunAttempt("labState", { kind: "actor", profileId: 1 });
  assert.strictEqual(a.hasAppearance, true);
  assert.strictEqual(a.raceId, 79683);
  assert.strictEqual(a.sex, 1);
  // the appearance's head parts, sorted (thuum ADR-026)
  assert.deepStrictEqual(a.headParts, [0x51505, 0x5162f, 0x51631]);
  assert.deepStrictEqual(mp.onHttpRpcRunAttempt("labCommand", { kind: "set-percentages", profileId: 1, health: 0.5 }).percentages, { health: 0.5, magicka: 0.5, stamina: 0.25 });
  assert.strictEqual(mp.onHttpRpcRunAttempt("labCommand", { kind: "kill", profileId: 1 }).ok, true);
  assert.strictEqual(mp.get(0xff000001, "isDead"), true);
  const r = mp.onHttpRpcRunAttempt("labCommand", { kind: "respawn", profileId: 1 });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(mp.get(0xff000001, "isDead"), false);
  assert.deepStrictEqual(mp.get(0xff000001, "locationalData").pos, [9, 9, 9]);
  const bad = mp.onHttpRpcRunAttempt("labCommand", { kind: "set-appearance", profileId: 1, preset: "no-such-preset" });
  assert.strictEqual(bad.ok, false);
  assert.match(bad.error, /no preset file/);
  assert.strictEqual(mp.onHttpRpcRunAttempt("labCommand", { kind: "set-appearance", profileId: 1, preset: "../x" }).ok, false);
});

test("open-race-menu opens the server's menu, and labState reports the verdict", () => {
  global.mp = fakeMp();
  const opened = [];
  mp.setRaceMenuOpen = (actorId, open) => opened.push([actorId, open]);
  delete require.cache[require.resolve("./gamemode.js")];
  require("./gamemode.js");
  const before = mp.onHttpRpcRunAttempt("labState", { kind: "actor", profileId: 1 });
  assert.deepStrictEqual([before.appearanceAttempts, before.lastAppearanceRaceId, before.lastAppearanceAllowed], [0, null, null]);
  assert.strictEqual(mp.onHttpRpcRunAttempt("labCommand", { kind: "open-race-menu", profileId: 1 }).ok, true);
  assert.deepStrictEqual(opened, [[0xff000001, true]]);
  assert.strictEqual(mp.onUpdateAppearanceAttempt(0xff000001, { raceId: 78320 }, false), undefined);
  mp.onUpdateAppearanceAttempt(0xff000001, { raceId: 79686 }, true);
  const after = mp.onHttpRpcRunAttempt("labState", { kind: "actor", profileId: 1 });
  assert.deepStrictEqual([after.appearanceAttempts, after.lastAppearanceRaceId, after.lastAppearanceAllowed], [2, 79686, true]);
  assert.deepStrictEqual(mp.onHttpRpcRunAttempt("labCommand", { kind: "open-race-menu", profileId: 9 }), { found: false, profileId: 9 });
});

test("unknown rpc and kind, and thrown errors, answer with error", () => {
  global.mp = fakeMp();
  mp.get = () => { throw new Error("boom"); };
  delete require.cache[require.resolve("./gamemode.js")];
  require("./gamemode.js");
  assert.deepStrictEqual(mp.onHttpRpcRunAttempt("nope", {}), { error: "unknown rpc nope" });
  assert.deepStrictEqual(mp.onHttpRpcRunAttempt("labState", { kind: "what" }), { error: "unknown kind what" });
  assert.deepStrictEqual(mp.onHttpRpcRunAttempt("labState", { kind: "actor", profileId: 1 }), { error: "boom" });
});

test("labCommand papyrus-av runs the server's own actor value natives", () => {
  global.mp = fakeMp();
  const calls = [];
  const bases = { Archery: 15 };
  mp.getDescFromId = (id) => id.toString(16);
  mp.callPapyrusFunction = (callType, className, fn, self, args) => {
    calls.push([callType, className, fn, self.type, self.desc, ...args]);
    if (fn === "SetActorValue") bases[args[0]] = args[1];
    if (fn === "ModActorValue") bases[args[0]] += args[1];
    return bases[args[0]];
  };
  delete require.cache[require.resolve("./gamemode.js")];
  require("./gamemode.js");
  const set = mp.onHttpRpcRunAttempt("labCommand", { kind: "papyrus-av", profileId: 1, how: "set", name: "Archery", value: 45 });
  assert.deepStrictEqual(set, { ok: true, actorId: 0xff000001, how: "set", name: "Archery", value: 45, base: 45, current: 45 });
  assert.deepStrictEqual(calls[0], ["method", "Actor", "SetActorValue", "form", "ff000001", "Archery", 45]);
  const mod = mp.onHttpRpcRunAttempt("labCommand", { kind: "papyrus-av", profileId: 1, how: "mod", name: "Archery", value: 5 });
  assert.strictEqual(mod.base, 50);
  const base = mp.onHttpRpcRunAttempt("labCommand", { kind: "papyrus-av", profileId: 1, how: "base", name: "Archery" });
  assert.strictEqual(base.value, 50);
  assert.strictEqual(mp.onHttpRpcRunAttempt("labCommand", { kind: "papyrus-av", profileId: 1, how: "nope", name: "Archery" }).ok, false);
  assert.strictEqual(mp.onHttpRpcRunAttempt("labCommand", { kind: "papyrus-av", profileId: 1, how: "set", name: "Archery", value: "x" }).ok, false);
  assert.deepStrictEqual(mp.onHttpRpcRunAttempt("labCommand", { kind: "papyrus-av", profileId: 9, how: "set", name: "Archery", value: 1 }), { found: false, profileId: 9 });
});

test("labCommand staff-rank sets the server's staffRank property", () => {
  global.mp = fakeMp();
  delete require.cache[require.resolve("./gamemode.js")];
  require("./gamemode.js");
  const ok = mp.onHttpRpcRunAttempt("labCommand", { kind: "staff-rank", profileId: 1, rank: 3 });
  assert.strictEqual(ok.ok, true);
  assert.strictEqual(mp.get(0xff000001, "staffRank"), 3);
  for (const rank of [-1, 4, 1.5, "owner"]) {
    assert.strictEqual(mp.onHttpRpcRunAttempt("labCommand", { kind: "staff-rank", profileId: 1, rank }).ok, false);
  }
  assert.deepStrictEqual(mp.onHttpRpcRunAttempt("labCommand", { kind: "staff-rank", profileId: 9, rank: 0 }), { found: false, profileId: 9 });
});

test("labCommand learn-spell runs the server's own Actor.AddSpell", () => {
  global.mp = fakeMp();
  const calls = [];
  mp.getDescFromId = (id) => id.toString(16);
  mp.callPapyrusFunction = (callType, className, fn, self, args) => {
    calls.push([callType, className, fn, self.type, self.desc, args[0].type, args[0].desc, args[1]]);
    return !calls.slice(0, -1).some((c) => c[6] === args[0].desc);
  };
  delete require.cache[require.resolve("./gamemode.js")];
  require("./gamemode.js");
  const ok = mp.onHttpRpcRunAttempt("labCommand", { kind: "learn-spell", profileId: 1, spellId: 0x12fd0 });
  assert.deepStrictEqual(ok, { ok: true, actorId: 0xff000001, spellId: 0x12fd0, learned: true });
  assert.deepStrictEqual(calls[0], ["method", "Actor", "AddSpell", "form", "ff000001", "espm", "12fd0", false]);
  const again = mp.onHttpRpcRunAttempt("labCommand", { kind: "learn-spell", profileId: 1, spellId: 0x12fd0 });
  assert.deepStrictEqual(again, { ok: true, actorId: 0xff000001, spellId: 0x12fd0, learned: false });
  for (const spellId of [0, -1, 1.5, "firebolt", undefined]) {
    assert.strictEqual(mp.onHttpRpcRunAttempt("labCommand", { kind: "learn-spell", profileId: 1, spellId }).ok, false);
  }
  assert.deepStrictEqual(mp.onHttpRpcRunAttempt("labCommand", { kind: "learn-spell", profileId: 9, spellId: 0x12fd0 }), { found: false, profileId: 9 });
});
