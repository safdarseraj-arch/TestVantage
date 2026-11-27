# TestVantages — Feature status by area

**Date:** 27 Nov 2026  
**Product:** TestVantages  
**Pilot context:** Cursor browser at `http://127.0.0.1:5173` (until go-live on testvantages.com)  
**Overall:** Software for a **small school pilot** is largely ready. Main gaps are **content** (publish bank + Official PYQ PDFs), **live server + HTTPS**, and **later** payment / WhatsApp auto-send / 10-lakh scale.

**Areas in this doc:**  
1 Question Bank · 2 Practice · 3 Test · 4 PYQ · 5 Progress · 6 Challenges · 7 Referral · 8 School ERP · **9 Career & exam guidance · 10 Teacher classroom · 11 Account/home/tour · 12 Staff ops** · 13 Folded-in map · 14 Not built yet  

Each area below uses the same structure: **What it covers** (point-by-point) · **Ready** · **Needs improve**.

Status labels used below:

| Label | Meaning |
|--------|---------|
| **Ready** | Works today for a pilot (same browser / Cursor) |
| **Partial** | Works with limits (content, API, or one device only) |
| **Later** | Planned; not blocking a small pilot |

---

## 1. Question Bank (upload)

**Where:** Question Bank tab (staff only) · `/question-bank` · `/upload` · `/question-bank/ai-generate` · `/admin`

### What it covers
1. **Smart Compose** — type one question with live math preview, soft checks, save draft / publish  
2. **Convert (OCR)** — PDF / scan / image → tagged question (Gemini + Pix2Text + local hybrid)  
3. **PDF crop / Word / bulk paste / JSON / CSV** — more import paths into the bank  
4. **Hybrid AI generate** — queue AI batches into a pending sub-bank (`/question-bank/ai-generate`)  
5. **Saved view** — browse drafts and published questions with filters (subject, chapter, source, toughness)  
6. **Review & publish** — readiness checks, untagged items, publish to the live pool  
7. **Question reports** — student/staff flags on bad items  
8. **Merge banks / Export** — combine banks; export JSON or full backup  
9. **Upload portal** — `/upload` routes Official PYQ · Any paper · Book into Approve → Hybrid → Publish  
10. **Storage** — browser save + backup + IndexedDB; optional API Online sync when server is up  

### Ready
- Compose → OCR → review → publish loop works in Cursor for staff  
- Draft vs published separation (students only see published)  
- Export / backup from Admin  
- OCR stack present (cloud + local fallback)  

### Needs improve
- **Partial:** Hybrid AI cloud queue needs API (`:3001`) + `GEMINI_API_KEY`  
- **Partial:** Cross-device bank needs live server (`npm run live:deploy` + PostgreSQL)  
- **Partial:** OCR still needs human Quality check / Approve on hard papers  
- **Later:** National-scale shared bank CDN  

---

## 2. Practice

**Where:** Practice tab · `/prepare` (Practice Hub)

### What it covers
1. **Practice Hub** — one page listing all practice modes · `/prepare`  
2. **Syllabus Practice** — self-paced chapter drills, AI pick, optional PYQ mix · `/practice`  
3. **High mistake** — practice or timed test on trap questions · `/high-mistake`  
4. **High skip** — practice or timed test on often-skipped questions · `/high-skip`  
5. **CDF Mastery** — Concept · Definition · Formula, per-question timer · `/cdf-test`  
6. **Quick Revision** — chapter notes / cheat sheet · `/quick-revision`  
7. **Formula Sheet** — pin formulas, print / Save as PDF · `/formula-sheet`  
8. **Daily Target** — clear weak chapters with a question count · `/daily-target`  
9. **Daily Practice Sheet** — dated chapter DPP · `/daily-sheet`  

### Ready
- All modes open and can start an exam session when the **published bank** has matching questions  
- High mistake / High skip categories with **Practice** or **Take test**  
- Formula pin + print path works locally  

