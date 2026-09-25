"""The assertion language: a restricted subset of Python expressions,
evaluated over the ast, never through eval. Only the names, attributes, and
calls listed here exist; everything else is a syntax rejection with a reason
the lab can grep (E_ASSERT_*).

  server.actor(<client>).x | .y | .z | .cell        from the state endpoint
  server.inventory(<client>).count("<file>:<id>")   from the state endpoint
  <client>.sees(<client>)                            from that client's last dump-state
  <client>.view(<client>).x | .y | .z                from that client's last dump-state
  abs(), + - * /, comparisons, and, or, not, numbers, strings, true, false
"""

from __future__ import annotations

import ast
import operator
from dataclasses import dataclass
from typing import Any, Protocol


class AssertionSyntax(Exception):
    """E_ASSERT_SYNTAX: the expression uses something outside the language."""


class AssertionData(Exception):
    """E_ASSERT_DATA: the expression is legal but the data is missing."""


class ServerFacade(Protocol):
    """What the runner gives the evaluator: labState answers (CONTRACT.md) keyed
    by scenario client name, and the item name table."""

    def actor(self, client: str) -> dict[str, Any] | None: ...
    def inventory(self, client: str) -> list[dict[str, Any]] | None: ...
    def base_id(self, spec: str) -> int: ...


class ViewsFacade(Protocol):
    def view(self, observer: str) -> dict[str, Any] | None: ...


@dataclass(frozen=True)
class ActorView:
    x: float
    y: float
    z: float
    cell: str


@dataclass(frozen=True)
class Pos:
    x: float
    y: float
    z: float


@dataclass(frozen=True)
class InventoryView:
    entries: tuple[dict[str, Any], ...]  # labState inventory entries: {"baseId": int, "count": int}
    resolver: Any  # Callable[[str], int]: "File.esm:EditorID", int, or 0x-hex to a base id

    def count(self, spec: str) -> int:
        try:
            want = int(self.resolver(spec))
        except KeyError as e:
            raise AssertionData(str(e)) from e
        return sum(int(e.get("count", 0)) for e in self.entries if int(e.get("baseId", -1)) == want)


class _ServerRef:
    def __init__(self, facade: ServerFacade):
        self._f = facade

    def actor(self, client: str) -> ActorView:
        d = self._f.actor(client)
        if not d or not d.get("found", True):
            raise AssertionData(f"server has no actor for {client}")
        try:
            return ActorView(float(d["x"]), float(d["y"]), float(d["z"]), str(d["cell"]))
        except (KeyError, TypeError, ValueError) as e:
            raise AssertionData(f"actor record for {client} lacks {e}") from e

    def inventory(self, client: str) -> InventoryView:
        entries = self._f.inventory(client)
        if entries is None:
            raise AssertionData(f"server has no inventory for {client}")
        return InventoryView(tuple(entries), self._f.base_id)


class _ClientRef:
    def __init__(self, name: str, views: ViewsFacade):
        self.name = name
        self._views = views

    def _dump(self) -> dict[str, Any]:
        v = self._views.view(self.name)
        if v is None:
            raise AssertionData(f"{self.name} has not reported a dump-state yet")
        return v

    def sees(self, other: str) -> bool:
        return other in (self._dump().get("sees") or {})

    def view(self, other: str) -> Pos:
        seen = (self._dump().get("sees") or {}).get(other)
        if not seen:
            raise AssertionData(f"{self.name} does not see {other}")
        try:
            return Pos(float(seen["x"]), float(seen["y"]), float(seen["z"]))
        except (KeyError, TypeError, ValueError) as e:
            raise AssertionData(f"{self.name}'s view of {other} lacks {e}") from e


_ATTRS = {
    ActorView: {"x", "y", "z", "cell"},
    Pos: {"x", "y", "z"},
}
_METHODS = {
    _ServerRef: {"actor", "inventory"},
    _ClientRef: {"sees", "view"},
    InventoryView: {"count"},
}
_CMP = {
    ast.Eq: operator.eq, ast.NotEq: operator.ne, ast.Lt: operator.lt,
    ast.LtE: operator.le, ast.Gt: operator.gt, ast.GtE: operator.ge,
}
_BIN = {ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul, ast.Div: operator.truediv}


