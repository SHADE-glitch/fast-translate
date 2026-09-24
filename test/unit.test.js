import assert from "assert";
import crypto from "node:crypto";
import { parseCountryCode, buildRequestQuery, getFlagEmoji, formatLanguageLabel, parseLanguageName, buildGoogleRequest, mapDeepLFormality, buildDeepLRequestBody, normalizeDeepLSourceLang, PROVIDERS, getProvider, mapLangCode, youdaoTruncate, buildBaiduRequest, buildYoudaoRequest, parseProviderResponse } from "../translation-helper.js";

// Node-backed stand-in for signing.js's GLib bundle. translation-helper.js must
// stay free of gi:// imports because this file runs under plain Node, so the
// hash primitives are injected. test/signing-crosscheck.js runs the GLib side
// under gjs against the same literals, so the two backends are compared on
// every `npm test` rather than once by hand.
const nodeHash = {
    md5Hex: (s) => crypto.createHash("md5").update(s, "utf8").digest("hex"),
    sha256Base64: (s) => crypto.createHash("sha256").update(s, "utf8").digest("base64"),
};

// ==========================================
// 1. parseCountryCode Tests
// ==========================================
console.log("⏳ Running parseCountryCode tests...");

assert.strictEqual(parseCountryCode("English (EN)"), "EN", "Should extract EN");
assert.strictEqual(parseCountryCode("Spanish (ES)"), "ES", "Should extract ES");
assert.strictEqual(parseCountryCode("Portuguese Brazilian (PT-BR)"), "PT-BR", "Should extract PT-BR");
assert.strictEqual(parseCountryCode("Bulgarian (BG)"), "BG", "Should extract BG");
assert.strictEqual(parseCountryCode(null), null, "Should return null on null");
assert.strictEqual(parseCountryCode(""), null, "Should return null on empty string");
assert.strictEqual(parseCountryCode("NoParentheses"), null, "Should return null on missing parentheses");

console.log("✅ parseCountryCode tests passed successfully!\n");

// ==========================================
// 2. buildRequestQuery Tests
// ==========================================
console.log("⏳ Running buildRequestQuery tests...");

const params = {
    text: "hello world!",
    target_lang: "ES",
    auth_key: "abc-123",
    split_sentences: "1"
};

const query = buildRequestQuery(params);
assert.strictEqual(
    query, 
    "text=hello+world%21&target_lang=ES&auth_key=abc-123&split_sentences=1",
    "Should correctly format and escape URL search queries"
);

console.log("✅ buildRequestQuery tests passed successfully!\n");

// ==========================================
// 3. getFlagEmoji and formatLanguageLabel Tests
// ==========================================
console.log("⏳ Running getFlagEmoji and formatLanguageLabel tests...");

assert.strictEqual(getFlagEmoji("ES"), "🇪🇸", "ES should map to Spain flag");
assert.strictEqual(getFlagEmoji("EN"), "🇬🇧", "EN should map to UK flag");
assert.strictEqual(getFlagEmoji("EN-US"), "🇺🇸", "EN-US should map to US flag");
assert.strictEqual(getFlagEmoji("PT-BR"), "🇧🇷", "PT-BR should map to Brazil flag");
assert.strictEqual(getFlagEmoji("ET"), "🇪🇪", "ET should map to Estonia flag");
assert.strictEqual(getFlagEmoji("ZH"), "🇨🇳", "ZH should map to China flag");
assert.strictEqual(getFlagEmoji(null), "", "Null should return empty string");
assert.strictEqual(getFlagEmoji(""), "", "Empty string should return empty string");

assert.strictEqual(formatLanguageLabel("DE"), "🇩🇪 DE", "DE should be formatted as 🇩🇪 DE");
assert.strictEqual(formatLanguageLabel(null), "", "Null should be formatted as empty string");
assert.strictEqual(formatLanguageLabel(""), "", "Empty string should be formatted as empty string");

assert.strictEqual(parseLanguageName("English American (EN-US)"), "English American", "Should extract English American");
assert.strictEqual(parseLanguageName("Spanish (ES)"), "Spanish", "Should extract Spanish");
assert.strictEqual(parseLanguageName("NoParens"), "NoParens", "Should return string directly if no parentheses");
assert.strictEqual(parseLanguageName(null), "", "Null should return empty string");

