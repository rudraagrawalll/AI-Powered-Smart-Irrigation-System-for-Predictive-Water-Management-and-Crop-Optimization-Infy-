# FieldWise — Smart Irrigation and Farm Management

FieldWise is a responsive web application for farmers to review field and crop information, monitor soil readings and weather, and get machine learning based irrigation recommendations. It includes English, Hindi, and Kannada interface support, voice interaction, alerts, history, analytics, and printable/exportable reports.

## Features

- Farmer registration and sign-in with protected, farmer-scoped data.
- Field and crop management, sensor readings, weather observations, irrigation recommendations, and history.
- FastAPI prediction service using the saved scikit-learn model and preprocessing artifacts in `ml/models`.
- English, Hindi, and Kannada dashboard labels, voice questions, and spoken responses. Optional Sarvam translation translates recommendation text.
- In-app and browser alerts, with optional Web Push, SMS, and email providers.
- Field analytics, CSV export, print-to-PDF, and installable PWA shell.
- Responsive layouts for desktop and mobile browsers.

## Architecture

| Component | Technology | Default address |
| --- | --- | --- |
| Web app | Next.js, React, TypeScript, Recharts | HTTPS: `https://localhost:3001` (or LAN IP on port 3001) |
| Application API | Express, PostgreSQL | `http://localhost:3000` |
| Prediction API | FastAPI, scikit-learn | `http://localhost:8000` |
| Sensor simulator | Python | Sends readings to Express on port 3000 |

The browser calls the web app, which proxies API requests to Express and FastAPI. Both backend services use the same `JWT_SECRET`; authenticated routes enforce field ownership. PostgreSQL stores account, field, reading, recommendation, weather, and notification data.

## Requirements

- Node.js and npm
- Python 3.10 or newer
- PostgreSQL
- OpenSSL for local HTTPS certificates

## Local setup

### 1. Create the database

```bash
createdb smart_irrigation
psql -d smart_irrigation -f database/schema.sql
```

Optional demo data:

```bash
psql -d smart_irrigation -f database/seed.sql
```

The seed is for local demonstrations only. It creates illustrative sample data and a development account; do not use it in production.

### 2. Configure and start Express

Copy `backend/.env.example` to `backend/.env`. Set the PostgreSQL connection and a long, random `JWT_SECRET`. The same secret must be available to FastAPI. Configure `FRONTEND_ORIGINS` and `FRONTEND_ORIGIN` for the origins you use. Keep `.env` files private.

```bash
cd backend
npm install
npm start
```

Express listens on port 3000 by default. Its startup applies additive, idempotent migrations for supported application features.

### 3. Install Python dependencies and start FastAPI

From the repository root:

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn backend.api.main:app --host 0.0.0.0 --port 8000
```

For optional MLflow experiment tracking, install `requirements-mlflow.txt`. FastAPI needs the same `JWT_SECRET` as Express and the saved artifacts under `ml/models`.

### 4. Configure and start the web app

Copy `frontend/.env.example` to `frontend/.env.local`. The proxy targets default to the local Express and FastAPI services.

For local HTTPS, run:

```bash
cd frontend
npm install
npm run dev:https
```

Open the HTTPS URL printed by the command. To select a LAN IP explicitly:

```bash
npm run dev:https -- 192.168.1.5
```

For another device on the same network, install and trust `frontend/.certs/ca.crt` on that device, then visit `https://<computer-LAN-IP>:3001`. The development certificate is self-signed; each device/browser must trust the generated local CA. The private certificate keys stay in the ignored `.certs` directory. Do not use this development certificate as a public production certificate.

### 5. Optional sensor simulator

Ensure the database has fields to simulate and start the simulator from the repository root:

```bash
.venv/bin/python simulation/sensor_readings.py
```

It discovers active fields and periodically posts generated readings to Express. These readings are synthetic and should be treated as demo data, not physical sensor measurements.

## Configuration and providers

The dashboard can use saved weather observations when the weather provider is unavailable. It reports unavailable weather when neither source has data.

- **OpenWeather:** set `OPENWEATHER_API_KEY` in `backend/.env` for current conditions and forecast data.
- **Sarvam translation:** set `SARVAM_API_KEY` in `backend/.env` for on-demand English recommendation translation to Hindi or Kannada. Static interface labels do not need a key.
- **Browser push:** generate a VAPID pair with `npx web-push generate-vapid-keys`. Set the public and private values in the backend environment and the matching public value in `frontend/.env.local`. The user must opt in on each device/browser.
- **Twilio SMS:** set its account SID, auth token, and `TWILIO_FROM` or `TWILIO_MESSAGING_SERVICE_SID`. The farmer must opt in and have a phone number saved.
- **SendGrid email:** set `SENDGRID_API_KEY` and a verified `SENDGRID_FROM_EMAIL`. The farmer must opt in.

Provider credentials belong on the server. External SMS, email, push, weather, and translation calls require valid provider configuration; actual delivery can incur charges.

## Machine learning workflow

Run the existing feature-engineering and preprocessing checks from `ml/src`:

```bash
../../.venv/bin/python test_feature_engineering.py
../../.venv/bin/python test_preprocessing.py
```

Inspect model metadata:

```bash
../../.venv/bin/python model_version.py
```

Retrain only when intentionally replacing the checked-in model artifacts:

```bash
../../.venv/bin/python train_model.py
```

Training and MLflow logging run only when their scripts are invoked. Importing those modules does not start training. Prediction can use current weather observations when the forecast provider is unavailable. The model input contract and water-depth/litre calculations are documented in the ML source and should be preserved when updating the model.

## Main API routes

**Express**

- `POST /api/auth/signup`, `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout`
- `GET/POST /api/fields`, `POST /api/crops`, `PATCH /api/farmers/me`
- `POST /api/sensor/readings`, `GET /api/sensor/latest/:field_id`, `GET /api/sensor/history/:field_id`
- `GET /api/weather/:field_id`, `GET /api/weather/history/:field_id`
- `POST /api/irrigation/complete`, `GET /api/irrigation/history/:field_id`
- `GET /api/analytics/:field_id`, `POST /api/translate/recommendation`
- `GET/PUT /api/notifications/preferences`, `POST /api/push/subscribe`, `POST /api/notifications/test`

**FastAPI**

- `POST /api/predict-irrigation` (authenticated prediction for an owned field)

## PWA and offline behavior

The app manifest is `/manifest.webmanifest`, and the service worker is `/sw.js`. The worker caches the app shell and icons and provides an offline navigation fallback. Authenticated API responses and farmer data are not cached for offline use. Voice recognition, speech synthesis, push, and PWA installation support depends on browser and device capabilities; HTTPS is required for these features outside localhost.

## Verification

The project has been checked with frontend ESLint and TypeScript, Python compilation, browser route and voice smoke checks, and live HTTPS/API/database health and read-only data routes. Successful prediction and irrigation-completion writes, physical mobile microphone behavior, and real external notification delivery need dedicated test data, device access, or provider configuration; do not infer those from health checks alone. See [PROJECT_REPORT.md](PROJECT_REPORT.md) for the project overview and verification summary.
