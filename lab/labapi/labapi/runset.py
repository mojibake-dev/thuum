"""A run set: a named list of scenarios the runner plays one after another,
with ADR-030's rules encoded instead of scripted per merge. A run that ends
without a verdict (a lab fault, E_RUN_*) is rerun once; when the set's only red
scenario reruns green twice it is a watch item (ADR-027), any other red is red;
a set can be stopped after its current run and resumed later; its state is
written beside the runs as results/runsets/<id>.json after every run, so a
lab-api restart loses nothing. The nightly sweep is a set named `nightly` over
every scenario in the deployed lab tree, started by the clock once the lab has
been idle for a while (docs/DECISIONS.md ADR-030; the merge gate is the same
machinery over the gate's list, `just verb-merge`)."""

from __future__ import annotations

import asyncio
import json
import time
from dataclasses import asdict, dataclass, field
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

from .runner import Runner
from .scenario import load_scenario


@dataclass
class Policy:
    lab_fault_reruns: int = 1   # a run without a verdict is rerun this often
    lone_red_reruns: int = 2    # the set's only red scenario reruns this often; all green makes it a watch item


@dataclass
class RunSet:
    id: str
    name: str
    scenarios: list[str]
    game: str | None
    policy: Policy
    started: str
    finished: str | None = None
    state: str = "running"          # running, stopping, stopped, done
    position: int = 0               # the next scenario to run
    current: str | None = None      # the run id in progress
    runs: dict[str, list[dict[str, Any]]] = field(default_factory=dict)  # scenario -> [{run, verdict, rerun?}]
    watch: list[str] = field(default_factory=list)   # ADR-027 watch items this set made
    verdict: str | None = None      # green, watch, red, error
    notes: list[str] = field(default_factory=list)

    def last_verdict(self, scenario: str) -> str | None:
        entries = self.runs.get(scenario) or []
        return entries[-1]["verdict"] if entries else None

    def summary(self) -> dict[str, Any]:
        counts: dict[str, int] = {}
        for s in self.scenarios[: self.position]:
            v = self.last_verdict(s) or "none"
            counts[v] = counts.get(v, 0) + 1
        return {"id": self.id, "name": self.name, "state": self.state, "verdict": self.verdict,
                "position": self.position, "total": len(self.scenarios), "current": self.current,
                "counts": counts, "watch": list(self.watch), "started": self.started, "finished": self.finished}

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        d["summary"] = self.summary()
        return d

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "RunSet":
        d = dict(d)
        d.pop("summary", None)
        d["policy"] = Policy(**d.get("policy", {}))
        return cls(**d)


class RunSetError(Exception):
    """E_RUNSET: a bad request for a set (an unknown scenario, a set in progress)."""