### Needs improve
- **Partial:** Empty until staff publish enough questions (content)  
- **Partial:** High mistake / High skip lists fill from attempts (and classmates when available)  
- **Partial:** CDF needs questions tagged for CDF  
- **Later:** Native PDF writer for formula sheets (today: print → Save as PDF)  

---

## 3. Test

**Where:** Tests tab · `/mock-test` · `/tests` · `/exam/:id` · `/result/:id`

### What it covers
1. **Mock Builder** — full / subject / chapter NTA-style mocks, calibrated mode · `/mock-test`  
2. **Speed Test** — 15–60 min timed easy–medium drill · `/speed-test`  
3. **Series calendar** — week-by-week mock schedule · `/test-series`  
4. **Mock Tests list** — assigned + labelled sample papers · `/tests`  
5. **Starter Diagnosis** — short paper → weak chapters → Daily Target · `/placement-check`  
6. **Exam runtime** — timer, palette, mark-for-review, submit, auto-submit · `/exam/:testId`  
7. **Staff create/publish** — Create test · Publish review · Paper patterns · `/create-test`, `/publish-review/:id`  

### Ready
- Full mock → exam → result flow works in Cursor  
- Mock Builder and Speed Test build from published bank  
- Starter Diagnosis can lock weak chapters into Daily Target  
- Sample papers labelled clearly (not official NTA)  

### Needs improve
- **Partial:** Assigned mocks empty until school/class assignment is set up  
- **Partial:** Series calendar is a **sample** schedule until a real teacher series is published  
- **Partial:** Guest attempts stay on this browser until live server login/sync  
- **Later:** Paid checkout for public test series (payment not in app yet)  

---

## 4. PYQ

**Where:** PYQ tab · `/practice/pyq` · `/practice/similar-pyq` · staff `/official-pyq` · `/upload`

### What it covers
1. **PYQ Bank — six modes** — syllabus practice · comprehensive test · subject · chapter · calibrated · year-wise paper · `/practice/pyq`  
2. **Similar PYQ** — same six modes on AI-similar / replica bank · `/practice/similar-pyq`  
3. **Official PYQ pending** — import NTA/Advanced/NEET PDF → Quality check → Crop → Approve → Hybrid fill → Publish · `/official-pyq`  
4. **Any paper / Book PDF** — same approve pipeline for non-official papers · `/any-paper`, book upload  
5. **Institute solutions** — attach solutions PDF(s) after the paper  
6. **Durability** — pending papers in IndexedDB + lean localStorage (so uploads are less likely to vanish)  
7. **Solution crop** — place cropped figures into Question / Options / **Solution**  
8. **Known upload errors checklist** — on Pending page  

### Ready
- Six-mode UI and session builder are built end-to-end  
- Fake dated catalog is off — students only see **staff-approved** papers  
- Approve → Publish can put papers into student PYQ + Question Bank  
- IndexedDB restore + sitting-key fixes reduce “lost PYQ” failures  

### Needs improve
- **Partial / content blocker:** Student PYQ stays **empty** until you upload and **Publish** real official PDFs  
- **Partial:** Similar PYQ empty until Hybrid/Gemini similar items are published  
- **Partial:** Very large OCR sets still stress the browser; live server is better for multi-device  
- **Later:** Central server archive of all pending papers (today: durable per browser + export)  

---

## 5. Progress

**Where:** Progress tab · `/my-results` · `/analytics` · `/form-forecast` · `/leaderboard` · `/result/:id`

### What it covers
1. **My Results** — all finished attempts · `/my-results`  
2. **Score Analytics** — trends, streak, weak chapters, study path · `/analytics`  
3. **Rank Forecast** — Practice AIR, Exam Fit /100, Revision Ladder, Precision Map, Insight Coach · `/form-forecast`  
4. **Rankings (Leaderboard)** — peer standings from real attempts · `/leaderboard`  
5. **Result analysis tabs** — Overall · Time · Question-wise · Difficulty · Stamina · Chapterwise · Charts · Insight Coach  
6. **Why-wrong tags** — Misread / Concept / Calc / Formula / Guess on question-wise  
7. **Charts → High mistake & High skip — fix first** — personal fix queue + links to practice categories  
8. **Mistake-only retest** — redo wrongs from one attempt  

