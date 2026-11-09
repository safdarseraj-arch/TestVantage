/**
 * Upload auto-fix also repairs a wrong question count (too few or too many cards), and a
 * bilingual (English + Hindi) scan gives the same English paper as the English-only scan.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'

if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map()
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
    get length() { return store.size },
    key: (i) => [...store.keys()][i] ?? null,
  }
}

const { paperItemsFromMathpixOcr, countMathpixQuestionMarkers, sanitizeMathpixOcrText } = await import('../src/utils/mathpixQuestionSplit.js')
const { stripHindiOcr, ocrIsHindiOnly, stripDevanagariRuns } = await import('../src/utils/stripHindiOcr.js')
const { buildPaperFacts } = await import('../src/utils/officialPyqPaperFacts.js')
const { numberingPrintedInOcr } = await import('../src/utils/officialPyqAdminFacts.js')
const { quickOcrQuestionCount } = await import('../src/utils/pyqOcrCountLite.js')
const { importQuestionsToOfficialPyqPending } = await import('../src/utils/officialPyqApproval.js')
const { localOfficialPyqQualityCheck, persistOfficialPyqQualityRun } = await import('../src/utils/officialPyqLocalQuality.js')
const pendingStore = await import('../src/utils/officialPyqPendingStore.js')
const parseLists = await import('../src/utils/parseMatchingListDisplay.js')

let failed = 0
function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (err) {
    failed += 1
    console.error(`FAIL - ${name}\n${err?.stack || err}`)
  }
}

const DEVANAGARI = /[\u0900-\u097F]/
const en = fs.readFileSync(new URL('./fixtures/jee-advanced-2025-p2-mathpix.txt', import.meta.url), 'utf8')
const meta = { exam: 'JEE Advanced', year: 2025, session: 'Paper 2', sourceLabel: 'test' }

const HINDI_INSTRUCTIONS = String.raw`\section*{खंड 1 (अधिकतम अंक: 12)}
\begin{itemize}
\item[-] इस खंड में चार (04) प्रश्न हैं।
\item[-] प्रत्येक प्रश्न के चार विकल्प (A), (B), (C) तथा (D) हैं। इन चार विकल्पों में से केवल एक विकल्प सही उत्तर है।
\item[-] प्रत्येक प्रश्न के लिए, सही उत्तर के विकल्प को चुनिए।
\item[-] प्रत्येक प्रश्न के उत्तर का मूल्यांकन निम्न अंकन योजना के अनुसार होगा:
पूर्ण अंक : +3 यदि सिर्फ सही विकल्प ही चुना गया है;
शून्य अंक : 0 यदि कोई भी विकल्प नहीं चुना गया है (अर्थात् प्रश्न अनुत्तरित है);
ऋण अंक : -1 अन्य सभी परिस्थितियों में।
\end{itemize}
`

/** Hindi copy after the English options, with its own repeated marker, the same display math and a Hindi option table. */
const MATHS_Q1_HINDI = String.raw`\begin{itemize}
\item[Q.] 1 मान लीजिए $x_{0}$ वह वास्तविक संख्या है जिसके लिए $e^{x_{0}}+x_{0}=0$ है। किसी दी गई वास्तविक संख्या $\alpha$ के लिए, परिभाषित कीजिए
$$g(x)=\frac{3 x e^{x}+3 x-\alpha e^{x}-\alpha x}{3\left(e^{x}+1\right)}$$
सभी वास्तविक संख्याओं $x$ के लिए।
तब निम्नलिखित में से कौन सा एक कथन सत्य है?
\end{itemize}

\begin{tabular}[t]{|l|l|}
\hline (A) & $\alpha=2$ के लिए, $\lim _{x \rightarrow x_{0}}\left|\frac{g(x)+e^{x_{0}}}{x-x_{0}}\right|=0$ है \\
\hline (B) & $\alpha=2$ के लिए, $\lim _{x \rightarrow x_{0}}\left|\frac{g(x)+e^{x_{0}}}{x-x_{0}}\right|=1$ है \\
\hline (C) & $\alpha=3$ के लिए, $\lim _{x \rightarrow x_{0}}\left|\frac{g(x)+e^{x_{0}}}{x-x_{0}}\right|=0$ है \\
\hline (D) & $\alpha=3$ के लिए, $\lim _{x \rightarrow x_{0}}\left|\frac{g(x)+e^{x_{0}}}{x-x_{0}}\right|=\frac{2}{3}$ है \\
\hline
\end{tabular}
`

/** Hindi copy whose option table is the English one again (math only). */
const MATHS_Q2_HINDI = String.raw`\item[Q.] 2 मान लीजिए $\mathbb{R}$ सभी वास्तविक संख्याओं के समुच्चय को दर्शाता है। तब क्षेत्र
$$\left\{(x, y) \in \mathbb{R} \times \mathbb{R}: x>0, y>\frac{1}{x}, 5 x-4 y-1>0,4 x+4 y-17<0\right\}$$
का क्षेत्रफल है

\begin{tabular}[t]{|l|l|l|l|}
\hline (A) & $\frac{17}{16}-\log _{e} 4$ & (B) & $\frac{33}{8}-\log _{e} 4$ \\
\hline (C) & $\frac{57}{8}-\log _{e} 4$ & (D) & $\frac{17}{2}-\log _{e} 4$ \\
\hline
\end{tabular}`

/** Hindi copy with the math-only options laid out differently from the English table. */
const MATHS_Q3_HINDI = String.raw`\item[Q.] 3 समीकरण
$$\theta=\tan ^{-1}(2 \tan \theta)-\frac{1}{2} \sin ^{-1}\left(\frac{6 \tan \theta}{9+\tan ^{2} \theta}\right)$$
के वास्तविक हलों की कुल संख्या है
(यहाँ, प्रतिलोम त्रिकोणमितीय फलन $\sin ^{-1} x$ तथा $\tan ^{-1} x$ क्रमशः $\left[-\frac{\pi}{2}, \frac{\pi}{2}\right]$ तथा $\left(-\frac{\pi}{2}, \frac{\pi}{2}\right)$ में मान ग्रहण करते हैं।)

\begin{tabular}[t]{|l|l|l|l|}
\hline (A) & 1 & (B) & 2 \\
\hline (C) & 3 & (D) & 5 \\
\hline
\end{tabular}`

const SECTION2_HINDI = String.raw`\section*{खंड 2 (अधिकतम अंक: 16)}
\begin{itemize}
\item[-] इस खंड में चार (04) प्रश्न हैं।
\item[-] प्रत्येक प्रश्न के चार विकल्प (A), (B), (C) तथा (D) हैं। इन चार विकल्पों में से एक या एक से अधिक विकल्प सही उत्तर है(हैं)।
\end{itemize}
`

/** "Q. 5" (no \item) printed again on the Hindi copy. */
const MATHS_Q5_HINDI = String.raw`Q. 5 मान लीजिए $I=\left(\begin{array}{ll}1 & 0 \\ 0 & 1\end{array}\right)$ तथा $P=\left(\begin{array}{ll}2 & 0 \\ 0 & 3\end{array}\right)$ है। कुछ शून्येतर वास्तविक संख्याओं $x, y$ तथा $z$ के लिए $Q=\left(\begin{array}{ll} x & y \\ z & 4\end{array}\right)$ है, जिनके लिए सभी शून्येतर वास्तविक प्रविष्टियों वाला एक 2 × 2 आव्यूह $R$ इस प्रकार है कि $Q R=R P$ है।

तब निम्नलिखित में से कौन सा (से) कथन सत्य है (हैं)?

\begin{tabular}[t]{|l|l|}
\hline (A) & $Q-2 I$ का सारणिक शून्य है \\
\hline (B) & $Q-6 I$ का सारणिक 12 है \\
\hline (C) & $Q-3 I$ का सारणिक 15 है \\
\hline (D) & $y z=2$ \\
\hline
\end{tabular}
`

