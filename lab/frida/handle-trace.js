// handle-trace.js: who leaks handles in SkyrimSE.exe? An idle lab client
// leaked Event handles at about 2,600 a minute, each with about 43 KB of
// committed memory, until Windows ran out of commit and the game died
// (Sysinternals Handle -s on sky-c1, 2026-10-05). This records the stack of
// every handle the creators below return, forgets the ones NtClose closes, and
// every 30 s prints the stacks of the handles still open, as module+offset
// (no symbols needed). Run it through lab-api (`just frida
// lab/frida/handle-trace.js c1`) for a minute or two, then stop frida-inject.
// Another handle type plugs in as one more row of CREATORS: the native
// function and which argument receives the handle.
'use strict';
const CREATORS = [
  { name: 'NtCreateEvent', out: 0, type: 'Event' },
  { name: 'NtOpenEvent', out: 0, type: 'Event' },
];
const modules = new ModuleMap();
const live = new Map(); // handle -> { type, key, t }
let created = 0;
let closed = 0;

function emit(obj) { obj.t = Date.now(); console.log(JSON.stringify(obj)); }
function frame(a) {
  let m = modules.find(a);
  if (!m) { modules.update(); m = modules.find(a); }
  return m ? m.name + '+0x' + a.sub(m.base).toString(16) : a.toString();
}
const ntdll = Process.getModuleByName('ntdll.dll');
CREATORS.forEach(function (c) {
  const p = ntdll.findExportByName(c.name);
  if (!p) { emit({ warn: 'no export', name: c.name }); return; }
  Interceptor.attach(p, {
    onEnter: function (args) {
      this.out = args[c.out];
      this.bt = Thread.backtrace(this.context, Backtracer.ACCURATE).slice(0, 20);
    },
    onLeave: function (retval) {
      if (retval.toInt32() !== 0) return;
      created += 1;
      live.set(this.out.readPointer().toString(), { type: c.type, key: this.bt.map(frame).join(' < '), t: Date.now() });
    }
  });
});
Interceptor.attach(ntdll.getExportByName('NtClose'), {
  onEnter: function (args) {
    if (live.delete(args[0].toString())) closed += 1;
  }
});

setInterval(function () {
  const old = Date.now() - 10000; // open for more than 10 s
  const groups = new Map();
  live.forEach(function (v) {
    if (v.t > old) return;
    const g = groups.get(v.key) || { type: v.type, open: 0 };
    g.open += 1;
    groups.set(v.key, g);
  });
  const top = Array.from(groups.entries()).sort(function (a, b) { return b[1].open - a[1].open; })
    .slice(0, 6).map(function (e) { return { type: e[1].type, open: e[1].open, stack: e[0] }; });
  emit({ report: true, created: created, closed: closed, live: live.size, top: top });
}, 30000);
emit({ attached: Process.id });
