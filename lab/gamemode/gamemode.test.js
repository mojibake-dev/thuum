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
  mp.set(0xff000001, "appearance", { raceId: 79683, isFemale: true });
  mp.set(0xff000001, "spawnPoint", { cellOrWorldDesc: "3c:Skyrim.esm", pos: [9, 9, 9], rot: [0, 0, 0] });
  delete require.cache[require.resolve("./gamemode.js")];
  require("./gamemode.js");
  const a = mp.onHttpRpcRunAttempt("labState", { kind: "actor", profileId: 1 });
  assert.strictEqual(a.hasAppearance, true);
  assert.strictEqual(a.raceId, 79683);
  assert.strictEqual(a.sex, 1);
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

test("unknown rpc and kind, and thrown errors, answer with error", () => {
  global.mp = fakeMp();
  mp.get = () => { throw new Error("boom"); };
  delete require.cache[require.resolve("./gamemode.js")];
  require("./gamemode.js");
  assert.deepStrictEqual(mp.onHttpRpcRunAttempt("nope", {}), { error: "unknown rpc nope" });
  assert.deepStrictEqual(mp.onHttpRpcRunAttempt("labState", { kind: "what" }), { error: "unknown kind what" });
  assert.deepStrictEqual(mp.onHttpRpcRunAttempt("labState", { kind: "actor", profileId: 1 }), { error: "boom" });
});
