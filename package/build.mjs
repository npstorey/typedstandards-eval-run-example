#!/usr/bin/env node
// P3: build, sign, timestamp and log the two record packages.
//
//   node package/build.mjs keygen    generate the Ed25519 seed outside the repository (mode 600)
//                                    and write package/public-key.txt and package/trust-registry.json
//   node package/build.mjs assemble  build and sign both nodes, verify them locally without proofs,
//                                    write package/<node>.package.json and package/build-log.json
//   node package/build.mjs prove     RFC 3161 token from freetsa.org, then a Rekor hashedrekord entry,
//                                    for both envelope hashes; write package/<node>.commitment.json
//   node package/build.mjs check     rebuild both envelopes unsigned from the build log and compare hashes
//
// Stages refuse to overwrite their outputs. `prove` never resubmits: a saved response is reused.
// The two packages are pinned exactly: @typedstandards/produce-core 0.4.0, @typedstandards/verify-core 0.9.0.
// Network I/O is curl (as in corpus/), so each request keeps a header dump.
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildCommitmentView,
  buildEnvelope,
  buildRekorProposal,
  buildTimestampRequest,
  DCTERMS_NS,
  derivePublicKeySpki,
  makeActivityNode,
  makeEntityNode,
  makeProvContext,
  makeProvGraph,
  parseRekorResponse,
  PROV_NS,
  provUsed,
  provWasDerivedFrom,
  provWasGeneratedBy,
  signEnvelopeHash,
  XSD_NS,
  xsdDateTime,
} from '@typedstandards/produce-core';
import {
  base64ToBytes,
  parseInclusionProof,
  rekorHashForPackage,
  verifyRecord,
  verifyRekorInclusion,
  verifyRfc3161Timestamp,
} from '@typedstandards/verify-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PKG_DIR = path.join(ROOT, 'package');
const PROOFS = path.join(PKG_DIR, 'proofs');
const SEED_PATH = path.join(os.homedir(), '.config', 'typedstandards-eval-run-example', 'signing.seed');
const REGISTRY_PATH = path.join(PKG_DIR, 'trust-registry.json');
const BUILD_LOG = path.join(PKG_DIR, 'build-log.json');

const REPO = 'https://github.com/npstorey/typedstandards-eval-run-example';
const REGISTRY_URL = 'https://raw.githubusercontent.com/npstorey/typedstandards-eval-run-example/main/package/trust-registry.json';
const NS = 'io.github.npstorey.eval-run-example';
const KID = 'eval-run-example:ed25519-2026-09';
const SIGNER = { bindingTier: 'pseudonymous', identifier: 'https://github.com/npstorey', displayName: 'Nathan Storey' };
const TYPE = 'content/analysis/v1';
const PRODUCER_PROFILE = 'scripted-recomputation/eval-run';
const CAPTURE_METHOD = 'script-run';
const P2_FREEZE_COMMIT = '959b2bb2621a643df45d5385a8ea6338ea9da9d3';
// From docs/p2-record.md section 1 (`date -u` before and after the run); recompute.py writes no timestamp.
const P2_RUN = { startedAt: '2026-09-13T21:58:40Z', endedAt: '2026-09-13T21:58:41Z', basis: 'date -u before and after the run, docs/p2-record.md section 1' };
const NODES = ['retrieval', 'recomputation'];

const rel = (p) => path.relative(ROOT, p);
const sha256File = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const writeJson = (p, v) => fs.writeFileSync(p, JSON.stringify(v, null, 2) + '\n', { flag: 'wx' });
const now = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
const die = (msg) => {
  console.error(`stopped: ${msg}`);
  process.exit(1);
};

