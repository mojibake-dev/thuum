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

test("labState actor carries the server's running effects, null without the property", () => {
  global.mp = fakeMp();
  delete require.cache[require.resolve("./gamemode.js")];
  require("./gamemode.js");
  const fortify = { effect: 0x3eaf3, source: 0xff9fc, magnitude: 100, secondsLeft: 27.5 };
  mp.set(0xff000001, "runningEffects", [fortify]);
  assert.deepStrictEqual(mp.onHttpRpcRunAttempt("labState", { kind: "actor", profileId: 1 }).effects, [fortify]);
  const get = mp.get;
  mp.get = (id, k) => {
    if (k === "runningEffects") throw new Error("Property 'runningEffects' doesn't exist");
    return get(id, k);
  };
  const actor = mp.onHttpRpcRunAttempt("labState", { kind: "actor", profileId: 1 });
  assert.strictEqual(actor.found, true);
  assert.strictEqual(actor.effects, null);
});

test("labState actor carries the server's shouts record, null without the property", () => {
  const record = { shouts: [0x3f9ea], wordsKnown: [0x20e17], wordsUnlocked: [0x20e17], recoverySecondsLeft: 12.5 };
  mp.set(0xff000001, "shouts", record);
  assert.deepStrictEqual(mp.onHttpRpcRunAttempt("labState", { kind: "actor", profileId: 1 }).shouts, record);
  const get = mp.get;
  mp.get = (id, k) => {
    if (k === "shouts") throw new Error("Property 'shouts' doesn't exist");
    return get(id, k);
  };
  assert.strictEqual(mp.onHttpRpcRunAttempt("labState", { kind: "actor", profileId: 1 }).shouts, null);
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

test("labCommand papyrus-av refuses a set the server's base does not read back", () => {
  global.mp = fakeMp();
  // the server indexes Marksman, not Archery: its natives take an unknown name and change nothing
  const bases = { Marksman: 15 };
  mp.getDescFromId = (id) => id.toString(16);
  mp.callPapyrusFunction = (callType, className, fn, self, args) => {
    if (!(args[0] in bases)) return 0;
    if (fn === "SetActorValue") bases[args[0]] = args[1];
    return bases[args[0]];
  };
  delete require.cache[require.resolve("./gamemode.js")];
  require("./gamemode.js");
  const no = mp.onHttpRpcRunAttempt("labCommand", { kind: "papyrus-av", profileId: 1, how: "set", name: "Archery", value: 60 });
  assert.strictEqual(no.ok, false);
  assert.strictEqual(no.base, 0);
  assert.match(no.error, /Archery 60: the server's base reads 0/);
  const yes = mp.onHttpRpcRunAttempt("labCommand", { kind: "papyrus-av", profileId: 1, how: "set", name: "Marksman", value: 60 });
  assert.deepStrictEqual(yes, { ok: true, actorId: 0xff000001, how: "set", name: "Marksman", value: 60, base: 60, current: 60 });
  // a mod or a force changes no base (the game's semantics), so neither is checked
  assert.strictEqual(mp.onHttpRpcRunAttempt("labCommand", { kind: "papyrus-av", profileId: 1, how: "mod", name: "Archery", value: 5 }).ok, true);
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

test("labCommand console runs the server's console verb as the player", () => {
  global.mp = fakeMp();
  const calls = [];
  mp.executeConsoleCommand = (actorId, name, args) => calls.push([actorId, name, args]);
  delete require.cache[require.resolve("./gamemode.js")];
  require("./gamemode.js");
  const ok = mp.onHttpRpcRunAttempt("labCommand", { kind: "console", profileId: 1, name: "addshout", args: [20, 0x3f9ea] });
  assert.deepStrictEqual(ok, { ok: true, actorId: 0xff000001, name: "addshout", args: [20, 0x3f9ea] });
  assert.deepStrictEqual(calls, [[0xff000001, "addshout", [20, 0x3f9ea]]]);
  for (const bad of [{ name: "" }, { name: "player.addshout" }, { name: "addshout", args: [1.5] }, { name: "addshout", args: [{}] }]) {
    assert.strictEqual(mp.onHttpRpcRunAttempt("labCommand", { kind: "console", profileId: 1, ...bad }).ok, false);
  }
  assert.strictEqual(calls.length, 1);
  assert.deepStrictEqual(mp.onHttpRpcRunAttempt("labCommand", { kind: "console", profileId: 9, name: "addshout", args: [] }), { found: false, profileId: 9 });
  delete mp.executeConsoleCommand;
  assert.strictEqual(mp.onHttpRpcRunAttempt("labCommand", { kind: "console", profileId: 1, name: "addshout", args: [] }).ok, false);
});

test("labState spell reads the winning SPEL's effects and their MGEFs as the server's espm resolves them", () => {
  const bytes = (n, fill) => {
    const b = new Uint8Array(n);
    fill(new DataView(b.buffer));
    return b;
  };
  const efit = (magnitude, area, duration) => bytes(12, (d) => { d.setFloat32(0, magnitude, true); d.setUint32(4, area, true); d.setUint32(8, duration, true); });
  const efid = (local) => bytes(4, (d) => d.setUint32(0, local, true));
  const mgefData = (flags, archetype, primaryAV) => bytes(0x98, (d) => { d.setUint32(0x00, flags, true); d.setUint32(0x40, archetype, true); d.setUint32(0x44, primaryAV, true); d.setFloat32(0x3c, 0.5, true); d.setUint32(0x58, 0xffffffff, true); });
  const records = {
    [0x12fd0]: {
      record: { editorId: "Firebolt", fields: [
        { type: "EFID", data: efid(0x0103b3) }, { type: "EFIT", data: efit(25, 0, 0) },
        { type: "EFID", data: efid(0x0103b4) }, { type: "EFIT", data: efit(10, 0, 0) }, { type: "CTDA", data: new Uint8Array(32) },
      ] },
      toGlobalRecordId: (local) => 0x01000000 + (local & 0xffffff),
    },
    [0x010103b3]: { record: { editorId: "FireDamageFFAimed", fields: [{ type: "DATA", data: mgefData(0x5, 0, 24) }] } },
    [0x010103b4]: { record: { editorId: "PerkRider", fields: [{ type: "DATA", data: mgefData(0x5, 0, 24) }, { type: "CTDA", data: new Uint8Array(32) }] } },
  };
  global.mp = { ...fakeMp(), lookupEspmRecordById: (id) => records[id] || {} };
  delete require.cache[require.resolve("./gamemode.js")];
  require("./gamemode.js");
  const spell = mp.onHttpRpcRunAttempt("labState", { kind: "spell", formId: 0x12fd0 });
  assert.strictEqual(spell.found, true);
  assert.strictEqual(spell.editorId, "Firebolt");
  assert.deepStrictEqual(spell.effects, [
    { mgef: 0x010103b3, magnitude: 25, area: 0, duration: 0, conditions: 0 },
    { mgef: 0x010103b4, magnitude: 10, area: 0, duration: 0, conditions: 1 },
  ]);
  assert.deepStrictEqual(spell.mgefs[String(0x010103b3)], { editorId: "FireDamageFFAimed", flags: 5, archetype: 0, primaryAV: 24, secondAVWeight: 0.5, secondaryAV: 0xffffffff, conditions: 0 });
  assert.strictEqual(spell.mgefs[String(0x010103b4)].conditions, 1);
  assert.deepStrictEqual(mp.onHttpRpcRunAttempt("labState", { kind: "spell", formId: 0x99 }), { found: false, formId: 0x99 });
});

test("labState fate reads the server's roll for a game-file actor", () => {
  global.mp = fakeMp();
  mp.set(0x85547, "actorFate", { baseId: 0x23ab5, level: 9, raceId: 0x13746, worn: [0x13913, 0x1391d] });
  delete require.cache[require.resolve("./gamemode.js")];
  require("./gamemode.js");
  assert.deepStrictEqual(mp.onHttpRpcRunAttempt("labState", { kind: "fate", actorId: 0x85547 }),
    { found: true, actorId: 0x85547, fated: true, baseId: 0x23ab5, level: 9, raceId: 0x13746, worn: [0x13913, 0x1391d] });
  assert.deepStrictEqual(mp.onHttpRpcRunAttempt("labState", { kind: "fate", actorId: 0x13482 }),
    { found: true, actorId: 0x13482, fated: false, baseId: 0, level: 0, raceId: 0, worn: [] });
});

test("labState follow reads the server's follow table by actor", () => {
  global.mp = fakeMp();
  mp.set(0, "cellFollows", [{ actor: 0x3550c, player: 0xff000000, cell: 0x133c6 }]);
  delete require.cache[require.resolve("./gamemode.js")];
  require("./gamemode.js");
  assert.deepStrictEqual(mp.onHttpRpcRunAttempt("labState", { kind: "follow", actorId: 0x3550c }),
    { found: true, actorId: 0x3550c, following: true, player: 0xff000000, cell: 0x133c6 });
  assert.deepStrictEqual(mp.onHttpRpcRunAttempt("labState", { kind: "follow", actorId: 0x13482 }),
    { found: true, actorId: 0x13482, following: false, player: 0, cell: 0 });
});

test("labState cellHost reads the server's host table and ref an actor by id", () => {
  global.mp = fakeMp();
  mp.set(0, "cellHosts", [
    { cell: 0xbbb1, hosted: true, player: 0xff000001, epoch: 2 },
    { cell: 0xbbb0, hosted: false, player: 0, epoch: 1 },
  ]);
  mp.set(0xff000a03, "locationalData", { cellOrWorldDesc: "3c:Skyrim.esm", pos: [9050, 550, 0], rot: [0, 0, 0] });
  mp.set(0xff000a03, "percentages", { health: 0.5, magicka: 1, stamina: 1 });
  delete require.cache[require.resolve("./gamemode.js")];
  require("./gamemode.js");
  assert.deepStrictEqual(mp.onHttpRpcRunAttempt("labState", { kind: "cellHost", cell: 0xbbb1 }),
    { found: true, cell: 0xbbb1, hosted: true, actorId: 0xff000001, epoch: 2 });
  assert.deepStrictEqual(mp.onHttpRpcRunAttempt("labState", { kind: "cellHost", cell: 0xbbb0 }),
    { found: true, cell: 0xbbb0, hosted: false, actorId: 0, epoch: 1 });
  // a cell never granted
  assert.deepStrictEqual(mp.onHttpRpcRunAttempt("labState", { kind: "cellHost", cell: 0x9732 }),
    { found: true, cell: 0x9732, hosted: false, actorId: 0, epoch: 0 });
  const wolf = mp.onHttpRpcRunAttempt("labState", { kind: "ref", actorId: 0xff000a03 });
  assert.deepStrictEqual([wolf.found, wolf.x, wolf.y, wolf.z, wolf.cell, wolf.healthPercentage, wolf.isDead],
    [true, 9050, 550, 0, "3c:Skyrim.esm", 0.5, false]);
  assert.deepStrictEqual(mp.onHttpRpcRunAttempt("labState", { kind: "ref", actorId: 0xff000a09 }), { found: false, actorId: 0xff000a09 });
  // a server without the property
  const bare = fakeMp();
  const get = bare.get;
  bare.get = (id, k) => { if (k === "cellHosts") throw new Error("no such property"); return get(id, k); };
  global.mp = bare;
  delete require.cache[require.resolve("./gamemode.js")];
  require("./gamemode.js");
  const none = mp.onHttpRpcRunAttempt("labState", { kind: "cellHost", cell: 0xbbb1 });
  assert.strictEqual(none.found, false);
});

test("kill-ref kills a game-file actor through the console verb's Kill, its killer a seat", () => {
  global.mp = fakeMp();
  const calls = [];
  mp.executeConsoleCommand = (actorId, name, args) => {
    calls.push([actorId, name, args]);
    mp.set(args[0], "isDead", true);
  };
  mp.set(0x85547, "isDead", false);
  delete require.cache[require.resolve("./gamemode.js")];
  require("./gamemode.js");
  const r = mp.onHttpRpcRunAttempt("labCommand", { kind: "kill-ref", profileId: 1, formId: 0x85547, killerProfileId: 1 });
  assert.deepStrictEqual(r, { ok: true, formId: 0x85547, killer: 0xff000001, isDead: true });
  assert.deepStrictEqual(calls, [[0xff000001, "Kill", [0x85547, 0xff000001]]]);
  const none = mp.onHttpRpcRunAttempt("labCommand", { kind: "kill-ref", profileId: 1, formId: 0x85549 });
  assert.strictEqual(none.killer, null);
  assert.deepStrictEqual(calls[1], [0xff000001, "Kill", [0x85549]]);
  assert.strictEqual(mp.onHttpRpcRunAttempt("labCommand", { kind: "kill-ref", profileId: 1 }).ok, false);
  assert.strictEqual(mp.onHttpRpcRunAttempt("labCommand", { kind: "kill-ref", profileId: 1, formId: 0x85547, killerProfileId: 9 }).found, false);
});

test("respawn-ref puts a dead game-file actor up at its spawn point, or in place", () => {
  global.mp = fakeMp();
  mp.set(0x85547, "isDead", true);
  mp.set(0x85547, "spawnPoint", { cellOrWorldDesc: "3c:Skyrim.esm", pos: [123400, -80300, 10705], rot: [0, 0, 0] });
  mp.set(0x85547, "locationalData", { cellOrWorldDesc: "3c:Skyrim.esm", pos: [1, 1, 1], rot: [0, 0, 0] });
  delete require.cache[require.resolve("./gamemode.js")];
  require("./gamemode.js");
  const r = mp.onHttpRpcRunAttempt("labCommand", { kind: "respawn-ref", profileId: 1, formId: 0x85547 });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(mp.get(0x85547, "isDead"), false);
  assert.deepStrictEqual(mp.get(0x85547, "locationalData").pos, [123400, -80300, 10705]);
  assert.deepStrictEqual(mp.onHttpRpcRunAttempt("labCommand", { kind: "respawn-ref", profileId: 1, formId: 0x85547 }), { ok: false, formId: 0x85547, error: "not dead" });
  mp.set(0x85549, "isDead", true);
  mp.set(0x85549, "spawnPoint", { cellOrWorldDesc: "3c:Skyrim.esm", pos: [9, 9, 9], rot: [0, 0, 0] });
  mp.set(0x85549, "locationalData", { cellOrWorldDesc: "3c:Skyrim.esm", pos: [5, 5, 5], rot: [0, 0, 0] });
  const inPlace = mp.onHttpRpcRunAttempt("labCommand", { kind: "respawn-ref", profileId: 1, formId: 0x85549, inPlace: true });
  assert.strictEqual(inPlace.spawn, null);
  assert.deepStrictEqual(mp.get(0x85549, "locationalData").pos, [5, 5, 5]);
  assert.strictEqual(mp.get(0x85549, "isDead"), false);
});

test("labState ref reads the record's worn armor and weapons, as a seat's npc-state counts them", () => {
  // npc-stream slice 3: a hosted actor's equipment follows its host's engine, and a claim compares the record's
  // hands with both seats' npc-state worn lists; the record marks ammo and a torch worn too, which those lists omit
  const records = {
    [0x12e49]: { record: { type: "ARMO" } },
    [0x13790]: { record: { type: "WEAP" } },
    [0x1397d]: { record: { type: "AMMO" } },
    [0x1d4ec]: { record: { type: "LIGH" } },
    [0x12eb7]: { record: { type: "ARMO" } },
  };
  global.mp = { ...fakeMp(), lookupEspmRecordById: (id) => records[id] || {} };
  mp.set(0xff000a03, "locationalData", { cellOrWorldDesc: "3c:Skyrim.esm", pos: [9050, 550, 0], rot: [0, 0, 0] });
  mp.set(0xff000a03, "equipment", {
    inv: { entries: [
      { baseId: 0x13790, count: 2, worn: true, wornLeft: true },
      { baseId: 0x12e49, count: 1, worn: true },
      { baseId: 0x1397d, count: 12, worn: true },
      { baseId: 0x1d4ec, count: 1, wornLeft: true },
      { baseId: 0x12eb7, count: 1 },
    ] },
    leftSpell: 0, rightSpell: 0, voiceSpell: 0, instantSpell: 0, numChanges: 3,
  });
  mp.set(0xff000a04, "locationalData", { cellOrWorldDesc: "3c:Skyrim.esm", pos: [0, 0, 0], rot: [0, 0, 0] });
  delete require.cache[require.resolve("./gamemode.js")];
  require("./gamemode.js");
  assert.deepStrictEqual(mp.onHttpRpcRunAttempt("labState", { kind: "ref", actorId: 0xff000a03 }).worn, [0x12e49, 0x13790]);
  // no equipment property reads null, not [], so a claim never takes an unread list for an empty one
  assert.strictEqual(mp.onHttpRpcRunAttempt("labState", { kind: "ref", actorId: 0xff000a04 }).worn, null);
  // EquipmentBinding throws for a form that is no actor
  const get = mp.get;
  mp.get = (id, k) => { if (k === "equipment") throw new Error("not an actor"); return get(id, k); };
  assert.strictEqual(mp.onHttpRpcRunAttempt("labState", { kind: "ref", actorId: 0xff000a03 }).worn, null);
});
