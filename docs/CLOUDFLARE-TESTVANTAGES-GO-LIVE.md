# testvantages.com -- go live this week

You already own **testvantages.com** at Cloudflare. That is only the **name**. You still need a computer on the internet to run TestVantages.

This laptop is slow -- **do not build or deploy from here.** Rent a cloud computer, run the live command **there**, then test for **one week**. Remaining gaps can wait until after that week.

In-app copy: **More -> Go live guide**. Status list: `GO-LIVE-STATUS.md`.

---

## 1. Pick ONE host (read this first)

**Use: DigitalOcean Droplet with Docker (4 GB RAM).**

1. This project already has a one-command live path: `npm run live:deploy`. It starts Docker: website + API (port **3001** inside) + database + Redis + Pix2Text (math OCR). There is **no** Railway / Render / Fly / Procfile setup in this repo.
2. TestVantages is **not** serverless. The API must stay **on** all day (always-on Node). Railway and Render free/hobby plans often **sleep**. Splitting the app across those hosts would mean a new setup we do not have.
3. DigitalOcean has a simple website and a **browser terminal**, so you barely use this slow laptop. Hetzner is the same recipe and cheaper if you are happy with more Linux. Fly is more command-line. Cloudflare Pages cannot run this API.

**Honest:** this is a website **plus** a Node API **plus** a database. Students never type `:3001`. A front door on the same computer forwards `/api` to the API.

---

## 2. What Cloudflare already did

1. You registered **testvantages.com** with Cloudflare Registrar (the shop that sold you the name).
2. **DNS lives in Cloudflare** -- the address book that says "when someone types this name, send them here." Edit it in Cloudflare -> **DNS**.
3. You do **not** need to move the name or change nameservers.
4. Cloudflare has **not** rented you a computer. Cursor at **127.0.0.1** is still only on this laptop.

---

## 3. Create the DigitalOcean computer