class RunSets:
    def __init__(self, settings, runner: Runner, wall=time.time):
        self.s = settings
        self.runner = runner
        self._wall = wall
        self.scenarios_dir = Path(settings.scenarios_dir)
        self.active: RunSet | None = None
        self.sets: dict[str, RunSet] = {}
        self.poll_s = 2.0                      # waiting for a hand-posted run or a snapshot to finish
        self.last_nightly: date | None = None

    # ----- the catalogue ---------------------------------------------------------

    def list_scenarios(self) -> list[str]:
        """Every scenario in the deployed lab tree, by id (the file's stem)."""
        if not self.scenarios_dir.is_dir():
            return []
        return sorted(p.stem for p in self.scenarios_dir.glob("*.yaml"))

    def _dir(self) -> Path:
        d = Path(self.s.results_dir) / "runsets"
        d.mkdir(parents=True, exist_ok=True)
        return d

    def save(self, rs: RunSet) -> None:
        (self._dir() / f"{rs.id}.json").write_text(json.dumps(rs.to_dict(), indent=2))

    def get(self, rid: str) -> RunSet | None:
        if rid in self.sets:
            return self.sets[rid]
        path = self._dir() / f"{rid}.json"
        if path.is_file():
            rs = RunSet.from_dict(json.loads(path.read_text()))
            self.sets[rid] = rs
            return rs
        return None

    def listing(self, limit: int = 20) -> list[dict[str, Any]]:
        ids = sorted(p.stem for p in self._dir().glob("*.json"))[-limit:]
        return [rs.summary() for rid in reversed(ids) if (rs := self.get(rid)) is not None]

    # ----- starting, stopping, resuming -------------------------------------------

    def start(self, name: str, scenarios: list[str] | str, game: str | None = None, policy: Policy | None = None) -> RunSet:
        """A new set, ready for execute(); raises RunSetError for a set in
        progress or a scenario the deployed tree does not have."""
        if self.active is not None:
            raise RunSetError(f"E_RUNSET_BUSY: run set {self.active.id} is active")
        known = self.list_scenarios()
        if scenarios == "all":
            wanted = known
        else:
            wanted = list(dict.fromkeys(str(x) for x in scenarios))  # once each, in the order given
            missing = [x for x in wanted if x not in known]
            if missing:
                raise RunSetError(f"E_RUNSET_SCENARIO: not in {self.scenarios_dir}: {', '.join(missing)}")
        if not wanted:
            raise RunSetError("E_RUNSET_EMPTY: no scenarios")
        if game is not None and game not in self.s.game_versions():
            raise RunSetError(f"E_RUNSET_GAME: unknown game version {game!r}")
        stamp = time.strftime("%Y%m%d-%H%M%S", time.gmtime(self._wall()))
        safe = "".join(c if c.isalnum() or c in "-_" else "-" for c in name)[:40] or "set"
        rid = f"{stamp}-{safe}"
        n = 1
        while (self._dir() / f"{rid}.json").exists():
            n += 1
            rid = f"{stamp}-{safe}-{n}"
        rs = RunSet(id=rid, name=name, scenarios=wanted, game=game, policy=policy or Policy(), started=_iso(self._wall()))
        self.sets[rid] = rs
        self.active = rs
        self.save(rs)
        return rs

    def stop(self, rid: str) -> RunSet:
        rs = self.get(rid)
        if rs is None:
            raise RunSetError(f"E_RUNSET_UNKNOWN: {rid}")
        if rs.state == "running":
            rs.state = "stopping"
            self.save(rs)
        return rs

    def resume(self, rid: str) -> RunSet:
        """A stopped set goes on from the scenario after the last it ran; the
        caller executes it. A set that ended is done and stays done."""
        if self.active is not None:
            raise RunSetError(f"E_RUNSET_BUSY: run set {self.active.id} is active")
        rs = self.get(rid)
        if rs is None:
            raise RunSetError(f"E_RUNSET_UNKNOWN: {rid}")
        if rs.state == "done":
            raise RunSetError(f"E_RUNSET_DONE: {rid} ended with {rs.verdict}")
        rs.state = "running"
        rs.current = None
        self.active = rs
        self.save(rs)
        return rs

    # ----- running ----------------------------------------------------------------

    async def execute(self, rs: RunSet) -> RunSet:
        try:
            while rs.position < len(rs.scenarios):
                if rs.state == "stopping":
                    rs.state = "stopped"
                    rs.notes.append(f"stopped before {rs.scenarios[rs.position]} at {_iso(self._wall())}")
                    return rs
                sid = rs.scenarios[rs.position]
                verdict = await self._run(rs, sid)
                tries = 0
                while verdict == "error" and tries < rs.policy.lab_fault_reruns:
                    tries += 1
                    verdict = await self._run(rs, sid, rerun="lab-fault")
                rs.position += 1
                self.save(rs)
            await self._settle(rs)
            rs.state = "done"
        except Exception as e:  # a set never dies silently; the runner's own errors are per run
            rs.notes.append(f"{type(e).__name__}: {e}")
            rs.verdict = "error"
            rs.state = "done"
        finally:
            if rs.state == "done":
                rs.finished = _iso(self._wall())
            rs.current = None
            self.save(rs)
            if self.active is rs:
                self.active = None
        return rs

    async def _settle(self, rs: RunSet) -> None:
        """ADR-027 at the end of the set: one red scenario reruns twice and,
        green both times, becomes a watch item; several reds, a red rerun, a
        missing scenario or a lab fault that stayed, and the set is not green."""
        reds = [s for s in rs.scenarios if rs.last_verdict(s) == "red"]
        if len(reds) == 1 and rs.policy.lone_red_reruns > 0:
            s = reds[0]
            greens = 0
            for _ in range(rs.policy.lone_red_reruns):
                if await self._run(rs, s, rerun="lone-red") != "green":
                    break
                greens += 1
            if greens == rs.policy.lone_red_reruns:
                rs.watch.append(s)
                reds = []
        others = [s for s in rs.scenarios if rs.last_verdict(s) not in ("green", "red")]
        if reds:
            rs.verdict = "red"
        elif others:
            rs.verdict = "error"
        elif rs.watch:
            rs.verdict = "watch"
        else:
            rs.verdict = "green"

    async def _run(self, rs: RunSet, sid: str, rerun: str | None = None) -> str:
        path = self.scenarios_dir / f"{sid}.yaml"
        if not path.is_file():
            rs.runs.setdefault(sid, []).append({"run": None, "verdict": "missing"})
            rs.notes.append(f"{sid}: no {path.name} in the deployed lab tree")
            return "missing"
        try:
            sc = load_scenario(path.read_text(encoding="utf-8"))
        except Exception as e:
            rs.runs.setdefault(sid, []).append({"run": None, "verdict": "invalid"})
            rs.notes.append(f"{sid}: {type(e).__name__}: {e}")
            return "invalid"
        # a run posted by hand, or a snapshot in progress, finishes first
        while self.runner.active is not None or self.runner.maintenance is not None:
            await asyncio.sleep(self.poll_s)
        rec = self.runner.prepare(sc, rs.game)
        rs.current = rec.run_id
        self.save(rs)
        await self.runner.execute(rec)
        entry: dict[str, Any] = {"run": rec.run_id, "verdict": rec.verdict}
        if rerun:
            entry["rerun"] = rerun
        rs.runs.setdefault(sid, []).append(entry)
        rs.current = None
        return rec.verdict

    # ----- the nightly ------------------------------------------------------------

    def maybe_nightly(self, now: datetime) -> RunSet | None:
        """The nightly sweep's start, if its time has come today, nothing ran
        it yet, and the lab is idle and has been for nightly_quiet_s (nobody
        playtesting or staging). The caller executes the set it returns."""
        when = (self.s.nightly_sweep_utc or "").strip()
        if not when:
            return None
        hh, mm = when.split(":")
        now = now.astimezone(timezone.utc)
        if self.last_nightly == now.date():
            return None
        if (now.hour, now.minute) < (int(hh), int(mm)):
            return None
        if self.active is not None or self.runner.active is not None or self.runner.maintenance is not None:
            return None
        ended = getattr(self.runner, "_last_run_ended_wall", None)
        if ended is not None and self._wall() - ended < self.s.nightly_quiet_s:
            return None
        self.last_nightly = now.date()
        try:
            return self.start("nightly", "all")
        except RunSetError:
            return None


def _iso(ts: float) -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(ts))
