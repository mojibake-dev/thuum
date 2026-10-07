// thread-sample.js: where a busy or stuck game spends its time. Samples every
// thread's instruction pointer twenty times over two seconds, as
// module+offset, and reports the running threads' commonest places, so a
// freeze can be placed in the game, a plugin (skee64.dll, SkyrimPlatform)
// or a Frida hook before anything is restarted (rotfern's RaceMenu freeze
// on sky-c1, 2026-10-07). Run: `just frida lab/frida/thread-sample.js c1`.
'use strict';
function emit(obj) { obj.t = Date.now(); send(obj); console.log(JSON.stringify(obj)); }

function place(pc) {
  const m = Process.findModuleByAddress(pc);
  return m === null ? pc.toString() : m.name + '+0x' + pc.sub(m.base).toString(16);
}

const counts = {}; // thread id -> place -> samples
const states = {};
let rounds = 0;
const timer = setInterval(() => {
  for (const t of Process.enumerateThreads()) {
    if (t.id === Process.getCurrentThreadId()) continue;
    const where = place(t.context.pc);
    counts[t.id] = counts[t.id] || {};
    counts[t.id][where] = (counts[t.id][where] || 0) + 1;
    states[t.id] = t.state;
  }
  rounds += 1;
  if (rounds < 20) return;
  clearInterval(timer);
  for (const id of Object.keys(counts)) {
    const top = Object.entries(counts[id]).sort((a, b) => b[1] - a[1]).slice(0, 3);
    if (states[id] === 'running' || top[0][1] < rounds) {
      emit({ thread: Number(id), state: states[id], top: top });
    }
  }
  emit({ done: true, rounds: rounds });
}, 100);