function keygen() {
  if (fs.existsSync(SEED_PATH)) die(`${SEED_PATH} exists; a key is already generated`);
  if (fs.existsSync(REGISTRY_PATH)) die(`${rel(REGISTRY_PATH)} exists`);
  fs.mkdirSync(path.dirname(SEED_PATH), { recursive: true, mode: 0o700 });
  const seed = crypto.randomBytes(32);
  fs.writeFileSync(SEED_PATH, seed, { mode: 0o600, flag: 'wx' });
  fs.chmodSync(SEED_PATH, 0o600);
  const publicKey = derivePublicKeySpki(new Uint8Array(seed));
  fs.writeFileSync(path.join(PKG_DIR, 'public-key.txt'), `${publicKey}\n`, { flag: 'wx' });
  writeJson(REGISTRY_PATH, {
    $comment: `Key registry for the record packages in ${REPO}. A verifier matches a signature's (kid, publicKey) pair against this list. The signing seed is held outside the repository.`,
    keys: [{ kid: KID, publicKey, status: 'active', activatedAt: now(), deprecatedAt: null, revokedAt: null, signerIdentity: SIGNER }],
  });
  const mode = (fs.statSync(SEED_PATH).mode & 0o777).toString(8);
  console.log(`seed written outside the repository (mode ${mode}); public key ${publicKey}`);
  console.log(`wrote package/public-key.txt and package/trust-registry.json`);
}

function loadInputs() {
  const manifest = readJson(path.join(ROOT, 'corpus', 'manifest.json'));
  const log = manifest.files.find((f) => f.artifact === 'inspect-eval-log');
  const zip = manifest.files.find((f) => f.artifact === 'hub-benchmark-data');
  const identity = readJson(path.join(ROOT, 'corpus', 'p1-identity.json'));
  const outPath = path.join(ROOT, 'analysis', 'out', 'recomputation.json');
  const outText = fs.readFileSync(outPath, 'utf8');
  const out = JSON.parse(outText);
  const inputs = {
    manifest: { path: 'corpus/manifest.json', sha256: sha256File(path.join(ROOT, 'corpus', 'manifest.json')) },
    identity: { path: 'corpus/p1-identity.json', sha256: sha256File(path.join(ROOT, 'corpus', 'p1-identity.json')) },
    script: { path: 'analysis/recompute.py', sha256: sha256File(path.join(ROOT, 'analysis', 'recompute.py')) },
    preregistration: { path: 'docs/p2-preregistration.md', sha256: sha256File(path.join(ROOT, 'docs', 'p2-preregistration.md')) },
    output: { path: 'analysis/out/recomputation.json', sha256: sha256File(outPath) },
  };
  if (out.script_sha256 !== inputs.script.sha256) die('recomputation.json was not written by the committed recompute.py');
  if (out.input.sha256 !== log.sha256) die('recomputation.json input does not match the manifest');
  return { manifest, log, zip, identity, out, outText, inputs };
}

