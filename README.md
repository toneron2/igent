# igent.me contract

**The seam between an igent device and its portal: one WebTransport connection, a
heartbeat datagram, a control stream, an agent stream, three topics, and a verdict from
URGE on every call.** The contract stays the same at every deployment of the portal, so a
device built against it does not change when the portal moves.

| | |
|---|---|
| **Status** | Procurement in process. |
| **Version** | 1 (2026-09-25); [`contract.md`](contract.md), changes in §11 |
| **Transport** | WebTransport over HTTP/3: QUIC, TLS 1.3, UDP |
| **Heartbeat** | one datagram of at most 200 bytes, 1 to 50 Hz, carrying the bio-signature |
| **Session** | `authenticate0`, then `authorize0`: a closed set of capabilities per session |
| **Verdict** | URGE's, on every reply: `valid`, confidence, the expression, its notation, a trace hash |
| **Conformance** | [`examples/`](examples/) holds the fixtures; `node bin/check.mjs` measures them (Node 18 or later) |
| **Licence** | All rights reserved; patent pending. See [`LICENSE`](LICENSE) |

## What it covers

An igent is any device running the stack: a desktop portlet, a phone, a sensor head, a
drone, a vehicle ride-along. The portal, igent.me, is the one cloud-side thing each of them
talks to. The contract fixes the connection and its streams (§2), the session handshake
and its refusals (§3), the heartbeat and its three states (§4), the control stream's tools
and who owns each (§5), agent-to-agent messages (§6), the three topics (§7), the verdict
object (§8), the status line by reference (§9), the deployment rungs (§10), and how the
contract changes (§11).

## Check

```bash
node bin/check.mjs                                   # every fixture against the rules
node bin/check.mjs --spec path/to/status-line.md     # also §9's hash against the status-line specification
```

`index.html` renders the contract unchanged.

## Related

[URGE](https://github.com/toneron2/URGE) is the verdict engine.
[identities](https://github.com/toneron2/identities) specifies the status line (§9).
[broad](https://github.com/toneron2/broad) is the first service behind the portal.
[physicalized-agent](https://github.com/toneron2/physicalized-agent) is the first device.

## Contact

Tony Slosar · TODOMODO.IO AGENCY LLC · anthonyslosar@gmail.com · [t.me/toneron2](https://t.me/toneron2) · [slosars.me](https://slosars.me)