### Ready
- Full result dashboard and My Results work after any submitted test  
- Why-wrong tags save on the attempt  
- Rank Forecast local metrics work without Gemini  
- High mistake / High skip student categories linked from Charts  

### Needs improve
- **Partial:** Classmate “vs batch” / trap metrics need more students on the same paper  
- **Partial:** Leaderboard is peer/device (or server) — **not** official All-India NTA rank  
- **Partial:** Guest progress is browser-local until live login  
- **Later:** Rich video solutions libraries; deeper one-click remediation from every chapter row  

---

## 6. Challenges

**Where:** Challenges tab · `/todays-drill` · `/peer-pulse` · `/study-circle` · `/merit-stride` · `/doubts`

### What it covers
1. **Daily Challenge** — one mixed set for today · `/todays-drill`  
2. **Peer Match** — Spar Code link with one classmate · `/peer-pulse`  
3. **Study Groups** — Cohort Code friend rooms (not school ERP) · `/study-circle`  
4. **Rewards** — Merit Points, badges, Focus Goal · `/merit-stride`  
5. **Ask a Doubt** — question-linked help (text / file / voice) · `/doubts`  

### Ready
- All five routes work for a habit pilot on one browser  
- Daily Challenge builds/resumes a short exam  
- Peer Match and Study Groups create/join flows work on-device  
- Rewards and doubts UI are live  

### Needs improve
- **Partial:** Peer / group sync across phones needs API / live server  
- **Partial:** Daily Challenge falls back to a thin starter pack if bank is empty  
- **Partial:** Doubts are local/peer — not a national moderated desk  
- **Later:** Cash rewards (today: in-app Merit Points only)  

---

## 7. Referral

**Where:** More → Refer & Earn · `/earn` · `/campus-earn` · `/m/:slug` · `/admin/referrals`

### What it covers
1. **Refer & Earn** — share kit, promo gallery, free-mock locks, 3-bucket ledger · `/earn`  
2. **Campus Referrals** — university mentor track · `/campus-earn`  
3. **Mentor microsite** — public mentor page · `/m/:slug`  
4. **Promo video pages** — tracked promo links · `/v/:slug`  
5. **Referral Admin** — partners, video approve/feature, B2B leads · `/admin/referrals`  

### Ready
- Promoter UI end-to-end for a **demo/pilot**: codes, mentor page, gallery, ledger, admin moderation  
- Campus onboarding + share tools  
- Dev/demo tools to simulate paid conversion and payout month  

### Needs improve
- **Later / blocker for real money:** RazorpayX / TDS / real payouts = Phase 3 (today payouts are **demo**)  
- **Later:** Real student checkout → real commissions (payment not in the app yet)  
- **Partial:** Referral data mostly browser-local until live sync  
- **Partial:** Compliance / tax process still manual  

---

## 8. School Integration (ERP)

**Where:** Classroom / Admin · `/admin/schools` · `/admin/schools/:id` · `/teacher` · `/teacher/results`

### What it covers (Phase-1)
1. **School profile** — name, academic year, board  
2. **Classes / sections** — organise students  
3. **Competitive batches** — JEE / NEET style batches  
4. **Student roster** — add / CSV import  
5. **Staff / teacher invites** — link teachers to the school  
6. **Assign mocks** — push a paper to a class or batch (`exams` tab)  
7. **Attendance** — mark attendance on device  
8. **Fees** — plans / dues / mark paid **on device** (no payment gateway)  
9. **Timetable** — simple school timetable  
10. **Teacher results** — class attempts · `/teacher/results`  
11. **Diagnostics** — High mistake / High skip / Combined / Suspect key tabs + heatmap  
12. **WhatsApp helper** — opens `wa.me` draft (does **not** auto-send)  

