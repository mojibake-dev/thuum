# Verb: script-variables

From the roadmap and M1's persistence gaps. A Papyrus script attached to a
world object keeps its state in its variables (a lever's "pulled", a door
script's state, a chest's "looted once"). The server runs those scripts on
its own VM and loses every variable at a restart, so the world forgets what
its scripts remembered.

## Intent

The variables of the scripts the server runs on world objects survive a
server restart: after it, each script resumes with the values it had, not
its compiled defaults and master-file properties.

Roadmap reference: skymp/ROADMAP.md "Scripts" ("Variables need to be
preserved"); docs/PLAN.md M1, persistence gaps
Milestone: after M1 (Eli, 2026-10-08: out of M1; the verb joins the
milestone where the server runs the world's own Papyrus, which it first
needs)   Class: A (state the server alone owns, recorded and restored)

## Authority

Rung: R0. The server's VM computes every write; no client reports a
variable. The record is the server's change form for the reference.
Why not R1: there is nothing to validate; the values never leave the
server.
Bounds: a script's variables are its own, a bounded set per compiled script;
a value is a Papyrus value (bool, int, float, string, form, array).
Object values are recorded as form descriptions (`id:File.esm`), so a load
order change cannot point them at another form.

## Engine surface

None on the client. Everything is in the server's Papyrus VM (fork
papyrus-vm/ and skymp5-server/cpp/server_guest_lib/):

- **Where variables live.** Each script instance (ActivePexInstance) holds an
  IVariablesHolder; the server's is ScriptVariablesHolder, a case-insensitive
  map `vars` plus `state` for the script's current state
  (ScriptVariablesHolder.h:61-62). A parent script shares its child's holder.
- **When scripts start.** MpObjectReference::InitScripts
  (MpObjectReference.cpp:1745) reads the script names from the VMAD data of
  the base record and the reference, builds one holder per script, and adds
  the object to the VM. It runs on the first Papyrus event the reference
  gets (SendPapyrusEvent, :1308, calls InitScripts at :1313), usually OnInit
  when a player first sees the reference (:990), or OnActivate.
- **Initial values.** A holder fills lazily on first lookup: compiled
  defaults, then VMAD property values (base record first, the reference's
  win), then the auto state.
- **What is saved today: nothing.** The reference's change form
  (MpChangeFormREFR, MpChangeForms.h) has no script field. dynamicFields is
  persisted but holds gamemode properties that are also sent to clients.
  `ScriptState::varHolders` (MpObjectReference.cpp:168) is declared and never
  filled. Upstream left "TODO: uncomment when add script vars save feature"
  (MpChangeForms.cpp:84).

- **Prerequisite: the lab server runs almost no game scripts.** Its image
  ships one compiled script, data/scripts/ActiveMagicEffect.pex (listed in
  skymp-server:m1-map-markers, 2026-10-06), so a world object's vanilla
  script is "not found in the script storage" (the lab server's log) and
  never runs. SkyMP reads scripts from three places
  (script_storages/ScriptStorageFactory.cpp): data/scripts, the BSA
  archives a server setting `archives` lists, and built-in assets. The lazy
  way is `archives` pointed at the game's own archives in persist (licensed,
  so through persist only, like the masters), per game version. That makes
  the server run vanilla Papyrus on every object a player meets (OnInit,
  OnLoad, critter spawns), a change for every scenario, so it lands first,
  on its own, with a full sweep; which archives hold the scripts is read
  from their file lists then, not assumed.

## Observe

- A snapshot of each script's holder after every Papyrus event the
  reference runs (SendPapyrusEvent, after the VM call), compared with the
  last one recorded; only a change writes the change form.
- UNKNOWN until built: writes that do not come from the reference's own
  event. A script can set another reference's auto-property (PropSet), and a
  latent call (Utility.Wait) resumes after its event returned. The first
  version records them at that reference's next event; the T0 test pins
  which.

## Impose

- At InitScripts after a restart, each holder is filled as today and the
  recorded values are laid over it before the object joins the VM, so the
  script's first event already sees them.
- OnInit: Skyrim fires it once per object, ever; SkyMP fires it again after
  every restart (MpObjectReference.cpp:990). A reference with recorded
  variables skips OnInit after a restart, or a script that sets its
  variables in OnInit would wipe what was just restored.

## Suppress

- Nothing on clients.

## Message contract

- None. Server-only state; the wire does not change.

## Server

- MpChangeFormREFR gains `scriptVariables`: per script, its variables and
  its state, as JSON (absent in older records, read as none). Not
  dynamicFields: clients receive those.
- ScriptVariablesHolder gains a snapshot (its variables and state, object
  values as form descriptions) and a restore that applies after the lazy
  fill.
- MpObjectReference: restore in InitScripts from its change form, snapshot
  after each event, keep the holders in varHolders.
- Papyrus natives touched: none; no ledger lines.

## Client

- None.

## Tests

- T0, ctest: a script (a small test .pex in unit/data) that counts its own
  activations keeps its count across a save and a load of its change form;
  a parent script's variables survive with its child's; an object value
  round-trips as a form description; OnInit does not run again for a
  reference with recorded variables; an older change form reads as none.
- T2: none (no wire change).
- T3 scenario `a-script-variables`: a vanilla object whose script counts or
  toggles (to be chosen from the master files: a lever or a door whose
  script keeps a bool), activated by c1; the server restarts; the next
  activation behaves as the second one, not the first.
- Assertions that would fail if the verb silently regressed: the T3
  object's second-activation behavior after a restart.

## Status

- [ ] doc complete, rung declared (the T3 object still to choose, after
      the server has the game's scripts)
- [x] engine surface cited (server VM only)
- [ ] server logic + T0
- [ ] message + validator: none needed
- [ ] native hook + T1: none needed
- [ ] TS handler: none needed
- [ ] T2: none needed
- [ ] T3 scenario green, no HYPOTHESIS tags
- [ ] ledger and suppression registry updated: nothing to add
