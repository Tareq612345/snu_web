// Shared security helpers for untrusted user-generated content.

const HTML_ENTITIES = Object.freeze({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
});

/**
 * Escapes a value for an HTML text or quoted-attribute context.
 * Do not use this to build JavaScript source inside inline event handlers.
 */
export const escapeHTML = (value) => String(value ?? '')
    .replace(/[&<>"']/g, character => HTML_ENTITIES[character]);

/**
 * Accepts only HTTP(S) URLs. Returns an empty string for malformed or
 * dangerous protocols such as javascript: and data:.
 */
export const normalizeHttpUrl = (value, baseUrl = 'https://localhost/') => {
    if (typeof value !== 'string' || !value.trim()) return '';

    try {
        const url = new URL(value.trim(), baseUrl);
        return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
    } catch {
        return '';
    }
};

export const setSafeText = (element, value) => {
    if (element) element.textContent = String(value ?? '');
    return element;
};

/**
 * Opens a validated external URL without exposing window.opener.
 */
export const openExternalUrl = (value) => {
    const baseUrl = typeof window !== 'undefined' ? window.location.href : 'https://localhost/';
    const safeUrl = normalizeHttpUrl(value, baseUrl);
    if (!safeUrl || typeof window === 'undefined') return false;

    const openedWindow = window.open(safeUrl, '_blank', 'noopener,noreferrer');
    if (openedWindow) openedWindow.opener = null;
    return true;
};
