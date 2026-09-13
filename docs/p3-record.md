# P3 record: the two record packages, signed, timestamped and logged

Chat IMPL EVAL-RUN-RECORD P3 · 2026-09-13 · model Opus 5 (1M context), effort xhigh

Node 22.23.1 runs `package/build.mjs`, with `@typedstandards/produce-core` 0.4.0 and
`@typedstandards/verify-core` 0.9.0 exactly as pinned (`package/build-log.json` lines 12–14).
Neither package was modified.

## 1. Stages

`package/build.mjs` has four stages, each refusing to overwrite its own outputs. They are split
so the permanent transparency-log entries go out only after both signed packages have verified
locally.

| Stage | Ran (UTC) | Does |
|---|---|---|
| `keygen` | 22:07:00 | seed outside the repository; `package/public-key.txt`, `package/trust-registry.json` |
| `assemble` | 22:07:05 | builds and signs both nodes; runs `verifyRecord` on each with no proofs and the network stubbed; writes the packages only if every check passes |
| `check` | after `assemble` | rebuilds both envelopes unsigned from the build log and the committed inputs, then compares |
| `prove` | 22:07:34–35 | FreeTSA token for both hashes, each verified offline, then Rekor for both; a saved response is never resubmitted |

Network requests go through curl with a header dump, as in `corpus/`.

## 2. Key and signer

- The seed is `~/.config/typedstandards-eval-run-example/signing.seed`: 32 bytes, mode 600,
  outside the repository, never printed. `*.seed` is also git-ignored.
- The public key is `MCowBQYDK2VwAyEA0af1lmbg+p+OQDcQUje+9f6CE1Wq5hFbPfDNBvsdOaw=`
  (`package/public-key.txt`; `package/trust-registry.json` line 6).
- The kid is `eval-run-example:ed25519-2026-09`. Its status is `active`, activated
  2026-09-13T22:07:00Z (registry lines 5–8).
