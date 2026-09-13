#!/usr/bin/env node
// Verify this example's two record packages offline:  node verify.mjs
//
// Reads package/retrieval.commitment.json and package/recomputation.commitment.json. Each bundle
// carries its package, signature, RFC 3161 token, Rekor inclusion proof and entry body, and the key
// registry. Global fetch is replaced by a stub that throws and counts, so any network attempt shows.
// Runs @typedstandards/verify-core's verifyRecord per node, prints the spec §9.2 checks, then checks
// that the recomputation node's prov:wasDerivedFrom edge names the retrieval node's envelope hash.
// Exits non-zero on any failure.
//
// Check #9 (the retrieval node's BlobRef to the evaluation log) is resolved from data/ when the log is
// present there. The log is not carried in the bundle, so without it #9 is reported as not checked.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { base64ToBytes, parseInclusionProof, rekorHashForPackage, verifyRecord } from '@typedstandards/verify-core';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const NODES = ['retrieval', 'recomputation'];
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const iso = (ms) => new Date(ms).toISOString();

let networkCalls = 0;
globalThis.fetch = (...args) => {
  networkCalls += 1;
  throw new Error(`network blocked: ${String(args[0])}`);
};

// The BlobRef fetch for #9: bytes from data/, never the network.
let localReads = 0;
const localBlobFetch = async (url) => {
  const file = path.join(ROOT, 'data', path.basename(new URL(url).pathname));
  if (!fs.existsSync(file)) throw new Error(`not present: ${path.relative(ROOT, file)}`);
  localReads += 1;
  const buf = fs.readFileSync(file);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  return { ok: true, status: 200, headers: { get: () => null }, arrayBuffer: async () => ab, json: async () => JSON.parse(buf), text: async () => buf.toString('utf8') };
};

// The Rekor entry body names this package's hash, signature and key (verifyRekorInclusion checks
// only that the body is in the log).
function entryBinding(entryBodyB64, packageHash, signature) {
  const body = JSON.parse(new TextDecoder().decode(base64ToBytes(entryBodyB64)));
  const pem = new TextDecoder().decode(base64ToBytes(body.spec?.signature?.publicKey?.content ?? ''));
  const der = pem.replace(/-----(BEGIN|END) PUBLIC KEY-----/g, '').replace(/\s+/g, '');
  return body.kind === 'hashedrekord' && body.spec?.data?.hash?.algorithm === 'sha512' &&
    body.spec.data.hash.value === rekorHashForPackage(packageHash) &&
    body.spec.signature.content === signature.signature && der === signature.publicKey;
}

const failures = [];
// ok: true = passed, false = failed, null = not applicable or not checked, 'note' = passed with a stated degradation.
const line = (label, ok, text) => {
  if (ok === false) failures.push(label);
  const mark = ok === false ? 'FAIL' : ok === null ? 'n/a ' : ok === 'note' ? 'note' : 'ok  ';
  console.log(`  ${label.padEnd(26)} ${mark}  ${text}`);
};

const registryFile = read('package/trust-registry.json');
const publicKeyFile = fs.readFileSync(path.join(ROOT, 'package', 'public-key.txt'), 'utf8').trim();
const recomputed = {};
const bundles = {};

const pkgJson = read('package.json');
console.log(`verify-core ${read('node_modules/@typedstandards/verify-core/package.json').version} (pinned ${pkgJson.dependencies['@typedstandards/verify-core']}), node ${process.versions.node}`);