### Ready
- Phase-1 school setup → assign mock → teacher results works for a **one-browser / one-campus pilot**  
- Diagnostic tabs for teaching priorities  
- Pilot checklist % on school dashboard  

### Needs improve
- **Partial:** Multi-device school data needs live deploy + PostgreSQL  
- **Later:** Auto WhatsApp (Twilio/Meta) — today manual draft only  
- **Later:** Online fee gateway — today mark-paid only; go-live doc: payment not in this app  
- **Later:** Full ERP depth (transport, payroll, etc.) — out of Phase-1 scope  
- **Blocked (not for pilot):** 10-lakh concurrent students (CDN / auto-scale)  

---

## 9. Career & exam guidance

**Where:** More / Progress · `/career-compass` · `/exam-pulse`  
**Why separate from Progress:** Progress = *your attempt analytics*. This area = *exam-day counselling & news*.

### What it covers — Career Guide (`/career-compass`)
1. **Rank from marks** — enter score for JEE Main / JEE Advanced / NEET UG → likely AIR / percentile band  
2. **Category filters** — General/UR · EWS · OBC-NCL · SC · ST  
3. **College & branch matches** — suggest colleges from predicted rank (IIT / NIT / IIIT / Medical filters)  
4. **Compare by branch** — side-by-side college compare (up to 5) with fees, NIRF, placements  
5. **Browse colleges** — search catalog; open one college’s facts panel  
6. **College details** — official links, counselling source tags, provenance badges (official vs indicative)  
7. **Choice filling guide** — ordered advice for JoSAA / CSAB / MCC style fill (local + optional AI explain)  
8. **Counselling predictor panels** — percentile curve, round-chance chips/table, placement package table  
9. **Admin counselling update** — staff tab to refresh counselling data when API is up  
10. **Disclaimers** — past cutoffs ≠ future guarantee; confirm on official portals  

### What it covers — Exam Updates (`/exam-pulse`)
1. **Four categories** — Exam updates · Counselling · Placements · Motivation  
2. **Curated feed** — NTA / JEE / Advanced / NEET / JoSAA / CSAB / MCC style notes shipped in-app  
3. **Official portal chips** — one-click links to NTA, JEE Main, JEE Advanced, NEET, JoSAA, CSAB, MCC  
4. **Refresh briefing** — pull a fresher briefing when API is reachable; else stay on curated  
5. **Background refresh** — about every 6 hours while the app is open  
6. **Like categories** — pin preferred categories so “All” sorts them first  
7. **“Why it matters”** — short student-facing reason on each story card  

### Ready
- Full Career Guide wizard (marks → rank → colleges → compare → browse → choice filling) works offline/local  
- Exam Updates curated briefing + portal links work without cloud  
- Links from Rank Forecast / Home into Career Guide  

### Needs improve
- **Partial:** Live AI briefing / counselling refresh needs API + keys; falls back to curated  
- **Partial:** College / cutoff DB is indicative — keep disclaimers; refresh when new JoSAA/MCC data lands  
- **Later:** Live NTA calendar API; counsellor booking; paid counselling desk  

---

## 10. Teacher classroom tools

**Where:** Classroom · `/teacher` · `/teacher/lecture-planner` · `/teacher/lecture-questions`  
**Note:** School roster / attendance / fees stay in **§8 School ERP**. This section is the teacher’s day-to-day teaching desk.

### What it covers — Teacher Home (`/teacher`)
1. **Greeting + faculty profile summary** — mode, subjects, standards, entitlements  
2. **Personal Vault** — private teacher-owned question bank (portable IP)  
3. **Upload to vault** — text / image / PDF / Word / CSV / JSON into teacher bank  
4. **Lecture plan** shortcut → Lecture Planner  
5. **Paper making** — create timed mock from teacher pool (`/create-test?pool=mine`)  
6. **Generate paper** — auto-generate from syllabus + pool  
7. **PDF** — open papers → print / Save as PDF for class  
8. **First-run tips** — dismissible get-started card  

