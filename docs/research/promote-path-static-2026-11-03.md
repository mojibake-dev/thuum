# The promote path, read from the code (2026-11-03, thuum-cf)

A static read for ADR-064 system 1's model (a reference's life on a non-owning seat: promote and demote), beside numidium's
promote rows from the runs 052100, 055217 and 060106. Every row below is a HYPOTHESIS from the code until a run or a trace
confirms it (rule 2). Lines are the fork at m3-handoff-settle f609a339 (the settle's half (a) included); the parent union-srv-3
35509f7a has the same lines but the pass block's reliable send.

## What the server sends at each promotion

| Promotion | Where | What goes to the new simulator, in order | The record's position |
| --- | --- | --- | --- |
| A grant (a cell's host changes) | PartOne.cpp ApplyHostDecisions, HostKind::Grant (:1745-1760) | HostGrantMessage {cell, epoch} to the host; FlipHostedFlags: UpdateHoster per actor in the cell (the isHostedByOther property, true or false per listener, MpObjectReference.cpp:987-1013); ReplayHeldSightings | NOT SENT: no movement, no keyframe for the cell's actors |
| A pass (D9, a simulator's report into another host's cell) | ActionListener.cpp:558-583 (`passed`) | since the settle branch: the passing report's own bytes reliably to the new host's user (:569-573), then UpdateHoster (:574) | the passing report's position, reliably, ahead of the word (half (a)); on the parent nothing but the unreliable relay |
| A claim (ADR-052, npc-talk) | PartOne.cpp ClaimActor (:2542) | UpdateHoster(claimant) | NOT SENT |
| A claim's release or lease end | PartOne.cpp ReleaseClaim (:2552), ApplyHostDecisions ClaimEnded (:1788-1795) | UpdateHoster(SimulatorOf) | NOT SENT |
| A release (a host stops hosting) | ApplyHostDecisions HostKind::Release (:1762-1775) | HostReleaseMessage to the old host; FlipHostedFlags with no host (every listener hears "hosted by other") | NOT SENT |
| A subscription (a seat's grid reaches the actor) | PartOne.cpp onSubscribe (:1340-1380) | CreateActor with the record's movement (the keyframe), then the prop and preset words | the record's movement, once, at the subscription |

UpdateHoster itself carries no position: it is the property isHostedByOther, "false" to the simulator and "true" to every other
listener with a user (MpObjectReference.cpp:995-1012).

## What the client does when the word flips to "mine"

formView.ts:140-169 (the view's update, under npcHandoff):

1. `promotedNow` is the word's flip: isMine(model, refr) and model.isHostedByOther false while hostedBefore was not false (:154).
2. The reference is moved to `model.movement` (pos, rot, worldOrCell) through TESModPlatform.moveRefrToPosition ONLY IF the
   engine's cell of the reference differs from the record's cell (`engineCell !== model.movement.worldOrCell`, :155) AND the view
   has not moved it into that record cell before (`this.movedInto !== model.movement.worldOrCell`, :140, one attempt per record
   cell, :74-76). A stale position inside the same cell is never corrected at a promotion; a second drift into another cell after
   one correction is never corrected either.
3. `model.movement` is whatever the client last received for the form: the CreateActor's movement at the subscription, then every
   relayed UpdateMovement (remoteServer.ts:949 `form.movement = msg.data`, unreliable). Nothing marks it as the record at the
   moment of the word.
4. After the flip the engine leads: the host never hears its own reports, applyMovement is not imposed on a reference this seat
   simulates (formView.ts:142-148's reason), so the new host's first report is its ENGINE's position of the reference, wherever
   the engine had it.

## The two gaps the runs fit

- G1 (server): a grant, a claim, a release and a lease end send no position; only the pass does (since the settle branch). The
  new simulator promotes on whatever its model last held.
- G2 (client): the promotion's placement is conditional (a cell mismatch) and one-shot (movedInto). If the engine had the
  reference in another cell and the view had already moved it into the record's cell once, or if the engine's position is wrong
  inside the right cell, the promoted copy stands where the engine had it and its first report moves the record there.

055217 and 060106 (the grant case, both orientations): the new host's first report put Hod in 9732, an exterior cell, 180 ms and
38 ms after the grant, while the record stood indoors. By the code, either the engine of the new host had him outdoors (its own
schedule before the hosted word turned his AI off, or an earlier relayed sample applied to the copy) and the view's one-shot move
did not fire again (G2), or the model held an outdoor sample (G1 with a late unreliable relay). The runs' c1.log and c2.log tell
which: a "moved 1348a into 133c7" line before the grant means the one-shot fired earlier and could not fire again at the
promotion; none means the engine's cell equalled the record's at the promotion and the position inside it was wrong, or the model
was outdoors.

## The fix's shape (for after the rows)

- Server: at EVERY promotion the simulator-to-be receives the actor's record movement reliably before the UpdateHoster word: the
  pass's block already does it with the passing report; the grant's path does it for every actor in the cell (a keyframe from
  the record, the "first grant's keyframe" npc-handoff.md plans), the claim's, the release's and the lease end's for their actor.
- Client: at `promotedNow` the view imposes the received record on the reference unconditionally (no cell-mismatch gate, no
  movedInto one-shot for a promotion), then lets the engine lead. The settle (half (b)) stays as the safety net it was meant
  to be, and never protects a false exit, because no promotion starts from a stale copy.

## For the trace plan

- A Frida read is not needed for G1 and G2: the client's console log carries the "moved ... into" line, and a `npc-state` read of
  the interior seat's copy right after its teleport in and BEFORE its grant shows the engine's cell of Hod on the seat about to be
  promoted (if 9732 there, the engine had him outdoors before any word). That read belongs in the scenario's premise as a claim
  where the mechanism acts (the interior seat's copy in the interior before its grant).
- The order of the hosted word against the CreateActor's movement at a subscription is on the same reliable channel; a run with
  both stamps (the console's "moved" line and the server's grant line) settles whether the one-shot fired before the grant.
