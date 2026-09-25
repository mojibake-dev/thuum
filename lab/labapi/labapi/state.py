"""The server's state, through the HTTP RPC hook skymp5-server already has on
its UI port: POST {SERVER_STATE_URL}/rpc/<name> with a JSON body
{"payload": ...}; the gamemode's mp.onHttpRpcRunAttempt(name, payload) return
value is the response body. CONTRACT.md fixes the two RPCs the lab gamemode
(Track S2) implements, labState and labCommand."""

from __future__ import annotations

from typing import Any, Protocol

import httpx


class StateError(Exception):
    """E_STATE: the server's RPC endpoint refused or malformed an answer."""


class StateBackend(Protocol):
    def rpc(self, name: str, payload: dict[str, Any]) -> dict[str, Any]: ...


class RpcStateClient:
    """httpx over the UI port. `transport` lets tests plug an httpx.MockTransport
    that speaks the same contract."""

    def __init__(self, base_url: str, timeout: float = 10.0, transport: httpx.BaseTransport | None = None):
        self._client = httpx.Client(base_url=base_url.rstrip("/"), timeout=timeout, transport=transport, verify=False)

    def rpc(self, name: str, payload: dict[str, Any]) -> dict[str, Any]:
        try:
            r = self._client.post(f"/rpc/{name}", json={"payload": payload})
        except httpx.HTTPError as e:
            raise StateError(f"E_STATE: rpc {name} failed: {e}") from e
        if r.status_code != 200:
            raise StateError(f"E_STATE: rpc {name} returned http {r.status_code}")
        try:
            body = r.json()
        except ValueError as e:
            raise StateError(f"E_STATE: rpc {name} returned non-JSON") from e
        if not isinstance(body, dict):
            raise StateError(f"E_STATE: rpc {name} returned {type(body).__name__}, expected an object")
        return body

    def close(self) -> None:
        self._client.close()


class ServerState:
    """The facade the evaluator and the runner use: scenario client names in,
    labState answers out. Profile ids and item ids come from the tables."""

    def __init__(self, backend: StateBackend, profile_ids: dict[str, int], base_id_resolver, cells=None):
        self._backend = backend
        self._profile_ids = profile_ids
        self.base_id = base_id_resolver
        # The cells table (guests.Tables) or None: scenario coordinates are
        # offsets from a named cell's origin; the wire carries absolutes.
        self._cells = cells

    def origin_for_desc(self, desc: str):
        return self._cells.origin_for_desc(desc) if self._cells else None

    def origin_for_form(self, form_id: int):
        return self._cells.origin_for_form(form_id) if self._cells else None

    def _normalize_actor(self, body: dict[str, Any]) -> dict[str, Any]:
        """Absolute server coordinates and descriptor to the scenario's frame:
        the named cell and offsets from its origin, when the table knows the
        descriptor; otherwise unchanged. The absolute record rides along."""
        cell = self._cells.cell_by_desc(str(body.get("cell", ""))) if self._cells else None
        if cell is None:
            return body
        out = dict(body)
        out["absolute"] = {"x": body.get("x"), "y": body.get("y"), "z": body.get("z"), "cell": body.get("cell")}
        try:
            out["x"] = float(body["x"]) - cell.origin[0]
            out["y"] = float(body["y"]) - cell.origin[1]
            out["z"] = float(body["z"]) - cell.origin[2]
        except (KeyError, TypeError, ValueError):
            return body
        out["cell"] = cell.name
        return out

    def _profile(self, client: str) -> int:
        try:
            return self._profile_ids[client]
        except KeyError:
            raise StateError(f"E_STATE: client {client!r} has no profile_id in the clients table") from None

    def actor(self, client: str) -> dict[str, Any] | None:
        body = self._backend.rpc("labState", {"kind": "actor", "profileId": self._profile(client)})
        return self._normalize_actor(body) if body.get("found") else None

    def inventory(self, client: str) -> list[dict[str, Any]] | None:
        body = self._backend.rpc("labState", {"kind": "inventory", "profileId": self._profile(client)})
        if not body.get("found"):
            return None
        entries = body.get("entries")
        if not isinstance(entries, list):
            raise StateError("E_STATE: inventory answer lacks entries")
        return entries

    def command(self, client: str, action: str, args: dict[str, Any]) -> dict[str, Any]:
        payload = {"kind": action, "profileId": self._profile(client), **args}
        if action == "teleport" and self._cells is not None and "cell" in args:
            cell = self._cells.cell(str(args["cell"]))
            if cell is not None:
                payload["cell"] = cell.desc
                for axis, origin in zip(("x", "y", "z"), cell.origin):
                    payload[axis] = origin + float(args.get(axis, 0))
        if action == "give" and "item" in args:
            try:
                payload["baseId"] = int(self.base_id(str(args["item"])))
            except KeyError as e:
                raise StateError(f"E_STATE: {e}") from e
        body = self._backend.rpc("labCommand", payload)
        if not body.get("ok"):
            raise StateError(f"E_STATE: {action} for {client} refused: {body.get('error', 'no reason')}")
        return body