console.log("✅ getFlagEmoji and formatLanguageLabel tests passed successfully!\n");

// ==========================================
// 4. buildGoogleRequest / mapDeepLFormality / buildDeepLRequestBody Tests
// ==========================================
console.log("⏳ Running request builder tests...");

// Google: URL shape, AUTO handling, form-urlencoded body (must stay "q=Hello"
// for the existing eval-test contract)
let g = buildGoogleRequest("EN", "ES", "Hello");
assert.strictEqual(
    g.url,
    "https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=es&dt=t",
    "Google URL should encode sl/tl lowercase"
);
assert.strictEqual(g.body, "q=Hello", "Google body must be form urlencoded q=Hello");
assert.strictEqual(g.contentType, "application/x-www-form-urlencoded");

g = buildGoogleRequest("AUTO", "ZH", "Hello world!");
assert.ok(g.url.includes("sl=auto&tl=zh"), "AUTO source should map to sl=auto");
assert.strictEqual(g.body, "q=Hello+world%21", "Google body must escape spaces and !");

// DeepL formality mapping (must stay omitted on default for eval-test contract)
assert.strictEqual(mapDeepLFormality("default"), undefined, "default formality must be omitted");
assert.strictEqual(mapDeepLFormality(null), undefined, "null formality must be omitted");
assert.strictEqual(mapDeepLFormality("more"), "prefer_more");
assert.strictEqual(mapDeepLFormality("less"), "prefer_less");
assert.strictEqual(mapDeepLFormality("formal"), "formal", "API values pass through");

// DeepL body: field-for-field parity with the old inline logic
let d = buildDeepLRequestBody({
    fromText: "Hello",
    sourceLang: "EN",
    targetLang: "ES",
    splitSentences: true,
    preserveFormatting: true,
    formality: "default",
});
assert.deepStrictEqual(d, {
    text: ["Hello"],
    target_lang: "ES",
    split_sentences: "1",
    preserve_formatting: true,
    source_lang: "EN",
}, "DeepL body should match inline logic; formality omitted on default");
assert.strictEqual(typeof d.preserve_formatting, "boolean", "preserve_formatting must stay boolean");

d = buildDeepLRequestBody({
    fromText: "Hello",
    sourceLang: "AUTO",
    targetLang: "ES",
    splitSentences: false,
    preserveFormatting: false,
    formality: "more",
});
assert.strictEqual(d.source_lang, undefined, "AUTO source must be omitted");
assert.strictEqual(d.split_sentences, "0");
assert.strictEqual(d.formality, "prefer_more");

// Regression: swapped regional target codes must not 400 as DeepL source
assert.strictEqual(normalizeDeepLSourceLang("EN-US"), "EN", "EN-US source must normalize to EN");
assert.strictEqual(normalizeDeepLSourceLang("EN-GB"), "EN", "EN-GB source must normalize to EN");
assert.strictEqual(normalizeDeepLSourceLang("PT-BR"), "PT", "PT-BR source must normalize to PT");
assert.strictEqual(normalizeDeepLSourceLang("EN"), "EN", "Base codes pass through");
d = buildDeepLRequestBody({
    fromText: "Hello",
    sourceLang: "EN-US",
    targetLang: "ES",
    splitSentences: true,
    preserveFormatting: true,
    formality: "default",
});
assert.strictEqual(d.source_lang, "EN", "Regional source must be normalized in the body");

console.log("✅ request builder tests passed successfully!\n");

// ==========================================
// 5. Provider registry / language mapping / signing
// ==========================================
console.log("⏳ Running provider registry tests...");