class Evaluator:
    def __init__(self, server: ServerFacade, views: ViewsFacade, clients: list[str]):
        self._names: dict[str, Any] = {"server": _ServerRef(server), "true": True, "false": False, "True": True, "False": False}
        for c in clients:
            self._names[c] = _ClientRef(c, views)

    def evaluate(self, expr: str) -> bool:
        try:
            tree = ast.parse(expr.strip(), mode="eval")
        except SyntaxError as e:
            raise AssertionSyntax(f"E_ASSERT_SYNTAX: {e.msg} in {expr!r}") from e
        value = self._eval(tree.body)
        if not isinstance(value, bool):
            raise AssertionSyntax(f"E_ASSERT_SYNTAX: expression is not a boolean: {expr!r}")
        return value

    def _eval(self, node: ast.AST) -> Any:
        if isinstance(node, ast.Constant):
            if isinstance(node.value, (bool, int, float, str)):
                return node.value
            raise AssertionSyntax(f"E_ASSERT_SYNTAX: constant {node.value!r} is not allowed")
        if isinstance(node, ast.Name):
            if node.id in self._names:
                return self._names[node.id]
            raise AssertionSyntax(f"E_ASSERT_SYNTAX: unknown name {node.id!r}")
        if isinstance(node, ast.UnaryOp):
            v = self._eval(node.operand)
            if isinstance(node.op, ast.USub) and isinstance(v, (int, float)) and not isinstance(v, bool):
                return -v
            if isinstance(node.op, ast.Not) and isinstance(v, bool):
                return not v
            raise AssertionSyntax("E_ASSERT_SYNTAX: unary operator not allowed here")
        if isinstance(node, ast.BinOp) and type(node.op) in _BIN:
            a, b = self._eval(node.left), self._eval(node.right)
            if not all(isinstance(x, (int, float)) and not isinstance(x, bool) for x in (a, b)):
                raise AssertionSyntax("E_ASSERT_SYNTAX: arithmetic on non-numbers")
            if isinstance(node.op, ast.Div) and b == 0:
                raise AssertionData("division by zero")
            return _BIN[type(node.op)](a, b)
        if isinstance(node, ast.BoolOp):
            vals = [self._eval(v) for v in node.values]
            if not all(isinstance(v, bool) for v in vals):
                raise AssertionSyntax("E_ASSERT_SYNTAX: and/or on non-booleans")
            return all(vals) if isinstance(node.op, ast.And) else any(vals)
        if isinstance(node, ast.Compare):
            left = self._eval(node.left)
            result = True
            for op, comp in zip(node.ops, node.comparators):
                if type(op) not in _CMP:
                    raise AssertionSyntax("E_ASSERT_SYNTAX: comparison operator not allowed")
                right = self._eval(comp)
                result = result and bool(_CMP[type(op)](left, right))
                left = right
            return result
        if isinstance(node, ast.Attribute):
            obj = self._eval(node.value)
            allowed = _ATTRS.get(type(obj))
            if allowed is None or node.attr not in allowed:
                raise AssertionSyntax(f"E_ASSERT_SYNTAX: attribute {node.attr!r} not allowed on {type(obj).__name__}")
            return getattr(obj, node.attr)
        if isinstance(node, ast.Call):
            if node.keywords:
                raise AssertionSyntax("E_ASSERT_SYNTAX: keyword arguments not allowed")
            if isinstance(node.func, ast.Name):
                if node.func.id == "abs" and len(node.args) == 1:
                    v = self._eval(node.args[0])
                    if isinstance(v, (int, float)) and not isinstance(v, bool):
                        return abs(v)
                    raise AssertionSyntax("E_ASSERT_SYNTAX: abs() of a non-number")
                raise AssertionSyntax(f"E_ASSERT_SYNTAX: call to {node.func.id!r} not allowed")
            if isinstance(node.func, ast.Attribute):
                obj = self._eval(node.func.value)
                methods = _METHODS.get(type(obj))
                if methods is None or node.func.attr not in methods:
                    raise AssertionSyntax(f"E_ASSERT_SYNTAX: method {node.func.attr!r} not allowed on {type(obj).__name__}")
                args = []
                for a in node.args:
                    if isinstance(a, ast.Name) and isinstance(self._names.get(a.id), _ClientRef):
                        args.append(a.id)  # a client name is passed as its name
                    else:
                        args.append(self._eval(a))
                if len(args) != 1 or not isinstance(args[0], str):
                    raise AssertionSyntax(f"E_ASSERT_SYNTAX: {node.func.attr} takes one client name or string")
                return getattr(obj, node.func.attr)(args[0])
            raise AssertionSyntax("E_ASSERT_SYNTAX: call form not allowed")
        raise AssertionSyntax(f"E_ASSERT_SYNTAX: {type(node).__name__} not allowed")


def clients_needing_views(expr: str, clients: list[str]) -> set[str]:
    """Which clients' dump-state an expression reads, so the runner refreshes them."""
    try:
        tree = ast.parse(expr.strip(), mode="eval")
    except SyntaxError:
        return set()
    needed: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) and node.func.attr in ("sees", "view"):
            base = node.func.value
            if isinstance(base, ast.Name) and base.id in clients:
                needed.add(base.id)
    return needed
