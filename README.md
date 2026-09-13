# typedstandards-eval-run-example

This repository turns one public AI benchmark evaluation run into two signed
[Typed Standards](https://typedstandards.org) record packages that are independently checkable
offline.
- **The run.** Epoch AI Benchmarking Hub run `S5QYXSvQBRSbUbXSnAGbMm`, which the hub lists as
  Llama-3.1-405B-Instruct on GPQA Diamond (198 questions, 16 epochs).
- **The two records.** The first pins the hub's published Inspect log and the hub data file
  that publishes the run's score. The second records a recomputation of accuracy from the log's
  per-sample grades (1613/3168, equal to the published `mean_score`) and links back to the first.
- **The check.** Each record carries its signature, an RFC 3161 timestamp, a Rekor
  transparency-log inclusion proof and the signing key's registry entry. After `npm ci`, checking
  both takes one command with no network access: `node verify.mjs`.

## What this record proves / what it does not

**Attested**: checkable by anyone from the signed bundles, or from a local copy of a pinned file.
**Asserted**: stated inside the signed bytes, but resting on the word of the party that states it.
**Not covered**: nothing in this repository addresses it.

| Property | Status | Why |
|---|---|---|
| File integrity | Attested | The retrieval record signs the SHA-256 and byte count of the evaluation log and of the hub data file, so any copy of either can be checked; this covers the bytes in hand, not the route they came by (the log was downloaded in a browser, and no HTTP headers were recorded). |
| The log's blob reference (check #9) | Attested (local copy only) | The retrieval record's BlobRef URL is the hub's published log link, which refuses scripted requests, so an online blob check reports `fetch_failed`; `verify.mjs` checks a local copy in `data/` instead, and the copy used here matches the pinned hash. |
| Analysis code identity | Attested | The recomputation record signs the script's SHA-256, the commit that froze it before it ran, the input log's SHA-256 and the output byte for byte, and rerunning the script on the pinned log reproduces that output exactly. |
| Lineage | Attested | The recomputation record's signed PROV-O graph has a `prov:wasDerivedFrom` edge to the retrieval record's envelope hash, and `verify.mjs` checks that edge against the hash it recomputes. |
| Signer identity and tier | Asserted | Both records verify under one self-generated Ed25519 key, but the only link from that key to the GitHub account it names is this repository, so the `pseudonymous` tier is the key holder's own claim. |
| Timestamp | Attested | For each envelope hash, a FreeTSA RFC 3161 token (2026-09-13T22:07:34Z) and a Rekor entry (integrated 22:07:35Z) verify offline against keys pinned in verify-core; they show when the records existed, not when the evaluation ran or when the log was downloaded. |
| Model identity | Asserted | The model name comes from the log's header (`hyperbolic/meta-llama/Meta-Llama-3.1-405B-Instruct`) and the hub's table (`Llama-3.1-405B-Instruct`); both are the source's statements, and no file here shows which weights produced the answers. |
| Execution environment | Asserted | `captureMethod: script-run` is a signed label, tamper-evident but verified by nothing; no runtime attestation covers the evaluation run or the recomputation, and verify-core reports `producerProfile_bundle_unresolved` because it has no vocabulary for this profile. |
| Correctness of the published score | Not covered | The recomputation shows that the published `mean_score` equals the mean of the per-sample grades in the pinned log, not that any grade, the grading method, or the benchmark's answer key is correct. |

## What a second party could add

- **A second signer.** An evaluation organisation that retrieves the same log and signs its own
  retrieval record over the same SHA-256 would make file integrity and model identity
  cross-evaluator rather than single-signer.
- **A runtime attestation.** A record signed by the evaluation harness when the run finished,
  naming the log's hash, would move the log's origin from asserted to attested.
- **A TEE.** Running the evaluation or the recomputation inside hardware-isolated execution that
  issues a signed quote would give the execution-environment row something to check.
- **A scriptable public log route.** If the source served its published log link to scripts,
  retrieval could be reproduced without a browser, and the blob check would pass online.

## Reproduction

Node 22 and npm for verification; Python 3 (standard library) for the corpus and the
recomputation.

    git clone https://github.com/npstorey/typedstandards-eval-run-example
    cd typedstandards-eval-run-example
    npm ci                  # the two pinned packages, from the lockfile
    node verify.mjs         # offline; exits 0 when every check passes

Without the log, check #9 reads `n/a` and the count of reads from `data/` is 0. Every other line
matches `docs/verify-output.txt`.

To check the data and the recomputation as well:

1. **Get the log by hand.** Retrieval is manual:
   - The hub's published link
     (`https://epoch-benchmarks-production-public.s3.us-east-2.amazonaws.com/inspect_ai_logs/S5QYXSvQBRSbUbXSnAGbMm.eval`)
     answers `AccessDenied` to scripts.
   - Open `https://logs.epoch.ai/inspect_ai_logs/S5QYXSvQBRSbUbXSnAGbMm.eval` in a browser,
     complete the host's human-verification step, and save the file as
     `data/S5QYXSvQBRSbUbXSnAGbMm.eval`.
   - A copy from any route can be checked against the pinned hash:
     `shasum -a 256 data/S5QYXSvQBRSbUbXSnAGbMm.eval` should print
     `93a9f3ca91499c42c533a882a04292efedf6218d74749bc0fa28350cfff1270d` (15,487,293 bytes).
2. **Check both files against the manifest.** Run `python3 corpus/fetch.py --restore`. It
   downloads the hub's current `benchmark_data.zip`, compares both files with
   `corpus/manifest.json`, and prints the manual step for a missing log.
   - The hub rebuilds that zip, so `--restore` reports a mismatch for the zip once the hub has
     rebuilt it since pinning, and exits non-zero. The first mismatch was seen at
     2026-09-13T22:24:02Z, 36 minutes after pinning.
   - The pinned SHA-256 (`e5120e5e…c6fb`), signed into the retrieval record, is then the only
     reference for the copy used here.
   - The run's row (`gpqa_diamond.csv` lines 440–442) can still be compared by eye in a newer
     copy.
3. **Rerun the recomputation.** Run `python3 analysis/recompute.py`, then
   `git diff --exit-code analysis/out/recomputation.json`. The output carries no timestamp, so a
   rerun on the pinned log is byte-identical.
4. **Verify again.** Run `node verify.mjs`; check #9 now compares the local log with the pinned
   hash.
5. **Optionally, rebuild the envelopes.** Run `node package/build.mjs check`. It rebuilds both
   envelopes, unsigned, from the committed inputs and the build log, and compares them with the
   signed packages.

## The two records

Both use `content/analysis/v1`, the one content node type verify-core recognises. The reserved
`content/evidence/v1` name is not used, so check #12 reads `ok`.

- **Retrieval record** (`package/retrieval.*`)
  - `output` is a BlobRef to the log.
  - `queries` lists the refused scripted request, the browser download and the zip download.
  - `extensions` carries the manifest facts, the size gate, the header identity checks, the
    published score with its source lines, and the model fields marked `asserted-from-source`.
- **Recomputation record** (`package/recomputation.*`)
  - `queries` names the script, its hash and the input hash.
  - `output` is `analysis/out/recomputation.json` inline.
  - `provenance` links the script, the retrieval record and the output.

Labels: `producerProfile: scripted-recomputation/eval-run`, `captureMethod: script-run`.

## Layout

- **`corpus/`:** the probe, the pinning script, the manifest and the header identity check.
- **`analysis/`:** the recomputation script and its output.
- **`package/`:**
  - the build script;
  - the signed packages and their commitment bundles;
  - the key registry and public key;
  - the build log;
  - every TSA and Rekor request and response, in `proofs/`.
- **`verify.mjs`:** the one-command check.
- **`docs/`:** phase records P0–P4, the P2 preregistration, the verify output, and the ledger of
  every external host contacted.

The signing seed is held outside the repository. `data/` is git-ignored: the log and the zip are
pinned by hash, not committed.

## Data, licences and citation

- **Code:** MIT (`LICENSE`).
- **Text:** CC BY 4.0 (`LICENSE-CC-BY-4.0.txt`).
- **`benchmark_data.zip`:** Epoch AI's data, under CC BY 4.0 as its `README.md` states.
- **The evaluation log:** its licence is not stated. The hub states CC BY 4.0 for its data and
  that benchmark questions and answers are the property of their respective creators; neither
  statement names the logs.

No question, choice or answer text from the log is committed. The recomputation output carries
identifiers, counts and scores only.

Cite the data as:

> Epoch AI, ‘Capabilities & Benchmarking’. Published online at epoch.ai. Retrieved from
> ‘https://epoch.ai/benchmarks’ [online resource].
