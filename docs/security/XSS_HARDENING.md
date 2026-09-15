# XSS hardening plan

## Threat model

Firestore content must be treated as attacker-controlled. Client-side ownership checks do not make stored values trusted. The following fields must never be interpolated into inline JavaScript or unvalidated URL attributes:

- message text, reply text, user names and file names
- image, audio, attachment and avatar URLs
- post/comment content and AI output

## Confirmed sinks

| Priority | File | Confirmed pattern | Required remediation |
| --- | --- | --- | --- |
| Critical | `groupChat.js` | `msg.text`, `msg.userName` and media URLs inside `innerHTML`/`onclick` | Event delegation, `textContent`, validated URLs |
| Critical | `dm.js` | media URLs and message text inside generated HTML | DOM construction and validated URLs |
| High | `support.js` | user name, profile data and last message inside generated handlers/HTML | Remove inline handlers and render text safely |
| High | `social.js` | post media URLs and content inside generated HTML | URL allow-list and safe linkification |
| High | `chat.js` | AI/user response formatted then assigned through `innerHTML` | Sanitize allowed markup or construct DOM nodes |
| High | `ui.js` | notification, toast and announcement text inside `innerHTML` | Use `textContent`; safe link builder for announcements |

## Implementation rules

1. Never place user-controlled data inside `onclick`, `onerror`, `onload`, or other inline handlers.
2. Use `addEventListener` or container-level event delegation.
3. Use `textContent` for plain text.
4. Use `escapeHTML` only when a complete DOM refactor is not practical; escaping is context-specific.
5. Pass every external URL through `normalizeHttpUrl` and reject empty results.
6. Open new tabs with `noopener,noreferrer`.
7. Do not use a raw-value fallback when a sanitizer/helper is unavailable.
8. Keep Firestore document IDs as data, not executable source.

## Regression payloads

- `<img src=x onerror=alert(1)>`
- `');alert(document.domain);//`
- `javascript:alert(1)`
- `data:text/html,<script>alert(1)</script>`
- quotes, apostrophes, backslashes and multiline text

## Completion criteria

- `npm run test:security` passes.
- `npm run build` passes.
- Source scan finds no user values interpolated into inline event handlers.
- Message reply/edit/delete/report and reaction controls still work.
- Image, audio and attachment previews still work for valid HTTPS URLs.
- Invalid URL protocols are not rendered or opened.
