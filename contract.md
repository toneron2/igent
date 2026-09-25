# The igent.me contract, version 0

**The seam between an igent and its portal: one WebTransport connection, a heartbeat
datagram, a control stream, an agent stream, three topics, and a verdict on every call.**
It is the one thing that stays the same at every rung of the ladder: while it holds,
moving the portal from A6 to Cloud Run changes a deployment, not a device. Consumed by
the portal, by every igent device, and by the igent.me site. Version 0 is for review, not
for building against; §11 says how it changes.

| | |
|---|---|
| **Transport** | WebTransport over HTTP/3 (QUIC, TLS 1.3, UDP): streams and datagrams on one connection |
| **Streams** | 0 heartbeat and governance · 1 data · 2 audio · 3 video; more by declaration (§2) |
| **Heartbeat** | one datagram, ≤ 200 bytes, 1 to 50 Hz, bio-signature inside (§4) |
| **Control** | MCP over stream 0, JSON-RPC 2.0, every call carrying a verdict id (§5) |
| **Agents** | A2A over stream 0, an agent card per identity (§6) |
| **Topics** | `security`, `control`, `heartbeat` (§7) |
| **Verdict** | URGE's: id, `valid`, `confidence`, notation, trace hash (§8) |
| **Status line** | the stream-0 event every igent renders, by reference (§9) |
| **Rungs** | 1–3 the portal is A6 behind OPNsense; 4 it is igent.me on Cloud Run; the contract is the same (§10) |

## 1. Terms

| Term | Means |
|---|---|
| igent | a device running the stack: the desktop portlet, the phone, the sensor head, the silent drone, Bolt Buddy |
| portal | igent.me: the Security Agent at its edge, the Routing Agent and everything below, service(n) behind |
| session | one WebTransport connection from one registered igent, from `authenticate0` to termination |
| register | the portal's list of known devices; an igent not on it gets no session (L2) |
| verdict | URGE's answer to one governance expression: `valid`, `confidence`, notation, trace |
| identity | one of the six (⚖️ Janus, 🐌 Oonia, 📖 Hermes, 📚 Curator, ⭐ Athena, 🔥 Helios); the faces the person sees |

## 2. The connection

One WebTransport session per igent, the igent as client, the portal as server. Streams
are opened by the igent at session start and kept for the session's life; the portal never
opens a stream the igent has not declared.

| Stream | Direction | Priority | Carries | Loss |
|---|---|---|---|---|
| datagram | igent → portal | highest | the heartbeat (§4) | unreliable by design: a missed one is information |
| 0 | both | critical | MCP control calls and replies (§5), A2A messages (§6), status-line events (§9), articulation commands down | reliable, ordered |
| 1 | igent → portal | high | the igent's data: the sensor head's vector map (JSON-LD), Bolt Buddy's bus state | reliable; the igent drops old frames before sending |
| 2 | igent → portal | normal | audio | reliable until RTP over QUIC is usable, then media |
| 3 | igent → portal | low | video | as 2 |
| 4+ | declared | declared | declared in `authenticate0` (§3) | declared |

An igent with no screen and no media, a wheelchair buddy for instance, opens the datagram
and stream 0 and nothing else. Every frame on a stream is one JSON object, UTF-8, newline
terminated; binary media on 2 and 3 is framed as the media profile says when there is one.

## 3. Session: `authenticate0`, `authorize0`

The first call on stream 0 is `authenticate0`; nothing else is answered before it. The
portal's Security Agent answers with a session or a refusal. `authorize0` follows once per
session and returns the capability set the igent may call, closed for the session.

```json
{ "jsonrpc": "2.0", "id": 1, "method": "authenticate0",
  "params": { "igent": "sh-0001", "role": 2, "hardware": "esp32p4:7c:df:a1:…",
              "bio": { "kind": "operator-presence", "sig": "…", "t": 1789564800000 },
              "streams": [0, 1, 2, 3], "contract": 0 } }
```

| Param | Rule |
|---|---|
| `igent` | the id on the register; unknown ids are refused before any other check |
| `role` | 0 system · 1 owner · 2 user; sub-users are `2.n` |
| `hardware` | the device's own identifier as the register recorded it; a phone is not on the hardware register (its MAC randomises) and sends its DHCP hostname, e.g. `Anthony-s-S23`; `examples/authenticate0-request-phone.json` |
| `bio` | the bio-signature the heartbeat will carry (§4); `kind` names the method; a phone sends fingerprint, voice or behavioural, a sensor head sends operator presence, a portlet sends none and gets role 1 or 2 by login |
| `streams` | the streams the igent will open |
| `contract` | this document's version; the portal refuses a version it does not serve |