function retrievalInput(ids, { log, zip, identity, inputs }) {
  const runId = identity.run_id;
  const pub = log.published_score;
  return {
    packageId: ids.packageId,
    createdAt: ids.createdAt,
    signingKeyId: KID,
    prompt: `Record the retrieval of the Epoch AI Benchmarking Hub's Inspect evaluation log for GPQA Diamond run ${runId}, and of the hub data file that publishes the run's score.`,
    promptVisibility: 'full_text',
    queries: [
      { tool: 'curl', operationType: 'retrieve', arguments: { url: log.url, request: 'GET Range: bytes=0-0', httpStatus: 403, evidence: 'corpus/probe/p0-probe.json' }, failed: true, failureKind: 'unavailable' },
      { tool: 'browser', operationType: 'retrieve', arguments: { url: log.url_retrieved, transport: log.transport } },
      { tool: 'curl', operationType: 'retrieve', arguments: { url: zip.url, httpStatus: zip.http_status } },
    ],
    dataSources: [
      { sourceId: 'epoch-ai-benchmarking-hub', catalogType: 'benchmark-hub', portalUrl: 'https://epoch.ai/benchmarks', datasetId: runId, datasetUrl: log.url, accessTimestamp: log.retrieved_at },
      { sourceId: 'epoch-ai-benchmarking-hub', catalogType: 'benchmark-hub', portalUrl: zip.page, datasetId: zip.file, datasetUrl: zip.url, accessTimestamp: zip.retrieved_at },
    ],
    cost: { model: 'none' },
    skillMetadata: {},
    output: { ref: `blob:sha256:${log.sha256}`, url: log.url, contentType: 'application/zip', size: log.bytes },
    trace: { resourceSpans: [] },
    summary: `Retrieval record for Epoch AI Benchmarking Hub run ${runId} (GPQA Diamond): the Inspect log pinned by SHA-256 ${log.sha256} (${log.bytes} bytes), and the hub's published mean_score ${pub.value}. Model identity is as the source asserts it.`,
    captureMethod: CAPTURE_METHOD,
    producerProfile: PRODUCER_PROFILE,
    type: TYPE,
    signer: SIGNER,
    extensions: {
      [NS]: {
        role: 'retrieval-record',
        repository: REPO,
        run: { hub: 'Epoch AI Benchmarking Hub', benchmark: 'GPQA Diamond', table: 'gpqa_diamond.csv', runId },
        log: {
          file: log.file,
          sha256: log.sha256,
          bytes: log.bytes,
          url: log.url,
          urlRetrieved: log.url_retrieved,
          transport: log.transport,
          retrievedAt: log.retrieved_at,
          retrievedAtBasis: log.retrieved_at_basis,
          httpHeaders: null,
          httpHeadersAbsent: log.http_headers_absent,
          scriptedRoute: log.scripted_route,
          secondRetrieval: log.second_retrieval,
          contentTypeBasis: 'the file begins with the ZIP local-file signature; no server Content-Type was recorded',
          sizeGate: log.size_gate,
          identityCheck: { pass: identity.pass, checks: identity.checks, logHeader: identity.log_header, csvRowLines: identity.csv_row_lines },
          licence: log.licence,
          licenceContext: log.licence_context,
          citation: log.citation,
        },
        hubDataFile: {
          file: zip.file,
          sha256: zip.sha256,
          bytes: zip.bytes,
          url: zip.url,
          retrievedAt: zip.retrieved_at,
          httpStatus: zip.http_status,
          httpContentLength: zip.http_content_length,
          httpEtag: zip.http_etag,
          licence: zip.licence,
          citation: zip.citation,
        },
        publishedScore: pub,
        model: { identifier: log.model_identifier, version: log.model_version },
        inputs: { manifest: inputs.manifest, identity: inputs.identity },
      },
    },
  };
}