1. Open [https://cloud.digitalocean.com](https://cloud.digitalocean.com) and sign up (card required).
2. **Create** -> **Droplets**.
3. Choose **Marketplace** -> search **Docker** -> pick the Docker on Ubuntu image (Docker is already installed -- it runs the packaged app).
4. Size: **4 GB RAM** (not 1 GB). Pix2Text downloads about 1-2 GB of models on first start. 80 GB disk is safer than 25 GB.
5. Region: closest to your students (India: Bangalore if offered).
6. Auth: a password is fine for this week if the dashboard allows it. Save it in a password manager.
7. Create the droplet. Copy the **public IP** (four numbers).

Hetzner: same idea (Ubuntu + Docker + 4 GB). Then jump to step 4.

---

## 4. Open a terminal ON the cloud computer (not this laptop)

1. In DigitalOcean, open the droplet -> **Access** -> **Launch Droplet Console** (a black window in the browser).
2. Install Node.js (the program that **builds** the website) and Git (copies the project):

```bash
sudo apt-get update
sudo apt-get install -y git curl
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v
docker --version
```

3. You should see a Node version and a Docker version. If Docker asks to log out/in, close the console and open it again.

---

## 5. Put THIS project on the cloud computer

The live site must be the **`onlinetest`** folder (the one with `package.json`). **Do not** run `npm run live:deploy` on this slow Windows/OneDrive laptop.

**A -- if GitHub already has the current app**

```bash
git clone https://github.com/safdarseraj-arch/TestVantage.git
cd TestVantage/onlinetest
```

Then open the folder that contains `package.json` and `deploy/docker-compose.yml` (often named `onlinetest`).

**B -- if GitHub is behind this laptop (common)**

1. On this laptop, copy the `onlinetest` folder **without** `node_modules` (that folder is huge and slow).
2. ZIP it. Upload to the droplet (DigitalOcean does not need the laptop to *build* -- only to copy files once).
3. On the droplet, unzip into a folder and `cd` into `onlinetest`.

Do not commit `.env` or `.env.production`.

---

## 6. Secrets on the server (never in git)

On the droplet, inside `onlinetest`:

```bash
cp .env.production.example .env.production
nano .env.production
```

(`nano` is a simple text editor. Change the lines, then Ctrl+O, Enter, Ctrl+X.)

Set all of these:

1. `POSTGRES_PASSWORD` -- a long new password. Put the **same** password inside `DATABASE_URL` (the part after `tv:`).
2. `TESTVANTAGE_ADMIN_EMAIL=admin@testvantages.com` (or your email).
3. `TESTVANTAGE_ADMIN_PASSWORD` -- a long new password. **Not** `admin123`.
4. `VITE_PUBLIC_SITE_URL=https://www.testvantages.com`
5. `TESTVANTAGE_CORS_ORIGIN=https://www.testvantages.com,https://testvantages.com`
6. `GEMINI_API_KEY=` your real Gemini key (server only). Never put it in a `VITE_*` line -- those get baked into the public website.
7. Leave `VITE_ALLOW_DEMO_SEED` **unset**. Never turn demo seeds on for the public site.

`.env.production` stays on the server. Never email it. Never commit it.

---

## 7. Deploy from this project (on the droplet)

Still inside `onlinetest` on the **cloud** computer:

```bash
npm install
npm run live:deploy
```

What that does:

1. Checks the project.
2. Builds the public website **on the fast Linux disk** (usually 2-5 minutes -- not 15-25 on OneDrive).
3. Starts Docker: database + Redis + Pix2Text + API on port **3001** inside + website.

First Pix2Text start can take **5-10 extra minutes** while models download.

Then check:

1. `http://YOUR_DROPLET_IP:8080` -- you should see TestVantages.
2. `http://YOUR_DROPLET_IP:8080/api/health` -- `ok` should be true.
3. Log in at `/login` -> **Admin** with the email/password from `.env.production`.

If the page never loads, DigitalOcean **Networking -> Firewalls**: allow ports **80**, **443**, and **8080**. Do **not** open **3001** to the world.

Useful: `npm run stack:logs` (running logs). `npm run deploy:preflight` (check only).

So students do not type `:8080` later, the person helping you can change `deploy/docker-compose.yml` from `8080:80` to `80:80`, then run `npm run live:deploy` again. Until then, the IP:8080 test is enough.

---

## 8. Cloudflare DNS (after you have the IP)

In Cloudflare -> **DNS** -> **Records**:

1. **A** record, name `@` (that means **testvantages.com**) -> droplet IP.
2. **www**: **CNAME** to `testvantages.com`, or another **A** record with the same IP.
3. Official student address: **https://www.testvantages.com** (apex **https://testvantages.com** should redirect to www). CORS in step 6 must include both origins in the comma list.
4. Wait 15-60 minutes if the name is slow to update.

**Orange cloud vs DNS-only (one line):** orange (Proxied) = visitors go through Cloudflare first (hides your IP); grey (DNS only) = visitors go straight to your droplet.

This week:

1. Start **grey** until `http://YOUR_IP:8080` works.
2. After HTTPS (next step), you can turn **orange** on for `@` and `www`.

---

## 9. HTTPS (the padlock)

Schools expect **https://**.

1. On the droplet, use Let's Encrypt (often a tool called **certbot**) and this project's file `deploy/nginx-ssl.conf.example`. Replace `yourdomain.com` with `testvantages.com`.
2. In Cloudflare -> **SSL/TLS**:
   - When the droplet has a real certificate, set **Full (strict)** -- Cloudflare talks to your computer with HTTPS and checks the cert.
   - Do not leave **Flexible** after you are live (Flexible = padlock for the student, but plain HTTP to your droplet).
3. Students then use **https://www.testvantages.com**.

You already have the registrar. SSL is a **separate** switch plus a certificate **on the droplet**.

---

## 10. Change the default admin password

1. You already set `TESTVANTAGE_ADMIN_PASSWORD` in `.env.production`.
2. On **https://www.testvantages.com**, log in -> Admin tab.
3. Change the in-app admin password again to something only you know.
4. Do **not** share bootstrap admin credentials with students.

---

## 11. Copy the question bank (critical -- different storage)

**Cursor at 127.0.0.1 and production are two different cupboards.** Questions on this laptop do **not** appear on testvantages.com until you export and import. This does **not** wipe the bank if you **merge/import**. Do not use "clear bank" on live.

**Export (this laptop, Cursor browser only):**

1. Press **F5** (or **Ctrl+Shift+B**). Keep the bottom panel open (**Ctrl+J** then **Ctrl+`**).
2. Open **http://127.0.0.1:5173/question-bank** in **Cursor's built-in browser** -- not Edge, not Chrome (they are empty different storage).
3. Question Bank -> **Export JSON** or **Full backup**. Save the file (OneDrive / USB).

**Import (live site):**

1. Open **https://www.testvantages.com** (not 127.0.0.1).
2. Log in as teacher/admin.
3. Question Bank -> **Merge banks** or **Import backup JSON**. Upload the file.
4. Open **Review & publish** and confirm questions are there. Do not clear or overwrite with an empty file.

Official PYQ: download PDFs yourself from NTA / JEE Advanced / NEET, then **Approve official papers**. Do not scrape coaching sites. Do not label sample papers as Official PYQ.

---

## 12. What students use

1. Share only **https://www.testvantages.com**.
2. Never send `127.0.0.1`, `localhost`, or "open Cursor".
3. Teachers use the same URL for Question Bank and admin.
4. After live:deploy, logins and attempts save on the **server database**, not in Cursor's browser.

---

## 13. One-week test checklist

Do this on **https://www.testvantages.com** for seven days. Note anything broken. Remaining gaps wait until after this week -- do not rebuild the host unless the site is down.

**Day 1 -- doors open**

1. `https://www.testvantages.com/api/health` shows ok.
2. Admin login works. Student **Register** + **Sign in** works.
3. Teacher/admin login works. Students cannot see Question Bank.

**Day 1 -- bank and papers**

1. Imported questions appear. Publish at least one paper.
2. Create a school + class. Assign that paper to the class.

**Mock + results**

1. As a student: start a mock, use the timer and palette, submit.
2. Open Result -> question-wise -> your vs correct. Score looks right.
3. As teacher: student result appears under that class.

**Question Bank (staff only)**

1. Upload one new question (typed or image).
2. Tag chapter / exam. It shows in Review & publish.
3. **Do not** wipe or empty-overwrite the bank.

**PYQ upload**

1. Import one official PDF you downloaded legally.
2. Approve it. Confirm students see it only after approve -- no fake dated catalog.

**Gemini generate**

1. Confirm `GEMINI_API_KEY` is on the **server** only.
2. Staff: generate or OCR one item with Gemini (upload or generate flow you already use in Cursor).
3. If Gemini fails, local OCR / Pix2Text may still work -- write down what failed. That can wait until after the week unless nothing uploads at all.

**Every day this week**

1. Admin -> Live platform -> **Download live backup**. Keep the file.
2. Spot-check `/api/health`.
3. One real student (friend or child) logs in from a **phone** and a **normal browser** (not Cursor).

**End of week**

1. Admin -> **Go-live readiness**. Most items Ready; HTTPS/backup may still be Partial if you skipped a nicety.
2. List remaining gaps (payment is **not** in this app; fees stay in School Management or your own process). Then push those gaps -- do not start over.

---

## 14. What not to do

1. Do not send students to 127.0.0.1 or localhost.
2. Do not wipe the question bank.
3. Do not treat Cloudflare Registrar as the host.
4. Do not use Cloudflare Pages, Railway, or Render as the main host for this repo this week.
5. Do not put `GEMINI_API_KEY` in git, chat, or `VITE_*`.
6. Do not leave `CHANGE_ME` or `admin123` on the public site.
7. Do not set `VITE_ALLOW_DEMO_SEED=1` on the server.
8. Do not open port **3001** to the world.
9. Do not run `npm run live:deploy` on this slow OneDrive laptop and wait 30 minutes -- run it on the droplet.
10. Do not scrape coaching sites for "official" PDFs.

---

## Short path

1. Cloudflare already owns the name and DNS.
2. Create a **4 GB DigitalOcean Docker droplet**. Copy the IP.
3. Browser console on the droplet: install Node, copy `onlinetest`, fill `.env.production`.
4. Run **`npm run live:deploy`** on the droplet (not the laptop).
5. Check `http://IP:8080` and `/api/health`.
6. Cloudflare **A** / **www** records. Then HTTPS. SSL -> **Full (strict)**.
7. Change admin password. Export bank from Cursor **127.0.0.1:5173/question-bank**. Import on **https://www.testvantages.com**.
8. Test one week. Share only **https://www.testvantages.com**.

---

## Cost and more than one AI (founder)

This is a guide only. Nothing here builds a second AI. Go live this week with **Gemini** on the 4 GB droplet.

### Can we add Claude / OpenAI / another Gemini key later?

**Yes — without rewriting the product.** Keys stay on the server (port **3001**), never in the public website.

1. **Another Gemini key** — paste it into `GEMINI_API_KEY` on the server. No rewrite.
2. **OpenAI (already partly there)** — upload / extract / solve / assist can already use `OPENAI_API_KEY` on the API. The live Docker file currently passes **Gemini only**. Chapter-trial generate and PYQ “similar papers” are **Gemini-only** today.
3. **Claude** — **not** wired. A future adapter is a few days of server work (same pattern as OpenAI), not a new product.
4. Students never see keys. Local math OCR (Pix2Text) and the website do not need a second AI to run.

### Typical monthly cost (India, late 2025 / 2026)

Card bills in **USD**. Bank conversion ~₹83–₹90 per $1. India GST (~18%) may apply on the host bill.

| Item | USD | INR (about) | Notes |
| --- | --- | --- | --- |
| DigitalOcean Basic **4 GB** / 2 CPU / 80 GB disk | **$24 / month** | **₹2,000–₹2,200** | Official droplet price. This is the big fixed cost. |
| Same plan **8 GB** (only if 4 GB struggles) | $48 / month | ₹4,000–₹4,400 | Resize later. Do not start here. |
| Optional DigitalOcean weekly backup | +20% (~$5) | ~₹400 | Nice after the pilot week. |
| **testvantages.com** (Cloudflare Registrar) | ~$10.50 / **year** | ~₹900 / year | **Already paid. Do not add this to the monthly droplet bill.** |
| Gemini Flash-Lite generate (planning number) | — | **~₹0.21 / question** | 100 Q ≈ ₹21; 1,000 Q ≈ ₹210. Image OCR on the heavier Flash model can cost more. Google’s free daily quota may cover a small first week. |
| Pix2Text / local OCR | $0 extra API | ₹0 extra | Runs **on your droplet**. Cost is RAM, not a per-page bill. |
| OpenAI / Claude **later** (order of magnitude) | — | often **~5–20×** Gemini Lite | Cheap OpenAI/Claude tiers can be closer to 3–10×. Do not treat this as a quote. |

**Quiet first month (one school, light generate/OCR):** about **₹2,100–₹2,600** (droplet + a little Gemini). Domain already paid.

**Busy generate/OCR month (hundreds to ~1,000 questions):** still mostly the droplet; Gemini often **₹50–₹400**, more if many full-page images.

### Is 4 GB enough?

**Yes for go-live + Gemini + a second cloud AI later.** A second API is just an outgoing web call. It does **not** need extra RAM.

What **does** use RAM on the same 4 GB computer:

1. Website + API (two copies in Docker)
2. Database (Postgres)
3. Redis (capped at 512 MB)
4. **Pix2Text** (math OCR) — models are about **1–2 GB** on first start

**4 GB is the minimum that fits this stack.** It will feel tight during a heavy math upload. A second Gemini/OpenAI/Claude **key** does not change that.

**Move to 8 GB ($48)** if the droplet freezes or “out of memory” during Pix2Text uploads, two people upload big PDFs at once, or you add more **local** OCR models. After the one-week live test, resize in DigitalOcean if needed — do not rebuild the host.
