# FarmHub — Farmer ↔ Buyer marketplace

React + Vite frontend, Flask + SQLite backend (JWT auth).

## Run (2 terminals)

**1. Backend** (http://127.0.0.1:5000)
```bash
cd farmhub/backend
python -m venv venv
venv\Scripts\activate          # Mac/Linux: source venv/bin/activate
pip install -r requirements.txt
python app.py
```
A seeded database (`instance/farmhub.db`) is included. To reset demo data: `python seed.py --reset`.

**2. Frontend** (http://localhost:5173)
```bash
cd farmhub
npm install
npm run dev
```

## Demo logins (password: `farmhub123`)
- Farmers: `ramesh@farmhub.test` (Nashik), `vidarbha@farmhub.test` (Nagpur), `deshmukh@`, `gill@`, `valley@farmhub.test`
- Buyers: `buyer@farmhub.test` (Nagpur), `freshmart@farmhub.test` (Nashik), `orangecity@farmhub.test` (Nagpur)

## What works
- Landing page: the visitor first chooses **Farmer** or **Buyer**, then registers / logs in for that role
  (logging in with the wrong role shows a clear message). JWT in localStorage.
- Each role gets its **own app** with its own menu — farmers never see buyer screens and vice versa.
- **Farmer app:** Overview · My produce · Orders · Buyer demand · Seasonal crops · Finance
  - add / edit / delete products with photo, crop season and a private production cost per unit
  - accept / reject orders; **Complete** asks for transport, packaging, labour and other costs
  - **Finance dashboard:** crops sold the most, every deduction (platform fee, transport, packaging,
    labour, other) between the sale price and the amount **received in bank**, production cost,
    **gross profit** and net profit — monthly, quarterly and yearly, split by crop season
- **Buyer app:** Overview · Marketplace · My orders · My requirements · Seasonal crops · Spending
  - marketplace with search, category and **season** filters ("In season now")
  - post requirements, track orders, spending dashboard (what you buy most, by period and season)
- **Seasonal crops:** Kharif (Jun–Oct), Rabi (Nov–Feb), Zaid (Mar–May) with sowing/harvest months,
  typical crops, live listings (buyers) or buyer demand (farmers) for each season
- Regional map: LIVE farmer listings for buyers, LIVE buyer requirements for farmers, next to sample data
- Buyer phone numbers are visible only to logged-in farmers; a farmer's production cost only to that farmer

## Phase 2 (all free: no paid API, no paid SDK)
| Feature | How it works | Free stack |
|---|---|---|
| **Anti-middleman KYB** | Buyers verify GSTIN (official GSTN mod-36 check digit + state code), FSSAI (14 digits) and business type. Commission agents / traders are refused. A buyer ordering > 4 crop types or shipping to > 3 PIN codes in 7 days is auto-flagged; farmers see a ⚠ badge | `backend/kyb.py`, rule in `app.py` |
| **Mandi & MSP benchmark** | Add/Edit produce and the buyer's order form show the district APMC modal price and Govt MSP. Price > 15 % below mandi, or below MSP, shows a warning | `backend/mandi.py` + `mandi_rates.json`; live AGMARKNET if `DATA_GOV_API_KEY` (free) is set |
| **Village pools (mini-FPO)** | "Pool with nearby farmers" groups the same crop in the same 6-digit PIN code (2+ farmers) into one lot. Buyers order once; the order is split across farmers in proportion to their stock | `BatchPool` model, `GET /api/pools`, `POST /api/pools/<id>/order` |
| **Milestone escrow** | Buyer pays (simulated UPI) → 100 % locked → farmer marks *picked up* → 70 % released → buyer's 4-digit delivery OTP → 100 % settled. Rejecting a paid order refunds it | `POST /api/orders/pay`, status `picked_up`, escrow timeline on both apps |
| **Photo quality grade** | Every uploaded crop photo is scored for resolution, sharpness, colour vibrancy, dark spots and lighting → Grade A / B + freshness % badge | Pillow (`backend/quality.py`) |
| **Hindi / Marathi + voice** | EN · हिं · मरा switcher; default from the user's state. "Speak to fill" understands e.g. *"20 quintal onion 1800 rupees"*, *"बीस क्विंटल प्याज अठारह सौ रुपये"*, *"२० क्विंटल कांदा १८०० रुपये"*; a type-in box does the same where the mic is not available | Own i18n (`src/i18n.js`, `src/i18n/*.js`) + browser Web Speech API |

### Also included
- **Ratings & reviews:** after delivery the buyer rates the farmer (1–5 ★ + comment). The rating shows on listings, pools and the order form; buyers can open all reviews; farmers see theirs under *My profile*.
- **Profiles:** farmers and buyers edit name, phone, PIN code, address and app language (*My profile* / *Business profile*).
- **Cancel:** a buyer can cancel an order the farmer has not accepted yet; a paid order is refunded from escrow.
- **Installable, offline-ready app (PWA):** manifest + icons + service worker. On a phone, Chrome/Edge offer "Install FarmHub". Screens that were opened once still open without internet; prices, orders and money are never cached. (Active in the production build: `npm run build`.)
- **Every screen in English, हिंदी and मराठी**, including finance, seasonal crops and the map.

### Map, mandi prices, Razorpay
- **All 36 states / UTs and 787 districts** are clickable on the map (boundaries from `vardhan-maps`). Each district shows its live listings (or buyer demand) and a **mandi price + MSP board**. State and district can also be picked from a **searchable dropdown** (type "chha" → Chhattisgarh), here and on signup / profile.
- **Live government prices:** put a free key from data.gov.in (sign up → My Account → API key) in `backend/.env` as `DATA_GOV_API_KEY`. Prices then come live from AGMARKNET (Govt of India daily mandi prices). Without it, or if the API is rate-limited, the offline cache in `mandi_rates.json` is used.
- **Razorpay (test mode):** create a free Razorpay account, switch the dashboard to *Test Mode*, generate API keys and put them in `backend/.env` as `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET`. The escrow payment then opens the real Razorpay checkout; the server verifies Razorpay's signature before locking the money. No keys → simulated UPI.
- **Chhattisgarh demo:** `durg@`, `kamla@` (Durg tomato pool, PIN 491111), `raipurfarm@` (paddy, Dubraj rice), `bastar@` (Kondagaon maize) and the verified buyer `raipur@farmhub.test` (Annapurna Hotels Raipur).

Demo accounts added by `python seed.py --reset`: `sunita@` and `ganesh@farmhub.test` (Nashik farmers in the onion pool with Ramesh, PIN 422202) and `quick@farmhub.test` (a flagged "possible middleman" buyer). Escrow demo orders use delivery OTP **4821**.

## Deploy
See `../DEPLOY.md` (Render + Neon, free).

## Notes
- Existing local DB? New columns (season, costs…) are added automatically when the backend starts.
- To load the new demo data (past sales for the finance dashboard) run `python seed.py --reset`
  — this **wipes** the local database first.
- `PLATFORM_FEE_PERCENT` (default 2) in `backend/.env` sets the fee deducted from each completed sale.
- After pulling Phase 2, run `pip install -r requirements.txt` once more (adds Pillow).
- The UPI payment is simulated for the prototype; no real money moves. Mandi prices in `mandi_rates.json` are an offline cache: set `DATA_GOV_API_KEY` for live AGMARKNET prices.
- Change `VITE_API_URL` (see `.env.example`) if the backend runs elsewhere.