function recomputationInput(ids, retrievalHash, { log, identity, out, outText, inputs }) {
  const runId = identity.run_id;
  const nodeA = `urn:eval-run-example:node:${retrievalHash}`;
  const script = `urn:eval-run-example:file:sha256:${inputs.script.sha256}`;
  const activity = `urn:eval-run-example:activity:recompute:${inputs.output.sha256}`;
  const result = `urn:eval-run-example:file:sha256:${inputs.output.sha256}`;
  const provenance = makeProvGraph(
    makeProvContext({ prov: PROV_NS, xsd: XSD_NS, dcterms: DCTERMS_NS, ex: `${REPO}#` }),
    [
      makeEntityNode(nodeA, { 'dcterms:description': 'Retrieval record node, identified by its envelope hash', 'ex:envelopeHash': retrievalHash }),
      makeEntityNode(script, { 'dcterms:title': inputs.script.path, 'dcterms:description': `Recomputation script, committed unrun in ${P2_FREEZE_COMMIT}`, 'ex:sha256': inputs.script.sha256 }, ['prov:Plan']),
      makeActivityNode(activity, {
        'dcterms:description': 'python3 analysis/recompute.py',
        'prov:startedAtTime': xsdDateTime(P2_RUN.startedAt),
        'prov:endedAtTime': xsdDateTime(P2_RUN.endedAt),
        ...provUsed([nodeA, script]),
      }),
      makeEntityNode(result, {
        'dcterms:title': inputs.output.path,
        'ex:sha256': inputs.output.sha256,
        ...provWasGeneratedBy(activity),
        ...provWasDerivedFrom([nodeA]),
      }),
    ],
  );
  return {
    packageId: ids.packageId,
    createdAt: ids.createdAt,
    signingKeyId: KID,
    prompt: `Recompute accuracy for GPQA Diamond run ${runId} from the per-sample scores in the pinned log, with the formula frozen in docs/p2-preregistration.md.`,
    promptVisibility: 'full_text',
    queries: [
      {
        tool: 'python3',
        operationType: 'script-run',
        arguments: {
          script: inputs.script.path,
          scriptSha256: inputs.script.sha256,
          input: out.input.file,
          inputSha256: out.input.sha256,
          preregistration: inputs.preregistration.path,
          freezeCommit: P2_FREEZE_COMMIT,
        },
      },
    ],
    dataSources: [
      { sourceId: 'retrieval-record', catalogType: 'record-package', portalUrl: REPO, datasetId: retrievalHash, accessTimestamp: P2_RUN.startedAt },
    ],
    cost: { model: 'none' },
    skillMetadata: {},
    output: outText,
    trace: { resourceSpans: [] },
    summary: `Recomputation for run ${runId}: ${out.recomputed_score_as_ratio} = ${out.recomputed_score} from the pinned log; the hub's published mean_score is ${out.published_score.value}; difference ${out.difference_recomputed_minus_published}. No claim is made about whether either score is correct.`,
    captureMethod: CAPTURE_METHOD,
    producerProfile: PRODUCER_PROFILE,
    type: TYPE,
    signer: SIGNER,
    provenance,
    extensions: {
      [NS]: {
        role: 'recomputation',
        repository: REPO,
        run: { hub: 'Epoch AI Benchmarking Hub', benchmark: 'GPQA Diamond', runId },
        script: { ...inputs.script, freezeCommit: P2_FREEZE_COMMIT },
        preregistration: inputs.preregistration,
        input: { path: out.input.file, sha256: out.input.sha256, bytes: out.input.bytes },
        output: inputs.output,
        scores: {
          recomputed: out.recomputed_score,
          recomputedFraction: out.recomputed_score_fraction,
          published: out.published_score,
          differenceRecomputedMinusPublished: out.difference_recomputed_minus_published,
          logHeaderAccuracy: out.log_header_metric.accuracy,
          differenceRecomputedMinusLogHeader: out.difference_recomputed_minus_log_header_accuracy,
        },
        derivedFrom: { role: 'retrieval-record', envelopeHash: retrievalHash, packageId: ids.retrievalPackageId },
        runTime: P2_RUN,
        claim: out.claim,
      },
    },
  };
}

function assembleBoth(ids, inputs) {
  const a = buildEnvelope(retrievalInput(ids.retrieval, inputs));
  const b = buildEnvelope(recomputationInput({ ...ids.recomputation, retrievalPackageId: ids.retrieval.packageId }, a.envelopeHash, inputs));
  return { retrieval: a, recomputation: b };
}

// A fetch for BlobRef check #9 that reads the blob from data/ instead of the network.
function localBlobFetch(counter) {
  return async (url) => {
    counter.calls += 1;
    const file = path.join(ROOT, 'data', path.basename(new URL(url).pathname));
    if (!fs.existsSync(file)) throw new Error(`not present locally: ${rel(file)}`);
    const buf = fs.readFileSync(file);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    return { ok: true, status: 200, headers: { get: () => null }, arrayBuffer: async () => ab, json: async () => JSON.parse(buf), text: async () => buf.toString('utf8') };
  };
}

