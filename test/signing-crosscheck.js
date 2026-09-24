// Cross-check for signing.js, run under gjs by `npm test`.
//
// test/unit.test.js asserts the very same literals through node:crypto. Two
// independent backends agreeing on every vector is what makes the Baidu and
// Youdao signatures trustworthy without holding real credentials: if GLib's
// checksum binding ever hashed UTF-16 or Latin-1 instead of UTF-8, the
// non-ASCII vectors below would diverge immediately — and non-ASCII source
// text is the normal case for these two providers, not an edge case.
import { md5Hex, sha256Hex, sha256Base64 } from "../signing.js";

function assertEq(actual, expected, what) {
    if (actual !== expected) {
        throw new Error(`${what}\n  expected: ${expected}\n  actual:   ${actual}`);
    }
}

// Published vectors.
assertEq(md5Hex("abc"), "900150983cd24fb0d6963f7d28e17f72", "md5Hex(abc)");
assertEq(
    sha256Hex("abc"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    "sha256Hex(abc)"
);
assertEq(sha256Base64("abc"), "ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0=", "sha256Base64(abc)");

// Non-ASCII: proves the digest is taken over UTF-8 bytes.
assertEq(md5Hex("你好"), "7eca689f0d3389d9dea66ae112e5cfd7", "md5Hex(你好)");
assertEq(
    sha256Hex("你好"),
    "670d9743542cae3ea7ebe36af56bd53648b0a1126162e78d81a32934a711302e",
    "sha256Hex(你好)"
);
assertEq(sha256Base64("你好世界"), "vspjNbIP9XzMR0A+9NnguPzLREKzFRwufVAFBnPUMXI=", "sha256Base64(你好世界)");

// The exact concatenations the two builders sign.
assertEq(
    md5Hex("20200101000000001" + "你好，世界！" + "1234567890" + "sk"),
    "6fbca6112e69977dfa9bb7eed92d64b8",
    "Baidu md5(appid+q+salt+secretKey)"
);
assertEq(
    sha256Base64("testkey" + "你好，世界！" + "s1" + "1700000000" + "testsecret"),
    "w/FeaKVy9lfFBIqTNBzm6/DCXcLSe98qztzhsZ0ahYw=",
    "Youdao base64(sha256(appKey+q+salt+curtime+appSecret))"
);

console.log("✅ GLib signing primitives match the node:crypto known-answer vectors");
