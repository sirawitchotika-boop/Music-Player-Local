#!/usr/bin/env python3
"""Validate apksigner --print-certs stdout against the public TEST fingerprint.

Supports legacy numbered signers, SDK-range signers, and Build Tools 37+
scheme-labeled signers. Source Stamp certificates are deliberately excluded:
they are not the APK's application signing identity.
"""

import os
import re
import sys

SHA256 = re.compile(r"^[0-9a-f]{64}$")
SIGNER_LABEL = (
    r"Signer #[1-9][0-9]*"
    r"|Signer \(minSdkVersion=[0-9]+(?: \(dev release=true\))?,\s*maxSdkVersion=[0-9]+\)"
    r"|V[0-9]+(?:\.[0-9]+)? Signer:"
)
DIGEST_LINE = re.compile(
    rf"^(?P<signer>{SIGNER_LABEL}) certificate SHA-256 digest:\s*"
    r"(?P<digest>[0-9a-fA-F: ]+)\s*$"
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
    seen_signer_entries = set()
    for line in sys.stdin:
        line = line.strip()

        # Source stamps use a separate certificate and must not be mistaken
        # for the APK's application signer.
        if line.startswith("Source Stamp Signer certificate "):
            continue

        number = NUMBERED_SIGNER.match(line)
        if number and number.group(1) != "1":
            return reject("more than one numbered APK signer")

        if "certificate SHA-256 digest:" not in line:
            continue
        match = DIGEST_LINE.fullmatch(line)
        if not match:
            return reject("unrecognized certificate output format")

        signer = match.group("signer")
        if signer in seen_signer_entries:
            return reject("duplicate signer entry for one signing scheme or SDK range")
        seen_signer_entries.add(signer)

        digest = normalize(match.group("digest"))
        if not SHA256.fullmatch(digest):
            return reject("invalid APK certificate digest")
        digests.append(digest)

    if not digests:
        return reject("APK application signer certificate digest not found")
    if len(set(digests)) != 1:
        return reject("different application certificates reported across signing schemes or SDK ranges")
    if digests[0] != expected:
        return reject("APK certificate does not match the configured public fingerprint")

    print("APK certificate verification passed: one expected TEST application certificate across all recognized signer formats.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