for (const n of NODES) {
  const b = read(`package/${n}.commitment.json`);
  bundles[n] = b;
  console.log(`\n${n}  package/${n}.commitment.json`);
  const registry = b.trustRegistry;
  const r = await verifyRecord(
    {
      package: b.package,
      packageHash: b.packageHash,
      signature: b.signature,
      rfc3161Timestamp: b.rfc3161Timestamp,
      rekorInclusionProof: parseInclusionProof(b.rekorInclusionProof),
      rekorEntryBody: b.rekorEntryBody,
    },
    { registry, fetch: localBlobFetch },
  );
  recomputed[n] = r.recomputedHash;

  line('#1 envelope integrity', r.envelopeIntegrity.status === 'verified', `${r.envelopeIntegrity.status}; recomputed ${r.recomputedHash}`);
  line('#2 signature', r.signatureValid === true, `${r.signatureValid ? 'valid' : 'invalid'} (${b.signature.algorithm}, kid ${b.signature.kid})`);
  line('#5 key status', r.keyTrust?.status === 'active', `${r.keyTrust?.status} in the registry carried in the bundle`);
  const t = r.rfc3161;
  line('#7 RFC 3161 timestamp', t?.verified === true, `verified=${t?.verified} genTime=${t?.genTime !== undefined ? iso(t.genTime) : 'none'} tsa=${t?.tsa ?? 'none'}${t?.reason ? ` reason=${t.reason}` : ''}`);
  const inc = r.rekorInclusion;
  const bound = entryBinding(b.rekorEntryBody, b.packageHash, b.signature);
  line('#8 Rekor inclusion', inc?.inclusionVerified === true && inc?.checkpointVerified === true && bound,
    `inclusion=${inc?.inclusionVerified} checkpoint=${inc?.checkpointVerified} (${inc?.origin ?? 'no anchor'}, tree ${inc?.treeSize}, leaf ${inc?.leafIndex}); entry body names this hash, signature and key: ${bound}`);
  if (r.blobRefs.length === 0) {
    line('#9 BlobRef', null, 'no BlobRef fields');
  } else {
    for (const ref of r.blobRefs) {
      const file = `data/${path.basename(new URL(ref.url).pathname)}`;
      if (!ref.ok && ref.reason === 'fetch_failed' && !fs.existsSync(path.join(ROOT, file))) {
        line('#9 BlobRef', null, `${ref.field}: not checked; ${file} is not present (the log is not carried in the bundle)`);
      } else {
        line('#9 BlobRef', ref.ok, `${ref.field}: ${ref.ok ? `${file} matches ${ref.ref} (${ref.size} bytes)` : ref.reason}`);
      }
    }
  }
  line('#12 type', r.typeResolution?.status === 'ok', `${r.typeResolution?.status} ${r.typeResolution?.type}`);
  line('#13 node id', r.nodeId === b.packageHash, `nodeId ${r.nodeId === b.packageHash ? 'equals' : 'differs from'} the bundle's packageHash`);
  line('#14 signer identity', r.signerIdentity?.status === 'ok', `${r.signerIdentity?.status} ${r.signerIdentity?.claimed} (bindingTier ${b.package.signer?.bindingTier})`);
  const cm = r.captureMethodVocab;
  line('#15 captureMethod', cm?.status === 'ok' ? true : cm?.status === 'producerProfile_bundle_unresolved' ? 'note' : false,
    `${cm?.status}: '${cm?.captureMethod}' under '${b.package.producerProfile}'${cm?.status === 'producerProfile_bundle_unresolved' ? '; verify-core bundles no vocabulary for this profile' : ''}`);
  const sameRegistry = JSON.stringify(registry) === JSON.stringify(registryFile) && registry.keys.some((k) => k.kid === b.signature.kid && k.publicKey === publicKeyFile);
  line('registry', sameRegistry, `the bundle's registry equals package/trust-registry.json and lists package/public-key.txt`);
}

console.log('\nlineage');
const graph = bundles.recomputation.package.provenance?.['@graph'] ?? [];
const targets = graph.flatMap((x) => x['prov:wasDerivedFrom'] ?? []).map((ref) => ref['@id']);
const expected = `urn:eval-run-example:node:${recomputed.retrieval}`;
line('wasDerivedFrom', targets.length === 1 && targets[0] === expected,
  `recomputation -> ${targets.join(', ') || 'none'}; retrieval's recomputed envelope hash ${recomputed.retrieval}`);

console.log(`\nnetwork fetch calls: ${networkCalls}; BlobRef reads from data/: ${localReads}`);
if (networkCalls !== 0) failures.push('network');
console.log(failures.length === 0 ? 'result: all checks passed' : `result: FAILED (${failures.join(', ')})`);
process.exit(failures.length === 0 ? 0 : 1);
