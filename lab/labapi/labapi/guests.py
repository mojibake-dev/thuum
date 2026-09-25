"""The lab tables (guests.yaml): guests from docs/LAB.md, scenario clients
with their profileIds, and the item name table (CONTRACT.md). A guest with
managed false is never stopped, rolled back, started, or exec'd into;
lab-api only waits for its heartbeat. fenestrate is the standing example."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import yaml


@dataclass(frozen=True)
class Guest:
    name: str
    vmid: int
    ip: str
    kind: str  # qemu | lxc
    role: str  # server | client | re | ci
    managed: bool
    snapshot: str = ""
    client: str | None = None  # scenario client name this guest plays, for role client


@dataclass(frozen=True)
class Cell:
    """A named place scenarios teleport to and measure from (guests.yaml cells)."""

    name: str
    desc: str  # FormDesc::ToString, "<hex id>:<file>"
    world_or_cell: int  # the form id lab-driver reports
    origin: tuple[float, float, float]


@dataclass(frozen=True)
class Tables:
    guests: dict[str, Guest]
    profile_ids: dict[str, int]  # scenario client name to profileId
    items: dict[str, int]  # lowercased "file:editorid" to base form id
    cells: dict[str, Cell] = field(default_factory=dict)  # lowercased name to cell

    def cell(self, name: str) -> Cell | None:
        return self.cells.get(name.strip().lower())

    def cell_by_desc(self, desc: str) -> Cell | None:
        d = desc.strip().lower()
        for c in self.cells.values():
            if c.desc.lower() == d:
                return c
        return None

    def cell_by_form(self, form_id: int) -> Cell | None:
        for c in self.cells.values():
            if c.world_or_cell == form_id:
                return c
        return None

    def origin_for_desc(self, desc: str) -> tuple[float, float, float] | None:
        c = self.cell_by_desc(desc)
        return c.origin if c else None

    def origin_for_form(self, form_id: int) -> tuple[float, float, float] | None:
        c = self.cell_by_form(form_id)
        return c.origin if c else None

    def guest_for_client(self, client: str) -> Guest | None:
        for g in self.guests.values():
            if g.role == "client" and g.client == client:
                return g
        return None

    def server_guest(self) -> Guest | None:
        for g in self.guests.values():
            if g.role == "server":
                return g
        return None

    def profile_id(self, client: str) -> int:
        try:
            return self.profile_ids[client]
        except KeyError:
            raise KeyError(f"client {client!r} has no profile_id in the clients table") from None

    def base_id(self, spec: str) -> int:
        """`File.esm:EditorID` through the table, or a plain int / 0x-hex form id."""
        s = spec.strip()
        try:
            return int(s, 0)
        except ValueError:
            pass
        key = s.lower()
        if key in self.items:
            return self.items[key]
        raise KeyError(f"item {spec!r} is not in the items table; add it to guests.yaml")


def load_tables(path: str | Path) -> Tables:
    data = yaml.safe_load(Path(path).read_text()) or {}
    guests: dict[str, Guest] = {}
    for row in data.get("guests", []):
        g = Guest(
            name=str(row["name"]),
            vmid=int(row["vmid"]),
            ip=str(row.get("ip", "")),
            kind=str(row.get("kind", "qemu")),
            role=str(row.get("role", "")),
            managed=bool(row.get("managed", False)),
            snapshot=str(row.get("snapshot") or ""),
            client=(str(row["client"]) if row.get("client") else None),
        )
        if g.kind not in ("qemu", "lxc"):
            raise ValueError(f"guest {g.name}: kind must be qemu or lxc")
        guests[g.name] = g
    profile_ids = {str(k): int(v["profile_id"]) for k, v in (data.get("clients") or {}).items()}
    items = {str(k).lower(): int(v, 0) if isinstance(v, str) else int(v) for k, v in (data.get("items") or {}).items()}
    cells: dict[str, Cell] = {}
    for name, row in (data.get("cells") or {}).items():
        origin = tuple(float(v) for v in row.get("origin", [0, 0, 0]))
        if len(origin) != 3:
            raise ValueError(f"cell {name}: origin needs three numbers")
        woc = row.get("worldOrCell", 0)
        cells[str(name).lower()] = Cell(str(name), str(row["desc"]), int(woc, 0) if isinstance(woc, str) else int(woc), origin)
    return Tables(guests, profile_ids, items, cells)


def load_guests(path: str | Path) -> dict[str, Guest]:
    return load_tables(path).guests
