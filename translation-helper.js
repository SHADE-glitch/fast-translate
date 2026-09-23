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


