# FieldWise PWA

This folder contains the farmer-facing Next.js app. See the repository [README](../README.md) for full-stack setup, database initialization, provider credentials, and the ML workflow.

## Run locally

Create `.env.local` from `.env.example`, then run:

```bash
npm install
npm run dev -- -p 3001
```

Open `http://localhost:3001/login`. The Express API defaults to port 3000 and FastAPI defaults to port 8000.

### HTTPS on a phone over your LAN

Microphone recording requires a secure browser context. Start the frontend with `npm run dev:https` (or pass your current LAN IP: `npm run dev:https -- 192.168.1.5`). This creates a local development CA and an HTTPS certificate for that IP, then serves the app at `https://<LAN-IP>:3001`. Keep the frontend, Express, and FastAPI services running as usual.

On the phone, transfer `frontend/.certs/ca.crt` from this computer and install it as a trusted CA certificate. On iPhone/iPad, also enable full trust under **Settings → General → About → Certificate Trust Settings**. Android and Firefox certificate handling varies by version; if the browser still shows a certificate warning, it will not enable microphone access. Only install this development CA on devices you control. The CA private key stays in the ignored `frontend/.certs/` directory.
