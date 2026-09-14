import test from 'node:test';
import assert from 'node:assert/strict';

import { escapeHTML, normalizeHttpUrl, setSafeText } from '../security.js';

test('escapeHTML neutralizes stored-XSS payloads', () => {
    assert.equal(
        escapeHTML(`<img src=x onerror="alert('xss')">`),
        '&lt;img src=x onerror=&quot;alert(&#39;xss&#39;)&quot;&gt;'
    );
});

test('escapeHTML handles quotes, ampersands, backslashes, and new lines', () => {
    assert.equal(
        escapeHTML(`'"&\\\nnext`),
        '&#39;&quot;&amp;\\\nnext'
    );
});

test('normalizeHttpUrl permits only HTTP and HTTPS', () => {
    assert.equal(normalizeHttpUrl('https://example.com/image.png'), 'https://example.com/image.png');
    assert.equal(normalizeHttpUrl('http://example.com/file.pdf'), 'http://example.com/file.pdf');
    assert.equal(normalizeHttpUrl('/profile/1', 'https://snu-study.netlify.app/'), 'https://snu-study.netlify.app/profile/1');
    assert.equal(normalizeHttpUrl('javascript:alert(1)'), '');
    assert.equal(normalizeHttpUrl('data:text/html,<script>alert(1)</script>'), '');
    assert.equal(normalizeHttpUrl('not a valid url', 'not a valid base'), '');
});

test('setSafeText uses textContent instead of innerHTML', () => {
    const fakeElement = { textContent: '' };
    setSafeText(fakeElement, '<svg onload=alert(1)>');
    assert.equal(fakeElement.textContent, '<svg onload=alert(1)>');
});
