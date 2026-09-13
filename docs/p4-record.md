# P4 record: offline verification

Chat IMPL EVAL-RUN-RECORD P4 · 2026-09-13 · model Opus 5 (1M context), effort xhigh

## 1. The command

    npm ci
    node verify.mjs

`verify.mjs` (SHA-256 `90bac851…e897`) reads `package/retrieval.commitment.json` and
`package/recomputation.commitment.json`, and does the following:
- replaces global `fetch` with a stub that throws and counts;
- runs verify-core's `verifyRecord` per node, with the key registry carried in the bundle;
- prints checks #1, #2, #5, #7, #8, #9, #12, #13, #14 and #15;
- checks that each bundle's registry equals `package/trust-registry.json` and lists
  `package/public-key.txt`;
- checks that the recomputation node's `prov:wasDerivedFrom` target names the retrieval node's
  recomputed envelope hash.

It exits non-zero on any failure.

Three details:
- **#8.** The Rekor entry id is not passed, because `verifyRecord` looks an id up online
  (`verify.js`, step 3). The carried inclusion proof and entry body are passed instead. The script
  also checks that the entry body names this package's SHA-512 prehash, signature and key.
- **#9.** The retrieval node's BlobRef is resolved from `data/<log>` through the `fetch` handed to
  `verifyRecord`. That fetch never touches the network. Without the log, #9 reads `n/a`.
- **#15.** `producerProfile_bundle_unresolved` is printed with the marker `note`: shown, not
  counted as a failure (ruling D4).

## 2. Output, with the log in `data/`

Saved verbatim as `docs/verify-output.txt` (SHA-256 `8b58b94a…bc9b`); exit 0.

```
verify-core 0.9.0 (pinned 0.9.0), node 22.23.1

retrieval  package/retrieval.commitment.json
  #1 envelope integrity      ok    verified; recomputed 3637b5952f6a44e050fa0ac84d2ab58454ab7d29507dbbaf09147da7f8b37d48
  #2 signature               ok    valid (Ed25519ph, kid eval-run-example:ed25519-2026-09)
  #5 key status              ok    active in the registry carried in the bundle
  #7 RFC 3161 timestamp      ok    verified=true genTime=2026-09-13T22:07:34.000Z tsa=freetsa.org
  #8 Rekor inclusion         ok    inclusion=true checkpoint=true (rekor.sigstore.dev, tree 2700728023, leaf 2700728018); entry body names this hash, signature and key: true
  #9 BlobRef                 ok    output: data/S5QYXSvQBRSbUbXSnAGbMm.eval matches blob:sha256:93a9f3ca91499c42c533a882a04292efedf6218d74749bc0fa28350cfff1270d (15487293 bytes)
  #12 type                   ok    ok content/analysis/v1
  #13 node id                ok    nodeId equals the bundle's packageHash
  #14 signer identity        ok    ok https://github.com/npstorey (bindingTier pseudonymous)
  #15 captureMethod          note  producerProfile_bundle_unresolved: 'script-run' under 'scripted-recomputation/eval-run'; verify-core bundles no vocabulary for this profile
  registry                   ok    the bundle's registry equals package/trust-registry.json and lists package/public-key.txt

recomputation  package/recomputation.commitment.json
  #1 envelope integrity      ok    verified; recomputed abb93f781ae71480bf8075474facbb272f3dcc38d50eeecda79be33427924a9c
  #2 signature               ok    valid (Ed25519ph, kid eval-run-example:ed25519-2026-09)
  #5 key status              ok    active in the registry carried in the bundle
  #7 RFC 3161 timestamp      ok    verified=true genTime=2026-09-13T22:07:34.000Z tsa=freetsa.org
  #8 Rekor inclusion         ok    inclusion=true checkpoint=true (rekor.sigstore.dev, tree 2700728037, leaf 2700728033); entry body names this hash, signature and key: true
  #9 BlobRef                 n/a   no BlobRef fields
  #12 type                   ok    ok content/analysis/v1
  #13 node id                ok    nodeId equals the bundle's packageHash
  #14 signer identity        ok    ok https://github.com/npstorey (bindingTier pseudonymous)
  #15 captureMethod          note  producerProfile_bundle_unresolved: 'script-run' under 'scripted-recomputation/eval-run'; verify-core bundles no vocabulary for this profile
  registry                   ok    the bundle's registry equals package/trust-registry.json and lists package/public-key.txt

lineage
  wasDerivedFrom             ok    recomputation -> urn:eval-run-example:node:3637b5952f6a44e050fa0ac84d2ab58454ab7d29507dbbaf09147da7f8b37d48; retrieval's recomputed envelope hash 3637b5952f6a44e050fa0ac84d2ab58454ab7d29507dbbaf09147da7f8b37d48

network fetch calls: 0; BlobRef reads from data/: 1
result: all checks passed
```

## 3. Three further runs, in a scratch copy of the repository

| Run | Exit | Output that differs from section 2 |
|---|---|---|
| No `data/` (as in a fresh clone) | 0 | line 9 becomes `#9 BlobRef n/a output: not checked; data/S5QYXSvQBRSbUbXSnAGbMm.eval is not present (the log is not carried in the bundle)`; line 32 becomes `network fetch calls: 0; BlobRef reads from data/: 0`. Every other line is identical (`diff`). |
| One digit of the recomputation package's `summary` changed | 1 | `#1 envelope integrity FAIL altered`, `#13 node id FAIL` |
| The `prov:wasDerivedFrom` target replaced with 64 zeros | 1 | `#1 FAIL altered`, `#13 FAIL`, `wasDerivedFrom FAIL` |

## 4. Not shown

Headless browsers do not launch in this sandboxed session, so there is no screenshot of a
browser verifier. The text capture above stands.
