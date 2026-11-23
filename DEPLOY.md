# FarmHub ko online (deploy) kaise kare

Free tools: **GitHub** + **Neon** (database) + **Render** (backend + frontend). Total ~20 minute.

> Backend ko SQLite par nahi, **Postgres** par chalana hai, kyunki free hosting par file-based DB
> har redeploy par mit jaata hai. Product photos bhi DB me store hoti hain, to wo bhi safe rehti hain.

## 1. Code GitHub par daalo
`Hac-a-Sol` folder ko ek GitHub repo me push karo (repo ka root wahi folder hona chahiye jisme `render.yaml` hai).
`.env` aur `venv` push nahi hote (`.gitignore` me hain).

## 2. Free Postgres banao (Neon)
1. https://neon.tech par signup karo → **New Project**.
2. **Connection string** copy karo (`postgresql://user:pass@host/db?sslmode=require`).

## 3. Render par deploy karo
1. https://render.com → **New → Blueprint** → apni GitHub repo chuno. `render.yaml` apne aap 2 services bana dega:
   - `farmhub-api` (Flask backend)
   - `farmhub` (React frontend)
2. Ye 3 variables maangega:

| Service | Variable | Value |
|---|---|---|
| farmhub-api | `DATABASE_URL` | Neon ki connection string |
| farmhub-api | `FRONTEND_URL` | `https://farmhub.onrender.com` (frontend ka URL) |
| farmhub | `VITE_API_URL` | `https://farmhub-api.onrender.com` (backend ka URL) |

3. Agar Render ne naam ke aage kuch extra laga diya (naam pehle se liya tha), to asli URLs dashboard me dekho,
   env variables sahi karo, aur **frontend ko "Clear build cache & deploy"** karo
   (`VITE_API_URL` build ke time baked hota hai).

## 4. Check karo
- `https://<backend-url>/api/health` → "FarmHub backend is healthy!"
- Frontend kholo → marketplace me demo products dikhne chahiye (`SEED_DEMO=1` pehli baar demo data daal deta hai).
- Login: `ramesh@farmhub.test` / `farmhub123` (farmer), `buyer@farmhub.test` / `farmhub123` (buyer).

## Dhyan rakho
- **Free tier sleep karta hai:** kuch der baad pehli request ~30-60 sec leti hai. Demo se 2 minute pehle site khol lo.
- **Demo ke baad** Render me `SEED_DEMO` hata do aur demo accounts ka password mat chhodo (sabko pata hai).
- **Vercel / Netlify** par frontend dalna ho: root `farmhub`, build `npm run build`, output `dist`,
  env `VITE_API_URL` = backend URL. Phir backend ke `FRONTEND_URL` me wahi URL daalo.
- Local me pehle jaisa hi chalega (SQLite). Deploy files (`render.yaml`, `Procfile`, `requirements-prod.txt`)
  local run ko affect nahi karti.
