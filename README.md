# Masar Platform

A web platform with modules for attendance, quizzes, community communication, and administration. Built with JavaScript, Vite, Tailwind CSS, and Firebase.

> This README describes the repository structure and configured commands. It is not a production-readiness assessment; builds, backend permissions, and end-to-end workflows must be verified in your own environment.

## Overview

Masar brings several platform modules into one web application:

| Area | Source files |
| --- | --- |
| Authentication and Firebase integration | `auth.js`, `firebase.js` |
| Attendance | `attendance.js` |
| Quizzes | `quiz.js` |
| Community and messaging | `social.js`, `chat.js`, `dm.js`, `groupChat.js` |
| Administration and content management | `admin.js`, `admin-stats.js`, `cms.js` |
| Notifications | `notifications.js`, `firebase-messaging-sw.js` |
| Engagement and events | `gamification.js`, `events.js` |
| Offline and installable-app assets | `sw.js`, `manifest.json`, `offline.html` |

The presence of a module does not guarantee that every workflow is complete or enabled in a deployment.

## Technology

- **Frontend:** JavaScript ES modules, HTML, and CSS.
- **Build tooling:** Vite 5 and `vite-plugin-static-copy`.
- **Styling:** Tailwind CSS 3, PostCSS, and Autoprefixer.
- **Firebase client services:** Authentication, Cloud Firestore, and Cloud Storage.
- **Backend:** Firebase Cloud Functions using `firebase-admin` and `firebase-functions`.
- **Hosting configuration:** Firebase Hosting serves the `dist/` build output.

## Local development

### Prerequisites

- A Node.js version compatible with Vite 5 and npm.
- Node.js 20 when working with the Cloud Functions package, as specified in `functions/package.json`.
- A separate Firebase project for development and permission to configure its services.

### 1. Install dependencies

```bash
git clone https://github.com/Tareq612345/snu_web.git
cd snu_web
npm ci
```

### 2. Configure Firebase

Before using data-dependent features:

1. Register a web app in your own Firebase project.
2. Replace the client project configuration in `firebase.js` with your development project's configuration.
3. Review the provider setup in `auth.js` and enable the authentication methods it uses. A Google provider is exported from `firebase.js`.
4. Add your local and deployed domains to Firebase Authentication's authorized domains as appropriate.
5. Configure Firestore and Storage access rules for your intended roles and data model.
6. Review `SUPER_ADMIN_EMAIL` in `firebase.js`. Client-side checks are not an authorization boundary; enforce privileged access in backend code and service rules.
7. If testing push notifications, review `firebase-messaging-sw.js` for project-specific configuration as well.

Firebase web configuration identifies a client project; it is not a substitute for authorization. Never commit service-account credentials, private keys, or server secrets.

### 3. Start the development server

```bash
npm run dev
```

The Vite configuration requests port `3000` and opens the browser automatically. Use the URL printed by Vite if that port is unavailable.

## Build and preview

```bash
npm run build
npm run preview
```

The production build is written to `dist/`. Preview serves the built frontend locally; it does not provision Firebase services or emulate Cloud Functions.

## Available scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite development server |
| `npm run build` | Generate the production frontend in `dist/` |
| `npm run preview` | Preview the built frontend locally |
| `npm run test:security` | Run the configured `tests/security.test.mjs` entry point |
| `npm run test:features` | Run the configured `tests/featureFlags.test.mjs` entry point |

**Testing caveat:** the root package declares the two test scripts above, but no root `tests/` directory was present in the repository listing reviewed for this README. Verify or restore those test files before relying on these commands. No passing test or build result is claimed here.

## Cloud Functions

The backend package lives in `functions/` and specifies Node.js 20.

```bash
cd functions
npm install
```

Its configured scripts include:

| Command | Purpose |
| --- | --- |
| `npm run serve` | Start the Firebase Functions emulator |
| `npm run shell` | Open the Firebase Functions shell |
| `npm run logs` | Read logs for the selected Firebase project |
| `npm run deploy` | Deploy functions to the selected Firebase project |

These commands require the Firebase CLI and appropriate project configuration. Confirm the selected project before any deployment. Emulating only Functions does not automatically isolate other Firebase services; configure any additional emulators needed before testing with real data.

## Deployment notes

`firebase.json` configures:

- Cloud Functions sourced from `functions/`.
- Static hosting from `dist/`.
- A fallback rewrite to `index.html`.

Build the frontend before deploying. Review `firestore.rules`, Storage permissions, authentication settings, and backend authorization before exposing a deployment to users. Do not assume the repository's existing Firebase project is available for your use.

## Repository layout

```text
snu_web/
├── index.html                 Frontend entry point
├── main.js                    Main frontend module
├── firebase.js                Firebase client setup
├── auth.js                    Authentication module
├── attendance.js              Attendance module
├── quiz.js                    Quiz module
├── social.js                  Community module
├── dm.js / groupChat.js        Messaging modules
├── admin.js / cms.js           Administration and content modules
├── functions/                 Firebase Cloud Functions package
├── firestore.rules            Firestore rules to review before deployment
├── firebase.json              Firebase deployment configuration
├── vite.config.js             Build configuration
├── tailwind.config.js         Tailwind configuration
├── sw.js                      Service worker
└── manifest.json              Web app manifest
```

## Safe development

- Use a dedicated development Firebase project and synthetic data.
- Enforce authorization server-side and in Firebase service rules, not only in the browser.
- Do not include student records, private messages, access tokens, or credentials in issues or screenshots.
- Clear or update service-worker caches when diagnosing stale frontend assets.
- Keep changes focused and document how they were tested.

## Feedback

Use [GitHub Issues](https://github.com/Tareq612345/snu_web/issues) for non-sensitive bug reports and feature requests. Include reproduction steps, expected behavior, actual behavior, and relevant browser details. Do not post secrets or personal data.