A refusal is a JSON-RPC error with a verdict, never a bare code:

```json
{ "jsonrpc": "2.0", "id": 1,
  "error": { "code": 4030, "message": "denied",
             "data": { "verdict": { "id": "v-000001", "valid": false, "confidence": 255,
                                    "expr": "must device_registered and must contract_supported",
                                    "notation": "O(device_registered) ∧ O(contract_supported)",
                                    "trace": "sha256:…" } } } }
```

Error codes: `4010` not registered · `4030` denied by verdict · `4090` session exists for
this igent · `4260` contract version not served. On success:

```json
{ "jsonrpc": "2.0", "id": 1,
  "result": { "session": "5c1e7a90", "rate": { "idle": 1, "max": 50 }, "missed": { "degraded": 3, "terminated": 10 },
              "verdict": { "id": "v-000002", "valid": true, "confidence": 255,
                           "expr": "must device_registered and must contract_supported and must bio_signature_fresh",
                           "notation": "O(device_registered) ∧ O(contract_supported) ∧ O(bio_signature_fresh)",
                           "trace": "sha256:…" } } }
```

`authorize0` takes `{ "session" }` and returns `{ "capabilities": [ "route", "use", … ] }`:
the closed set for this session, per the igent's class and role (§5). A capability not in
the set is refused with `4030` when called; there is nothing to escalate to.

## 4. The heartbeat

One datagram, igent → portal, from the moment `authenticate0` succeeds until the session
ends. It is the continuous half of authentication: the device proves who is holding it
every few seconds rather than once at login.

```json
{ "s": "5c1e7a90", "n": 1042, "t": 1789564812345, "a": 1,
  "b": "Zm9vYmFy…", "h": { "cpu": 12, "temp": 41, "batt": 87, "rssi": -58 } }
```

| Field | Bytes | Rule |
|---|---|---|
| `s` | 8 | the session id |
| `n` | ≤ 10 | sequence, monotonic; the portal reads gaps as missed heartbeats |
| `t` | 13 | milliseconds since the epoch on the device clock |
| `a` | 1 | activity level: `1` idle · `5` light · `10` active · `25` intensive · `50` realtime; the value is also the rate in Hz |
| `b` | ≤ 88 | the bio-signature, base64, per the `kind` declared in `authenticate0`; absent on a portlet |
| `h` | ≤ 60 | health: what the igent has of `cpu` `temp` `batt` `rssi`, integers; anything else is stream-1 data |

**Budget: 200 bytes on the wire**, the ESN figure; `bin/check.mjs` measures the fixture
`examples/heartbeat.json` and prints the number. An igent
that cannot fit its bio-signature in `b` sends its hash and the full signature on stream 0
once per minute. **Rate**: the igent sends at the rate `a` names and may change `a` on any
datagram; the portal never asks for a rate, it reads one. `1` (IDLE) is the floor.

| State | Portal rule |
|---|---|
| ACTIVE | datagrams arriving within `2 / a` seconds of the last |
| DEGRADED | 3 missed in a row: the portal keeps the session, refuses new `use` and `execute` calls, and emits ⚖️ Janus `denied` on stream 0 with the reason |
| TERMINATED | 10 missed in a row, or a bio-signature that fails verification on 3 consecutive datagrams: the session is closed, the streams reset, and the next `authenticate0` starts over |

A bio-signature that weakens degrades before it terminates: the Security Agent's verdict
carries `confidence`, and the DEGRADED rule applies below the scheme's threshold. The
device side of this, the NOEVO shadow of the Security Agent, keeps the device safe on its
own when the link is down; what it may do alone is the device's interface document,
not this one.

## 5. The control stream: MCP

Stream 0 carries MCP as JSON-RPC 2.0, the igent as client. Every call carries the
session and, on the reply, the verdict that permitted or denied it. The initial tool
list is Screen.png's, one tool per agent verb, the agent's class deciding whether the set
is closed:

