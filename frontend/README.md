# Frontend — Stage 4 web PWA

Vite + React + react-router-dom + react-i18next (English only for now) + vite-plugin-pwa.
Design direction: "Field Notebook" — a naturalist's observation journal, not the generic
AI-default cream+terracotta / near-black+neon / broadsheet looks. See `src/styles/global.css`
for the token system.

## Run

```bash
cp .env.example .env      # then set VITE_GOOGLE_CLIENT_ID to a real Google OAuth Web client id
npm install
npm run dev                # http://127.0.0.1:5173, expects the backend on http://127.0.0.1:8000/v1
npm run build               # production build to dist/
```

## Tests — real, not mocked

```bash
npx vitest run
```

**12/12 passing**, and deliberately not mocked: every test that needs a backend starts from a
**real user created in the real Postgres database** (`src/test/mint_session.py` mints a real
`users` row + a real access/refresh token pair using the backend's own `app.security` functions
— not a fake session shape) and every API call in the tests hits the **real running FastAPI
backend** over real `fetch()`. `src/pages/LogActionPage.test.jsx` in particular drives the actual
core daily-practice loop through real DOM interactions (type, click, click) and then queries the
real database afterward to confirm the actual row that got written — score, not `is_relevant`,
matches what was clicked.

**Honest limit, stated plainly, not hidden:** the one thing that cannot be tested here is a real
Google OAuth handshake — this sandbox has no network path to `accounts.google.com` and no real
Google Client ID. `GoogleSignInButton.jsx` is the real, production Google Identity Services
integration (not a stub); it is simply untestable from this environment. Every other flow —
onboarding (both the ideal path and the manual path, against the real 3 seeded ideals and 25
seeded catalog qualities), the goal-overview and quality-overview read-model cards (including the
±0.3 vs-baseline comparison and the context breakdown, checked against hand-computed expected
values), and account export/deletion — is exercised for real.

## A real bug this caught

The very first test run rendered raw i18n keys (`action.new`, `action.whatHappened`) instead of
English text. Not a bug in the app — `main.jsx` initializes i18next before rendering `<App/>`, but
tests import pages directly and never touch `main.jsx`, so `useTranslation()` ran against an
uninitialized instance. Fixed by initializing i18n in `src/test/setup.js` too. Documented here
rather than quietly fixed, because "the build succeeded" was never treated as sufficient proof on
this project, and this is a concrete example of why: a clean build does not catch this class of bug.

## Structure

```
src/
  api/          client.js (auth headers, 401->refresh->retry, structured error parsing), resources.js
  auth/         AuthContext, real GoogleSignInButton
  components/   BottomNav, Feedback (error/loading), QualityPicker, RatingControl (signature element)
  pages/        Login, onboarding/{ChoosePath,Ideal,Manual}, Home, LogAction, Goals{List,Detail}, Qualities{List,Detail}, Profile
  i18n/         en.json only for now (ADR v2 §6: en primary now, ru added in Stage 6 without touching components)
  styles/       global.css — the whole design token system in one file
  test/         mint_session.py + helpers.js (real-session bootstrap), setup.js
```

## What Stage 4 deliberately does not include

Cycles and reflections have a working, tested backend API (Stage 3) but no screens yet — the
roadmap's Stage 4 scope is onboarding + daily practice + goals + qualities + basic statistics,
not every entity. Russian localization is Stage 6 (catalog enrichment), not now. No native mobile
wrapper yet (Capacitor, per the research recommendation) — this is the reference web/PWA client
first, per the "web validates the model before native" sequencing already agreed earlier in this
project.