### What it covers — Lecture Planner (`/teacher/lecture-planner`)
1. **Plan inputs** — subject, chapter, topic, duration (minutes), class note  
2. **Pool scope** — mine vs main bank (when teacher is allowed main access)  
3. **Local plan builder** — picks bank questions sized to duration  
4. **AI narration** — optional cloud narrate of teaching order / topic notes (falls back local)  
5. **Tag picks as Lecture** — mark selected questions Source = Lecture  
6. **Links** — jump to Lecture Set / Upload / Create paper  

### What it covers — Lecture Set (`/teacher/lecture-questions`)
1. **List lecture-tagged questions** — Source = Lecture (teacher-scoped for non-admin)  
2. **Tag from vault** — mark existing bank items as Lecture  
3. **Untag** — remove Lecture source  
4. **Tag by ID** — quick add by question id  
5. **Upload shortcuts** — same teacher upload routes as vault  

### Ready
- Teacher login → hub → vault / planner / lecture set / create paper loop works in Cursor  
- Lecture tagging reuses the main question-bank store (no second OCR stack)  
- Print/PDF via browser print on Edit Test  

### Needs improve
- **Partial:** Multi-device lesson sync needs live server + login  
- **Partial:** AI lecture narration richer when Gemini API is up  
- **Later:** Shared school-wide lesson library / timetable-linked lecture packs  

---

## 11. Account, home & product map

**Where:** `/home` · `/login` · `/onboarding/*` · `/profile` · `/tour` · `/go-live-guide`

### What it covers — Home (`/home`)
1. **Brand-first landing** — TestVantages hero story  
2. **5 feature highlight slides** — Practice Hub · Mock Builder · PYQ Bank · High mistake/skip · Rank Forecast  
3. **Entry CTAs** into the main student journeys  

### What it covers — Login & onboarding
1. **Role modes** — Student · Teacher · Admin · Ambassador (referral)  
2. **Register / sign-in** — local accounts for pilot; server accounts after live deploy  
3. **Invite / referral prefill** — `?invite=` / `?ref=` / captured referral codes  
4. **School invite** — campus teacher invite codes (not friend-earn codes)  
5. **Demo accounts** — quick pilot logins when enabled  
6. **Student onboarding** (`/onboarding/student`) — profile fields after first student sign-up  
7. **Teacher onboarding** (`/onboarding/teacher`) — teaching profile / faculty mode  

### What it covers — Profile (`/profile`)
1. **Edit student or teacher profile** — same fields as onboarding  
2. **Invite & earn card** — earn share code + copy link (ties to Referral)  
3. **Admin note** — founder admin password lives under Admin, not this form  

### What it covers — Product Tour (`/tour`)
1. **Full site map** — every student + staff journey labelled with path and “where in nav”  
2. **Flow strips** — typical student / teacher journeys  

### What it covers — Go-live Guide (`/go-live-guide`)
1. **Part A** — finish building in Cursor (bank, paper, one full test, backup)  
2. **Part B** — rent VPS, point domain  
3. **Part C** — deploy (`npm run live:deploy`), HTTPS, smoke test  
4. **Printable checklist** — Print → Save as PDF  
5. **National scale note** — CDN / auto-scale = later (Phase 3)  

### Ready
- Home carousel (5 slides), login roles, onboarding, profile, tour, go-live guide all usable in Cursor  
- Invite codes surface on Profile and Login  

### Needs improve
- **Partial:** Cross-device login needs live deploy + real passwords  
- **Partial:** Public marketing site / SEO landing outside the app = founder ops  
- **Later:** SSO / Google login (not required for school pilot)  

---

## 12. Staff ops & paper pipeline

**Where:** Admin / Classroom tools · `/admin` · `/admin/paper-patterns` · `/create-test` · `/edit-test` · `/publish-review/:id` · `/paper-manifest/:id` · `/merge-banks`  
**Note:** Supports §1 Question Bank and §3 Test; listed here so nothing is “hidden.”