| Tool | Agent | Identity | Class | Scheme | Does |
|---|---|---|---|---|---|
| `authenticate0` `authorize0` | Security | ⚖️ Janus | NOEVO | 0 | §3; can block |
| `authenticate1` `authorize1` `manage0` `manage1` | User | 📖 Hermes | controlled | — | the person's own session and preferences |
| `route` | Routing | 🐌 Oonia | NOEVO | 1 | to a service or agent by an existing route only |
| `use` | Tool | 🐌 Oonia | NOEVO | 1 | a pre-made, locked, authorised tool |
| `execute` | Orchestrator | 🐌 Oonia | NOEVO | 1 | a governed plan across services |
| `record` | records | 📚 Curator | NOEVO | 1 | a FHIR resource or a trace into the ledger |
| `evaluate` | Logic Engine | ⚖️ Janus | NOEVO | 0 | URGE: a governance expression and slots in, a verdict out; replaces the nine ESN `*_Validate` tools of 2025 with one engine |
| `generate` | Designer | ⭐ Athena | EVO | 2 | a proposal: sketch, specify, test, deploy; nothing runs until Janus admits it |
| `compose` | Composer | 🔥 Helios | EVO | 3 | a workflow from parts; nothing runs until Janus admits it |
| `getlog` `tracklog` | Monitor / Ops | — | EVO | — | what the O&I planes read |
| `slew` `hold` | articulation | 🐌 Oonia routes, ⚖️ Janus verifies | NOEVO | 1 | portal → sensor head: a target vector and a rate; the device's state machine may refuse locally |

Every reply, success or error, carries `verdict` (§8). A call without a session is refused
`4010`; a call outside the `authorize0` set is refused `4030`. Tool schemas are the MCP
server's own and are not restated here; the contract fixes the names, the owner and the
verdict, so a device built against v0 knows what it may ask and what comes back.

## 6. The agent stream: A2A

Agent-to-agent traffic also rides stream 0, as A2A messages addressed by agent card. Each
identity publishes one card; a device's local agents (the User Agent, the NOEVO shadow)
publish theirs in `authenticate0`'s reply exchange.

```json
{ "name": "janus", "glyph": "⚖️", "class": "noevo", "scheme": 0,
  "capabilities": ["authenticate0", "authorize0", "evaluate"],
  "verdict_required": false, "endpoint": "stream:0" }
```

`verdict_required` is true on the EVO cards: a message from ⭐ Athena or 🔥 Helios is
delivered only with a Janus verdict attached (`by`, §9), and never to each other.

## 7. Topics

Three, the Sketch's, carried by Pub/Sub at rung 4 and by the portal process at rungs 1–3.

| Topic | Publishes | May subscribe | Carries |
|---|---|---|---|
| `security` | Security Agent | Monitor, Curator | every verdict, every refusal, every DEGRADED / TERMINATED transition |
| `control` | Routing, Orchestrator | the agents, Curator | calls, routes, plan steps, status-line events |
| `heartbeat` | the heartbeat receiver | Security Agent, Monitor | one message per state change per session, not per datagram |

An igent subscribes to nothing; what it needs comes back on its own stream 0.

## 8. The verdict

Every reply, every A2A delivery, every status line carries the same object, URGE's:

| Field | Rule |
|---|---|
| `id` | the portal's id for this evaluation; unique per session |
| `valid` | URGE's `valid` |
| `confidence` | URGE's, 0–255 |
| `expr` | the governance expression evaluated; the reader can re-run it |
| `notation` | URGE's `formal_notation` |
| `trace` | `sha256:` of the trace as Curator stored it; the audit record |

A verdict is never regenerated, summarised or paraphrased by a model. The engine at rung
1–3 is URGE as published; the engine version is in `authenticate0`'s reply when it differs
from the one this version of the contract was drafted against (0.1.1).

## 9. The status line, by reference

The stream-0 event every igent renders is specified once, in the identities layer:
`status-line.md`, version 0, sha256 `891001881456692d1511f54d287751a616d7fd0b03c43730f4bce0c0c7b31308`,
served beside its demonstration at `/external/identities/`. This contract carries it by
reference and restates none of it. Its verdict object is §8's.

## 10. Rungs

| Rung | igent | link | portal | What of this contract applies |
|---|---|---|---|---|
| 1 | desktop portlet | LAN | A6 | §3 by login, no `b`; stream 0; the status line in the portlet bar |
| 2 | S23 | 5G → WireGuard through OPNsense | A6 | all of it inside the tunnel; the tunnel is the stand-in, not the design |
| 3 | sensor head | WiFi 6, the pocket router | A6 | all of it; streams 1–3; `slew` `hold` down stream 0 |
| 4 | phone app or AOSP | 5G WebTransport | igent.me on Cloud Run | all of it, unchanged; Pub/Sub carries §7 |
| 5 | igent(n) | 5G | igent.me → service(n) | all of it |

## 11. Versions and conformance

`contract` in `authenticate0` is the version an igent speaks; the portal serves a set and
refuses the rest (`4260`). A change to a field, a code, a stream number or a rule is a
new version; a change to wording is not. The examples beside this document
(`examples/`) are the conformance fixtures: `bin/check.mjs` measures each against the
rules here (sizes, required fields, codes) and a consumer runs the same check on its copy.

| | Date | Change |
|---|---|---|
| v0 | 2026-09-21 | first draft; the status line by reference (§9) |