// Known-answer vectors. test/signing-crosscheck.js asserts these identical
// literals through signing.js's GLib backend under gjs, so `npm test` proves
// the two backends agree on every run rather than relying on a one-off manual
// check. That agreement is what makes the signatures verifiable with no
// credentials and no network. The non-ASCII vectors matter most: Baidu and
// Youdao are used mainly for Chinese source text, so a backend that hashed
// UTF-16 or Latin-1 instead of UTF-8 would be a silent, total failure.
assert.strictEqual(nodeHash.md5Hex("abc"), "900150983cd24fb0d6963f7d28e17f72");
assert.strictEqual(nodeHash.sha256Base64("abc"), "ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0=");
assert.strictEqual(nodeHash.md5Hex("你好"), "7eca689f0d3389d9dea66ae112e5cfd7");
assert.strictEqual(nodeHash.sha256Base64("你好世界"), "vspjNbIP9XzMR0A+9NnguPzLREKzFRwufVAFBnPUMXI=");
assert.strictEqual(
    nodeHash.md5Hex("20200101000000001" + "你好，世界！" + "1234567890" + "sk"),
    "6fbca6112e69977dfa9bb7eed92d64b8",
    "Baidu md5(appid+q+salt+secretKey) over non-ASCII q"
);
assert.strictEqual(
    nodeHash.sha256Base64("testkey" + "你好，世界！" + "s1" + "1700000000" + "testsecret"),
    "w/FeaKVy9lfFBIqTNBzm6/DCXcLSe98qztzhsZ0ahYw=",
    "Youdao base64(sha256(appKey+q+salt+curtime+appSecret)) over non-ASCII q"
);

// Registry values are append-only: gsettings stores the integer, so reordering
// would silently repoint a saved choice at a different service.
assert.deepStrictEqual(PROVIDERS.map(p => p.value), [0, 1, 2, 3]);
assert.deepStrictEqual(PROVIDERS.map(p => p.id), ["deepl", "google", "baidu", "youdao"]);
assert.strictEqual(getProvider(0).id, "deepl");
assert.strictEqual(getProvider(2).id, "baidu");
assert.strictEqual(getProvider(99), null);

// Language mapping. Unmapped codes must return null so the caller can say
// "unsupported" instead of sending a guessed code that fails opaquely.
assert.strictEqual(mapLangCode("baidu", "AUTO"), "auto");
assert.strictEqual(mapLangCode("baidu", "ZH"), "zh");
assert.strictEqual(mapLangCode("baidu", "EN-US"), "en");
assert.strictEqual(mapLangCode("baidu", "JA"), "jp", "Baidu uses jp, not ja");
assert.strictEqual(mapLangCode("baidu", "FR"), "fra");
assert.strictEqual(mapLangCode("baidu", "ES"), "spa");
assert.strictEqual(mapLangCode("baidu", "SK"), null, "Baidu Slovak is deliberately unmapped, not guessed");
assert.strictEqual(mapLangCode("baidu", "TR"), null, "Baidu Turkish is deliberately unmapped, not guessed");
assert.strictEqual(mapLangCode("baidu", "EN-AU"), "en", "Unlisted regional falls back to its base code");
assert.strictEqual(mapLangCode("youdao", "ZH"), "zh-CHS");
assert.strictEqual(mapLangCode("youdao", "EN-GB"), "en");
assert.strictEqual(mapLangCode("youdao", "SK"), "sk");
assert.strictEqual(mapLangCode("unknown-provider", "EN"), null);
assert.strictEqual(mapLangCode("baidu", null), null);

// Youdao truncation: <=20 chars untouched, otherwise first 10 + length + last 10.
assert.strictEqual(youdaoTruncate("Hello"), "Hello");
assert.strictEqual(youdaoTruncate("01234567890123456789"), "01234567890123456789", "20 chars is the inclusive boundary");
assert.strictEqual(youdaoTruncate("012345678901234567890"), "0123456789211234567890", "21 chars truncates");
assert.strictEqual(youdaoTruncate("0123456789ABCDEFGHIJ_middle_middle_middle_XYZ"), "012345678945middle_XYZ");

// Baidu: sign = md5(appid + q + salt + secretKey) over the RAW query text.
const bReq = buildBaiduRequest({
    appid: "20200101000000001", secretKey: "abcdefghijklmnop",
    fromText: "Hello", sourceLang: "EN", targetLang: "ZH",
    salt: "1234567890", hash: nodeHash,
});
assert.strictEqual(bReq.url, "https://fanyi-api.baidu.com/api/trans/vip/translate");
assert.strictEqual(bReq.method, "POST");
assert.strictEqual(bReq.contentType, "application/x-www-form-urlencoded");
assert.deepStrictEqual(bReq.headers, {});
assert.strictEqual(
    bReq.body,
    "q=Hello&from=en&to=zh&appid=20200101000000001&salt=1234567890&sign=4f1ff411fad108e59ca4fed3ab1bf7be",
    "Baidu body must carry the mapped codes and the md5 sign in field order"
);
assert.deepStrictEqual(
    buildBaiduRequest({
        appid: "a", secretKey: "s", fromText: "Hello", sourceLang: "SK",
        targetLang: "ZH", salt: "1", hash: nodeHash,
    }),
    { error: { code: "unsupported-language", detail: "SK->ZH" } },
    "An unmappable language must fail before any request is built"
);
assert.deepStrictEqual(
    buildYoudaoRequest({
        appid: "a", secretKey: "s", fromText: "Hello", sourceLang: "XX",
        targetLang: "ZH", salt: "1", curtime: "1", hash: nodeHash,
    }).error,
    { code: "unsupported-language", detail: "XX->ZH" },
    "Youdao uses the same failure shape so extension.js can branch once"
);

