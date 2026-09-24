/**
  * Pure helper functions for Translate Assistant.
  * These functions do not rely on GJS-specific window manager APIs and can be tested in Node.js.
  */

/**
 * Parses out standard language ISO codes (e.g., 'English (EN)' -> 'EN')
 * @param {string} description - The language description string from preferences
 * @returns {string|null} The country code or null
 */
export function parseCountryCode(description) {
    if (!description) return null;
    const regex = /^[^(]*\(([^)]*)\)$/gm;
    let m = regex.exec(description);
    if (m && m.length > 1) {
        return m[1];
    }
    return null;
}

/**
 * Safely formats query parameters for post request payload
 * @param {Object} params - Key-value pair parameters
 * @returns {string} The query string
 */
export function buildRequestQuery(params) {
    return Object.keys(params)
        .map(key => {
            const value = params[key];
            if (value === undefined || value === null) {
                return '';
            }
            const escapedKey = encodeURIComponent(key)
                .replace(/%20/g, '+')
                .replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
            const escapedValue = encodeURIComponent(value)
                .replace(/%20/g, '+')
                .replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
            return `${escapedKey}=${escapedValue}`;
        })
        .filter(part => part !== '')
        .join('&');
}

/**
 * Converts a 2-letter country code or language code to a regional flag emoji
 * @param {string} countryCode - The ISO country or language code (e.g. 'ES', 'PT-BR')
 * @returns {string} The regional flag emoji or empty string
 */
export function getFlagEmoji(countryCode) {
    if (!countryCode) return "";
    let code = countryCode.toUpperCase();
    if (code === 'AUTO') return "🌐";
    if (code.includes('-')) {
        code = code.split('-')[1];
    }
    
    // Custom language-to-country overrides
    const overrides = {
        'EN': 'GB',
        'JA': 'JP',
        'ZH': 'CN',
        'CS': 'CZ',
        'EL': 'GR',
        'SV': 'SE',
        'DA': 'DK',
        'SL': 'SI',
        'ET': 'EE'
    };
    
    if (overrides[code]) {
        code = overrides[code];
    }
    
    if (code.length === 2) {
        return String.fromCodePoint(
            code.codePointAt(0) - 65 + 0x1F1E6,
            code.codePointAt(1) - 65 + 0x1F1E6
        );
    }
    return "";
}

/**
 * Formats a language code with its flag emoji.
 * @param {string} langCode - The ISO country/language code
 * @returns {string} The formatted label text
 */
export function formatLanguageLabel(langCode) {
    if (!langCode) return "";
    if (langCode.toUpperCase() === 'AUTO') return "🌐 Auto";
    const flag = getFlagEmoji(langCode);
    return flag ? `${flag} ${langCode}` : langCode;
}

/**
 * Extracts the human-readable language name from GSchema enum description
 * (e.g. "English American (EN-US)" -> "English American")
 * @param {string} description - The description from preferences
 * @returns {string} The language name
 */
export function parseLanguageName(description) {
    if (!description) return "";
    const idx = description.indexOf('(');
    if (idx !== -1) {
        return description.substring(0, idx).trim();
    }
    return description;
}

/**
 * Builds a Google Translate (auth-free) request. Pure: byte-identical to the
 * previously inline logic in extension.js.
 * @param {string} sourceLang - Source code ('AUTO' allowed)
 * @param {string} targetLang - Target code
 * @param {string} fromText - Text to translate
 * @returns {{url: string, body: string, contentType: string}}
 */
export function buildGoogleRequest(sourceLang, targetLang, fromText) {
    const sl = sourceLang === 'AUTO' ? 'auto' : String(sourceLang).toLowerCase();
    const tl = String(targetLang).toLowerCase();
    return {
        url: `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=${tl}&dt=t`,
        body: buildRequestQuery({ q: fromText }),
        contentType: 'application/x-www-form-urlencoded',
    };
}

/**
 * Maps a GSettings formality value to the DeepL API value.
 * Returns undefined when the parameter must be omitted (default/unset).
 * @param {string} formality - 'default' | 'more' | 'less' | API value
 * @returns {string|undefined}
 */
export function mapDeepLFormality(formality) {
    if (!formality || formality === 'default') return undefined;
    if (formality === 'more') return 'prefer_more';
    if (formality === 'less') return 'prefer_less';
    return formality;
}

/**
 * Normalizes a language code for DeepL source_lang. DeepL accepts regional
 * variants (EN-US, PT-BR, …) as *target* languages only; as a *source* it
 * rejects them with 400 "Value for 'source_lang' not supported". Since a
 * language swap can promote a target code into the source slot, strip the
 * regional suffix (EN-US -> EN, PT-BR -> PT).
 * @param {string} code - The source language code
 * @returns {string} The DeepL-compatible source code
 */
