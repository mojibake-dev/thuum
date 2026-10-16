"""The HTTP surface, exactly docs/LAB.md's endpoint table under LAB_ROOT_PATH.
No auth: the Caddy vhost at https://thuum.gaussing.tv/lab is LAN and tailnet
only and is the boundary; inside the VLAN the clients reach :80 directly."""

from __future__ import annotations

import asyncio
import logging
import time
from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse
import yaml
from pydantic import ValidationError

from .board import StepBoard
from .config import Settings
from .guests import Tables, load_tables
from .proxmox import GuestControl, ProxmoxError
from .runner import Runner, RunnerError
from .runset import Policy, RunSetError, RunSets
from . import scenario as scenario_mod
from .scenario import load_scenario
from .state import RpcStateClient, ServerState, StateError
from .system import RealSystem, System

log = logging.getLogger("labapi")


@dataclass
class Services:
    settings: Settings
    tables: Tables
    control: GuestControl
    system: System
    state: ServerState
    board: StepBoard
    runner: Runner
    runsets: RunSets


def build_real(settings: Settings) -> Services:
    from .proxmox import ProxmoxerGuests

    tables = load_tables(settings.guests_file)
    control = GuestControl(ProxmoxerGuests(settings.pve_url, settings.pve_token_id, settings.pve_token_secret, settings.pve_node, settings.pve_verify_ssl, settings.guest_task_timeout_s, http_timeout=settings.pve_timeout_s))
    system = RealSystem()
    state = ServerState(RpcStateClient(settings.server_state_url), tables.profile_ids, tables.base_id, tables)
    board = StepBoard()
    runner = Runner(settings, tables, control, system, state, board)
    return Services(settings, tables, control, system, state, board, runner, RunSets(settings, runner))


def build_fake(settings: Settings, fake_state=None, fake_pve=None, fake_system=None) -> Services:
    """Everything external replaced by labapi.fakes; used by tests and labapi-dev."""
    from .fakes import FakeProxmox, FakeState, FakeSystem

    tables = load_tables(settings.guests_file)
    fs = fake_state or FakeState()
    control = GuestControl(fake_pve or FakeProxmox())
    system = fake_system or FakeSystem()
    state = ServerState(RpcStateClient(settings.server_state_url, transport=fs.transport()), tables.profile_ids, tables.base_id, tables)
    board = StepBoard()
    runner = Runner(settings, tables, control, system, state, board)
    return Services(settings, tables, control, system, state, board, runner, RunSets(settings, runner))