- The signer is `{ bindingTier: 'pseudonymous', identifier: 'https://github.com/npstorey',
  displayName: 'Nathan Storey' }` (registry lines 11–15; each package's lines 11–15).
- The labels are `producerProfile: 'scripted-recomputation/eval-run'`,
  `captureMethod: 'script-run'` and `type: 'content/analysis/v1'` (each package's lines 7–10).

## 3. Build log

From `package/build-log.json`.

| Node | `packageId` | `createdAt` | Envelope hash | Lines |
|---|---|---|---|---|
| retrieval | `74a11e1f-c17e-469c-a78e-8f4a1f76773d` | 2026-09-13T22:07:05.696Z | `3637b5952f6a44e050fa0ac84d2ab58454ab7d29507dbbaf09147da7f8b37d48` | 40–42 |
| recomputation | `ab822abb-9c0f-485a-8012-008b51261f65` | 2026-09-13T22:07:05.697Z | `abb93f781ae71480bf8075474facbb272f3dcc38d50eeecda79be33427924a9c` | 52–54 |

The build read five inputs, and each hash matched the committed blob before any proof was
requested: `corpus/manifest.json` `28870354…`, `corpus/p1-identity.json` `f6c5ce1f…`,
`analysis/recompute.py` `bcc5ffae…`, `docs/p2-preregistration.md` `18cbf2e6…`, and
`analysis/out/recomputation.json` `54ab7c6f…`.

`assemble` output, verbatim:

    retrieval: envelope 3637b5952f6a44e050fa0ac84d2ab58454ab7d29507dbbaf09147da7f8b37d48  #1 verified  #2 true  #5 active  #9 true  #12 ok  #14 ok  #15 producerProfile_bundle_unresolved
    recomputation: envelope abb93f781ae71480bf8075474facbb272f3dcc38d50eeecda79be33427924a9c  #1 verified  #2 true  #5 active  #9 none  #12 ok  #14 ok  #15 producerProfile_bundle_unresolved
    lineage: recomputation wasDerivedFrom urn:eval-run-example:node:3637b5952f6a44e050fa0ac84d2ab58454ab7d29507dbbaf09147da7f8b37d48
    network fetch calls 0, local BlobRef reads 1

`check` output: `rebuilt envelope hash matches; package file matches` for both nodes.

## 4. The nodes

### Node A: retrieval record (`package/retrieval.package.json`)

- `output` (lines 74–79) is a BlobRef: `blob:sha256:93a9f3ca…270d`, `url` = the CSV's S3 link,
  `contentType: application/zip`, `size` 15,487,293. The content type rests on the file's ZIP
  signature, since no server header was recorded (line 111).
- `queries` (lines 22–51) lists three retrievals:
  - the scripted S3 request, `failed: true`, `failureKind: unavailable`, HTTP 403;
  - the browser download from `logs.epoch.ai`;
  - the curl download of the hub zip.
- `dataSources` (lines 52–69) holds the hub run at 2026-09-13T21:44:15Z and the hub zip at
  21:47:46Z.
- `extensions["io.github.npstorey.eval-run-example"]` (lines 84–211) carries:
  - `role: retrieval-record`;
  - the log facts with the absent headers stated;
  - the size gate and identity checks;
  - the hub zip row and the published score with its source lines;
  - `model.identifier` and `model.version`, each `basis: asserted-from-source` (lines 189–200).

### Node B: recomputation (`package/recomputation.package.json`)

- `queries` (lines 22–35) has one `script-run` entry. It names `analysis/recompute.py`,
  `scriptSha256` `bcc5ffae…`, `inputSha256` `93a9f3ca…`, the preregistration, and freeze commit
  `959b2bb`.
- `output` (line 49) is `analysis/out/recomputation.json` inline, byte for byte (SHA-256
  `54ab7c6f…`).
- `provenance` (lines 54–114) has four nodes:
  - an entity for node A, `urn:eval-run-example:node:<A's envelope hash>`;
  - an entity for the script by hash, also a `prov:Plan`;
  - one activity that `prov:used` both;
  - the recomputation entity, which `prov:wasGeneratedBy` the activity and
    `prov:wasDerivedFrom` node A (lines 107–111).
- `extensions` (lines 115–166) carries the script, preregistration, input and output hashes, both
  scores with their difference, and `derivedFrom` with A's envelope hash and `packageId`.
- The run times are the `date -u` stamps from `docs/p2-record.md` section 1, labelled as such
  (lines 159–163). `recompute.py` writes no timestamp.

## 5. Proofs

From `package/proofs/proof-log.json`, the header dumps, and the saved responses.

| | retrieval | recomputation |
|---|---|---|
| TSA request | 22:07:34Z, HTTP 200, `application/timestamp-reply` | 22:07:34Z, HTTP 200, same |
| Token (`<node>.tsr`) | 4,630 B; verified offline; genTime 2026-09-13T22:07:34Z; freetsa.org | 4,631 B; verified; genTime 22:07:34Z |
| Rekor request | 22:07:35Z, HTTP 201 | 22:07:35Z, HTTP 201 |
| Entry UUID | `108e9186e8c5677aecac2ae9104953af1138dae6409d85a24e519293bf8683c609282a7c69e7986c` | `108e9186e8c5677a222ca4ef003c262b1a98b14d7d165dbfa4e10b3a80445e66e9bddd1c78b11a14` |
| `logIndex` | 2822632280 | 2822632295 |
| `integratedTime` | 1789337255 (2026-09-13T22:07:35Z) | 1789337255 |
| Inclusion proof: tree size, leaf index | 2700728023, 2700728018 | 2700728037, 2700728033 |
| Inclusion, checkpoint (pinned `rekor.sigstore.dev` key) | verified, verified | verified, verified |
| Entry body names this hash (sha512 prehash), signature and key | yes | yes |

Nothing was refused and nothing was retried. Every request, proposal and response is kept in
`package/proofs/`.

## 6. Commitment bundles

`package/<node>.commitment.json` is the view from `buildCommitmentView` (`protocolVersion`
0.1.0, `visibility: public`). The package and key registry are carried inline, as in the offline
bundle fixtures: `package` from line 31 and `trustRegistry` from line 247 in the retrieval bundle.

- The bundle carries the RFC 3161 token, the Rekor entry id, the inclusion proof and the entry
  body (retrieval bundle lines 24–27).
- `trustRegistryUrl` is
  `https://raw.githubusercontent.com/npstorey/typedstandards-eval-run-example/main/package/trust-registry.json`
  (line 28). That URL resolves only once the repository is public. It sits outside the signed
  package and can be changed without re-signing.
- `packageUrl` is omitted, because the bundle carries the package.

## 7. Points for the owner

- **Check #9 online.** Node A's BlobRef URL is the hub's published S3 link, which answers
  `AccessDenied` to scripts. A verifier that resolves #9 over the network reports `fetch_failed`
  for it; the typedstandards.org verifier in bundle mode would attempt that fetch. `verify.mjs`
  reads the blob from `data/` when the log is there, and otherwise reports #9 as not checked.
  The URL is inside the signed bytes.
- **What verify-core's inclusion check covers.** `verifyRekorInclusion` confirms that a body is in
  the log, not that the body belongs to this package. `package/build.mjs` and `verify.mjs` add
  that binding check with verify-core's own `rekorHashForPackage`. No package change was needed.
- **Structure.** The brief names one `package/build.mjs` that builds, signs, timestamps and logs.
  It is one file, with the stages above.