export function normalizeDeepLSourceLang(code) {
    if (!code) return code;
    const dash = String(code).indexOf('-');
    return dash === -1 ? code : String(code).slice(0, dash);
}
/**
 * Builds a DeepL request body object (caller JSON.stringifies it).
 * Pure: field-for-field identical to the previously inline logic.
 * @param {Object} opts
 * @param {string} opts.fromText - Text to translate
 * @param {string} opts.sourceLang - Source code ('AUTO' allowed)
 * @param {string} opts.targetLang - Target code
 * @param {boolean|string} opts.splitSentences - GSettings split-sentences value
 * @param {boolean} opts.preserveFormatting - GSettings preserve-formatting value
 * @param {string} opts.formality - GSettings formality value
 * @returns {Object} The request body object
 */
export function buildDeepLRequestBody({ fromText, sourceLang, targetLang, splitSentences, preserveFormatting, formality }) {
    const bodyObj = {
        text: [fromText],
        target_lang: targetLang,
        split_sentences: splitSentences ? "1" : "0",
        preserve_formatting: !!preserveFormatting,
    };
    if (sourceLang && sourceLang !== 'AUTO') {
        bodyObj.source_lang = normalizeDeepLSourceLang(sourceLang);
    }
    const mapped = mapDeepLFormality(formality);
    if (mapped !== undefined) {
        bodyObj.formality = mapped;
    }
    return bodyObj;
}

/* =========================================================================
 * Provider registry
 *
 * The gschema `translation-service` enum is the index into PROVIDERS. Values
 * are append-only: an existing installation stores the integer, so reordering
 * silently repoints a user's saved choice at a different service.
 *
 * Request builders are pure and take the hash primitives as an injected
 * `hash` argument, because signing needs MD5/HMAC and this module is also
 * loaded by test/unit.test.js under plain Node where gi:// is unavailable.
 * extension.js injects signing.js's GLib-backed bundle; the Node tests inject
 * node:crypto. Same function, two backends, identical output — that is what
 * makes the signatures testable without any network or credentials.
 * ========================================================================= */

export const PROVIDERS = [
    { value: 0, id: 'deepl', label: 'DeepL', charLimit: 5000 },
    { value: 1, id: 'google', label: 'Google Translate', charLimit: 5000 },
    { value: 2, id: 'baidu', label: 'Baidu Translate', charLimit: 6000 },
    { value: 3, id: 'youdao', label: 'Youdao Translate', charLimit: 5000 },
];

export function getProvider(value) {
    return PROVIDERS.find(p => p.value === value) || null;
}

/**
 * Language codes are provider-specific and the gschema enums are DeepL-shaped
 * (AUTO, EN-GB, EN-US, PT-PT, PT-BR). Anything unmapped returns null, which
 * extension.js turns into "not supported by <provider>" instead of sending a
 * guessed code that fails with an opaque server error.
 *
 * 待确认 (both providers): Baidu's and Youdao's official API docs render the
 * language table client-side, so it could not be read back while writing this,
 * and there are no credentials to probe with. The tables therefore list ONLY
 * codes that could be stated with confidence, and omit the rest on purpose —
 * an omitted language costs the user a clear local message, while a wrong code
 * costs a cryptic HTTP 200 error body. Re-check against the live docs and add
 * the missing pairs once an APP ID/secret is available.
 */
const LANG_CODES = {
    // Baidu general-translate codes. Not ISO-639-1: jp/fra/spa/bul/est/dan/
    // fin/rom/swe are Baidu's own spellings.
    // Deliberately absent: SK, SL, ID, LT, LV, TR — not verifiable, see above.
    baidu: {
        AUTO: 'auto', ZH: 'zh', EN: 'en', 'EN-US': 'en', 'EN-GB': 'en',
        JA: 'jp', FR: 'fra', ES: 'spa', RU: 'ru', PT: 'pt', 'PT-PT': 'pt',
        'PT-BR': 'pt', DE: 'de', IT: 'it', EL: 'el', NL: 'nl', PL: 'pl',
        BG: 'bul', CS: 'cs', DA: 'dan', ET: 'est', FI: 'fin', HU: 'hu',
        RO: 'rom', SV: 'swe',
    },
    // Youdao uses zh-CHS for Simplified Chinese and ISO-639-1 elsewhere.
    youdao: {
        AUTO: 'auto', ZH: 'zh-CHS', EN: 'en', 'EN-US': 'en', 'EN-GB': 'en',
        JA: 'ja', FR: 'fr', ES: 'es', RU: 'ru', PT: 'pt', 'PT-PT': 'pt',
        'PT-BR': 'pt', DE: 'de', IT: 'it', NL: 'nl', PL: 'pl', CS: 'cs',
        DA: 'da', FI: 'fi', HU: 'hu', RO: 'ro', SV: 'sv', TR: 'tr',
        EL: 'el', BG: 'bg', ET: 'et', LT: 'lt', LV: 'lv', SK: 'sk', SL: 'sl',
        ID: 'id',
    },
};

/**
 * @param {string} providerId - e.g. 'baidu'
 * @param {string} code - gschema code such as 'EN-US' or 'AUTO'
 * @returns {string|null} provider code, or null when unsupported
 */
