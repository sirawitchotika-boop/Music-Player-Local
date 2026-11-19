#!/usr/bin/env python3
"""Validate apksigner --print-certs stdout against the public test-key SHA-256.

Parse both signer-number and SDK-range output. Does not print certificate
values, accept private key material, or modify any files.

This verifier is intentionally NOT connected to an APK build until approved.
"""

import os
import re
import sys

SHA256 = re.compile(r"^[0-9a-f]{64}$")
DIGEST_LINE = re.compile(
    r"^Signer (?P<signer>#[1-9][0-9]*|\(minSdkVersion=[0-9]+,\s*maxSdkVersion=[0-9]+\))"
    r" certificate SHA-256 digest:\s*(?P<digest>[0-9a-fA-F: ]+)\s*$"
)
NUMBERED_SIGNER = re.compile(r"^Signer #([0-9]+) certificate ")


def normalize(value):
    return re.sub(r"[:\s]", "", value).lower()


def reject(reason):
    print(f"APK certificate verification failed: {reason}. No APK may be uploaded.", file=sys.stderr)
    return 1


def main():
    expected = normalize(os.environ.get("GT_SIGNING_TEST_EXPECTED_CERT", ""))
    if not SHA256.fullmatch(expected):
        return reject("expected public fingerprint is missing or malformed")

    digests = []
    for line in sys.stdin:
        line = line.strip()
        number = NUMBERED_SIGNER.match(line)
        if number and number.group(1) != "1":
            return reject("more than one numbered APK signer")
        if "certificate SHA-256 digest:" not in line:
            continue
        match = DIGEST_LINE.fullmatch(line)
        if not match:
            return reject("unrecognized certificate output format")
        digest = normalize(match.group("digest"))
        if not SHA256.fullmatch(digest):
            return reject("invalid APK certificate digest")
        digests.append(digest)

    if not digests:
        return reject("APK certificate digest not found")
    if len(set(digests)) != 1:
        return reject("different certificates reported across signer or SDK ranges")
    if digests[0] != expected:
        return reject("APK certificate does not match the configured public fingerprint")

    print("APK certificate verification passed: one expected TEST certificate across all reported signing ranges.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
