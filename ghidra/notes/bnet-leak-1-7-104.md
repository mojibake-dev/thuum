# Bethesda.net HTTP retries in 1.7.104: the frames behind the event leak

Status: static read, partial, 2026-10-05, by the re-analyst subagent, for the
Event handle leak on sky-c1 (lab/frida/handle-trace.js; about 2,600 events a
minute, created in pairs, until commit runs out). Every role below is a
HYPOTHESIS unless marked otherwise. Answered: what the traced frames are, the
WinHttpOpen arguments, and which errors the handler retries. Not answered
here: the body of the retry function (452548), the manager that owns the
request, an INI switch, and any retry cap (see Open).

Program and tools: SkyrimSE-1.7.104.0.exe, SHA-256 846efccf...f1402f
(rpool/sky/persist/game/SHA256SUMS). sky-re was stopped (pyghidra-mcp
answered 502), and LAB.md allows two 12 GB clients only with sky-re off; both
clients were up, so this read did not use Ghidra. It used binutils `objdump`
(pei-x86-64) and a short Python reader of the PE headers, `.pdata` and the
import table. Both ran on the Proxmox host against the file in place, with
the scripts fed on stdin; nothing was written on the host, and nothing was
renamed or saved in Ghidra. Function bounds are `.pdata` RUNTIME_FUNCTION
entries, with chained entries followed to the primary one (Microsoft, "x64
exception handling",
https://learn.microsoft.com/en-us/cpp/build/exception-handling-x64). Ids are
Address Library ids from addrlib/aio/SKSE/Plugins/versionlib-1-7-104-0.bin,
read with lab/addr.py's loader. Every function start below is exactly an id's
offset. The four trace ids also exist in versionlib-1-6-1170-0.bin, but the
1.6.1170 bodies were not read. WinHTTP constants come from mingw-w64's
winhttp.h
(https://github.com/mingw-w64/mingw-w64/blob/master/mingw-w64-headers/include/winhttp.h)
and Microsoft Learn (links inline).

## The trace frames

| frame (RVA) | containing function | id | what the frame is |
| --- | --- | --- | --- |
| +0x13d2f04 | 0x13d2de0 (several chained .pdata entries) | 449335 | return address of `call [WinHttpOpen]` at 0x13d2efe |
| +0x1446b55 | 0x1446ae0 to 0x1446b7e | 451735 | return address of `call [WinHttpSendRequest]` at 0x1446b4f |
| +0x14766ed | 0x14766d0 to 0x14768a4 | 452548 | the retry function's first call site (Stack A continues into 449335) |
| +0x14767a1 | same | 452548 | its second call site (Stack B continues into 451735) |
| +0x1446fe8 | 0x1446f80 to 0x144716a | 451742 | return address of `call 0x1414766d0` at 0x1446fe3 |

So, as a HYPOTHESIS, each leaked pair is one new session (WinHttpOpen, Stack
A) plus one send (WinHttpSendRequest, Stack B), both on the retry path.

## The WinHTTP surface

The exe imports 14 WinHttp functions: Open, Connect, SetOption,
SetStatusCallback, SetTimeouts, OpenRequest, AddRequestHeaders, QueryHeaders,
QueryDataAvailable, WriteData, ReadData, CloseHandle, SendRequest and
ReceiveResponse. Direct calls through their IAT slots fall in four clusters:
0x1343xxx to 0x1344xxx, 0x1375xxx, 0x13d2xxx to 0x13dexxx, and 0x1446xxx to
0x1447xxx. The trace touches only the last two. Three runs of six-byte `jmp
[IAT]` stubs without .pdata (0x13ddbfb to 0x13ddc19, 0x143c310 to 0x143c31c,
0x14463f6 to 0x144640e) are reached some other way; their users are not
enumerated.

| id | start | WinHTTP calls | role (HYPOTHESIS) |
| --- | --- | --- | --- |
| 449335 | 0x13d2de0 | Open, SetOption, Connect | open a session and a connection; the session handle is stored at +0x00 and the connection at +0x08 |
| 449334 | 0x13d2d70 | CloseHandle twice (+0x08, then +0x00) | close the session; 449335 calls it when WinHttpConnect fails |
| 527208 | 0x13de1f0 | OpenRequest, SetOption x2, SetTimeouts, AddRequestHeaders, SetStatusCallback, CloseHandle x5 | build a request; only the call list was read |
| 451735 | 0x1446ae0 | SendRequest | calls 527208, stores the request handle at +0x68, then sends with dwContext = the object |
| 451734 | 0x1446a90 | CloseHandle | closes the request handle at +0x68 |
| 451742 | 0x1446f80 | none directly | the request's error handler (below) |
| 452548 | 0x14766d0 | none directly | the retry; body not covered in this note |
| 527209 | 0x13de660 | QueryHeaders x2 | read the response headers |

## The session: proxy, flags, timeouts

449335's one direct `WinHttpOpen` call, as disassembled:

```
1413d2ee7: xor    r9d,r9d                        ; pszProxyBypassW = NULL
1413d2eea: mov    DWORD PTR [rsp+0x20],0x10000000 ; dwFlags
1413d2ef2: xor    r8d,r8d                        ; pszProxyW = NULL
1413d2ef5: lea    rcx,[rip+0x73814c]  # 0x141b0b048 ; pszAgentW (string not read)
1413d2efc: xor    edx,edx                        ; dwAccessType
1413d2efe: call   QWORD PTR [rip+0x3f5bdc]  # 0x1417c8ae0 WinHttpOpen
```

- dwAccessType is 0, WINHTTP_ACCESS_TYPE_DEFAULT_PROXY. Microsoft: it
  "Retrieves the static proxy or direct configuration from the registry",
  set by "The Netsh.exe commands" among others
  (https://learn.microsoft.com/en-us/windows/win32/api/winhttp/nf-winhttp-winhttpopen).
  So a machine proxy set with `netsh winhttp set proxy` would apply to this
  session (HYPOTHESIS until a request-level WINHTTP_OPTION_PROXY is ruled
  out, below).
- dwFlags 0x10000000 is WINHTTP_FLAG_ASYNC; both proxy strings are NULL.
- Next, `WinHttpSetOption(session, 0x54, &0x800, 4)`:
  - `mov r9d,0x4`, then `lea edx,[r9+0x50]` gives option 84,
    WINHTTP_OPTION_SECURE_PROTOCOLS;
  - `mov DWORD PTR [rsp+0x50],0x800` gives WINHTTP_FLAG_SECURE_PROTOCOL_TLS1_2.
- Then `WinHttpConnect(session, host, port, 0)`: the host is a wide string
  and the port the u16 at +0x440 of the second argument.
- No WINHTTP_OPTION_PROXY (38, 0x26) is set on the session here.

Not read:
- the two request-level `WinHttpSetOption` calls in 527208, at 0x13de339 and
  0x13de412;
- the `WinHttpSetTimeouts` call at 0x13de3a1 (so the timeouts are unknown);
- the stub at 0x143c31c.

## The error handler (451742)

- The trace shows WinHTTP's worker calling it with no frame in between. A
  status callback that tail-jumps here would leave none; the callback that
  527208 registers at 0x13de5e3 is not read.
- Arguments:
  - rcx: the request object;
  - rdx: a WINHTTP_ASYNC_RESULT* (dwResult, a qword at +0; dwError, a dword
    at +8).
- **Retry branch.** All three conditions must hold:
  - `cmp QWORD PTR [rdx],0x5`: dwResult is API_SEND_REQUEST (5);
  - `add eax,0xffffd11c` / `cmp eax,0x1c` / `mov ecx,0x16000801` / `bt ecx,eax`:
    dwError is one of 12004, 12015, 12029, 12030 or 12032;
  - the byte at +0x5c is zero.
  
  It then calls 452548 and, when that returns non-null, a virtual call
  (`[vtable+0x28]`) with the result, and returns. **This branch does not
  call 451734**, so the handler itself closes no handle when it retries.
- **Every other error:**
  - formats a message (string at 0x141b18e90, not read);
  - passes it to a virtual call (`[vtable+0x30]`) on the object at +0x40;
  - records dwError at +0x74 if none is recorded yet;
  - calls 451734, which closes the request handle at +0x68.
- The codes, named by Microsoft
  (https://learn.microsoft.com/en-us/windows/win32/winhttp/error-messages):
  - 12004 ERROR_WINHTTP_INTERNAL_ERROR;
  - 12015 ERROR_WINHTTP_LOGIN_FAILURE ("the request handle should be closed
    ... A new request handle must be created before retrying");
  - 12029 ERROR_WINHTTP_CANNOT_CONNECT ("connection to the server failed");
  - 12030 ERROR_WINHTTP_CONNECTION_ERROR;
  - 12032 ERROR_WINHTTP_RESEND_REQUEST.
  
  The firewall's refusal most plausibly arrives as 12029 (HYPOTHESIS; the
  trace below logs it).

## What drives the retries (HYPOTHESIS)

- Both stacks start on a WinHTTP worker thread and pass through 451742 and
  then 452548; neither has a main-thread frame. So the retry is driven by
  the request's own error handler on WinHTTP's thread, not by a per-frame
  tick.
- About 28 pairs a second fits an attempt that fails at once and re-enters.
- Microsoft: "Each call to WinHttpOpen opens a new session context", which
  "must be closed using the WinHttpCloseHandle function" (WinHttpOpen page,
  above).
- Which BSPlatform manager owns the request is not established. CommonLib
  names the candidates only as RTTI and vtables:
  - BSPlatform::BSBethesdaPlatform (Offsets_RTTI.h:7039, Offsets_VTABLE.h:6488);
  - bnet::WinHttpTransport (Offsets_VTABLE.h:6917);
  - bnet::BaseHttpRequest and bnet::HttpRequest (6660, 6661);
  - bnet::Network and its NetworkLoop caller (6629, 6630);
  - bnet::Notification::UserData::ReconnectJob (6684; AE id only);
  - the managers in the CallbackBind names: BSBNetAccountManager,
    BSModsManager, BSCreationClubManager and BSCoreServicesManager
    (Offsets_RTTI.h:7053 to 7150).

## Frida trace (planned, not run)

Get RVAs with `python3 lab/addr.py addrlib/aio 1.7.104 <id>`. Hook the
winhttp.dll exports by name.

- **winhttp.dll exports:**
  - WinHttpOpen, WinHttpConnect and WinHttpOpenRequest: log the returned
    handle;
  - WinHttpCloseHandle: log the handle;
  - every 10 s, print how many sessions, connections and requests are still
    open.
- **WinHttpSetOption and WinHttpSetTimeouts:** log dwOption and all four
  timeouts. This answers the request-level proxy and timeout questions
  dynamically.
- **451742 on enter:** log dwResult [rdx], dwError [rdx+8] and the byte
  [rcx+0x5c].
- **452548 on leave:** log the return value.
- **Expected under the firewall rule:**
  - dwError 12029 at about 28 a second;
  - one WinHttpOpen and one WinHttpSendRequest per entry to 452548;
  - open sessions growing at the same rate.

Falsified by any of:
- dwError outside the five codes during the leak;
- WinHttpOpen not called once per attempt;
- every session handle closed within a second of its open (then the events
  leak elsewhere).

## Open

- **452548's body:** whether it closes the previous request, connection and
  session, and whether a count, a delay or the +0x5c byte ever stops it.
- **The status callback** registered at 0x13de5e3, and how it reaches 451742.
- **527208's** two SetOption calls and its SetTimeouts arguments.
- **The owner:** compare the request object's vtable (+0x00) with CommonLib's
  VTABLE_bnet__BaseHttpRequest and VTABLE_bnet__WinHttpTransport.
- **Strings and settings:** "api.bethesda.net", "bnet", and any INI or launcher
  switch that disables the platform (question 3). None was searched in this
  pass.
- **The other two WinHTTP clusters** (0x1343xxx, 0x1375xxx) are not on the
  trace.
- **Confirmation:** a Ghidra pass once sky-re can run confirms all of the
  above.