async function assemble() {
  for (const n of NODES) if (fs.existsSync(path.join(PKG_DIR, `${n}.package.json`))) die(`package/${n}.package.json exists`);
  if (fs.existsSync(BUILD_LOG)) die('package/build-log.json exists');
  const inputs = loadInputs();
  for (const f of inputs.manifest.files) {
    if (sha256File(path.join(ROOT, 'data', f.file)) !== f.sha256) die(`data/${f.file} does not match the manifest`);
  }
  const registry = readJson(REGISTRY_PATH);
  const seed = new Uint8Array(fs.readFileSync(SEED_PATH));
  if (seed.length !== 32) die('the seed is not 32 bytes');
  if (derivePublicKeySpki(seed) !== registry.keys.find((k) => k.kid === KID)?.publicKey) die('the seed does not match the registry key');

  const ids = {};
  for (const n of NODES) ids[n] = { packageId: crypto.randomUUID(), createdAt: new Date().toISOString() };
  const built = assembleBoth(ids, inputs);

  // Local verification before any proof leaves the machine.
  const realFetch = globalThis.fetch;
  const network = { calls: 0 };
  const local = { calls: 0 };
  globalThis.fetch = (...args) => {
    network.calls += 1;
    throw new Error(`network blocked: ${String(args[0])}`);
  };
  const log = { kid: KID, signer: SIGNER, producerProfile: PRODUCER_PROFILE, captureMethod: CAPTURE_METHOD, type: TYPE, versions: versions(), inputs: inputs.inputs, nodes: {} };
  try {
    for (const n of NODES) {
      const { pkg, envelopeHash } = built[n];
      const signature = signEnvelopeHash(envelopeHash, seed, KID);
      const parsed = JSON.parse(JSON.stringify(pkg));
      const r = await verifyRecord({ package: parsed, packageHash: envelopeHash, signature }, { registry, fetch: localBlobFetch(local) });
      const blobOk = r.blobRefs.every((b) => b.ok);
      const ok = r.envelopeIntegrity.status === 'verified' && r.signatureValid === true && r.keyTrust?.status === 'active' &&
        r.typeResolution?.status === 'ok' && r.nodeId === envelopeHash && r.signerIdentity?.status === 'ok' &&
        r.captureMethodVocab?.status === 'producerProfile_bundle_unresolved' && blobOk;
      console.log(`${n}: envelope ${envelopeHash}  #1 ${r.envelopeIntegrity.status}  #2 ${r.signatureValid}  #5 ${r.keyTrust?.status}  #9 ${r.blobRefs.map((b) => b.ok).join(',') || 'none'}  #12 ${r.typeResolution?.status}  #14 ${r.signerIdentity?.status}  #15 ${r.captureMethodVocab?.status}`);
      if (!ok) die(`${n} did not verify locally; nothing written`);
      log.nodes[n] = { ...ids[n], envelopeHash, file: `package/${n}.package.json`, signature };
    }
  } finally {
    globalThis.fetch = realFetch;
  }
  const derived = built.recomputation.pkg.provenance['@graph'].find((x) => x['prov:wasDerivedFrom'])['prov:wasDerivedFrom'][0]['@id'];
  if (derived !== `urn:eval-run-example:node:${built.retrieval.envelopeHash}`) die('lineage edge does not name the retrieval node');
  console.log(`lineage: recomputation wasDerivedFrom ${derived}`);
  console.log(`network fetch calls ${network.calls}, local BlobRef reads ${local.calls}`);
  if (network.calls !== 0) die('a network fetch was attempted');

  for (const n of NODES) writeJson(path.join(PKG_DIR, `${n}.package.json`), built[n].pkg);
  writeJson(BUILD_LOG, log);
  console.log('wrote package/retrieval.package.json, package/recomputation.package.json, package/build-log.json');
}

function versions() {
  const v = (name) => readJson(path.join(ROOT, 'node_modules', '@typedstandards', name, 'package.json')).version;
  return { produceCore: v('produce-core'), verifyCore: v('verify-core'), node: process.versions.node };
}

