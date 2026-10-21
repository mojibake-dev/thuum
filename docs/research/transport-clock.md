# The transport's frozen clock (2026-10-21, found on the way to cell-host)

Status: CONFIRMED by source read (renet 2.0.0 and wire-transport), the fix
built on fork branch wire-renet-clock with a T0 that fails without it; the
lab's measurement (a probe under packet loss) pending.

## What

wire-transport's `Server::poll` and `Client::poll` called the transport's
update alone, `self.transport.update(dt, &mut self.renet)`
(crates/wire-transport/src/lib.rs:330 and :582 on 9ad635cd). renet's own loop
calls two updates a frame, `server.update(dt)` then `transport.update(dt,
&mut server)` (renet 2.0.0 README.md:76-78, :138-140), and the netcode
transport's update does not call renet's (renet_netcode 2.0.0
src/server.rs:85-111: netcode's own update, the socket drain, the clients'
netcode updates, the disconnections). `RenetServer::update` is the only
place every connection's `current_time` advances (src/server.rs:241-245 into
src/remote_connection.rs `update`: `self.current_time += duration`, the
stats, the discard of packets older than DISCARD_AFTER 3 s).

## So what

With `current_time` at zero for the life of every connection, on both ends:

- a lost reliable packet was never resent: the reliable channel resends a
  message only when `current_time - last_sent >= resend_time`
  (src/channel/reliable.rs:112-113 for a small message, :158-159 for a
  slice), and both stood at zero after the first send, so the check always
  skipped; "reliable" meant "sent once";
- every round trip read 0 (`RenetServer::rtt`, the EWMA in
  remote_connection.rs:444-465 over `current_time - sent_at`, both zero);
- no sent packet was ever discarded as lost (DISCARD_AFTER never reached),
  so the per-connection sent table only shrank on acks.

The lab's LAN loses nearly nothing, so none of it showed in a sweep; a
friend's connection over the internet would have lost reliable messages for
good (a cast's end, a teach, a death). Playtest six's "a lost end left an
observer's figure casting" (docs/verbs/spell-cast.md) is the symptom's shape.

## The fix

Fork branch wire-renet-clock (off m2-train-31 9ad635cd): `self.renet.update(dt)`
before the transport's update in both polls, renet's order; a `Server::
client_rtt_ms(client)` accessor (renet's rtt in seconds, converted without
`as`, None for a client not connected) for the cell-host handoff; a loopback
test, `the_connection_clock_advances_under_poll_and_the_round_trip_reads`,
reads a round trip above zero after a message's ack and was run once with
the update removed: it fails there (0), so it guards the fix. Nothing on the
wire changes (no message, no validator); T2 should read identical, since the
difftest's loopback loses nothing.

## The measurement to run (numidium, after the morning order)

A probe over b-spell's shape with `server.netem` losing packets (say 10
percent) on the stage before and after the fix: under loss, a reliable end
message (SpellCast with interruptCast, MsgType 23) lost on the way leaves
c2's figure of c1 casting until the watch ends (`c2.watched(c1).drainEndMs`
past the bound, b-spell's assertion), and a lost teach or ChangeValues
shows as a missing effect; with the fix every end arrives within the resend
time. Also `server.client_rtt_ms` through a stats line, once the bridge
exposes it (the cell-host verb's `IServer::GetRttMs`).

## Measured on parity before the fix (2026-10-21, numidium)

- x-renet-loss 20261021-182102 on merged parity 9ad635cd (no clock fix),
  both seats in tgm, 25 percent egress loss from the setup on, six 3 s
  Flames holds: red at round one, c2's figure of c1 never cast (drainMs 0,
  drainEndMs -1): a start never sent again under loss.
- x-renet-loss-control 20261021-182443, the same with no loss: green, all
  six rounds. So the before-reading's red is the loss and the missing
  resend, not the probe. The after-reading runs on cell-host's stage
  (fork m3-cell-host carries wire-renet-clock); a red there stages
  wire-renet-clock alone.
