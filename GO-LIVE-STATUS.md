# TestVantages — Go-live status

Product mode is **live** (not a development demo). Local URL until you host: **http://127.0.0.1:5173/** (Question Bank: **http://127.0.0.1:5173/question-bank**). Use Cursor’s browser, not Edge/Chrome — they are different storage.

## What is live (software)

- Fake dated “official PYQ” catalog is **off** for students. PYQ Bank shows only papers staff import and approve.
- Leaderboard and ranks use **real attempts only**. Development seed names are not shown.
- Built-in catalog papers are labelled **Sample paper** — not official NTA papers.
- Paper pattern designer is wired at `/admin/paper-patterns` (staff).
- Save mode defaults to **Online**. Start the API on port **3001** so sync is real.
- Students never see Question Bank. Staff bootstrap login stays on the Admin tab only.
- Go live guide stays in **More** for staff, not for signed-in students.
- Reversible demo: add `VITE_ALLOW_DEMO_SEED=1` to `.env` and press F5. Never set this on a public host.

## What the founder must still do (human)

1. **Host** — rent a cloud computer, copy `onlinetest`, copy `.env.production.example` → `.env.production`, change all passwords, run `npm run live:deploy`.
2. **Domain + HTTPS** — point DNS at the server; use `deploy/nginx-ssl.conf.example` (Let’s Encrypt).
3. **Admin password** — change `admin@testvantage.com` in Admin (and `TESTVANTAGE_ADMIN_PASSWORD` on the server). Do not share the bootstrap password with students.
4. **Gemini key** (optional) — put `GEMINI_API_KEY` in server `.env` only, never in `VITE_*`.
5. **Official PYQ PDFs** — download from NTA / JEE Advanced / NEET portals yourself, then **Approve official papers**. Do not scrape coaching sites or label sample papers as Official PYQ.
6. **Import the question bank** on the live site (export JSON from Question Bank first).
7. **Pilot** — one school, one class, 5–10 real students on **https://your-domain** (not 127.0.0.1).
8. **Daily backup + health** — Admin → Live platform → Download live backup; monitor `/api/health`.
9. **Payment** — not built as a checkout in this app; handle fees in School Management or your own process.

Hosting, DNS, keys, legal PDF upload, and payment are not faked in software.

## How to run locally (still Cursor until you host)

1. Press **F5** (or **Ctrl+Shift+B**), or **Ctrl+Shift+P** → Run Task → **1. Start TestVantages**.
2. Keep the bottom panel open (**Ctrl+J** then **Ctrl+`**).
3. Open **http://127.0.0.1:5173/** in Cursor’s browser.
4. API is often port **3001** (`npm run api:start`) — needed for Online save and server login after `live:deploy`.

Full steps: in-app **More → Go live guide** (`/go-live-guide`) and Admin → Go-live readiness.

## Production build (this Windows/OneDrive PC)

- `npm run build` in the OneDrive folder often sits on `transforming…` — that is a known OneDrive issue, not a product bug.
- Use **`npm run live:build`** instead. It builds on local disk (`AppData`) and copies `dist/` back. The copy now includes the `server` folder so Vite can load.
- First run can take 15–25 minutes. On a Linux cloud server, `npm run live:deploy` is usually 2–5 minutes.

| Now (this computer) | After `live:deploy` on your domain |
| --- | --- |
| Cursor browser at 127.0.0.1 | Students use https://your-domain |
| Accounts and bank in this browser (plus API if running) | Server login + PostgreSQL |
| Question Bank for teachers/admins only | Same — students never see it |
