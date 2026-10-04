# presets

Appearance records for `set-appearance`, one JSON file per preset, exactly the
object `mp.get(actor, "appearance")` returns for a character made in the race
menu. Record them from a real client on the lab (`mp.get` through a labState
call, then save), never type form ids from memory. `lab-nord-1.json` is the
one the m0-appearance scenario names; it does not exist until recorded.

`lab-orc-2.json` is profile 2's look in the clean world since 2026-10-04: an
Orc made through the real race menu on sky-c2 (exploratory run
20261004-202843: the server opened the menu, Down picked Orc, the menu
closed), recorded from the server's record, so the two lab characters look
different for appearance checks.