def create_app(services: Services) -> FastAPI:
    s = services.settings
    runsets = services.runsets

    async def nightly_loop() -> None:
        # the clock's only job: start the nightly set when its minute has come
        # and the lab is idle (runset.maybe_nightly decides); never while a run,
        # a snapshot or another set is in progress
        while True:
            await asyncio.sleep(60)
            try:
                rs = runsets.maybe_nightly(datetime.now(timezone.utc))
            except Exception as e:  # a clock bug must not take lab-api down
                log.warning("nightly: %s", e)
                continue
            if rs is not None:
                log.info("nightly sweep %s: %d scenarios", rs.id, len(rs.scenarios))
                _track(asyncio.create_task(runsets.execute(rs)))

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        task = asyncio.create_task(nightly_loop())
        try:
            yield
        finally:
            task.cancel()

    app = FastAPI(title="thuum lab-api", docs_url=None, redoc_url=None, lifespan=lifespan)
    app.state.services = services
    app.state.tasks: set[asyncio.Task] = set()
    router = APIRouter(prefix=s.root_path.rstrip("/"))
    runner = services.runner
    board = services.board

    def _track(task: asyncio.Task) -> None:
        app.state.tasks.add(task)
        task.add_done_callback(app.state.tasks.discard)

    # the driver's polls, the status reads and the run watchers are the lab's
    # own pulse; anything else that reaches lab-api is an operator at work
    quiet_paths = {f"{router.prefix}/status", f"{router.prefix}/step", f"{router.prefix}/game", f"{router.prefix}/runsets"}

    def _is_operator_call(request: Request) -> bool:
        path = request.url.path.rstrip("/")
        if path in quiet_paths or path.startswith(f"{router.prefix}/step/"):
            return False
        if request.method == "GET" and (path.startswith(f"{router.prefix}/run/") or path.startswith(f"{router.prefix}/runset/")):
            return False
        return True

    @app.middleware("http")
    async def access_log(request: Request, call_next):
        t0 = time.monotonic()
        if _is_operator_call(request):
            runner.touch()
        response = await call_next(request)
        fwd = request.headers.get("x-forwarded-for")
        peer = fwd.split(",")[0].strip() if fwd else (request.client.host if request.client else "-")
        log.info("%s %s %s %d %.3fs", peer, request.method, request.url.path, response.status_code, time.monotonic() - t0)
        return response

    def _busy() -> JSONResponse:
        if runner.maintenance:
            return JSONResponse({"error": f"E_RUN_BUSY: {runner.maintenance} in progress"}, status_code=409)
        if runner.active is None and runner.hold_active():
            h = runner.hold_status() or {}
            return JSONResponse({"error": f"E_RUN_HOLD: the lab is held ({h.get('reason')}) until {h.get('until')}; `just lab-release` ends it"}, status_code=409)
        return JSONResponse({"error": f"E_RUN_BUSY: run {runner.active.run_id if runner.active else '?'} is active"}, status_code=409)

    def _idle() -> bool:
        return runner.active is None and runner.maintenance is None and not runner.hold_active()

    # A hold: the lab is somebody's (a playtest, a staging writing the clones)
    # until the minutes pass or a release; POST /run, /runset, /up and /down
    # answer 409 E_RUN_HOLD meanwhile and the nightly does not start.
    @router.post("/hold")
    async def hold(request: Request):
        body = await request.json()
        if not isinstance(body, dict) or not isinstance(body.get("reason"), str):
            raise HTTPException(400, "body must be {minutes, reason}")
        try:
            minutes = float(body.get("minutes", 180))
        except (TypeError, ValueError):
            raise HTTPException(400, "minutes must be a number")
        if not (0 < minutes <= 24 * 60):
            raise HTTPException(400, "minutes must be between 0 and 1440")
        return {"ok": True, "hold": runner.hold(minutes, body["reason"])}

    @router.post("/release")
    async def release():
        runner.release()
        return {"ok": True, "hold": None}

    @router.post("/up")
    async def up():
        if not _idle():
            return _busy()
        try:
            return await runner.up()
        except (RunnerError, ProxmoxError) as e:
            return JSONResponse({"ok": False, "error": str(e)}, status_code=500)

    @router.post("/down")
    async def down():
        if not _idle():
            return _busy()
        try:
            return await runner.down()
        except (RunnerError, ProxmoxError) as e:
            return JSONResponse({"ok": False, "error": str(e)}, status_code=500)

    @router.get("/status")
    async def status():
        d = await asyncio.to_thread(runner.status)
        d["runset"] = runsets.active.summary() if runsets.active else None
        return d

    # A run set (runset.py): the scenarios named, or "all" of the deployed tree,
    # one after another, with ADR-027's and the lab-fault reruns applied; the
    # merge gate and the nightly sweep are both this. POST {name, scenarios:
    # [...] | "all", game?, lab_fault_reruns?, lone_red_reruns?}.
    @router.post("/runset")
    async def runset_start(request: Request):
        body = await request.json()
        if not isinstance(body, dict) or not isinstance(body.get("name"), str):
            raise HTTPException(400, "body must be {name, scenarios, game?, lab_fault_reruns?, lone_red_reruns?}")
        scenarios = body.get("scenarios", "all")
        if scenarios != "all" and not (isinstance(scenarios, list) and all(isinstance(x, str) for x in scenarios)):
            raise HTTPException(400, 'scenarios must be a list of ids or "all"')
        policy = Policy(lab_fault_reruns=int(body.get("lab_fault_reruns", 1)), lone_red_reruns=int(body.get("lone_red_reruns", 2)),
                        lab_fault_stop=int(body.get("lab_fault_stop", 2)))
        if not _idle() or runsets.active is not None:
            return _busy() if not _idle() else JSONResponse({"error": f"E_RUNSET_BUSY: run set {runsets.active.id} is active"}, status_code=409)
        try:
            rs = runsets.start(body["name"], scenarios, body.get("game"), policy)
        except RunSetError as e:
            raise HTTPException(400, str(e)) from e
        _track(asyncio.create_task(runsets.execute(rs)))
        return rs.to_dict()

    @router.get("/runsets")
    async def runsets_list():
        return runsets.listing()

    @router.get("/runset/{rid}")
    async def runset_status(rid: str):
        rs = runsets.get(rid)
        if rs is None:
            raise HTTPException(404, f"no run set {rid}")
        return rs.to_dict()

    @router.post("/runset/{rid}/stop")
    async def runset_stop(rid: str):
        try:
            return runsets.stop(rid).to_dict()
        except RunSetError as e:
            raise HTTPException(404, str(e)) from e

    @router.post("/runset/{rid}/resume")
    async def runset_resume(rid: str):
        if runsets.active is not None:
            return JSONResponse({"error": f"E_RUNSET_BUSY: run set {runsets.active.id} is active"}, status_code=409)
        try:
            rs = runsets.resume(rid)
        except RunSetError as e:
            raise HTTPException(409 if "BUSY" in str(e) else 404 if "UNKNOWN" in str(e) else 400, str(e)) from e
        _track(asyncio.create_task(runsets.execute(rs)))
        return rs.to_dict()

    @router.post("/run")
    async def run(scenario: UploadFile = File(...), game: str | None = Form(None)):
        text = (await scenario.read()).decode("utf-8", errors="replace")
        try:
            sc = load_scenario(text)
        except (ValueError, ValidationError, KeyError) as e:
            raise HTTPException(400, f"E_SCENARIO: {e}") from e
        version = game or sc.game
        if version is not None and version not in s.game_versions():
            raise HTTPException(400, f"E_GAME: unknown game version {version!r}; the lab plays {', '.join(s.game_versions())}")
        if not _idle():
            return _busy()
        rec = runner.prepare(sc, game)
        _track(asyncio.create_task(runner.execute(rec)))
        return {"run": rec.run_id}

    @router.get("/run/{run_id}")
    async def run_status(run_id: str):
        rec = runner.runs.get(run_id)
        if rec is None:
            raise HTTPException(404, "no such run")
        return rec.progress()

    @router.get("/step")
    async def step(client: str):
        return board.poll(client)

    # One client's own state outside a run (lab-driver's dump-state), nothing
    # reset: for a playtest that hits something odd, such as a player who can
    # look around but not move (docs/verbs/rest.md, the stuck wait). Read only;
    # refused while a run owns the clients. `action` picks another read-only
    # step: poisons (docs/verbs/magic-effects.md, what a player's own poison
    # did to its weapon, which only a human can apply: the game asks first).
    PROBE_ACTIONS = {"dump-state", "poisons"}

    @router.get("/probe")
    async def probe(client: str, action: str = "dump-state"):
        if runner.active:
            return _busy()
        if action not in PROBE_ACTIONS:
            raise HTTPException(400, f"a probe reads only {sorted(PROBE_ACTIONS)}")
        if runner.tables.guest_for_client(client) is None:
            raise HTTPException(404, f"no client {client!r}")
        done = await board.run_step(client, action, {}, s.step_timeout_s)
        if not done.ok:
            return JSONResponse({"ok": False, "client": client, "error": done.result.get("error", "no answer")}, status_code=504)
        return {"ok": True, "client": client, "state": done.result.get("data")}

    # A playtest's second pair of hands (playtest fourteen, 2026-10-12: one
    # person plays both seats): one input step in one client's game while the
    # person plays the other, such as test 2 holding its block (End, the
    # clones' left attack) while test 1 swings. Input steps only, never a
    # console line: a seat's setup goes through the server (the gamemode's
    # labCommand console, just playtest-console), not keystrokes in a game
    # (playtest fifteen, Eli). Refused while a run owns the clients. The
    # recorder's watch-start and watch-stop too (ADR-033: a playtest is
    # recorded, lab/tools/playtest-record.sh): the stop answers with the trace.
    ASSIST_ACTIONS = {"hold-key", "tap-key", "anim-event", "draw-weapon", "watch-start", "watch-stop"}

    @router.post("/clients/{client}/assist")
    async def assist(client: str, request: Request):
        if runner.active:
            return _busy()
        body = await request.json()
        if not isinstance(body, dict) or body.get("action") not in ASSIST_ACTIONS:
            raise HTTPException(400, f"body must be {{action, args?}}, action one of {sorted(ASSIST_ACTIONS)}")
        args = body.get("args") or {}
        if not isinstance(args, dict):
            raise HTTPException(400, "args must be an object")
        if runner.tables.guest_for_client(client) is None:
            raise HTTPException(404, f"no client {client!r}")
        done = await board.run_step(client, body["action"], args, s.step_timeout_s)
        if not done.ok:
            return JSONResponse({"ok": False, "client": client, "error": done.result.get("error", "no answer")}, status_code=504)
        return {"ok": True, "client": client, "result": done.result.get("data")}

    # A playtest's step on one seat, written as a scenario writes it (Eli, 2026-10-16: he plays both
    # seats, so the lab casts on one while he staggers it from the other): `equip {formId: 0x12fd0}`,
    # `repeat {times: 12, gapMs: 3000, step: {hold-key: {code: 199, ms: 3000}}}`. Input and its rhythm
    # only (scenario.PLAYTEST_STEPS), and only inside a playtest's hold, so it never fires into a run;
    # the answer is the driver's, a repeat's when its last repetition is done.
    @router.post("/clients/{client}/playtest-step")
    async def playtest_step(client: str, request: Request):
        if runner.active:
            return _busy()
        held = runner.hold_status() or {}
        if not str(held.get("reason", "")).startswith("playtest"):
            return JSONResponse({"ok": False, "error": "E_NO_PLAYTEST: a playtest step needs a playtest's hold (just playtest-restore or playtest-start)"},
                                status_code=409)
        body = await request.json()
        if not isinstance(body, dict) or "step" not in body:
            raise HTTPException(400, "body must be {step}, the step as a scenario writes it")
        try:
            action, args = scenario_mod.playtest_step(body["step"])
        except (ValueError, TypeError, yaml.YAMLError) as e:
            raise HTTPException(400, str(e))
        if runner.tables.guest_for_client(client) is None:
            raise HTTPException(404, f"no client {client!r}")
        runner.touch()
        done = await board.run_step(client, action, args, scenario_mod.step_seconds(action, args, s.step_timeout_s))
        if not done.ok:
            return JSONResponse({"ok": False, "client": client, "action": action, "error": done.result.get("error", "no answer")}, status_code=504)
        return {"ok": True, "client": client, "action": action, "result": done.result.get("data")}

    # The client's logon launcher asks which game version to start (ADR-022):
    # the active run's, else the default. It keeps one game folder per version.
    # Self-service cold snapshots and promotes of a lab client (thuum-mundus's
    # recipe and guardrails in proxmox.GuestControl): POST
    # /clients/<c>/snapshot {name, description?} takes a stacked clean-m1-<x>;
    # POST /clients/<c>/promote {from, to} makes `to` bit-identical to it and
    # stacks `from` again on top, so the table's name stands after a merge.
    # Minutes long; no run starts meanwhile.
    async def _maintain(what: str, fn, *args):
        # a snapshot or a promote is the holder's own work: a hold keeps runs,
        # run sets, up and down out, not this (verb-stage's first live run held
        # the lab and then could not snapshot the clones it had just written,
        # 2026-10-14 06:5x); a run or another maintenance in progress still does
        if runner.active is not None or runner.maintenance is not None:
            return _busy()
        runner.maintenance = what
        try:
            return await asyncio.to_thread(fn, *args)
        except ProxmoxError as e:
            return JSONResponse({"ok": False, "error": str(e)}, status_code=500)
        finally:
            runner.maintenance = None

    def _client_guest(client: str):
        g = runner.tables.guest_for_client(client)
        if g is None:
            raise HTTPException(404, f"no guest plays client {client}")
        return g

    @router.post("/clients/{client}/snapshot")
    async def client_snapshot(client: str, request: Request):
        body = await request.json()
        if not isinstance(body, dict) or not isinstance(body.get("name"), str):
            raise HTTPException(400, "body must be {name, description?}")
        g = _client_guest(client)
        description = str(body.get("description") or f"{body['name']} by lab-api")
        return await _maintain(f"snapshot {body['name']} of {g.name}", services.control.snapshot_clone, g, body["name"],
                               description, s.quiesce_cmd, s.guest_task_timeout_s, s.heartbeat_timeout_s)

    @router.post("/clients/{client}/promote")
    async def client_promote(client: str, request: Request):
        body = await request.json()
        if not isinstance(body, dict) or not isinstance(body.get("from"), str) or not isinstance(body.get("to"), str):
            raise HTTPException(400, "body must be {from, to}")
        g = _client_guest(client)
        return await _maintain(f"promote {body['from']} to {body['to']} on {g.name}", services.control.promote_clone, g,
                               body["from"], body["to"], s.heartbeat_timeout_s)

    @router.get("/game")
    async def game_version(client: str):
        # the clone's logon launcher asks which version to start and whether
        # without skymp5-client (a solo run, ADR-031); see launch.ps1
        return {"client": client, "version": runner.game_for(client), "solo": runner.solo_for(client)}

    @router.post("/step/{step_id}/result")
    async def step_result(step_id: str, request: Request):
        body = await request.json()
        if not isinstance(body, dict):
            raise HTTPException(400, "result body must be a JSON object")
        if not board.complete(step_id, body):
            raise HTTPException(404, f"step {step_id} is not in flight")
        return {"ok": True}

    @router.get("/frida/scripts/{name}")
    async def frida_script(name: str):
        if "/" in name or "\\" in name or name.startswith("."):
            raise HTTPException(400, "bad script name")
        for base in (Path(s.frida_scripts_dir), Path(s.frida_scripts_dir) / "uploads"):
            p = base / name
            if p.is_file():
                return FileResponse(p, media_type="text/javascript")
        raise HTTPException(404, "no such script")

    @router.post("/frida")
    async def frida(client: str = Form(...), script: str | None = Form(None), file: UploadFile | None = File(None)):
        if file is not None:
            name = Path(file.filename or "upload.js").name
            up_dir = Path(s.frida_scripts_dir) / "uploads"
            up_dir.mkdir(parents=True, exist_ok=True)
            (up_dir / name).write_bytes(await file.read())
        elif script:
            name = Path(script).name
            if not (Path(s.frida_scripts_dir) / name).is_file():
                raise HTTPException(404, f"no script {name} under {s.frida_scripts_dir}")
        else:
            raise HTTPException(400, "give a script name or upload a file")
        g = services.tables.guest_for_client(client)
        if g is None:
            raise HTTPException(404, f"no guest plays client {client}")
        if not g.managed:
            raise HTTPException(400, f"{g.name} is unmanaged; Frida cannot be started there through the guest agent")
        url = f"{s.lab_api_internal_url.rstrip('/')}/frida/scripts/{name}"
        cmd = ["powershell", "-NoProfile", "-Command", s.frida_exec_template.format(url=url, name=name, lab_dir=s.client_lab_dir, out="")]
        try:
            res = await asyncio.to_thread(services.control.exec, g, cmd, s.guest_task_timeout_s)
        except ProxmoxError as e:
            raise HTTPException(502, str(e)) from e
        runner.frida_started.append((client, name))
        return {"ok": res.exitcode == 0, "exitcode": res.exitcode, "out": res.out[-2000:], "err": res.err[-2000:]}

    @router.api_route("/state/{path:path}", methods=["GET", "POST"])
    async def state_proxy(path: str, request: Request):
        """A transparent pass-through to the server's UI port (the RPCs of CONTRACT.md)."""
        import httpx

        body = await request.body()
        url = f"{s.server_state_url.rstrip('/')}/{path}"

        def go():
            with httpx.Client(timeout=10, verify=False) as c:
                return c.request(request.method, url, content=body, headers={"content-type": request.headers.get("content-type", "application/json")})

        try:
            r = await asyncio.to_thread(go)
        except httpx.HTTPError as e:
            raise HTTPException(502, f"E_STATE: {e}") from e
        return JSONResponse(content=_maybe_json(r), status_code=r.status_code)

    app.include_router(router)
    return app