/** Numerical: Hindi copy after the English answer line, with its own Hindi answer line. */
const MATHS_Q9_HINDI = String.raw`\item[Q.] 9 मान लीजिए $y(x)$ अवकल समीकरण
$$x^{2} \frac{d y}{d x}+x y=x^{2}+y^{2}, \quad x>\frac{1}{e},$$
का वह हल है जो $y(1)=0$ को संतुष्ट करता है। तब $2 \frac{(y(e))^{2}}{y\left(e^{2}\right)}$ का मान \_\_\_\_ है।
उत्तर: [0.7 to 0.8]`

const PHYSICS_HEAD_HINDI = String.raw`\section*{भौतिकी}`

/** Physics Q2: the Hindi copy has its own copy of the figure and the math-only option table. */
const PHYSICS_Q2_HINDI = String.raw`\item[Q.] 2 समान लंबाई $\ell$ तथा त्रिज्याओं $\sqrt{2} R$ तथा $2 R$ वाले दो समाक्षीय चालक बेलनों को चित्र 1 में दर्शाए अनुसार रखा गया है। आंतरिक बेलन पर आवेश $Q$ है तथा बाहरी बेलन भू-संपर्कित है। बेलनों के बीच के वलयाकार क्षेत्र को परावैद्युतांक $\kappa=5$ वाले पदार्थ से भरा गया है। किनारों के प्रभावों को नगण्य मानते हुए, तल से गुजरने वाला विद्युत क्षेत्र का फ्लक्स है:

\begin{figure}
\includegraphics[alt={},max width=\textwidth]{https://cdn.mathpix.com/cropped/6f1bd82b-d701-48ff-92e8-6260b4069190-29.jpg?height=531&width=424&top_left_y=1060&top_left_x=669}

\caption{चित्र 1}
\end{figure}

\begin{tabular}[t]{|l|l|l|l|l|l|l|l|}
\hline (A) & $\frac{Q}{30 \epsilon_{0}}$ & (B) & $\frac{Q}{15 \epsilon_{0}}$ & (C) & $\frac{Q}{60 \epsilon_{0}}$ & (D) & $\frac{Q}{120 \epsilon_{0}}$ \\
\hline
\end{tabular}
`

/** A whole Hindi page repeating physics Q1–Q2, after the English Q4. */
const PHYSICS_HINDI_PAGE = String.raw`\begin{itemize}
\item[Q.] 1 कुछ पदार्थों में तापांतर से विद्युत वाहक बल (e.m.f.) उत्पन्न हो सकता है। मान लीजिए किसी तार के सिरों के बीच प्रति इकाई तापांतर पर उत्पन्न विद्युत वाहक बल $S$ है, पदार्थ की विद्युत चालकता $\sigma$ तथा ऊष्मा चालकता $\kappa$ है। राशि $Z=\frac{S^{2} \sigma}{\kappa}$ का विमीय सूत्र है:
\end{itemize}

\begin{tabular}[t]{|l|l|l|l|}
\hline (A) & $\left[M^{0} L^{0} T^{0} I^{0} K^{0}\right]$ & (B) & $\left[M^{0} L^{0} T^{0} I^{0} K^{-1}\right]$ \\
\hline (C) & $\left[M^{1} L^{2} T^{-2} I^{-1} K^{-1}\right]$ & (D) & $\left[M^{1} L^{2} T^{-4} I^{-1} K^{-1}\right]$ \\
\hline
\end{tabular}

\item[Q.] 2 दो समाक्षीय चालक बेलनों को चित्र में दर्शाए अनुसार रखा गया है। तल से गुजरने वाला विद्युत क्षेत्र का फ्लक्स है:
\includegraphics[alt={},max width=\textwidth]{https://cdn.mathpix.com/cropped/6f1bd82b-d701-48ff-92e8-6260b4069190-30.jpg?height=526&width=426&top_left_y=1060&top_left_x=1131}
$$\frac{Q}{30 \epsilon_{0}}$$
`

