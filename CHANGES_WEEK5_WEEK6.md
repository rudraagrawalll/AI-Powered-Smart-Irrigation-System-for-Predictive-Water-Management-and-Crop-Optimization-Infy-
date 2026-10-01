# Week 5–6 implementation log

Date: 2026-09-27

This file records the changes made for the Week 5 PWA/dashboard and Week 6 language, alerts, voice, reporting, and notification work.

## Frontend and PWA

- Added authenticated `/login`, account creation, email or phone sign-in, signed-in farmer identity, redirect guard, persistent login cookie validation, and logout controls. Cookie SameSite behavior is configurable for cross-domain HTTPS deployments.
- Added environment-driven Express/FastAPI URLs and credentials on API requests.
- Added responsive history, analytics, reports, and per-field detail routes. These use farmer-scoped API data, charts, explicit loading/error/empty states, CSV export, and browser print-to-PDF.
- Integrated the dashboard with the logged-in farmer profile and persisted profile updates, field metadata, language choice, and notification preferences.
- Added persisted English, Hindi, and Kannada primary/navigation labels, opt-in browser speech recognition with basic command intents, and text-to-speech responses.
- Added prominent dashboard actions to enable device notifications and read the current irrigation recommendation aloud in the selected language. Notification permission and in-app preference are persisted; Web Push is registered when VAPID configuration is available.
- Extended selected-language rendering across dashboard metrics, recommendations, weather, sensor status, field metadata, history, profile controls, empty states, irrigation classes, and rule-based alerts. Farmer-entered field and crop names remain unchanged.
- Added an optional Sarvam translation action for irrigation explanations; static translations work without a provider key.
- Added rule-based missing-sensor, low-moisture, heavy-rain, irrigation, and over-watering alerts. Added user-initiated browser notifications and push subscription controls.
- Replaced the fixed single-field sensor script with a field-aware simulator that discovers every active farmer field, provisions missing sensors, uses weather plus soil/crop/irrigation conditions, and posts readings for every field on each cycle.
- Added first-request sensor recovery: fields with no reading now receive an initial soil/crop-aware reading automatically, so the dashboard no longer shows "No sensor available" while the continuous simulator is starting.
- Made the live reading loop progressive and bounded: one target per field, realistic environmental deltas capped per sample, and dashboard polling now refreshes the latest reading, history, and analytics every five seconds.
- Fixed stale legacy readings by aligning simulator timestamps with the database clock, ignoring future-dated legacy records, and selecting the newest valid reading by database creation time. Sensor values are bounded to a realistic 5–95% range.
- Added SMS/email provider preference and test controls. Provider delivery requires environment credentials and opt-in.
- Fixed the generated manifest icon paths and updated the service worker to cache the app shell, offline navigation responses, and versioned Next.js assets; authenticated API responses remain network-only. Push messages display and notification clicks navigate into the app.
- Existing `frontend/app/page.tsx` was edited after the user explicitly lifted the freeze.
- Reworked the dashboard visual language toward the supplied AgroMesh reference: warm neutral canvas, compact white insight cards, green icon accents, cooperative field context, grouped Sensor Insights and Soil Conditions, and a lighter bottom navigation surface.
- Increased dashboard contrast and added a desktop grid: wider workspace, full-width controls, side-by-side recommendation and Sensor Insights, and aligned lower detail panels while preserving the mobile stack.

## Backend and database

- Added password hashing (Node scrypt), signed seven-day HTTP-only sessions, signup/login/logout/profile routes, configurable credentialed CORS, and production requirement for `JWT_SECRET`.
- Scoped field listing/creation and field-bound sensor, weather, history, analytics, crop, and prediction access to the authenticated farmer.
- Added idempotent startup migrations and `database/migrations/001_week5_week6.sql` for passwords, extra prediction features, weather wind speed, notification preferences, and push subscriptions. The canonical schema and a clearly marked development seed were updated as well.
- Added stored weather fallback when OpenWeather is unavailable, with source metadata. No fabricated weather fallback is used by the dashboard.
- Added persisted notification preferences, Web Push subscription storage/delivery, Twilio SMS, SendGrid email, and Sarvam text translation endpoints. Optional integrations report when credentials are missing.

## ML integration and code reliability

- Kept the existing model artifacts, feature-engineering contract, water-depth calculation, and litre formula unchanged.
- Prediction now falls back to request weather observations if OpenWeather forecast is not configured or fails.
- FastAPI validates numeric input ranges, verifies the same signed farmer session as Express, enforces field ownership, and gives a clear missing-sensor response.
- Stored schedule volume now matches the generated schedule (zero when over-watering protection cancels irrigation); the separate formula-derived water requirement remains unchanged.
- Training data/model paths are repository-relative. Training and MLflow scripts no longer train/log during import. Model-version output records metrics from an intentional training run instead of asserting hard-coded metrics.

## Validation performed

- `frontend/npm run build` passed after the route, auth, language, voice, notification, report, PWA, and email/phone sign-in changes.
- `node --check backend/server.js` and `node --check backend/auth.js` passed.
- Python compilation passed for FastAPI, prediction, training, MLflow, and model metadata modules.
- Existing feature-engineering and preprocessing checks passed (10,000 rows; transformed matrix has 73 columns).
- Offline ML smoke prediction passed using the saved model and current-observation weather fallback.
- Live Express/PostgreSQL checks passed for signup, profile lookup, farmer-scoped field creation/listing, crop creation, notification preference persistence, cross-farmer access denial, and logout. Temporary accounts/field data were removed after the checks.
- `GET /` and `/db-test` passed against PostgreSQL.
- Replaced the stale Express process on port 3000 with the updated server; verified its protected field and session endpoints return 401 without a session.
- Live FastAPI prediction endpoint returned 401 without a farmer session; Python compilation passed.
- Next.js dev server returned 200 for the dashboard, login, manifest, service worker, and both app icons.
- Frontend ESLint passed; `git diff --check` passed.

## Runtime prerequisites and limits

- The application needs Express on port 3000, FastAPI on port 8000, Next.js on port 3001, and PostgreSQL.
- Provider delivery requires credentials; browser/device behavior still needs physical device checks.
- Actual Sarvam, Twilio, SendGrid, and remote Web Push deliveries need valid credentials; they were not configured or claimed as live-tested.
- Browser voice recognition, push permission, app installation, and offline shell were not exercised on physical Android/iOS/tablet devices. SpeechRecognition availability depends on the browser. Push requires HTTPS (localhost is allowed for development) and VAPID keys.
- Browser print uses the native print dialog's “Save as PDF”; it does not create a PDF silently.