function curl(args) {
  const out = execFileSync('curl', ['-sS', ...args, '-w', '%{http_code}'], { encoding: 'utf8' });
  return Number(out.trim());
}

async function prove() {
  const log = readJson(BUILD_LOG);
  const registry = readJson(REGISTRY_PATH);
  fs.mkdirSync(PROOFS, { recursive: true });
  const proofLogPath = path.join(PROOFS, 'proof-log.json');
  const proofLog = fs.existsSync(proofLogPath) ? readJson(proofLogPath) : { requests: [] };
  const saveLog = () => fs.writeFileSync(proofLogPath, JSON.stringify(proofLog, null, 2) + '\n');

  // RFC 3161, both nodes, before anything goes to the public log.
  for (const n of NODES) {
    const { envelopeHash } = log.nodes[n];
    const tsr = path.join(PROOFS, `${n}.tsr`);
    if (!fs.existsSync(tsr)) {
      const tsq = path.join(PROOFS, `${n}.tsq`);
      fs.writeFileSync(tsq, buildTimestampRequest(envelopeHash));
      const requestedAt = now();
      let status;
      try {
        status = curl(['--max-time', '10', '-D', `${tsr}.headers`, '-H', 'Content-Type: application/timestamp-query', '--data-binary', `@${tsq}`, '-o', `${tsr}.part`, 'https://freetsa.org/tsr']);
      } catch (e) {
        proofLog.requests.push({ node: n, service: 'freetsa.org', requestedAt, error: String(e.message).split('\n')[0] });
        saveLog();
        die(`TSA request for ${n} failed: ${String(e.message).split('\n')[0]}`);
      }
      proofLog.requests.push({ node: n, service: 'freetsa.org', requestedAt, httpStatus: status, headers: rel(`${tsr}.headers`) });
      saveLog();
      if (status !== 200) die(`TSA answered HTTP ${status} for ${n}`);
      fs.renameSync(`${tsr}.part`, tsr);
    }
    const token = fs.readFileSync(tsr).toString('base64');
    const t = await verifyRfc3161Timestamp(token, envelopeHash);
    console.log(`${n}: RFC 3161 verified=${t.verified} genTime=${t.genTime ? new Date(t.genTime).toISOString() : null} tsa=${t.tsa ?? null}${t.reason ? ` reason=${t.reason}` : ''}`);
    if (!t.verified) die(`the TSA token for ${n} does not verify; not submitting to Rekor`);
  }

  // Rekor, both nodes. A saved response is never resubmitted.
  for (const n of NODES) {
    const { envelopeHash, signature } = log.nodes[n];
    const response = path.join(PROOFS, `${n}.rekor-response.json`);
    if (!fs.existsSync(response)) {
      const proposal = path.join(PROOFS, `${n}.rekor-proposal.json`);
      fs.writeFileSync(proposal, JSON.stringify(buildRekorProposal(envelopeHash, signature.signature, signature.publicKey)));
      const requestedAt = now();
      let status;
      try {
        status = curl(['--max-time', '15', '-D', `${response}.headers`, '-H', 'Content-Type: application/json', '--data-binary', `@${proposal}`, '-o', `${response}.part`, 'https://rekor.sigstore.dev/api/v1/log/entries']);
      } catch (e) {
        proofLog.requests.push({ node: n, service: 'rekor.sigstore.dev', requestedAt, error: String(e.message).split('\n')[0] });
        saveLog();
        die(`Rekor request for ${n} failed: ${String(e.message).split('\n')[0]}`);
      }
      proofLog.requests.push({ node: n, service: 'rekor.sigstore.dev', requestedAt, httpStatus: status, headers: rel(`${response}.headers`) });
      saveLog();
      if (status !== 201) die(`Rekor answered HTTP ${status} for ${n}; response kept at ${rel(response)}.part`);
      fs.renameSync(`${response}.part`, response);
    }
    const parsed = parseRekorResponse(readJson(response));
    const proof = parseInclusionProof(parsed.inclusionProof);
    if (!proof || !parsed.entryBody) die(`the Rekor response for ${n} carries no usable inclusion proof or body`);
    const inclusion = verifyRekorInclusion(parsed.entryBody, proof);
    const binding = entryBinding(parsed.entryBody, envelopeHash, signature);
    console.log(`${n}: Rekor logIndex=${parsed.logIndex} inclusion=${inclusion.inclusionVerified} checkpoint=${inclusion.checkpointVerified} binding=${binding}`);
    if (!inclusion.inclusionVerified || !inclusion.checkpointVerified || !binding) die(`the Rekor proof for ${n} does not verify`);

    const pkg = readJson(path.join(PKG_DIR, `${n}.package.json`));
    const view = buildCommitmentView({
      packageHash: envelopeHash,
      visibility: 'public',
      captureMethod: pkg.metadata.captureMethod,
      producerProfile: pkg.producerProfile,
      type: pkg.type,
      signer: pkg.signer,
      contentHash: pkg.contentHash,
      contentCanonicalization: pkg.contentCanonicalization,
      signature,
      rfc3161Timestamp: fs.readFileSync(path.join(PROOFS, `${n}.tsr`)).toString('base64'),
      rekorEntryId: parsed.entryId,
      rekorInclusionProof: parsed.inclusionProof,
      rekorEntryBody: parsed.entryBody,
      trustRegistryUrl: REGISTRY_URL,
      subjectTitle: `${n === 'retrieval' ? 'Retrieval record' : 'Recomputation'}: Epoch AI Benchmarking Hub GPQA Diamond run ${pkg.extensions[NS].run.runId}`,
      subjectSummary: pkg.summary,
    });
    const bundle = path.join(PKG_DIR, `${n}.commitment.json`);
    if (fs.existsSync(bundle)) die(`${rel(bundle)} exists`);
    writeJson(bundle, { ...view, package: pkg, trustRegistry: registry });
    console.log(`wrote ${rel(bundle)}`);
  }
}

