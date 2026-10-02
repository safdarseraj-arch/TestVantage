# TestVantage

JEE / NEET–style mock test platform — React 18 + Vite 6.

## Run locally (recommended)

1. Open this project in **Cursor**.
2. Press **F5** (or **Ctrl+Shift+B**), or run task **1. Start TestVantage**.
3. Wait until the bottom panel shows the server is ready.
4. Open Cursor’s built-in browser to:

   **http://127.0.0.1:5173/question-bank**

Use **127.0.0.1**, not `localhost` (different browser storage). Keep the bottom terminal panel open while you work.

Full simple guide: **0 - READ ME FIRST.txt** (parent TestVantage folder).

```bash
npm install
npm run start
# or: npm run dev
```

## Login

### Student (register / sign in)
- `/login` → **Student** tab
- Register with name, email, password (min 4 chars)
- Guests can still take tests; history is stored per browser

### Admin
- `/login` → **Admin** tab
- Staff bootstrap (local only): `admin@testvantage.com` / `admin123` — **change this in Admin**. Do not share with students.
- **Before public hosting:** set `TESTVANTAGE_ADMIN_PASSWORD` in `.env` / `.env.production` to a strong secret
- Access: Question Bank, Create Test, Admin panel, School Management

Live product mode is **on by default** (no fake official PYQ, no seed leaderboard). To restore local demo seeds for staff testing only, set `VITE_ALLOW_DEMO_SEED=1` in `.env` and press F5.

## Features

### Tests
- JEE Main, JEE Advanced, NEET patterns
- 6 question types: MCQ, MSQ (partial marking), matrix, passage, integer, numerical
- Timer, question palette, mark for review, auto-submit

### Result analysis (`/result/:testId`)
- Summary, question review, solutions, My Results

### Question Bank (admin)
| Tab | Upload |
|-----|--------|
| Single | Question + options + solution + chapter |
| Word/PDF/Image | Hybrid OCR (Local always; Gemini optional) |
| Bulk paste | `Q1.` … `Answer: A` … `Solution: …` |
| JSON / CSV | Full import/export |

### Student insights
- Career Compass (rank / college + Choice Filling Guide)
- Exam Pulse (news briefing)
- Mock Builder / practice / PYQ

### School Management
- Schools, classes, staff, attendance, fees, timetable (admin / teacher)

## Quality checks

```bash
npm run test:upload-gate
npm run build
```

## Production deploy (server)

1. Copy `.env.production.example` → `.env.production` and **change all passwords**.
2. Add `GEMINI_API_KEY` (optional but recommended for upload/solutions).
3. On your cloud server (with Docker installed):

```bash
npm install
npm run live:deploy
```

4. Open **http://your-server:8080** — add HTTPS with `deploy/nginx-ssl.conf.example`.

Stack: **nginx + 2× API + PostgreSQL + Redis + Pix2Text**.

```bash
npm run deploy:preflight   # check only
npm run stack:logs         # view logs
```

Health: `GET /api/health` and `GET /api/ready`.

**OneDrive / Windows dev folder:** `npm run live:build` automatically builds on local disk (`scripts/onedrive-build.mjs` → `%LOCALAPPDATA%\testvantage-build`) because synced `node_modules` makes Vite sit on `transforming…` for 15–30+ minutes. First run also copies `node_modules` (5–10 min). On a **Linux cloud server**, `npm run live:deploy` usually builds in **2–5 minutes**.

**Secrets:** keep API keys in server `.env` only (`GEMINI_API_KEY`, etc.). Never use `VITE_*` for secrets.
