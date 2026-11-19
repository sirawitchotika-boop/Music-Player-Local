#!/usr/bin/env bash
# Uses ONLY an existing, separately approved signing-test keystore.
# Never creates or rotates keys. Secrets are never printed.
set -euo pipefail
umask 077

for key in GT_SIGNING_TEST_KEYSTORE_B64 GT_SIGNING_TEST_STORE_PASSWORD GT_SIGNING_TEST_KEY_ALIAS GT_SIGNING_TEST_KEY_PASSWORD; do
  if [ -z "${!key:-}" ]; then
    echo "Signing test not configured: missing required GitHub Secret." >&2
    exit 1
  fi
done
if [ -z "$GT_SIGNING_TEST_EXPECTED_CERT" ]; then
  echo "Signing test not configured: missing public certificate fingerprint GitHub Variable." >&2
  exit 1
fi

keystore="${RUNNER_TEMP:?}/gt-soundmaster-signingtest.jks"
if ! printf '%s' "$GT_SIGNING_TEST_KEYSTORE_B64" | base64 --decode > "$keystore"; then
  rm -f "$keystore"
  echo "Signing test keystore could not be decoded." >&2
  exit 1
fi
if [ ! -s "$keystore" ]; then
  rm -f "$keystore"
  echo "Signing test keystore is empty." >&2
  exit 1
fi

if ! keytool -list -keystore "$keystore" \
   -storepass "$GT_SIGNING_TEST_STORE_PASSWORD" \
   -alias "$GT_SIGNING_TEST_KEY_ALIAS" >/dev/null 2>&1; then
  rm -f "$keystore"
  echo "Signing test keystore validation failed. No APK was signed." >&2
  exit 1
fi

cat >> android/app/build.gradle <<'GRADLE'
// Signing-test app ONLY; values read from environment at build time.
android {
    signingConfigs {
        signingTest {
            storeFile file(System.getenv("GT_SIGNING_TEST_KEYSTORE_FILE"))
            storePassword System.getenv("GT_SIGNING_TEST_STORE_PASSWORD")
            keyAlias System.getenv("GT_SIGNING_TEST_KEY_ALIAS")
            keyPassword System.getenv("GT_SIGNING_TEST_KEY_PASSWORD")
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.signingTest
        }
    }
}
GRADLE
# Only the temporary path, never key material or passwords.
echo "GT_SIGNING_TEST_KEYSTORE_FILE=$keystore" >> "$GITHUB_ENV"
echo "Existing signing-test keystore validated. Release signing configured."