function bilingual(text) {
  const lines = text.split('\n')
  const inserts = []
  const at = (fromRe, targetRe, block, skip = 0) => {
    let s = -1
    for (let n = 0; n <= skip; n += 1) s = lines.findIndex((l, i) => i > s && fromRe.test(l))
    assert.ok(s >= 0, `anchor ${fromRe}`)
    let t = s
    while (t < lines.length && !targetRe.test(lines[t])) t += 1
    assert.ok(t < lines.length, `target ${targetRe}`)
    inserts.push({ t, block })
  }
  inserts.push({ t: 1, block: HINDI_INSTRUCTIONS })
  at(/^\\item\[Q\.\] 1 Let \$x_\{0\}\$/, /^Answer: C$/, MATHS_Q1_HINDI)
  at(/^\\item\[Q\.\] 2 Let \$\\mathbb\{R\}\$ denote the set of all real numbers\. Then the area/, /^Answer: B$/, MATHS_Q2_HINDI)
  at(/^\\item\[Q\.\] 3 The total number of real solutions/, /^Answer: C$/, MATHS_Q3_HINDI)
  at(/^\\section\*\{SECTION 2 \(Maximum Marks: 16\)\}/, /^\\section\*\{SECTION 2/, SECTION2_HINDI)
  at(/^Q\. 5 Let \$I=/, /^Answer: A, B$/, MATHS_Q5_HINDI)
  at(/^\\item\[Q\.\] 9 Let \$y\(x\)\$/, /^\\item\[Q\.\] 10 /, MATHS_Q9_HINDI)
  at(/^\\section\*\{SECTION 1 \(Maximum Marks: 12\)\}/, /^\\section\*\{SECTION 1/, PHYSICS_HEAD_HINDI, 1)
  at(/^\\item\[Q\.\] 2 Two co-axial conducting cylinders/, /^Answer: C$/, PHYSICS_Q2_HINDI)
  at(/^\\section\*\{SECTION 2 \(Maximum Marks: 16\)\}/, /^\\section\*\{SECTION 2/, PHYSICS_HINDI_PAGE, 1)
  inserts.sort((a, b) => b.t - a.t)
  for (const { t, block } of inserts) lines.splice(t, 0, ...block.replace(/\n$/, '').split('\n'))
  const hindiFirst = lines.findIndex((l) => l === '\\item[Q.] 5 The correct statement(s) about intermolecular forces is(are)')
  assert.ok(hindiFirst >= 0)
  lines.splice(hindiFirst, 1, '\\item[Q.] 5 अंतराआण्विक बलों के बारे में सही कथन है (हैं)', 'The correct statement(s) about intermolecular forces is(are)')
  return lines.join('\n')
}

const bi = bilingual(en)
const enItems = paperItemsFromMathpixOcr(en)
const card = (q) =>
  JSON.stringify({
    text: q.text,
    options: q.options,
    passageText: q.passageText,
    questionType: q.questionType,
    subject: q.subject,
    printedNumber: q.printedNumber,
    correctIndex: q.correctIndex,
    correctIndices: q.correctIndices,
    correctInteger: q.correctInteger,
    correctNumerical: q.correctNumerical,
    numericalTolerance: q.numericalTolerance,
    numericalAlternatives: q.numericalAlternatives,
    bonusMarksToAll: q.bonusMarksToAll,
    answerSource: q.answerSource,
  })

test('English-only scan: the Hindi filter returns it byte for byte', () => {
  assert.equal(stripHindiOcr(en), en)
  assert.equal(enItems.length, 48)
  assert.equal(ocrIsHindiOnly(en), false)
})

test('bilingual fixture really carries Hindi copies, repeated markers and Hindi headers', () => {
  assert.ok((bi.match(/[\u0900-\u097F]/g) || []).length > 800)
  assert.ok(bi.split('\n').filter((l) => /^\\item\[Q\.\] 1 /.test(l)).length > en.split('\n').filter((l) => /^\\item\[Q\.\] 1 /.test(l)).length)
  assert.match(bi, /^Q\. 5 मान लीजिए/m)
  assert.match(bi, /\\section\*\{खंड 2/)
  assert.equal(ocrIsHindiOnly(bi), false)
})

test('bilingual scan splits into the same 48 English cards (text, options, answers)', () => {
  const items = paperItemsFromMathpixOcr(bi)
  assert.equal(items.length, 48)
  items.forEach((q, i) => assert.equal(card(q), card(enItems[i]), `Q${i + 1}`))
  assert.doesNotMatch(JSON.stringify(items), DEVANAGARI)
})

test('bilingual scan: facts card, marker counts and numbering match the English scan', () => {
  assert.deepEqual(buildPaperFacts(bi), buildPaperFacts(en))
  assert.equal(buildPaperFacts(bi).expectedQuestionCount, 48)
  assert.equal(countMathpixQuestionMarkers(bi), countMathpixQuestionMarkers(en))
  assert.equal(quickOcrQuestionCount(bi), quickOcrQuestionCount(en))
  assert.equal(numberingPrintedInOcr(bi, 16), numberingPrintedInOcr(en, 16))
  assert.doesNotMatch(sanitizeMathpixOcrText(bi), DEVANAGARI)
  assert.equal(stripHindiOcr(stripHindiOcr(bi)), stripHindiOcr(bi))
})

test('Hindi copy keeps the English figure once and drops its own copy of it', () => {
  const stripped = stripHindiOcr(bi)
  assert.ok(stripped.includes('-08.jpg?height=531&width=424'))
  assert.ok(!stripped.includes('-29.jpg'))
  assert.ok(!stripped.includes('-30.jpg'))
  assert.equal((stripped.match(/Answer: \[0\.7 to 0\.8\]/g) || []).length, 1)
})

test('a Hindi-only answer line becomes the English answer line', () => {
  const ocr = String.raw`\item[Q.] 1 A ball is thrown up with speed $u$. Find the height reached in metres.
\item[Q.] 1 एक गेंद को $u$ चाल से ऊपर फेंका जाता है। प्राप्त ऊँचाई मीटर में ज्ञात कीजिए।
उत्तर: 5
\item[Q.] 2 A block slides down a smooth incline of angle $\theta$. Find its acceleration.
Answer: 3`
  const out = stripHindiOcr(ocr)
  assert.equal(out, String.raw`\item[Q.] 1 A ball is thrown up with speed $u$. Find the height reached in metres.
Answer: 5
\item[Q.] 2 A block slides down a smooth incline of angle $\theta$. Find its acceleration.
Answer: 3`)
})

test('an English line with a Hindi gloss keeps its English words', () => {
  assert.equal(stripDevanagariRuns('Find the speed (गति) of the ball.'), 'Find the speed of the ball.')
  assert.equal(stripDevanagariRuns('Find the speed of the ball.'), 'Find the speed of the ball.')
})

const HINDI_ONLY = Array.from({ length: 18 }, (_, i) =>
  String.raw`\item[Q.] ${i + 1} एक कण का द्रव्यमान $m$ है और वह $v$ वेग से गतिमान है। कण की गतिज ऊर्जा ज्ञात कीजिए। सही विकल्प चुनिए।
\begin{tabular}{|l|l|}
\hline (A) & $\frac{1}{2} m v^{2}$ \\
\hline (B) & $m v^{2}$ \\
\hline
\end{tabular}`,
).join('\n')

test('Hindi-only scan: no garbage cards, and the paper is flagged', () => {
  assert.equal(ocrIsHindiOnly(HINDI_ONLY), true)
  assert.equal(stripHindiOcr(HINDI_ONLY), HINDI_ONLY)
  assert.deepEqual(paperItemsFromMathpixOcr(HINDI_ONLY), [])
  const quality = localOfficialPyqQualityCheck({ ...meta, questions: [], preparedText: HINDI_ONLY })
  assert.equal(quality.passed, false)
  assert.match(quality.lines[0], /Hindi only/)
})

test('upload with one question missing: auto-fix rebuilds all 48 without pressing Re-parse', () => {
  globalThis.localStorage.clear()
  const stored = enItems.filter((_, i) => i !== 6).map((q) => ({ ...q }))
  const paper = importQuestionsToOfficialPyqPending({ ...meta, preparedText: en, questions: stored })
  assert.equal(paper.questions.length, 48)
  assert.deepEqual(paper.questions.map((q) => q.printedNumber), enItems.map((q) => q.printedNumber))
  assert.ok(!paper.localQuality.lines.some((l) => /This paper has/.test(l)), paper.localQuality.lines.join(' | '))
  globalThis.localStorage.clear()
})

test('upload with one question cut in two: auto-fix merges back to 48', () => {
  globalThis.localStorage.clear()
  const stored = enItems.map((q) => ({ ...q }))
  const whole = stored[12].text
  const cut = whole.indexOf(' ', Math.floor(whole.length / 2))
  stored.splice(12, 1, { ...stored[12], text: whole.slice(0, cut) }, { ...stored[12], id: 'tail', text: whole.slice(cut + 1), printedNumber: 14 })
  assert.equal(stored.length, 49)
  const paper = importQuestionsToOfficialPyqPending({ ...meta, preparedText: en, questions: stored })
  assert.equal(paper.questions.length, 48)
  assert.deepEqual(paper.questions.map((q) => q.printedNumber), enItems.map((q) => q.printedNumber))
  assert.ok(!paper.questions.some((q) => q.text === whole.slice(cut + 1)))
  globalThis.localStorage.clear()
})

test('no rebuild lands on the facts count: stored cards stay and the count line stays', () => {
  globalThis.localStorage.clear()
  const start = en.indexOf('\\item[Q.] 16 If')
  const end = en.indexOf('Answer: 21', start) + 'Answer: 21'.length
  const lost = en.slice(0, start) + en.slice(end)
  assert.equal(paperItemsFromMathpixOcr(lost).length, 47)
  assert.equal(buildPaperFacts(lost).expectedQuestionCount, 48)
  const fresh = paperItemsFromMathpixOcr(lost)
  const stored = [...fresh, { ...fresh[46], id: 'x1' }, { ...fresh[46], id: 'x2' }].map((q) => ({ ...q }))
  const paper = importQuestionsToOfficialPyqPending({ ...meta, preparedText: lost, questions: stored })
  assert.equal(paper.questions.length, 49)
  assert.equal(paper.localQuality.passed, false)
  assert.ok(paper.localQuality.lines.some((l) => /says 48 questions\. This paper has 49/.test(l)), paper.localQuality.lines.join(' | '))
  globalThis.localStorage.clear()
})

test('a card the admin edited is never dropped by the count repair', () => {
  globalThis.localStorage.clear()
  const stored = enItems.map((q) => ({ ...q }))
  stored.push({
    ...stored[47],
    id: 'mine',
    printedNumber: undefined,
    text: 'My own extra question about a falling stone and its speed.',
    adminEdited: true,
    adminEditedAt: 1,
  })
  const paper = importQuestionsToOfficialPyqPending({ ...meta, year: 2018, preparedText: en, questions: stored })
  assert.equal(paper.questions.length, 49)
  assert.ok(paper.questions.some((q) => q.id === 'mine'))
  assert.equal(paper.localQuality.passed, false)
  globalThis.localStorage.clear()
})

test('approved paper with a wrong count is flagged, never restructured', () => {
  globalThis.localStorage.clear()
  const stored = enItems.filter((_, i) => i !== 6).map((q) => ({ ...q }))
  const added = pendingStore.addOfficialPyqPendingPaper({ ...meta, year: 2019, preparedText: en, questions: stored, status: 'approved' })
  const saved = persistOfficialPyqQualityRun(added)
  assert.equal(saved.status, 'approved')
  assert.equal(saved.questions.length, 47)
  assert.equal(saved.localQuality.passed, false)
  assert.ok(saved.localQuality.lines.some((l) => /says 48 questions\. This paper has 47/.test(l)), saved.localQuality.lines.join(' | '))
  globalThis.localStorage.clear()
})

test('bilingual upload: 48 English cards and no count line', () => {
  globalThis.localStorage.clear()
  const stored = paperItemsFromMathpixOcr(bi).map((q) => ({ ...q }))
  const paper = importQuestionsToOfficialPyqPending({ ...meta, preparedText: bi, questions: stored })
  assert.equal(paper.questions.length, 48)
  assert.doesNotMatch(JSON.stringify(paper.questions), DEVANAGARI)
  assert.ok(!paper.localQuality.lines.some((l) => /This paper has|Hindi only/.test(l)), paper.localQuality.lines.join(' | '))
  globalThis.localStorage.clear()
})

const { labelNumberedQuestions } = await import('../src/utils/numberedQuestionMarkers.js')
const p14 = fs.readFileSync(new URL('./fixtures/jee-advanced-2014-p1-mathpix.txt', import.meta.url), 'utf8')
const p14Stored = JSON.parse(fs.readFileSync(new URL('./fixtures/jee-advanced-2014-p1-stored-cards.json', import.meta.url), 'utf8'))
const answerOf = (q) => q.correctIndices ?? q.correctIndex ?? q.correctInteger ?? q.correctNumerical

test('2014 P1: questions numbered "1." (no "Q.") split into all 60 with their printed keys', () => {
  assert.equal(countMathpixQuestionMarkers(p14), 60)
  const items = paperItemsFromMathpixOcr(p14)
  assert.equal(items.length, 60)
  assert.deepEqual(items.map((q) => q.printedNumber), Array.from({ length: 60 }, (_, i) => i + 1))
  const subjects = items.map((q) => q.subject)
  assert.ok(subjects.slice(0, 20).every((s) => s === 'physics'), subjects.join(','))
  assert.ok(subjects.slice(20, 40).every((s) => s === 'chemistry'), subjects.join(','))
  assert.ok(subjects.slice(40).every((s) => s === 'mathematics'), subjects.join(','))
  // "Answer (C) and (D)" with no colon, "\section*{Answer: (A), (B) and (C)}", "2 OR 8", "0 (zero)".
  assert.deepEqual(answerOf(items[0]), [2, 3])
  assert.deepEqual(answerOf(items[1]), [0, 1, 2])
  assert.deepEqual(answerOf(items[26]), [1, 2, 3])
  assert.deepEqual(answerOf(items[25]), [0, 2])
  assert.equal(answerOf(items[17]), 2)
  assert.deepEqual(items[17].numericalAlternatives, [{ value: 8 }])
  assert.equal(answerOf(items[56]), 0)
  // OCR lost the first letter ("he reactivity"); the card still has its own A–D and stays a question.
  assert.match(items[21].text, /^he reactivity/)
  assert.equal(items[21].options.filter((o) => String(o).trim()).length, 4)
  assert.doesNotMatch(items[23].options[3], /Answer/)
  // A figure elsewhere in the paper must not strip a chemistry stem's own structure.
  assert.match(items[35].text, /peptide shown below is\n<smiles>/)
})

test('2014 P1: a subject missing its Section 2 instruction leaves the scan facts unknown', () => {
  const facts = buildPaperFacts(p14)
  assert.equal(facts.known, false)
  assert.ok(facts.notes.some((n) => /section instruction is missing/.test(n)), facts.notes.join(' | '))
  assert.equal(facts.sections[0].type, 'multiple_correct')
})

test('"1." numbering is only used when the paper has no "Q." markers and runs 1, 2, 3 …', () => {
  assert.equal(labelNumberedQuestions(en), en)
  const list = 'Q. 1 Which are true?\n1. first\n2. second\n3. third\nQ. 2 Next'
  assert.equal(labelNumberedQuestions(list), list)
  const short = 'Consider:\n1. first\n2. second\n3. third'
  assert.equal(labelNumberedQuestions(short), short)
})

test('2014 P1: 56 scrambled cards with duplicate machine fixes are rebuilt to 60 and pass', () => {
  globalThis.localStorage.clear()
  const { questions, ...rest } = p14Stored
  const added = pendingStore.addOfficialPyqPendingPaper({ ...rest, preparedText: p14, questions })
  pendingStore.updateOfficialPyqPendingPaper(added.id, { adminFacts: p14Stored.adminFacts, paperFacts: p14Stored.paperFacts })
  assert.equal(pendingStore.getOfficialPyqPendingPaper(added.id).questions.length, 56)
  const saved = persistOfficialPyqQualityRun(pendingStore.getOfficialPyqPendingPaper(added.id))
  assert.equal(saved.questions.length, 60)
  assert.equal(saved.localQuality.passed, true, saved.localQuality.lines.join(' | '))
  assert.deepEqual(saved.questions.map((q) => q.printedNumber), Array.from({ length: 60 }, (_, i) => i + 1))
  const stems = saved.questions.map((q) => String(q.text).replace(/\s+/g, ' ').slice(0, 60))
  assert.equal(new Set(stems).size, 60, 'no question appears twice')
  // A duplicate machine fix used to be pasted over Q11 by its old position.
  assert.match(saved.questions[10].text, /^Airplanes A and B/)
  assert.ok(saved.questions.slice(10, 20).every((q) => q.questionType === 'integer'))
  assert.ok(saved.questions.slice(0, 10).every((q) => q.questionType === 'multiple_correct'))
  // The stored machine fix of Q36 lost the peptide; the scan's card with the structure wins.
  assert.match(saved.questions[35].text, /<smiles>/)
  globalThis.localStorage.clear()
})

const { officialPyqCompareCardKey, officialPyqCompareIsCurrent, dropStaleOfficialPyqCompares } = await import(
  '../src/utils/officialPyqCompareFreshness.js'
)
const { saveOfficialPyqCompareResult } = await import('../src/utils/officialPyqOriginalCompare.js')
const { autoFixFlaggedOfficialPyqCards } = await import('../src/utils/officialPyqAutoFix.js')

/** Same exam, year and session each time, so the store keeps the first paper's id — like uploading the paper again. */
function add2014Scrambled() {
  const { questions, ...rest } = p14Stored
  const added = pendingStore.addOfficialPyqPendingPaper({ ...rest, preparedText: p14, questions })
  pendingStore.updateOfficialPyqPendingPaper(added.id, { adminFacts: p14Stored.adminFacts, paperFacts: p14Stored.paperFacts })
  return added.id
}

test('2014 P1: compare reports about the old scrambled cards do not survive the rebuild', () => {
  globalThis.localStorage.clear()
  const id = add2014Scrambled()
  const before = pendingStore.getOfficialPyqPendingPaper(id).questions.filter((q) => q.originalCompare?.verdict === 'differs')
  assert.ok(before.length >= 6, 'fixture carries the old "differs" reports')
  const saved = persistOfficialPyqQualityRun(pendingStore.getOfficialPyqPendingPaper(id))
  assert.equal(saved.questions.length, 60)
  const left = saved.questions
    .map((q, i) => ({ goTo: i + 1, q }))
    .filter(({ q }) => q.originalCompare?.verdict === 'differs')
  // e.g. "Q21 differs: the card has 0.45\hat{k} g" was about the platform question that used to sit there.
  assert.deepEqual(left.map((x) => x.goTo), [], left.map((x) => `Q${x.goTo}: ${x.q.originalCompare.differences?.[0]?.detail}`).join(' | '))
  for (const q of saved.questions) if (q.originalCompare) assert.ok(officialPyqCompareIsCurrent(q))
  globalThis.localStorage.clear()
})

test('a compare report stays while the card is unchanged and goes once the wording changes', () => {
  globalThis.localStorage.clear()
  const id = add2014Scrambled()
  persistOfficialPyqQualityRun(pendingStore.getOfficialPyqPendingPaper(id))
  const card = pendingStore.getOfficialPyqPendingPaper(id).questions[4]
  const saved = saveOfficialPyqCompareResult(id, 4, {
    verdict: 'differs',
    differences: [{ kind: 'wrong_symbol', detail: 'one symbol differs' }],
    suggested_text: 'unrelated words entirely different from this card so the old rule would call it moved',
  }, card)
  const stored = saved.questions[4]
  assert.equal(stored.originalCompare.cardKey, officialPyqCompareCardKey(card))
  assert.equal(officialPyqCompareIsCurrent(stored), true, 'a fingerprinted report is kept while the card is unchanged')
  const kept = persistOfficialPyqQualityRun(pendingStore.getOfficialPyqPendingPaper(id))
  assert.equal(kept.questions[4].originalCompare?.verdict, 'differs')
  const changed = { ...stored, text: `${stored.text} (edited)` }
  assert.equal(officialPyqCompareIsCurrent(changed), false)
  assert.equal(dropStaleOfficialPyqCompares([changed])[0].originalCompare, undefined)
  globalThis.localStorage.clear()
})

test('older reports without a fingerprint: resolved or moved ones go, real ones stay', () => {
  const words = 'a block of mass slides down a rough incline and the friction force acting on the block is required'
  const card = { text: words, options: ['1', '2', '3', '4'] }
  const report = (suggestedText, extra = {}) => ({
    ...card,
    originalCompare: { verdict: 'differs', differences: [{ kind: 'wrong_text', detail: 'x' }], suggestedText, ...extra },
  })
  assert.equal(officialPyqCompareIsCurrent(report(words)), false, 'card already reads like the original')
  const other = 'two ideal batteries of emf and three resistors are connected in the circuit shown below'
  assert.equal(officialPyqCompareIsCurrent(report(other)), false, 'report about another question, card not flagged')
  assert.equal(officialPyqCompareIsCurrent(report(other), { flagged: true }), true, 'flagged card keeps the report')
  const half = 'a block of mass slides down a smooth incline and the normal reaction from the wedge surface is required'
  assert.equal(officialPyqCompareIsCurrent(report(half)), true, 'a partial wording difference is a real report')
  const empty = { ...card, originalCompare: { verdict: 'differs', notFound: true, differences: [], suggestedText: '' } }
  assert.equal(officialPyqCompareIsCurrent(empty), false, 'nothing to show')
  const matches = { ...card, originalCompare: { verdict: 'matches', differences: [] } }
  assert.equal(officialPyqCompareIsCurrent(matches), true)
})

let autoFixOut = null
let autoFixCompares = 0
globalThis.localStorage.clear()
{
  const id = add2014Scrambled()
  autoFixOut = await autoFixFlaggedOfficialPyqCards(id, {
    compare: async () => {
      autoFixCompares += 1
      return { verdict: 'matches', differences: [] }
    },
  })
  autoFixOut.paper = pendingStore.getOfficialPyqPendingPaper(id)
}
globalThis.localStorage.clear()

test('2014 P1: Auto-fix first rebuilds missing questions from the scan, then compares only real flags', () => {
  assert.equal(autoFixOut.ok, true, autoFixOut.error)
  assert.deepEqual(autoFixOut.rebuilt, { from: 56, to: 60, expected: 60 })
  assert.equal(autoFixOut.paper.questions.length, 60)
  assert.equal(autoFixOut.paper.localQuality.passed, true)
  assert.equal(autoFixCompares, 0, 'no Gemini compare is spent on cards that were only out of place')
})

const { confirmOfficialPyqPaperFacts } = await import('../src/utils/officialPyqAdminFactsApply.js')
const { autoFixAfterOfficialPyqFactsConfirmed } = await import('../src/utils/officialPyqFactsAutoFix.js')
const factsRun = { compares: 0, asked: 0 }
const countingOpts = (extra = {}) => ({
  canCompare: true,
  confirmPaid: () => {
    factsRun.asked += 1
    return true
  },
  compare: async () => {
    factsRun.compares += 1
    return { verdict: 'matches', differences: [] }
  },
  ...extra,
})
let factsOut = null
let factsPaper = null
let factsFlagged = null
let factsPublished = null
globalThis.localStorage.clear()
{
  const { questions, adminFacts, paperFacts: _facts, ...rest } = p14Stored
  const added = pendingStore.addOfficialPyqPendingPaper({ ...rest, preparedText: p14, questions })
  assert.equal(pendingStore.getOfficialPyqPendingPaper(added.id).questions.length, 56)
  const confirmed = confirmOfficialPyqPaperFacts(added.id, adminFacts)
  assert.equal(confirmed.ok, true, confirmed.errors.join(' | '))
  factsOut = await autoFixAfterOfficialPyqFactsConfirmed(added.id, countingOpts({ before: confirmed.before }))
  factsPaper = pendingStore.getOfficialPyqPendingPaper(added.id)
  factsOut.calls = { ...factsRun }

  // A card that still shows an alert after the free step: the paid step needs Compare and the admin's yes.
  pendingStore.updateOfficialPyqPendingPaper(added.id, { localQuality: { ...factsPaper.localQuality, passed: false, failedGoTo: [5] } })
  const unavailable = await autoFixAfterOfficialPyqFactsConfirmed(added.id, countingOpts({ canCompare: false }))
  const declined = await autoFixAfterOfficialPyqFactsConfirmed(added.id, countingOpts({ confirmPaid: () => false }))
  const unasked = await autoFixAfterOfficialPyqFactsConfirmed(added.id, countingOpts({ confirmPaid: undefined }))
  const comparesBeforeYes = factsRun.compares
  const agreed = await autoFixAfterOfficialPyqFactsConfirmed(added.id, countingOpts())
  factsFlagged = { unavailable, declined, unasked, comparesBeforeYes, agreed, compares: factsRun.compares }
}
globalThis.localStorage.clear()
{
  const { questions, ...rest } = p14Stored
  const added = pendingStore.addOfficialPyqPendingPaper({ ...rest, preparedText: p14, questions, status: 'published' })
  const out = await autoFixAfterOfficialPyqFactsConfirmed(added.id, countingOpts())
  factsPublished = { out, paper: pendingStore.getOfficialPyqPendingPaper(added.id) }
}
globalThis.localStorage.clear()

test('2014 P1: confirming facts (60) on 56 stored cards starts auto-fix, rebuilds to 60, no Gemini call', () => {
  assert.equal(factsOut.ok, true, factsOut.error)
  assert.equal(factsOut.mode, 'auto_fix')
  assert.deepEqual(factsOut.rebuilt, { from: 56, to: 60, expected: 60 })
  assert.deepEqual(factsOut.todo, [])
  assert.equal(factsOut.paid, false)
  assert.equal(factsPaper.questions.length, 60)
  assert.equal(factsPaper.localQuality.passed, true, factsPaper.localQuality.lines.join(' | '))
  assert.deepEqual(factsOut.calls, { compares: 0, asked: 0 }, 'no cost question and no Gemini request when the free rebuild fixes everything')
})

test('after confirm, a card still flagged is only sent to Gemini when Compare works and the admin agrees', () => {
  const { unavailable, declined, unasked, comparesBeforeYes, agreed, compares } = factsFlagged
  assert.deepEqual(unavailable.todo, [5])
  assert.equal(unavailable.waiting, 'compare_unavailable')
  assert.equal(declined.waiting, 'declined')
  assert.equal(unasked.waiting, 'declined', 'no confirmPaid means no paid call')
  assert.equal(comparesBeforeYes, 0)
  assert.equal(agreed.paid, true)
  assert.equal(compares, 1, 'only the one flagged card is compared')
})

test('published paper: confirm step only re-checks and flags, never rewrites or calls Gemini', () => {
  const { out, paper } = factsPublished
  assert.equal(out.ok, true, out.error)
  assert.equal(out.mode, 'flag_only')
  assert.equal(out.paid, false)
  assert.equal(paper.questions.length, 56)
  assert.equal(paper.localQuality.passed, false)
})

const p14b = fs.readFileSync(new URL('./fixtures/jee-advanced-2014-p2-mathpix.txt', import.meta.url), 'utf8')
const p14bStored = JSON.parse(fs.readFileSync(new URL('./fixtures/jee-advanced-2014-p2-stored-cards.json', import.meta.url), 'utf8'))
const PASSAGE_CHILDREN_2014_P2 = [11, 12, 13, 14, 15, 16, 31, 32, 33, 34, 35, 36, 51, 52, 53, 54, 55, 56]

test('2014 P2: "1." numbering with List rows "\\item[Q.]" and "58." alone splits into 60 clean cards', () => {
  const items = paperItemsFromMathpixOcr(p14b)
  assert.equal(items.length, 60)
  assert.deepEqual(items.map((q) => q.printedNumber), Array.from({ length: 60 }, (_, i) => i + 1))
  assert.deepEqual(
    [...new Set(items.map((q) => q.subject))],
    ['physics', 'chemistry', 'mathematics'],
  )
  const noKey = items.map((q, i) => (answerOf(q) == null ? i + 1 : 0)).filter(Boolean)
  assert.deepEqual(noKey, [18, 21], 'only Q18 and Q21 have no printed answer')
  const withPassage = items.map((q, i) => (String(q.passageText ?? '').trim() ? i + 1 : 0)).filter(Boolean)
  assert.deepEqual(withPassage, PASSAGE_CHILDREN_2014_P2, 'long physics child stems keep their paragraph too')
  assert.match(items[10].passageText, /^In the figure a container/)
  assert.match(items[14].passageText, /^The figure shows a circular loop/)
  // Four pictures printed without (A)–(D) under "Which one of the following sketches".
  assert.equal(items[0].options.filter((o) => /cdn\.mathpix\.com/.test(o)).length, 4)
  assert.doesNotMatch(items[0].text, /cdn\.mathpix\.com/)
  // Match codes "P-1, Q-2" and "3142" under a "P Q R S" header are the options; both lists stay.
  assert.deepEqual(items[17].options, ['P-1, Q-2, R-3, S-4', 'P-2, Q-4, R-3, S-1', 'P-4, Q-1, R-2, S-3', 'P-2, Q-1, R-3, S-4'])
  assert.match(items[19].text, /P\. Lift is accelerating vertically up[\s\S]*S\. Lift is falling freely[\s\S]*List II/)
  assert.deepEqual(items[59].options, ['P-3, Q-1, R-4, S-2', 'P-1, Q-3, R-4, S-2', 'P-3, Q-1, R-2, S-4', 'P-1, Q-3, R-2, S-4'])
  for (const [i, q] of items.entries()) {
    assert.doesNotMatch([q.text, ...q.options].join('\n'), /\{Answer|Answer\s*\(\s*[A-D]\s*\)/, `Q${i + 1} keeps no answer line`)
    assert.doesNotMatch(q.text, /Choices\s*:\s*$/, `Q${i + 1} stem ends without "Choices:"`)
  }
})

test('2014 P2: facts read "two questions on each paragraph" → 60 questions, 10 + 6 + 4 per subject', () => {
  const facts = buildPaperFacts(p14b)
  assert.equal(facts.known, true, facts.notes.join(' | '))
  assert.equal(facts.expectedQuestionCount, 60)
  assert.deepEqual(facts.sections.slice(0, 3).map((s) => [s.count, s.type]), [[10, 'single_correct'], [6, 'single_correct'], [4, 'matrix_match']])
})

test('2014 P2: the stored scrambled 63 cards flag duplicates, leaked text and the facts the scan contradicts', () => {
  const quality = localOfficialPyqQualityCheck({ ...p14bStored, preparedText: p14b })
  assert.equal(quality.passed, false)
  const lines = quality.lines.join('\n')
  assert.match(lines, /Go to Q 13\. The same question is also on Q 12/)
  assert.match(lines, /Go to Q 53\. The same question is also on Q 42/)
  assert.match(lines, /Go to Q 36\. Text of printed question 32 is inside this card/)
  assert.match(lines, /Go to Q 50\. Text of printed question 44 is inside this card/)
  assert.match(lines, /Go to Q 62\. The card text starts with its printed question number/)
  assert.match(lines, /Physics Q1–Q10 are confirmed as “One or more correct”, and the scan prints “Only one correct”/)
  for (const n of [13, 25, 36, 47, 50, 51, 53, 56, 62]) assert.ok(quality.failedGoTo.includes(n), `Q${n} is flagged`)
})

let p14bRebuilt = null
globalThis.localStorage.clear()
{
  const { questions, adminFacts, paperFacts, localQuality: _old, ...rest } = p14bStored
  const added = pendingStore.addOfficialPyqPendingPaper({ ...rest, preparedText: p14b, questions })
  pendingStore.updateOfficialPyqPendingPaper(added.id, { adminFacts, paperFacts })
  p14bRebuilt = persistOfficialPyqQualityRun(pendingStore.getOfficialPyqPendingPaper(added.id))
}
globalThis.localStorage.clear()

test('2014 P2: auto-fix rebuilds 63 scrambled cards to the 60 printed questions, in order', () => {
  const qs = p14bRebuilt.questions
  assert.equal(qs.length, 60)
  assert.deepEqual(qs.map((q) => q.printedNumber), Array.from({ length: 60 }, (_, i) => i + 1))
  const stems = qs.map((q) => String(q.text).replace(/\s+/g, ' ').slice(0, 60))
  assert.equal(new Set(stems).size, 60, 'no question appears twice')
  // A machine fix that rewrote slot Q43 into Q52's question is placed by its current wording.
  assert.match(qs[42].text, /^Coefficient of \$x\^\{11\}\$/)
  assert.match(qs[51].text, /^If \$s ?t ?= ?1\$, then the tangent/)
  assert.equal(qs[45].correctIndex, 3, 'a machine fix without an answer gets the printed key')
  assert.doesNotMatch(qs[57].text, /^\s*58\./)
  assert.equal(String(qs[57].passageText ?? ''), '', 'section instructions are not a paragraph')
  const withPassage = qs.map((q, i) => (String(q.passageText ?? '').trim() ? i + 1 : 0)).filter(Boolean)
  assert.deepEqual(withPassage, PASSAGE_CHILDREN_2014_P2)
  assert.doesNotMatch(qs[30].passageText, /\\section/)
  assert.deepEqual(qs.slice(20, 40).map((q) => q.subject), Array(20).fill('chemistry'))
})

// The 2014 P2 scan itself lost Q22's label II, a Q38 structure and the end of Q57's condition:
// only the original page can settle them, so they stay flagged after auto-fix.
const SCAN_LOSS_2014_P2 = [22, 38, 57]
function assertOnlyScanLossLeft(quality, extra = []) {
  const why = quality.lines.join(' | ')
  assert.deepEqual([...quality.failedGoTo].sort((a, b) => a - b), [...extra, ...SCAN_LOSS_2014_P2].sort((a, b) => a - b), why)
  for (const n of SCAN_LOSS_2014_P2) {
    assert.ok(quality.lines.some((l) => l.startsWith(`Go to Q ${n}.`) && /compare with the original page/.test(l)), `Q${n}: ${why}`)
  }
}

const p14b60 = JSON.parse(fs.readFileSync(new URL('./fixtures/jee-advanced-2014-p2-stored-cards-60.json', import.meta.url), 'utf8'))
let p14b60Rebuilt = null
globalThis.localStorage.clear()
{
  const { questions, adminFacts, paperFacts, localQuality: _old, ...rest } = p14b60
  const added = pendingStore.addOfficialPyqPendingPaper({ ...rest, preparedText: p14b, questions })
  pendingStore.updateOfficialPyqPendingPaper(added.id, { adminFacts, paperFacts })
  p14b60Rebuilt = persistOfficialPyqQualityRun(pendingStore.getOfficialPyqPendingPaper(added.id))
}
globalThis.localStorage.clear()

test('2014 P2: 60 cards with the right count but a duplicate and stray numbers are rebuilt too', () => {
  const before = localOfficialPyqQualityCheck({ ...p14b60, preparedText: p14b })
  assert.match(before.lines.join('\n'), /Go to Q 52\. The same question is also on Q 43/)
  assert.match(before.lines.join('\n'), /Go to Q 31, 58\. The card text starts with its printed question number/)
  const qs = p14b60Rebuilt.questions
  assert.equal(qs.length, 60)
  assert.match(qs[42].text, /^Coefficient of/)
  assert.match(qs[30].text, /^The product X is/)
  assert.doesNotMatch(qs[57].text, /^\s*58\./)
  assert.doesNotMatch(qs[50].text, /Choices/)
  // The machine fix of Q18 had List-I pictures on A and C; the scan's card puts them in the stem.
  assert.ok(qs[17].options.every((o) => !/cdn\.mathpix\.com/.test(o)), JSON.stringify(qs[17].options))
  assertOnlyScanLossLeft(p14b60Rebuilt.localQuality, [31])
})

test('2014 P2: after the rebuild only genuine problems stay flagged', () => {
  const quality = p14bRebuilt.localQuality
  // Q31: the scan's OCR printed one option twice and lost option D.
  assertOnlyScanLossLeft(quality, [31])
  assert.ok(quality.lines.some((l) => /scan prints “Only one correct”/.test(l)), 'confirmed facts the scan contradicts stay flagged')
})

const p14bQa = fs.readFileSync(new URL('./fixtures/jee-advanced-2014-p2-qa-mathpix.txt', import.meta.url), 'utf8')
const p14bQaStored = JSON.parse(
  fs.readFileSync(new URL('./fixtures/jee-advanced-2014-p2-qa-stored-cards.json', import.meta.url), 'utf8'),
)

test('2014 P2 (Q. N with answers): bare "1." / "P." list rows, "2.r/2" and a lowercase "s." split into clean lists', () => {
  const items = paperItemsFromMathpixOcr(p14bQa)
  assert.equal(items.length, 60)
  const { parseMatchingListForDisplay } = parseLists
  for (const n of [17, 18, 19, 20]) {
    const q = items[n - 1]
    const parsed = parseMatchingListForDisplay(q.text, q.options)
    assert.equal(parsed?.listI?.length, 4, `Q${n} List-I`)
    assert.equal(parsed?.listII?.length, 4, `Q${n} List-II`)
    assert.equal((q.text.match(/List[\s-]*II\s*\n/g) || []).length, 1, `Q${n} prints List-II once`)
    assert.doesNotMatch(q.text, /Choices\s*:/, `Q${n}`)
  }
  // "List II / 1. 2r" printed beside the first lens picture moves down to rows 2–4.
  assert.match(items[17].text, /\(S\)[\s\S]*List II\n\(1\) \$2 r\$\n\(2\) r\/2\n\(3\) \$-r\$\n\(4\) \$r\$$/)
  assert.match(items[18].text, /\nS\. \$\\theta=20\^\{\\circ\}\$/)
  assert.doesNotMatch(items[18].text, /Q_\{1\}/, 'Q19 never carries Q17 rows')
})

test('2014 P2 (Q. N with answers): saved Q1 / Q18 / Q19 / Q20 damage is flagged and repaired from the scan', () => {
  const before = localOfficialPyqQualityCheck({ ...p14bQaStored, preparedText: p14bQa })
  const lines = before.lines.join('\n')
  assert.equal(before.passed, false)
  assert.match(lines, /Go to Q 1\. The option pictures are repeated inside the question text/)
  assert.match(lines, /Go to Q 18, 19\. List rows of printed question 17 are inside this card/)
  assert.match(lines, /Go to Q 20\. The chapter field holds question text/)

  globalThis.localStorage.clear()
  const { questions, adminFacts, paperFacts, localQuality: _old, ...rest } = p14bQaStored
  const added = pendingStore.addOfficialPyqPendingPaper({ ...rest, preparedText: p14bQa, questions })
  pendingStore.updateOfficialPyqPendingPaper(added.id, { adminFacts, paperFacts })
  const rebuilt = persistOfficialPyqQualityRun(pendingStore.getOfficialPyqPendingPaper(added.id))
  globalThis.localStorage.clear()

  assert.equal(rebuilt.questions.length, 60)
  assertOnlyScanLossLeft(rebuilt.localQuality)
  const [q1] = rebuilt.questions
  assert.doesNotMatch(q1.text, /cdn\.mathpix|includegraphics/, 'Q1 stem keeps no option pictures')
  assert.ok(q1.options.every((o) => /original\/crops/.test(o)), 'Q1 keeps its four picture options')
  for (const n of [18, 19]) {
    const text = rebuilt.questions[n - 1].text
    assert.doesNotMatch(text, /Q_\{1\}|\+x/, `Q${n} lost Q17's rows`)
    assert.equal((text.match(/List[\s-]*II\s*\n/g) || []).length, 1, `Q${n} prints List-II once`)
  }
  assert.match(rebuilt.questions[18].text, /P\. \$\\theta=5\^\{\\circ\}\$/, 'Q19 gets its own List-I back')
  assert.equal(rebuilt.questions[19].chapter, 'General')
})

const MATCH_LIST_QS = [17, 18, 19, 20, 37, 38, 39, 40, 57, 58, 59, 60]

test('2014 P2 (Q. N with answers): every match-the-list card reads 4 + 4 rows with P-1, Q-2 … answer codes', () => {
  const items = paperItemsFromMathpixOcr(p14bQa)
  for (const n of MATCH_LIST_QS) {
    const q = items[n - 1]
    const parsed = parseLists.parseMatchingListForDisplay(q.text, q.options)
    assert.deepEqual(parsed?.listI?.map((r) => r.label), ['(P)', '(Q)', '(R)', '(S)'], `Q${n} List-I`)
    assert.deepEqual(parsed?.listII?.map((r) => r.label), ['(1)', '(2)', '(3)', '(4)'], `Q${n} List-II`)
    assert.ok(q.options.every((o) => /^P-\d,? Q\s?-\d,? R-\d,? S-\d$/.test(o)), `Q${n} options ${JSON.stringify(q.options)}`)
    assert.doesNotMatch(q.text, /^\s*P\s*Q\s*R\s*S\s*$/m, `Q${n} keeps no code-table heading`)
  }
  assert.deepEqual(items[56].options, ['P-1, Q-2, R-4, S-3', 'P-2, Q-1, R-3, S-4', 'P-1, Q-2, R-3, S-4', 'P-2, Q-1, R-4, S-3'])
  assert.match(items[56].text, /\(2\) False\n\(3\) 1\n\(4\) 2/, 'Q57 row "3.1" is row 3, value 1')
  assert.match(items[59].text, /List I\n[\s\S]*\(P\)\s*\$f_\{4\}\$ is[\s\S]*List II\n[\s\S]*\(1\)\s*onto but not one-one/, 'Q60 headings swapped back')
})

test('2014 P2 (Q. N with answers): saved code-only answers and Q60 with Q57 lists are flagged and repaired', () => {
  const before = localOfficialPyqQualityCheck({ ...p14bQaStored, preparedText: p14bQa })
  assert.match(before.lines.join('\n'), /Go to Q 37, 38, 39, 40, 57, 58, 59, 60\. The answer codes are shown without P, Q, R, S/)
  globalThis.localStorage.clear()
  const { questions, adminFacts, paperFacts, localQuality: _old, ...rest } = p14bQaStored
  const added = pendingStore.addOfficialPyqPendingPaper({ ...rest, preparedText: p14bQa, questions })
  pendingStore.updateOfficialPyqPendingPaper(added.id, { adminFacts, paperFacts })
  const rebuilt = persistOfficialPyqQualityRun(pendingStore.getOfficialPyqPendingPaper(added.id))
  globalThis.localStorage.clear()
  assertOnlyScanLossLeft(rebuilt.localQuality)
  for (const n of MATCH_LIST_QS) {
    const q = rebuilt.questions[n - 1]
    const parsed = parseLists.parseMatchingListForDisplay(q.text, q.options)
    assert.equal(`${parsed?.listI?.length}/${parsed?.listII?.length}`, '4/4', `Q${n}`)
    assert.ok(q.options.every((o) => /^P-\d/.test(o)), `Q${n} options ${JSON.stringify(q.options)}`)
  }
  const q60 = rebuilt.questions[59].text
  assert.doesNotMatch(q60, /z_\{k\}|-01\.jpg/, 'Q60 lost Q57 rows and Q1 pictures')
  assert.match(q60, /onto but not one-one/)
})

const stemLeaks = await import('../src/utils/officialPyqStemLeaks.js')
const { officialPyqStructureDamage } = await import('../src/utils/officialPyqCardStructure.js')

test('another question\'s picture or options on a card are found; a stem the scan prints three times is no duplicate', () => {
  const pic = (y) => `\\includegraphics{https://cdn.mathpix.com/cropped/x-19.jpg?height=172&width=1531&top_left_y=${y}&top_left_x=340}`
  const stem = 'For the reaction sequence given below, the correct statement(s) is(are)'
  const items = [
    { printedNumber: 7, text: `${stem}\n${pic(340)}`, options: ['a', 'b', 'c', 'd'] },
    { printedNumber: 8, text: `${stem}\n${pic(1080)}`, options: ['e', 'f', 'g', 'h'] },
  ]
  const figure = stemLeaks.figureFromAnotherQuestion({ text: `${stem}\n${pic(340)}` }, items[1], items)
  assert.equal(figure?.source, 0)
  assert.match(figure.replacement, /top_left_y=1080/)
  assert.equal(stemLeaks.figureFromAnotherQuestion(items[1], items[1], items), null)

  const combo = 'Which of the following is the only CORRECT combination?'
  const q51 = { printedNumber: 15, text: combo, options: ['(I), (P), (R)', '(II), (Q), (T)', '(I), (Q), (U)', '(II), (R), (S)'] }
  const q52 = { printedNumber: 16, text: combo, options: ['(III), (R), (U)', '(IV), (P), (R), (S)', '(III), (P), (Q), (U)', '(IV), (Q), (T)'] }
  const leaked = { ...q52, text: `${combo}\n(A) (I), (P), (R)\n(B) (II), (Q), (T)\n(C) (I), (Q), (U)\n(D) (II), (R), (S)` }
  const lines = stemLeaks.optionLinesFromAnotherQuestion(leaked, q52, [q51, q52])
  assert.equal(lines?.source, 0)
  assert.equal(stemLeaks.withoutForeignListRows(leaked.text, lines.lines), combo)
  assert.equal(stemLeaks.optionLinesFromAnotherQuestion(q52, q52, [q51, q52]), null)

  // The generic stem follows each paragraph, so the scan prints it three times.
  const q53 = { text: combo, options: ['(I), (S)', '(I), (U)', '(II), (Q)', '(II), (T)'] }
  const queue = 'Three boys and two girls stand in a queue. The probability that every girl has a boy ahead is'
  const q54 = { text: queue, options: ['1/2', '1/3', '2/3', '3/4'] }
  const scan = [
    'Answer Q. 15 and Q. 16 by appropriately matching the lists based on the information given.',
    `Q. 15 ${combo}`,
    `Q. 16 ${combo}`,
    'Answer Q. 17 and Q. 18 by appropriately matching the lists based on the information given.',
    `Q. 17 ${combo}`,
    `Q. 18 ${queue}`,
  ].join('\n')
  assert.equal(officialPyqStructureDamage([q51, q52, q53, q54], scan).size, 0)
  assert.equal(officialPyqStructureDamage([q51, q54, q53, { ...q54, options: ['a', 'b', 'c', 'd'] }], scan).get(3), 'The same question is also on Q 2')
})

if (failed) {
  console.error(`\n${failed} test(s) failed`)
  process.exit(1)
}
console.log('\nall upload count / Hindi tests passed')
