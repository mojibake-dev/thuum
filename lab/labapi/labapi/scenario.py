"""Scenario files (lab/scenarios/*.yaml). The step notation is one key per
step: `<client>: <verb> {flow mapping}`, `wait: <seconds>`, `assert: [...]`,
`server: restart`. A bare `verb {a: 1}` value is not valid YAML (the colon
inside the braces ends the plain scalar), so the loader quotes such values
before parsing; a quoted form in the file is accepted as well."""

from __future__ import annotations

import re
from typing import Any, Literal

import yaml
from pydantic import BaseModel, Field, field_validator

# Verbs the client executes (lab-driver) and verbs lab-api sends to the
# server's command endpoint (CONTRACT.md). Screenshot is special: guest exec on
# a managed guest, a client verb on an unmanaged one.
# craft is specified by m0-forge and not yet implemented by lab-driver (Track L1).
CLIENT_ACTIONS = {"connect", "reconnect", "move", "equip", "cast", "activate", "hit", "dump-state", "request-screenshot", "craft"}
# Server-side verbs (rung R0) go to the labCommand RPC; CONTRACT.md lists them.
SERVER_ACTIONS = {"teleport", "give", "set-appearance", "set-percentages", "kill", "respawn"}
SPECIAL_ACTIONS = {"screenshot"}
SERVER_STEP_ACTIONS = {"restart"}
KNOWN_ARTIFACTS = {"server.log", "screenshots", "world-diff", "pcap"}

_FLOW_STEP = re.compile(r"^(?P<lead>\s*-\s+[\w-]+:\s+)(?P<value>[\w-]+\s+\{.*\})\s*(?P<comment>#.*)?$")


def quote_flow_steps(text: str) -> str:
    """`- c1: teleport {cell: x, y: 0}` becomes `- c1: "teleport {cell: x, y: 0}"`."""
    out = []
    for line in text.splitlines():
        m = _FLOW_STEP.match(line)
        if m:
            value = m.group("value").replace('"', '\\"')
            comment = m.group("comment") or ""
            line = f'{m.group("lead")}"{value}"' + (f"  {comment}" if comment else "")
        out.append(line)
    return "\n".join(out) + "\n"


class Netem(BaseModel):
    delay_ms: float = 0
    jitter_ms: float = 0
    loss_pct: float = 0


class ServerSpec(BaseModel):
    snapshot: str = "clean"
    netem: Netem | None = None


class Step(BaseModel):
    kind: Literal["client", "wait", "assert", "server"]
    client: str | None = None
    action: str | None = None
    args: dict[str, Any] = Field(default_factory=dict)
    seconds: float | None = None
    assertions: list[str] = Field(default_factory=list)

    def describe(self) -> str:
        if self.kind == "client":
            return f"{self.client}: {self.action}" + (f" {self.args}" if self.args else "")
        if self.kind == "wait":
            return f"wait {self.seconds}"
        if self.kind == "assert":
            return f"assert x{len(self.assertions)}"
        return f"server: {self.action}"


class Scenario(BaseModel):
    id: str
    milestone: str | None = None
    clients: list[str] = Field(default_factory=list)
    server: ServerSpec = Field(default_factory=ServerSpec)
    timeout_s: float = 600
    steps: list[Step] = Field(default_factory=list)
    artifacts: list[str] = Field(default_factory=list)

    @field_validator("id")
    @classmethod
    def _id_shape(cls, v: str) -> str:
        if not re.fullmatch(r"[a-z0-9][a-z0-9-]*", v):
            raise ValueError("scenario id must be lowercase letters, digits, and dashes")
        return v


def _parse_action(value: Any) -> tuple[str, dict[str, Any]]:
    if isinstance(value, dict) and len(value) == 1:
        (verb, args), = value.items()
        return str(verb), dict(args or {})
    if not isinstance(value, str):
        raise ValueError(f"step value must be a string or a one-key mapping, got {type(value).__name__}")
    value = value.strip()
    if "{" in value:
        verb, _, flow = value.partition("{")
        args = yaml.safe_load("{" + flow)
        if not isinstance(args, dict):
            raise ValueError(f"step arguments must be a mapping: {value!r}")
        return verb.strip(), args
    return value, {}


def parse_step(raw: Any, clients: list[str]) -> Step:
    if not isinstance(raw, dict) or len(raw) != 1:
        raise ValueError(f"each step is a one-key mapping, got {raw!r}")
    (key, value), = raw.items()
    key = str(key)
    if key == "wait":
        return Step(kind="wait", seconds=float(value))
    if key == "assert":
        if not isinstance(value, list) or not all(isinstance(x, str) for x in value):
            raise ValueError("assert takes a list of expressions")
        return Step(kind="assert", assertions=list(value))
    if key == "server":
        action, args = _parse_action(value)
        if action not in SERVER_STEP_ACTIONS:
            raise ValueError(f"unknown server step {action!r}")
        return Step(kind="server", action=action, args=args)
    if key not in clients:
        raise ValueError(f"step names client {key!r}, which is not in clients {clients}")
    action, args = _parse_action(value)
    if action not in CLIENT_ACTIONS | SERVER_ACTIONS | SPECIAL_ACTIONS:
        raise ValueError(f"unknown client step {action!r} for {key}")
    return Step(kind="client", client=key, action=action, args=args)


def load_scenario(text: str) -> Scenario:
    data = yaml.safe_load(quote_flow_steps(text))
    if not isinstance(data, dict):
        raise ValueError("scenario must be a mapping")
    clients = [str(c) for c in data.get("clients", [])]
    steps = [parse_step(s, clients) for s in data.get("steps", [])]
    artifacts = [str(a) for a in data.get("artifacts", [])]
    server = data.get("server") or {}
    return Scenario(
        id=str(data["id"]),
        milestone=(str(data["milestone"]) if data.get("milestone") is not None else None),
        clients=clients,
        server=ServerSpec(snapshot=str(server.get("snapshot", "clean")), netem=(Netem(**server["netem"]) if server.get("netem") else None)),
        timeout_s=float(data.get("timeout_s", 600)),
        steps=steps,
        artifacts=artifacts,
    )