export function mapLangCode(providerId, code) {
    if (!code) return null;
    const table = LANG_CODES[providerId];
    if (!table) return null;
    const upper = String(code).toUpperCase();
    if (table[upper] !== undefined) return table[upper];
    // Regional variants the table does not list explicitly (e.g. a future
    // EN-AU) fall back to their base language when that is supported.
    const dash = upper.indexOf('-');
    if (dash > 0 && table[upper.slice(0, dash)] !== undefined) {
        return table[upper.slice(0, dash)];
    }
    return null;
}

/**
 * Baidu general translate.
 * sign = md5(appid + q + salt + secretKey), hex, over the RAW query text — so
 * `q` must be the unescaped string, not its urlencoded form.
 *
 * Every request builder below returns the same shape, which is what lets
 * extension.js feed any of them to one Soup.Message:
 *   success: { url, method, contentType, headers, body }
 *   failure: { error: { code, detail } } — currently only 'unsupported-language'
 * @returns {{url:string, method:string, contentType:string, headers:Object, body:string}|{error:{code:string, detail:string}}}
 */
export function buildBaiduRequest({ appid, secretKey, fromText, sourceLang, targetLang, salt, hash }) {
    const from = mapLangCode('baidu', sourceLang);
    const to = mapLangCode('baidu', targetLang);
    if (!from || !to) return { error: { code: 'unsupported-language', detail: `${sourceLang}->${targetLang}` } };
    const sign = hash.md5Hex(`${appid}${fromText}${salt}${secretKey}`);
    return {
        url: 'https://fanyi-api.baidu.com/api/trans/vip/translate',
        method: 'POST',
        contentType: 'application/x-www-form-urlencoded',
        headers: {},
        body: buildRequestQuery({ q: fromText, from, to, appid, salt, sign }),
    };
}

/**
 * Youdao v3 signing.
 *   truncate(input) = input                          when input.length <= 20
 *                   = input[0:10] + len + input[-10:]  otherwise
 *   sign = base64(sha256(appKey + truncate(input) + salt + curtime + appSecret))
 * The SHA-256 digest is base64'd as RAW BYTES, not as its hex text.
 * `curtime` is Unix seconds as a string and `salt` any unique request id; both
 * are passed in so the builder stays pure and deterministic under test.
 */
export function youdaoTruncate(input) {
    const s = String(input);
    if (s.length <= 20) return s;
    return s.slice(0, 10) + s.length + s.slice(-10);
}

export function buildYoudaoRequest({ appid, secretKey, fromText, sourceLang, targetLang, salt, curtime, hash }) {
    const from = mapLangCode('youdao', sourceLang);
    const to = mapLangCode('youdao', targetLang);
    if (!from || !to) return { error: { code: 'unsupported-language', detail: `${sourceLang}->${targetLang}` } };
    const sign = hash.sha256Base64(
        `${appid}${youdaoTruncate(fromText)}${salt}${curtime}${secretKey}`
    );
    return {
        url: 'https://openapi.youdao.com/api',
        method: 'POST',
        contentType: 'application/x-www-form-urlencoded',
        headers: {},
        body: buildRequestQuery({
            q: fromText, from, to, appKey: appid, salt, sign,
            signType: 'v3', curtime,
        }),
    };
}

/**
 * Extract the translated text (or a provider failure) from a 200 response.
 *
 * Failures come back as { code, detail } rather than prose: this module must
 * stay free of gettext so test/unit.test.js can import it under plain Node,
 * and extension.js turns the code into a translated sentence.
 *   code: 'malformed-response' | 'empty-translation' | 'provider-error'
 *       | 'unknown-provider'
 *   detail: provider-supplied raw text (server error message / provider id)
 * @returns {{text?:string, error?:{code:string, detail:string}}}
 */
export function parseProviderResponse(providerId, json) {
    if (!json || typeof json !== 'object') {
        return { error: { code: 'malformed-response', detail: String(providerId) } };
    }
    const empty = { error: { code: 'empty-translation', detail: String(providerId) } };
    switch (providerId) {
    case 'deepl': {
        const t = json.translations;
        const text = (t && t.length > 0) ? t[0].text : '';
        return text ? { text } : empty;
    }
    case 'google': {
        const text = (json && json[0]) ? json[0].map(part => part[0]).join('') : '';
        return text ? { text } : empty;
    }
    case 'baidu': {
        if (json.error_code) {
            const detail = [json.error_code, json.error_msg].filter(Boolean).join(' ');
            return { error: { code: 'provider-error', detail } };
        }
        const data = json.result && json.result.data;
        const text = Array.isArray(data) ? data.map(d => d.dst).join('') : '';
        return text ? { text } : empty;
    }
    case 'youdao': {
        if (json.errorCode && String(json.errorCode) !== '0') {
            return { error: { code: 'provider-error', detail: String(json.errorCode) } };
        }
        const text = Array.isArray(json.translation) ? json.translation.join('') : '';
        return text ? { text } : empty;
    }
    default:
        return { error: { code: 'unknown-provider', detail: String(providerId) } };
    }
}


