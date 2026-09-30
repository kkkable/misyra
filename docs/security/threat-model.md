# Misyra security threat model and abuse controls (MTS-110)

This document is the human-readable companion of [`threat-register.json`](./threat-register.json). The register is the source of truth: `scripts/threat-model-check.mjs` validates it, `pnpm test` proves it covers every component and maps every mitigation to a real ticket and, when mitigated, to an existing test, and the release gate below is computed from it.

**Scope.** MTS-110 created this threat model and the abuse-control budget. MTS-111 now enforces the classified request-rate/body budgets, webhook replay protection, security headers, media byte/dimension validation, key-rotation fallbacks, and explicit least-privilege role assertions. Later tickets remain responsible for threats mapped beyond MTS-111.

Current register: 28 threats, 24 mitigated, 3 planned, 1 accepted.

## Assets

| Asset | Why it matters | Where it lives |
|---|---|---|
| Session and refresh credentials | Account takeover | OS secure storage on device; only hashes on the server |
| Provider identity proofs (Apple, Google) | Sign-in trust | Verified server-side, never trusted from the client |
| Google Calendar tokens | Access to a user's external calendar | Encrypted at rest (AES-256-GCM) in PostgreSQL |
| Missions, evidence attempts, Story drafts | Private personal content | PostgreSQL and private blob containers, scoped per account |
| Evidence and Story working media | Private photos | Private blob containers, app-private device directories |
| Retained feedback and screenshots | Indefinite retention, optional email | Dedicated retained-feedback container, role restricted |
| AI provider budget | Direct cost | Server-side AI gateway, per-mission generation cap |
| Signing and encryption keys | Root of trust for tokens and uploads | Server configuration and Azure Key Vault (rotation hooks: MTS-111) |

## Trust boundaries

Each boundary is a place where data or authority crosses from a less-trusted to a more-trusted party. Every request crossing one must be authenticated, bounded, and validated by the receiving side.

| Boundary | Crossing | Primary controls |
|---|---|---|
| Mobile to API | All product traffic over HTTPS | Bearer session, server-authoritative rules, idempotency keys, declared rate and body budget |
| Public internet to API public routes | Auth exchange, refresh, sign-out, OAuth callback, Google webhook | Signature/proof verification, single-use state, channel token, strict per-origin budget |
| API to PostgreSQL | Account-scoped reads and writes | Composite account foreign keys, transactions, idempotency records |
| API and worker to blob storage | Media reads, uploads, cleanup | Container-scoped role assignments, signed short-lived upload authorizations |
| API to AI providers | Planner, evidence, Story requests | Strict schema validation of output, per-mission cap, user confirmation of drafts |
| API to Google Calendar | OAuth, sync, watch channels | Encrypted tokens, hashed single-use state, channel-token verified notifications |
| Mobile to Apple EventKit | On-device calendar access | Sync mutations through the normal authenticated path, no public Apple webhook |
| Feedback operators to retained feedback | Read-only operations access | Read-only role for a designated group, excluded from cleanup identity |

Components in scope: mobile, api, worker, database, blob, queues, providers, external-calendars. The queues component currently means the PostgreSQL transactional outbox and the on-device mutation queue; no Azure Storage Queue exists (T-QUE-02).

## Threat register

Status meanings: **mitigated** has a control and test evidence in the repository; **planned** has a named ticket that will deliver or verify the control; **accepted** is low or medium risk with a written rationale.

### mobile

| ID | Severity | Status | Threat | Tickets |
|---|---|---|---|---|
| T-MOB-01 | high | mitigated | Server secrets or provider credentials are shipped inside the mobile app bundle or binary. | MTS-034, MTS-110 |
| T-MOB-02 | medium | mitigated | Session or refresh tokens are read from device storage by other apps or from backups. | MTS-035, MTS-036 |
| T-MOB-03 | medium | planned | Evidence or Story working media becomes readable by unrelated apps through shared photo-library or external storage. | MTS-079, MTS-118 |
| T-MOB-04 | medium | mitigated | Diagnostics or logs leak tokens or private mission, evidence, or Story content. | MTS-105, MTS-007 |
| T-MOB-05 | medium | mitigated | Queued offline mutations are replayed or duplicated after retries, reconnects, or multi-device use. | MTS-025, MTS-030, MTS-031 |

### api

