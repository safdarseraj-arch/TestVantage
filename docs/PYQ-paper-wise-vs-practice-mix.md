# PYQ paper-wise generation vs practice 40/30/30

Staff note. The generate UI already exists. This file records how the two mixes differ, and why we are not running another paper scrape.

---

## Two different jobs

| | Practice trial SCQs | PYQ-style (AI), paper-wise |
| --- | --- | --- |
| Where | Question Bank > Gemini trial drafts | PYQ generate panel (admin). Saves into the PYQ bank under that paper |
| Mix | Easy 40% / Moderate 30% / Tough 30% | Do not force 40/30/30. Estimate actual difficulty of that sitting (T1-T10) |
| Identity | Chapter / subject only | Exam + year + date/shift (Main) or Paper 1/2 (Advanced) or year (NEET) |
| Legal | Original-ish practice items | Still original-ish. Not a licensed official NTA / IIT dump. Never labelled official PYQ |
| Toughness bands | Easy = T1-T3, Moderate = T4-T7, Tough = T8-T10 | Same scale, but the spread should match the real paper, not the 4/3/3 plan |

Practice mix lives in src/utils/bankToughnessMix.js. PYQ generate lives in src/components/PyqGeminiGeneratePanel.jsx and src/utils/pyqGeminiExtract.js. Prompts in src/utils/geminiScqTrial.js already say: do not force 40/30/30 on PYQ-style items.

Needs the API on port 3001 (npm run api:start) for Gemini / Improve.

---

## Built-in PYQ dumps are not official papers

The workspace does not contain usable official NTA / JEE Advanced / NEET question dumps.

1. src/data/pyqCatalog.js -- demo templates only. The same short stems are stamped onto many years and slots. Fine for UI and study-mode wiring. Not real previous-year papers.
2. src/data/officialPyq/manifest.json -- empty index (portals: [], slots: []). scripts/fetch-official-pyq.mjs only probes official portal URLs. It does not download or parse papers. Live NTA PDF links change often.
3. src/data/officialPyqSources.js -- curated archive / landing-page links (NTA, jeeadv.ac.in). Most slots are manual download, then upload. liveFetch is off unless a stable public PDF is known.
4. No coaching-site scrape -- do not pull papers from third-party PYQ sites. That work was tried and produced garbage or unsafe copies. Stop.

Students see demo items plus whatever staff legally import. Imported items sit in local PYQ storage and merge in getAllPyqQuestions() -- the demo list is never wiped.

---

## What staff should do instead of another scrape

1. Open the official archive (NTA / JEE Advanced / NEET portal).
2. Download the official PDF yourself.
3. Upload into the official PYQ pending queue. Approve only after a human check.
4. Or use PYQ-style (AI) to fill a named sitting for practice -- tagged by year/date/shift, actual toughness, clearly not official.

Do not start a new extractor. Do not invent answer keys. Do not copy competitor paper banks.