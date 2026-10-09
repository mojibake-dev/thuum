"""The HTTP surface, exactly docs/LAB.md's endpoint table under LAB_ROOT_PATH.
No auth: the Caddy vhost at https://thuum.gaussing.tv/lab is LAN and tailnet
only and is the boundary; inside the VLAN the clients reach :80 directly."""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from fastapi import APIRouter, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from pydantic import ValidationError

from .board import StepBoard
from .config import Settings
from .guests import Tables, load_tables
from .proxmox import GuestControl, ProxmoxError
from .runner import Runner, RunnerError
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


def build_real(settings: Settings) -> Services:
    from .proxmox import ProxmoxerGuests

    tables = load_tables(settings.guests_file)
    control = GuestControl(ProxmoxerGuests(settings.pve_url, settings.pve_token_id, settings.pve_token_secret, settings.pve_node, settings.pve_verify_ssl, settings.guest_task_timeout_s, http_timeout=settings.pve_timeout_s))
    system = RealSystem()
    state = ServerState(RpcStateClient(settings.server_state_url), tables.profile_ids, tables.base_id, tables)
    board = StepBoard()
    runner = Runner(settings, tables, control, system, state, board)
    return Services(settings, tables, control, system, state, board, runner)


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
    return Services(settings, tables, control, system, state, board, runner)


def create_app(services: Services) -> FastAPI:
    s = services.settings
    app = FastAPI(title="thuum lab-api", docs_url=None, redoc_url=None)
    app.state.services = services
    app.state.tasks: set[asyncio.Task] = set()
    router = APIRouter(prefix=s.root_path.rstrip("/"))
    runner = services.runner
    board = services.board

    @app.middleware("http")
    async def access_log(request: Request, call_next):
        t0 = time.monotonic()
        response = await call_next(request)
        fwd = request.headers.get("x-forwarded-for")
        peer = fwd.split(",")[0].strip() if fwd else (request.client.host if request.client else "-")
        log.info("%s %s %s %d %.3fs", peer, request.method, request.url.path, response.status_code, time.monotonic() - t0)
        return response

    def _busy() -> JSONResponse:
        if runner.maintenance:
            return JSONResponse({"error": f"E_RUN_BUSY: {runner.maintenance} in progress"}, status_code=409)
        return JSONResponse({"error": f"E_RUN_BUSY: run {runner.active.run_id if runner.active else '?'} is active"}, status_code=409)

    def _idle() -> bool:
        return runner.active is None and runner.maintenance is None

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
        return await asyncio.to_thread(runner.status)

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
        task = asyncio.create_task(runner.execute(rec))
        app.state.tasks.add(task)
        task.add_done_callback(app.state.tasks.discard)
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
    # refused while a run owns the clients.
    @router.get("/probe")
    async def probe(client: str):
        if runner.active:
            return _busy()
        if runner.tables.guest_for_client(client) is None:
            raise HTTPException(404, f"no client {client!r}")
        done = await board.run_step(client, "dump-state", {}, s.step_timeout_s)
        if not done.ok:
            return JSONResponse({"ok": False, "client": client, "error": done.result.get("error", "no answer")}, status_code=504)
        return {"ok": True, "client": client, "state": done.result.get("data")}

    # The client's logon launcher asks which game version to start (ADR-022):
    # the active run's, else the default. It keeps one game folder per version.
    # Self-service cold snapshots and promotes of a lab client (thuum-mundus's
    # recipe and guardrails in proxmox.GuestControl): POST
    # /clients/<c>/snapshot {name, description?} takes a stacked clean-m1-<x>;
    # POST /clients/<c>/promote {from, to} makes `to` bit-identical to it and
    # stacks `from` again on top, so the table's name stands after a merge.
    # Minutes long; no run starts meanwhile.
    async def _maintain(what: str, fn, *args):
        if not _idle():
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
        return {"client": client, "version": runner.game_for(client)}

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
