#!/usr/bin/env bash
# Manual, read-only GitHub Actions diagnostic for the disposable signing-test key.
# Does not build an APK, change secrets/variables, or print key material/digests.
set -Eeuo pipefail
set +x
umask 077
export LC_ALL=C

fail() { printf '%s\n' "FAIL: $*" >&2; exit 1; }
normalize_sha256() { printf '%s' "$1" | tr -d ':[:space:]' | tr '[:upper:]' '[:lower:]'; }

for tool in base64 keytool openssl mktemp; do
  command -v "$tool" >/dev/null 2>&1 || fail "Missing required verifier tool: $tool"
done
for name in GT_SIGNING_TEST_KEYSTORE_B64 GT_SIGNING_TEST_STORE_PASSWORD GT_SIGNING_TEST_KEY_ALIAS GT_SIGNING_TEST_EXPECTED_CERT; do
  [[ -n "${!name:-}" ]] || fail "Missing required signing-test configuration: $name"
done

expected="$(normalize_sha256 "$GT_SIGNING_TEST_EXPECTED_CERT")"
[[ "$expected" =~ ^[0-9a-f]{64}$ ]] || fail 'Public expected certificate SHA-256 is malformed.'
[[ -d "${RUNNER_TEMP:-}" ]] || fail 'Temporary directory is unavailable.'

keystore="$(mktemp "$RUNNER_TEMP/gt-signing-test-cert-XXXXXXXX.p12")"
trap 'rm -f -- "$keystore"' EXIT
if ! printf '%s' "$GT_SIGNING_TEST_KEYSTORE_B64" | base64 --decode > "$keystore"; then
  fail 'Stored test-only keystore could not be decoded.'
fi
[[ -s "$keystore" ]] || fail 'Stored test-only keystore is empty.'

# Keep the password in an environment variable, never a process argument.
if ! keytool -list -keystore "$keystore" -storetype PKCS12 \
    -storepass:env GT_SIGNING_TEST_STORE_PASSWORD \
    -alias "$GT_SIGNING_TEST_KEY_ALIAS" >/dev/null 2>&1; then
  fail 'Stored test-only keystore password, alias, or file is invalid.'
fi

# Cross-check two independently calculated hashes of the PUBLIC certificate.
# The original setup script obtains its value from keytool -list -v.
keytool_sha="$(keytool -list -v -keystore "$keystore" -storetype PKCS12 \
  -storepass:env GT_SIGNING_TEST_STORE_PASSWORD -alias "$GT_SIGNING_TEST_KEY_ALIAS" |
  sed -n 's/^[[:space:]]*SHA256:[[:space:]]*//p' | head -n 1)" || fail 'Could not read keytool certificate SHA-256.'
keytool_sha="$(normalize_sha256 "$keytool_sha")"
[[ "$keytool_sha" =~ ^[0-9a-f]{64}$ ]] || fail 'Invalid keytool certificate SHA-256.'

openssl_sha="$(keytool -exportcert -keystore "$keystore" -storetype PKCS12 \
  -storepass:env GT_SIGNING_TEST_STORE_PASSWORD -alias "$GT_SIGNING_TEST_KEY_ALIAS" 2>/dev/null |
  openssl x509 -inform DER -noout -fingerprint -sha256 |
  sed -n 's/^[^=]*=//p')" || fail 'Could not independently inspect public certificate.'
openssl_sha="$(normalize_sha256 "$openssl_sha")"
[[ "$openssl_sha" =~ ^[0-9a-f]{64}$ ]] || fail 'Invalid OpenSSL certificate SHA-256.'

[[ "$keytool_sha" == "$openssl_sha" ]] || fail 'Keytool/OpenSSL disagree on the public certificate. Stop before another APK build.'
if [[ "$keytool_sha" != "$expected" ]]; then
  fail 'BASELINE MISMATCH: uploaded TEST keystore certificate differs from the GitHub public fingerprint. No changes made.'
fi

printf '%s\n' 'BASELINE PASS: uploaded TEST keystore matches GitHub public certificate fingerprint.'
printf '%s\n' 'This verifies stored configuration only; the APK signer/parser from the failed run remains unverified.'