// Youdao: sign = base64(sha256(appKey + truncate(q) + salt + curtime + appSecret)).
const yReq = buildYoudaoRequest({
    appid: "testkey", secretKey: "testsecret", fromText: "Hello",
    sourceLang: "EN", targetLang: "ZH", salt: "s1", curtime: "1700000000", hash: nodeHash,
});
assert.strictEqual(yReq.url, "https://openapi.youdao.com/api");
assert.strictEqual(yReq.contentType, "application/x-www-form-urlencoded");
assert.strictEqual(
    yReq.body,
    "q=Hello&from=en&to=zh-CHS&appKey=testkey&salt=s1&sign=" +
    encodeURIComponent("VjpDlwHzPcn13NX8evndOL66ETGxWmqiY4nHTJ5A5+k=") +
    "&signType=v3&curtime=1700000000"
);
const yLong = buildYoudaoRequest({
    appid: "testkey", secretKey: "testsecret",
    fromText: "0123456789ABCDEFGHIJ_middle_middle_middle_XYZ",
    sourceLang: "EN", targetLang: "ZH", salt: "s1", curtime: "1700000000", hash: nodeHash,
});
assert.ok(
    yLong.body.includes("sign=" + encodeURIComponent("YxqrginLBwbTQaMk6aYjVoYrazAWrLNleCVeoCmK75Y=")),
    "Long text must be signed in truncated form"
);
assert.ok(yLong.body.includes("q=" + encodeURIComponent("0123456789ABCDEFGHIJ_middle_middle_middle_XYZ")),
    "The transmitted q stays full-length; only the signed input is truncated");

// Response parsing, including each provider's own error envelope. Errors come
// back as {code, detail} pairs, never prose, because translation-helper.js
// must stay gettext-free for extension.js to translate them.
assert.deepStrictEqual(parseProviderResponse("deepl", { translations: [{ text: "Hola" }] }), { text: "Hola" });
assert.deepStrictEqual(parseProviderResponse("google", [[["Hola", "Hello"]]]), { text: "Hola" });
assert.deepStrictEqual(parseProviderResponse("baidu", { result: { data: [{ src: "Hello", dst: "你好" }] } }), { text: "你好" });
assert.deepStrictEqual(parseProviderResponse("youdao", { errorCode: "0", translation: ["Hola"] }), { text: "Hola" });
assert.deepStrictEqual(
    parseProviderResponse("baidu", { error_code: "52003", error_msg: "UNAUTHORIZED USER" }).error,
    { code: "provider-error", detail: "52003 UNAUTHORIZED USER" },
    "Baidu reports failures inside a 200 body"
);
assert.deepStrictEqual(
    parseProviderResponse("youdao", { errorCode: "202" }).error,
    { code: "provider-error", detail: "202" },
    "Youdao reports failures inside a 200 body"
);
assert.deepStrictEqual(parseProviderResponse("deepl", { translations: [] }).error,
    { code: "empty-translation", detail: "deepl" }, "Empty DeepL result is an error, not an empty string");
assert.deepStrictEqual(parseProviderResponse("google", [[]]).error,
    { code: "empty-translation", detail: "google" }, "Empty Google parts are an error");
assert.deepStrictEqual(parseProviderResponse("nope", {}).error,
    { code: "unknown-provider", detail: "nope" });
assert.deepStrictEqual(parseProviderResponse("deepl", null).error,
    { code: "malformed-response", detail: "deepl" }, "A null body must not throw");

console.log("✅ provider registry tests passed successfully!\n");

console.log("🎉 All unit tests passed successfully!");

