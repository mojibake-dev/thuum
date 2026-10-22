// flush-check.js (numidium, 2026-10-21): the live check of lab-api's frida path (runner.frida_script_text,
// frida-inject -e): one line at load, then one every 500 ms for 10 s, each numbered, so the fetched trace shows
// whether a short script's lines survive the injector's exit (P0's trace came back empty, 20261022-040233).
'use strict';
function emit(obj) { obj.t = Date.now(); send(obj); console.log(JSON.stringify(obj)); }
emit({ event: 'ready', params: globalThis.LAB_PARAMS || null });
let n = 0;
const timer = setInterval(function () {
  n += 1;
  emit({ event: 'tick', n: n });
  if (n >= 20) clearInterval(timer);
}, 500);