| ID | Severity | Status | Threat | Tickets |
|---|---|---|---|---|
| T-API-01 | high | mitigated | A stolen or replayed refresh token gives long-lived access to an account. | MTS-034, MTS-036 |
| T-API-02 | high | mitigated | A forged or unverified Apple or Google identity proof signs an attacker into a victim account. | MTS-034 |
| T-API-03 | medium | mitigated | A hijacked session deletes the account or its data. | MTS-037 |
| T-API-04 | high | mitigated | Credential stuffing, enumeration, cost abuse, or resource exhaustion targets public and authenticated API endpoints. | MTS-111 |
| T-API-05 | medium | mitigated | Oversized or malformed request bodies exhaust API memory or parsing time. | MTS-111 |
| T-API-06 | medium | mitigated | Server logs or audit records leak credentials or private content. | MTS-027, MTS-007 |
| T-API-07 | medium | mitigated | Missing security headers and no signing or encryption key rotation hooks. | MTS-111 |

### worker

| ID | Severity | Status | Threat | Tickets |
|---|---|---|---|---|
| T-WRK-01 | medium | mitigated | The cleanup job identity reaches storage or data beyond the working containers it must clean. | MTS-085, MTS-108 |
| T-WRK-02 | medium | mitigated | Cleanup deletes or retains the wrong media, leaving private content past its retention period. | MTS-085, MTS-099 |

### database

| ID | Severity | Status | Threat | Tickets |
|---|---|---|---|---|
| T-DB-01 | high | planned | One account reads or modifies another account's missions, evidence, or Story data through an identifier it should not reach. | MTS-113, MTS-118 |
| T-DB-02 | medium | planned | Indefinitely retained feedback, screenshots, and optional email create privacy and legal exposure, including after account deletion. | MTS-108, MTS-119 |
| T-DB-03 | medium | mitigated | Retried or duplicated requests apply an effect twice, such as double reward issuance. | MTS-025, MTS-058 |

### blob

| ID | Severity | Status | Threat | Tickets |
|---|---|---|---|---|
| T-BLOB-01 | high | mitigated | Malicious, mislabeled, or oversized images are stored and later processed, for example decompression bombs or non-image payloads with an image content type. | MTS-078, MTS-111 |
| T-BLOB-02 | high | mitigated | An attacker forges, tampers with, or replays an upload authorization to write media they should not. | MTS-078 |
| T-BLOB-03 | medium | mitigated | Managed identities hold broad storage access, so one compromised identity exposes every container. | MTS-006, MTS-108 |

### queues

| ID | Severity | Status | Threat | Tickets |
|---|---|---|---|---|
| T-QUE-01 | medium | mitigated | The transactional outbox delivers an event more than once or out of order. | MTS-025, MTS-026 |
| T-QUE-02 | low | accepted | A poisoned or replayed Azure Storage Queue message stalls a consumer or triggers unauthorized work. | MTS-004 |

### providers

| ID | Severity | Status | Threat | Tickets |
|---|---|---|---|---|
| T-PRV-01 | medium | mitigated | Hostile text or images in AI Planner input, Story text, or imported event titles manipulate model output. | MTS-056, MTS-087, MTS-089 |
| T-PRV-02 | medium | mitigated | Repeated AI Story generation for one mission drains the provider budget. | MTS-094 |

### external-calendars

| ID | Severity | Status | Threat | Tickets |
|---|---|---|---|---|
| T-CAL-01 | high | mitigated | Stored Google Calendar tokens are read from the database or backups. | MTS-069 |
| T-CAL-02 | medium | mitigated | The Google OAuth callback is forged or replayed to link an attacker's calendar to a victim account. | MTS-069 |
| T-CAL-03 | medium | mitigated | A spoofed Google webhook notification triggers unauthorized synchronization work. | MTS-071 |
| T-CAL-04 | low | mitigated | A captured valid webhook notification is replayed to cause repeated synchronization. | MTS-111 |

Residual risk, exact mitigations, and evidence files for each threat are in the register.

## Abuse controls

### Rate and body budget

Every `/v1` route and both health probes are assigned to one class below. A test enumerates the real routes from source with the TypeScript compiler and fails if a route is unclassified or a stale entry remains, so a new endpoint cannot ship without a budget. MTS-111 calibrates and enforces these values at the Fastify boundary.

