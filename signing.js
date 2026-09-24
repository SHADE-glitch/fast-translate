/**
 * Hash primitives for the translation providers that sign their requests.
 * GJS-only: imports GLib, so this module must never be imported by
 * translation-helper.js or anything test/unit.test.js loads (unit.test.js runs
 * under plain Node, where gi:// is unavailable).
 *
 * The request builders in translation-helper.js take these as an injected
 * `hash` argument instead, which keeps them pure and unit-testable in Node
 * against the same known-answer vectors. extension.js passes `hashBundle`.
 *
 * GJS binding notes, each verified on GNOME Shell 50.1 rather than assumed:
 *   - GLib.compute_checksum_for_string(type, str, -1) does take the length.
 *   - GLib.compute_hmac_for_data(digestType, keyBytes, dataBytes) takes THREE
 *     arguments — the (ptr, len) pairs are collapsed. The C-style five-argument
 *     call throws "Too many arguments ... expected 3, got 5".
 *   - GLib.compute_hmac_for_string does NOT collapse the key length and needs
 *     four arguments, so compute_hmac_for_data is the one to use; it also
 *     accepts raw binary keys, which Tencent's TC3 derivation chain requires.
 *   - GLib.base64_encode takes a Uint8Array.
 * So HMAC-SHA1/SHA256 are available natively when Tencent (TC3-HMAC-SHA256),
 * Aliyun (HMAC-SHA1 RPC) or Huawei (SDK-HMAC-SHA256) get added; no dependency
 * and no hand-rolled crypto will be needed. Only what the current providers use
 * is exported here.
 *
 * Known-answer vectors this module reproduces (asserted in test/unit.test.js
 * against node:crypto, and cross-checked through gjs):
 *   md5("abc")       = 900150983cd24fb0d6963f7d28e17f72
 *   sha256("abc")    = ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad
 *   sha256Base64("abc") = ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0=
 *   base64("abc")    = YWJj
 */

import GLib from "gi://GLib";

function hexToBytes(hex) {
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i++) {
        out[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
    }
    return out;
}

export function md5Hex(str) {
    return GLib.compute_checksum_for_string(GLib.ChecksumType.MD5, str, -1);
}

export function sha256Hex(str) {
    return GLib.compute_checksum_for_string(GLib.ChecksumType.SHA256, str, -1);
}

/** SHA-256 as base64 over the RAW digest bytes, not its hex text — this is how
 *  Youdao's v3 signature is defined. */
export function sha256Base64(str) {
    return GLib.base64_encode(hexToBytes(sha256Hex(str)));
}

/** Handed to translation-helper.js's request builders. */
export const hashBundle = { md5Hex, sha256Base64 };
