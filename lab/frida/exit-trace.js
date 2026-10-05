// exit-trace.js: who ends SkyrimSE.exe? Hooks every orderly exit path and
// prints a backtrace as JSON lines (module+offset; no symbols needed), so an
// exit that leaves no dump and no event (sky-c1, 2026-10-01: three times right
// after the generated save loaded with an appearance) names its caller.
// Run through lab-api (`just frida exit-trace.js c1`) or by hand with
// frida-inject -n SkyrimSE.exe -s exit-trace.js. Dynamic section of the
// appearance-on-1.7.104 investigation (rule 8).
'use strict';
function emit(obj) { obj.t = Date.now(); send(obj); console.log(JSON.stringify(obj)); }
function where(context) {
  return Thread.backtrace(context, Backtracer.ACCURATE).slice(0, 24).map(function (a) {
    const m = Process.findModuleByAddress(a);
    return m ? m.name + '+0x' + a.sub(m.base).toString(16) : a.toString();
  });
}
// Frida 17 removed the static Module.findExportByName (the clients run
// 17.19.0); a module's exports are read from its Module object.
function hook(mod, name, kind) {
  const m = Process.findModuleByName(mod);
  const p = m ? m.findExportByName(name) : null;
  if (!p) { emit({ warn: 'no export', mod: mod, name: name }); return; }
  Interceptor.attach(p, {
    onEnter: function (args) {
      emit({ exit: name, kind: kind, code: args[0].toInt32(), tid: this.threadId, bt: where(this.context) });
    }
  });
}
// The audit log says the exits are access violations (status 0xC0000005)
// that never reach Windows Error Reporting: something in the process handles
// the exception and terminates. Frida's handler runs first and gets to look.
Process.setExceptionHandler(function (d) {
  const pc = d.context.pc; const m = Process.findModuleByAddress(pc);
  emit({ exception: d.type, address: d.address.toString(), memory: d.memory ? { op: d.memory.operation, address: d.memory.address.toString() } : null,
         pc: m ? m.name + '+0x' + pc.sub(m.base).toString(16) : pc.toString(), tid: Process.getCurrentThreadId(),
         bt: where(d.context), regs: { rax: d.context.rax.toString(), rcx: d.context.rcx.toString(), rdx: d.context.rdx.toString(), r8: d.context.r8.toString(), rsp: d.context.rsp.toString() } });
  return false; // let the process's own handling continue
});
hook('kernel32.dll', 'ExitProcess', 'orderly');
hook('kernel32.dll', 'TerminateProcess', 'terminate');
hook('ntdll.dll', 'RtlExitUserProcess', 'orderly');
hook('ntdll.dll', 'NtTerminateProcess', 'terminate');
hook('ucrtbase.dll', 'exit', 'crt');
hook('ucrtbase.dll', '_exit', 'crt');
hook('ucrtbase.dll', 'abort', 'crt');
hook('kernelbase.dll', 'RaiseFailFastException', 'fastfail');
emit({ attached: Process.id, modules: Process.enumerateModules().filter(function (m) { return /SkyrimSE|SkyrimPlatform|MpClientPlugin|skse64/i.test(m.name); }).map(function (m) { return { name: m.name, base: m.base.toString(), size: m.size }; }) });