### What it covers
1. **OCR / Admin settings** (`/admin`) — OCR stack toggles, Hybrid/Gemini readiness, teacher account tools, **Go-live readiness** checklist panel  
2. **Paper Patterns** (`/admin/paper-patterns`) — design / edit exam paper patterns (sections, marks, timing)  
3. **Create test** — wizard: pick bank questions, timing, save draft  
4. **Edit test** — open draft/published papers; print / Save as PDF  
5. **Publish review** — final checklist before students see the paper  
6. **Paper manifest** — download manifest; path to assign to a class  
7. **Merge banks** — import question JSON from another computer  
8. **Export / full backup** — from Question Bank / Admin (safety copy before go-live)  
9. **Manage meta** (QB hub) — subjects, units, chapters, exam patterns used across the bank  

### Ready
- Create → edit → publish review → manifest → assign (with school) works for pilot  
- Paper pattern designer and merge/export available to staff  
- Go-live readiness panel shows what still needs VPS/HTTPS  

### Needs improve
- **Partial:** Shared patterns / papers across devices need live server  
- **Partial:** OCR quality still needs human review on hard scans  
- **Later:** Central CDN for national shared bank  

---

## 13. Already folded into areas 1–8 (not separate products)

| Item | Lives under |
|------|-------------|
| High mistake / High skip | **§2 Practice** (+ §5 Progress charts → Fix first) |
| Similar PYQ | **§4 PYQ** |
| Campus Referrals / mentor microsite `/m/:slug` / promo `/v/:slug` | **§7 Referral** |
| Fees / Attendance / Timetable / WhatsApp draft | **§8 School ERP** |
| Rank Forecast / Leaderboard / Why-wrong / Charts | **§5 Progress** |
| Daily Challenge / Peer Match / Groups / Rewards / Doubts | **§6 Challenges** |
| Hybrid AI generate / Upload PDF / Review | **§1 Question Bank** |

---

## 14. Not built as full products yet (do not treat as ready areas)

| Gap | Note |
|-----|------|
| Student **payment / checkout** | Not in app — blocks paid public series & real referral cash |
| **Auto WhatsApp** send | Manual `wa.me` draft only |
| National **doubt desk** / live tutor | Local / peer doubts only |
| Full **ERP** (transport, payroll, HR) | Out of Phase-1 School ERP scope |
| **10-lakh** concurrent scale | Later infra; not a pilot blocker |
| Live NTA calendar API / counsellor booking | Career/Exam guidance stays local + curated for pilot |
| SSO / Google login | Optional later; email login enough for pilot |

---

## Cross-cutting (all areas)

| Item | Status | Note |
|------|--------|------|
| Brand **TestVantages** | Ready | Header + copy |
| Home hero (5 slides) | Ready | Practice Hub · Mock · PYQ · High mistake/skip · Rank Forecast |
| Login (student / teacher / admin) | Ready | Cursor now; server login after live:deploy |
| HTTPS + testvantages.com | Partial | Founder: DNS + SSL after VPS deploy |
| 10-lakh scale | Later / blocked | Does not block a 5–50 student pilot |
| Official PYQ content | Partial | Pipeline ready; need real PDF upload + Publish |
| Payment / payouts | Later | Not in app for student checkout or referral cash |

---

## Suggested pilot order

1. Publish a usable **Question Bank** (or import backup)  
2. Upload + Approve + Publish **2–3 Official PYQ** papers  
3. Create school → class → assign one mock  
4. Students: Practice Hub → Mock / PYQ → Result → High mistake  
5. Teacher: `/teacher/results` diagnostics  
6. When ready for public: VPS → `npm run live:deploy` → HTTPS on testvantages.com  

---

## Related docs

- `docs/CLOUDFLARE-TESTVANTAGES-GO-LIVE.md` — domain / deploy  
- `docs/TESTVANTAGE-PRODUCT-GUIDE.md` — product tour  
- Admin → **Go-live readiness** — live checklist in the app · `/admin`  
- More → **Go-live Guide** · `/go-live-guide`  