// The hashedrekord body names this package's Rekor hash, this signature and this key.
function entryBinding(entryBodyB64, envelopeHash, signature) {
  const body = JSON.parse(new TextDecoder().decode(base64ToBytes(entryBodyB64)));
  const pem = new TextDecoder().decode(base64ToBytes(body.spec?.signature?.publicKey?.content ?? ''));
  const der = pem.replace(/-----(BEGIN|END) PUBLIC KEY-----/g, '').replace(/\s+/g, '');
  return body.kind === 'hashedrekord' &&
    body.spec?.data?.hash?.algorithm === 'sha512' &&
    body.spec.data.hash.value === rekorHashForPackage(envelopeHash) &&
    body.spec.signature.content === signature.signature &&
    der === signature.publicKey;
}

function check() {
  const log = readJson(BUILD_LOG);
  const built = assembleBoth({ retrieval: log.nodes.retrieval, recomputation: log.nodes.recomputation }, loadInputs());
  let ok = true;
  for (const n of NODES) {
    const same = built[n].envelopeHash === log.nodes[n].envelopeHash;
    const onDisk = JSON.stringify(readJson(path.join(PKG_DIR, `${n}.package.json`))) === JSON.stringify(built[n].pkg);
    ok &&= same && onDisk;
    console.log(`${n}: rebuilt envelope hash ${same ? 'matches' : 'DIFFERS'}; package file ${onDisk ? 'matches' : 'DIFFERS'}`);
  }
  process.exit(ok ? 0 : 1);
}

const stage = process.argv[2];
if (stage === 'keygen') keygen();
else if (stage === 'assemble') await assemble();
else if (stage === 'prove') await prove();
else if (stage === 'check') check();
else die('usage: node package/build.mjs keygen|assemble|prove|check');
