import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const verifier = resolve(root, 'scripts/verify-signing-test-cert-output.py');
const shaA = 'a'.repeat(64);
const shaB = 'b'.repeat(64);
const supported = [
  `Signer #1 certificate DN: CN=Disposable Test\nSigner #1 certificate SHA-256 digest: ${shaA}\n`,
  `Signer (minSdkVersion=24, maxSdkVersion=32) certificate SHA-256 digest: ${shaA}\n`,
  `Signer (minSdkVersion=24, maxSdkVersion=32) certificate SHA-256 digest: ${shaA}\nSigner (minSdkVersion=33, maxSdkVersion=35) certificate SHA-256 digest: ${shaA}\n`
];

function verify(input, expected = shaA) {
  return spawnSync('python3', [verifier], {
    encoding: 'utf8', input,
    env: { ...process.env, GT_SIGNING_TEST_EXPECTED_CERT: expected }
  });
}

for (const [index, sample] of supported.entries()) {
  test(`accepts expected cert in apksigner format ${index + 1}`, () => {
    const result = verify(sample);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /verification passed/);
    assert.doesNotMatch(result.stdout + result.stderr, /a{64}|b{64}/);
  });
}

test('accepts colon-separated uppercase expected certificate', () => {
  const expected = shaA.toUpperCase().match(/../g).join(':');
  assert.equal(verify(supported[0], expected).status, 0);
});

test('rejects a valid but unexpected APK certificate without exposing it', () => {
  const result = verify(supported[0], shaB);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /does not match/);
  assert.doesNotMatch(result.stdout + result.stderr, /a{64}|b{64}/);
});

test('rejects different certificates for different SDK ranges', () => {
  const result = verify(`Signer (minSdkVersion=24, maxSdkVersion=32) certificate SHA-256 digest: ${shaA}\nSigner (minSdkVersion=33, maxSdkVersion=35) certificate SHA-256 digest: ${shaB}\n`);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /different certificates/);
});

test('rejects a second numbered signer even when certificate is the same', () => {
  const result = verify(`Signer #1 certificate SHA-256 digest: ${shaA}\nSigner #2 certificate SHA-256 digest: ${shaA}\n`);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /more than one numbered/);
});

test('rejects extra numbered signer even if only its DN is shown', () => {
  const result = verify(`Signer #1 certificate SHA-256 digest: ${shaA}\nSigner #2 certificate DN: CN=Unknown\n`);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /more than one numbered/);
});

test('rejects missing and unknown certificate formats', () => {
  assert.match(verify('Verified using v2 scheme: true\n').stderr, /digest not found/);
  assert.match(verify(`Signer Unknown certificate SHA-256 digest: ${shaA}\n`).stderr, /unrecognized/);
});

test('rejects malformed expected values and truncated certificates', () => {
  assert.match(verify(supported[0], 'wrong').stderr, /malformed/);
  assert.match(verify('Signer #1 certificate SHA-256 digest: abc\n').stderr, /invalid APK certificate digest/);
});

test('documents why the previous strict pattern cannot read SDK-range output', () => {
  const legacy = /^Signer #1 certificate SHA-256 digest: (.*)$/m;
  assert.equal(legacy.exec(supported[1]), null);
  assert.equal(verify(supported[1]).status, 0);
});