| Class | Keyed by | Rate | Max body | Routes |
|---|---|---|---|---|
| `public-auth-exchange` | ip | 10 per 60 s | 16 KiB | 1 |
| `public-auth-session` | ip | 30 per 60 s | 4 KiB | 2 |
| `public-oauth-callback` | ip | 20 per 60 s | none | 1 |
| `public-webhook` | IP | 120 per 60 s | 8 KiB | 1 |
| `authenticated-read` | account | 300 per 60 s | none | 10 |
| `authenticated-write` | account | 120 per 60 s | 64 KiB | 12 |
| `account-sensitive` | account | 10 per 1 h | 4 KiB | 2 |
| `sync` | account | 60 per 60 s | 1 MiB | 5 |
| `media-upload-authorization` | account | 30 per 60 s | 8 KiB | 1 |
| `media-upload` | account | 30 per 60 s | 12 MiB | 1 |
| `feedback-submission` | account | 20 per 1 h | 12 MiB | 1 |
| `ai-request` | account | 30 per 1 h | 256 KiB | 4 |
| `health-probe` | ip | 600 per 60 s | none | 2 |

Public classes are keyed by network origin, never by account, and every public class stays at or below 120 requests per minute. Direct/test servers use the socket address. In Azure Container Apps, detected via its built-in runtime metadata, the API uses only the platform-appended rightmost `X-Forwarded-For` address and ignores earlier client-supplied values. Sensitive account operations (reauthentication and account deletion) are limited to 10 per hour.

### AI abuse

- At most three AI generation or regeneration requests per mission, enforced in the database.
- At most three images per AI Planner request.
- AI output is untrusted: validated against strict schemas, never executed, and always reviewed by the user before it changes data.

### Upload abuse

- Uploads require an HMAC-signed, short-lived authorization verified in constant time before any bytes are written.
- Media and feedback bodies are capped at 12 MiB; all other bodies have smaller declared ceilings.
- Protected media is allowlisted by supported image type and validated by matching file signature plus decoded dimensions before Blob storage.

### Account takeover

- Provider proofs are verified cryptographically; refresh tokens are hashed, rotated, and reuse-detected.
- Account deletion requires recent reauthentication.
- OAuth state is random, hashed, single-use, and expires after ten minutes.

### Secrets on the device

`scripts/mobile-secret-scan.mjs` provides two independent checks. `--env-only` proves mobile source reads only `EXPO_PUBLIC_*` (plus two allow-listed build-time names), and it runs inside `pnpm test`. Passing a built artifact directory scans bundles, Hermes bytecode, and assets for credential-shaped strings and server-only variable names. Findings report file, line, and rule only, never the matched value.

**Known limitation.** A real bundle cannot be produced yet: `expo export` fails because Metro cannot resolve the `.js` import specifiers that point at TypeScript sources, and CI's mobile build is only `tsc --noEmit`. The artifact scanner is therefore verified against seeded fixtures, and it must be run on the release-candidate build (MTS-118) once the app bundles.

## Release gate

A release candidate may not ship while any **high**-severity threat is not mitigated. This is computed, not judged: `releaseBlocking` must equal (severity is high and status is not mitigated), and validation rejects any register where it does not.

Unresolved high-risk threats after MTS-111:

- **T-DB-01** (database, privilege-escalation): One account reads or modifies another account's missions, evidence, or Story data through an identifier it should not reach. Cleared by MTS-113, MTS-118.

Commands:

- `node scripts/threat-model-check.mjs` validates the register and lists blockers.
- `node scripts/threat-model-check.mjs --release` also exits non-zero while any blocker remains; MTS-118 runs it as part of the release-candidate suite.

## Review checklist

Complete this list in every pull request that adds an endpoint, storage location, credential, AI input, or external integration, then update the register in the same pull request.

- [ ] New or changed route: added to `routeAbuseControls` with the strictest class that fits (a test fails otherwise).
- [ ] New public (unauthenticated) route: keyed by origin or channel, body bounded, replay considered.
- [ ] New secret or key: server-only, added to the mobile deny-list if it has a recognizable name, rotation path noted.
- [ ] New AI input or output: output schema-validated, not executed, user-confirmed, counted against a budget.
- [ ] New upload or media path: signed authorization, type and size validated, container-scoped identity.
- [ ] New identity or role assignment: least privilege, scoped to a container or resource, asserted by a test.
- [ ] New queue, job, or webhook: idempotent, authenticated, poison and replay cases recorded.
- [ ] New logging or diagnostics: contains no token, credential, or private content.
- [ ] Register updated: new threats added, statuses moved to mitigated only with test evidence.

## Maintenance

Add threats to `threat-register.json`, not only to this document. Moving a threat to **mitigated** requires at least one test file in its evidence list. High-severity threats cannot be accepted; they must be mitigated before release. Re-review the register whenever a component is added (for example, a real Azure Storage Queue).
