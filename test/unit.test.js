import assert from "assert";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { parseCountryCode, buildRequestQuery, getFlagEmoji, formatLanguageLabel, parseLanguageName, buildGoogleRequest, mapDeepLFormality, buildDeepLRequestBody, normalizeDeepLSourceLang, PROVIDERS, getProvider, getProviderById, mapLangCode, youdaoTruncate, buildBaiduRequest, buildYoudaoRequest, parseProviderResponse, parseGoogleDict, looksLikeWord, swapLanguages, safeTruncate, codePointLength, isSameLanguage, hasVisibleText } from "../translation-helper.js";

// Real Google `translate_a/single` replies captured live on 2026-10-09 (see the
// fixtures' provenance note). They pin parseGoogleDict against the provider's
// actual positional array instead of a hand-written guess.
const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));

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
// for the existing eval-test contract).
//
// Host and client are pinned deliberately: translate.googleapis.com with
// client=gtx answers 429 "automated queries" from this machine's proxy exit IP,
// while clients5.google.com with client=dict-chrome-ex answers 200 for the same
// request (measured 2026-10-09). The dt list must keep asking for the
// dictionary sections the word card renders.
let g = buildGoogleRequest("EN", "ES", "Hello");
assert.strictEqual(
    g.url,
    "https://clients5.google.com/translate_a/single?client=dict-chrome-ex&sl=en&tl=es&dt=t&dt=bd&dt=rm&dt=md&dt=ss&dt=ex",
    "Google URL must use the clients5 dict-chrome-ex endpoint and request the dictionary sections"
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

// ==========================================
// 5b. parseGoogleDict (dictionary card)
// ==========================================
console.log("⏳ Running Google dictionary parser tests...");

// A recognised word: dictionary sections present. Every field the card renders
// is asserted against the real captured reply.
const runDict = parseGoogleDict(fixture("google-dict-run.json"));
assert.strictEqual(runDict.isDictionary, true, "run is a dictionary word");
assert.strictEqual(runDict.translation, "跑步", "translation is the joined d[0] segments");
assert.strictEqual(runDict.phonetic, "rən", "phonetic comes from d[0][1][3]");
assert.strictEqual(runDict.detectedLang, "en", "detected language comes from d[2]");
assert.strictEqual(runDict.entries[0].pos, "verb", "first POS block is verb");
assert.ok(runDict.entries[0].terms.includes("运行"), "verb terms include 运行");
assert.ok(runDict.entries.length >= 3, "a rich word carries several POS blocks");
assert.strictEqual(runDict.examples[0], "Bobby set off at a run",
    "example HTML (<b>run</b>) must be stripped to plain text");

const bankDict = parseGoogleDict(fixture("google-dict-bank.json"));
assert.strictEqual(bankDict.isDictionary, true, "bank is a dictionary word");
assert.strictEqual(bankDict.translation, "银行");
assert.strictEqual(bankDict.entries[0].pos, "noun");

// A sentence: no dictionary sections. The parser must still yield the
// translation and must NOT report a dictionary, so the card falls back to plain
// translation.
const sentence = parseGoogleDict(fixture("google-plain-sentence.json"));
assert.strictEqual(sentence.isDictionary, false, "a sentence is not a dictionary entry");
assert.strictEqual(sentence.translation, "河岸很陡。", "sentence translation survives");
assert.strictEqual(sentence.phonetic, null, "no phonetic for a sentence");
assert.deepStrictEqual(sentence.entries, [], "no entries for a sentence");

// An unknown word echoes itself and carries no dictionary sections.
const unknown = parseGoogleDict(fixture("google-plain-unknown.json"));
assert.strictEqual(unknown.isDictionary, false, "an unknown word is not a dictionary entry");
assert.strictEqual(unknown.translation, "asdfghqwer");

// Defensive: the reply is a positional array, so a shape change must degrade to
// a plain translation, never throw.
assert.deepStrictEqual(parseGoogleDict(null),
    { translation: "", phonetic: null, detectedLang: null, entries: [], examples: [], isDictionary: false },
    "null body yields the empty shape");
assert.strictEqual(parseGoogleDict([]).isDictionary, false, "empty array yields the empty shape");
assert.strictEqual(parseGoogleDict([[null, null]]).translation, "",
    "null translation segments are skipped, not stringified");
assert.strictEqual(parseGoogleDict({}).isDictionary, false, "a non-array body yields the empty shape");
// A dictionary block with no usable terms is dropped rather than shown empty.
const noTerms = parseGoogleDict([[[["x", "x"]]], [["noun", [], null]], "en"]);
assert.strictEqual(noTerms.isDictionary, false, "a term-less POS block is dropped");

console.log("✅ Google dictionary parser tests passed successfully!\n");

// ==========================================
// 6. swapLanguages guard
// ==========================================
console.log("⏳ Running swap guard tests...");

// '⇄' used to assign _source_lang straight into the target slot. The source
// default is AUTO, so one press put an automatic-detection code where only a
// concrete language may live (the target enum has 28 values and AUTO is not one
// of them), and every later double-copy failed until the user touched Settings.
// The decision lives here, in the pure module, so the failure is testable
// without a shell.
assert.deepStrictEqual(swapLanguages("ZH", "EN-US"),
    { source: "EN-US", target: "ZH" }, "A concrete pair swaps both ways");
assert.deepStrictEqual(swapLanguages("EN-GB", "PT-BR"),
    { source: "PT-BR", target: "EN-GB" }, "Regional codes swap too");
assert.deepStrictEqual(swapLanguages("AUTO", "ZH"),
    { error: { code: "swap-source-is-automatic", detail: "ZH" } },
    "AUTO may never become the target");
assert.strictEqual(swapLanguages("AUTO", "ZH").source, undefined,
    "The refused swap must not produce a new state");
assert.strictEqual(swapLanguages("AUTO", "EN-US").target, undefined,
    "The refused swap must not produce a new state");
assert.strictEqual(swapLanguages("ZH", "AUTO").source, "AUTO",
    "AUTO is legal as a source, so swapping into it is allowed");
assert.deepStrictEqual(swapLanguages("AUTO", "AUTO"),
    { error: { code: "swap-source-is-automatic", detail: "AUTO" } },
    "Two AUTO values still refuse");

console.log("✅ swap guard tests passed successfully!\n");

// ==========================================
// 7. code-point-safe truncation
// ==========================================
console.log("⏳ Running truncation tests...");

// The request was cut with String.slice(0, charLimit), which counts UTF-16 code
// units and can stop in the middle of a surrogate pair. The lone high surrogate
// then made encodeURIComponent() throw URIError, and the popup showed the user a
// literal "Error: URI malformed". Providers count characters, not code units, so
// the limit is applied in code points and the cut never splits a pair.
const astral = "a".repeat(4999) + "\u{10437}" + "b"; // 5001 code points, 5002 units
assert.strictEqual(codePointLength(astral), 5001, "Astral chars count once");
assert.strictEqual(astral.length, 5002, "sanity: UTF-16 units differ from code points");

const cut = safeTruncate(astral, 5000);
assert.strictEqual(codePointLength(cut), 5000, "truncated to exactly the limit");
assert.strictEqual(cut, "a".repeat(4999) + "\u{10437}",
    "the trailing astral character must stay whole");
assert.doesNotThrow(() => encodeURIComponent(cut),
    "a truncated request must always be URI-encodable");

// The naive slice is what we are guarding against; assert it really was broken,
// so this test cannot silently stop covering the bug.
assert.throws(() => encodeURIComponent(astral.slice(0, 5000)), URIError,
    "slice(0, limit) must still split the pair (regression sentinel)");

assert.strictEqual(safeTruncate("hello", 10), "hello", "short text untouched");
assert.strictEqual(safeTruncate("hello", 5), "hello", "exactly at the limit untouched");
assert.strictEqual(safeTruncate("hello", 0), "hello", "limit 0 means unlimited");
assert.strictEqual(safeTruncate("😀😀😀", 2), "😀😀", "emoji pairs are single units");
assert.strictEqual(codePointLength("😀😀😀"), 3, "three emoji are 3 characters, not 6");

console.log("✅ truncation tests passed successfully!\n");

// ==========================================
// 8. same-language and visible-text guards
// ==========================================
console.log("⏳ Running request-sanity guard tests...");

// Nothing on the request path noticed that source == target, so the user paid a
// network round trip to be shown the same text twice, which reads as "it broke".
assert.strictEqual(isSameLanguage("ZH", "ZH"), true, "identical pair is a no-op request");
assert.strictEqual(isSameLanguage("EN-US", "EN-US"), true, "identical regional pair too");
assert.strictEqual(isSameLanguage("zh", "ZH"), true, "case must not hide a match");
assert.strictEqual(isSameLanguage("EN-GB", "EN-US"), false,
    "regional variants are a real DeepL request, not a no-op");
assert.strictEqual(isSameLanguage("AUTO", "ZH"), false,
    "detection is unknown, so AUTO must never block a request");
assert.strictEqual(isSameLanguage(null, "ZH"), false, "missing code is not a match");
assert.strictEqual(isSameLanguage("ZH", null), false, "missing code is not a match");

// .trim() does not cover U+200B..200F or U+2060 (category Cf, not Zs), so a
// clipboard holding only invisible formatting used to fire a real request.
assert.strictEqual(hasVisibleText("\u200B\u200E\u200F\u2060"), false, "zero width only");
assert.strictEqual(hasVisibleText("\u200B"), false, "single ZWSP");
assert.strictEqual(hasVisibleText("  \t\n\u00A0"), false, "whitespace only");
assert.strictEqual(hasVisibleText(""), false, "empty");
assert.strictEqual(hasVisibleText(null), false, "null");
assert.strictEqual(hasVisibleText("\u60A8\u597D"), true, "CJK is visible");
assert.strictEqual(hasVisibleText("a\u200B"), true, "one visible char plus ZWSP is visible");
assert.strictEqual(hasVisibleText("\u2014"), true,
    "an em dash is punctuation, not an invisible format character");

console.log("✅ request-sanity guard tests passed successfully!\n");

// ==========================================
// 9. looksLikeWord / getProviderById (word→Google routing)
// ==========================================
console.log("⏳ Running word-detection tests...");

// A single word (English or CJK) is routed to Google for the dictionary card.
assert.strictEqual(looksLikeWord("bank"), true, "a single English word");
assert.strictEqual(looksLikeWord("  bank  "), true, "surrounding whitespace is trimmed first");
assert.strictEqual(looksLikeWord("don't"), true, "apostrophe keeps it one token");
assert.strictEqual(looksLikeWord("well-known"), true, "hyphen keeps it one token");
assert.strictEqual(looksLikeWord("爱"), true, "a single CJK character");
assert.strictEqual(looksLikeWord("银行"), true, "a CJK word has no spaces");
assert.strictEqual(looksLikeWord("internationalization"), true, "a long single token is still a word");

// Prose must NOT be routed to Google — that would change its translation quality.
assert.strictEqual(looksLikeWord("hello world"), false, "two tokens is text");
assert.strictEqual(looksLikeWord("Hello."), false, "trailing full stop means prose");
assert.strictEqual(looksLikeWord("你好！"), false, "CJK exclamation means prose");
assert.strictEqual(looksLikeWord("a;b"), false, "semicolon means prose");
assert.strictEqual(looksLikeWord(""), false, "empty is not a word");
assert.strictEqual(looksLikeWord("   "), false, "whitespace only is not a word");
assert.strictEqual(looksLikeWord(null), false, "null is not a word");
// The 40-code-point bound: 40 CJK chars is a word by length, 41 is not.
assert.strictEqual(looksLikeWord("字".repeat(40)), true, "40 code points is within the bound");
assert.strictEqual(looksLikeWord("字".repeat(41)), false, "41 code points exceeds the bound");
// Documented limitation: a CJK fragment with no spaces and no punctuation is
// indistinguishable from a CJK word, so it is treated as one. Real CJK
// sentences normally carry punctuation (。！？，), which lands them in 'text'.
// The cost of a miss is only that Google, not the selected provider, translates
// that fragment.
assert.strictEqual(looksLikeWord("这是一整句话"), true,
    "CJK with no spaces and no punctuation is treated as a word (documented limitation)");

assert.strictEqual(getProviderById("google").id, "google");
assert.strictEqual(getProviderById("deepl").value, 0);
assert.strictEqual(getProviderById("nope"), null, "unknown id yields null");

console.log("✅ word-detection tests passed successfully!\n");

console.log("🎉 All unit tests passed successfully!");