def _maybe_json(r) -> Any:
    try:
        return r.json()
    except ValueError:
        return {"raw": r.text}


def main() -> None:
    import uvicorn

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")
    settings = Settings.from_env()
    uvicorn.run(create_app(build_real(settings)), host="0.0.0.0", port=settings.listen_port, proxy_headers=True, forwarded_allow_ips="*")


def dev() -> None:
    """Local development on the fakes: uvicorn on 8080, no Proxmox, no server."""
    import tempfile

    import uvicorn

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")
    tmp = Path(tempfile.mkdtemp(prefix="labapi-dev-"))
    (tmp / "snapshots" / "clean").mkdir(parents=True)
    (tmp / "snapshots" / "clean" / "world.json").write_text("{}")
    settings = Settings(results_dir=str(tmp / "results"), server_world_dir=str(tmp / "world"), server_snapshots_dir=str(tmp / "snapshots"), listen_port=8080, time_scale=0.1)
    from .fakes import FakeState

    fake_state = FakeState()
    fake_state.spawn(1, 0, 0, 0)
    fake_state.spawn(2, 200, 0, 0)
    services = build_fake(settings, fake_state=fake_state)
    print(f"labapi-dev: fakes, results in {tmp}, LAB_API=http://127.0.0.1:8080{settings.root_path}")
    uvicorn.run(create_app(services), host="127.0.0.1", port=8080)
