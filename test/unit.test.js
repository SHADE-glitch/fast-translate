import assert from "assert";
import { parseCountryCode, buildRequestQuery, getFlagEmoji, formatLanguageLabel, parseLanguageName, buildGoogleRequest, mapDeepLFormality, buildDeepLRequestBody, normalizeDeepLSourceLang } from "../translation-helper.js";

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

console.log("🎉 All unit tests passed successfully!");

