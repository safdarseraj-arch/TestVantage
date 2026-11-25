// Focused test: real FIITJEE S2 OCR layout (opyq 1wo2ske) - Q37 stem crop glued after Q36 Sol.
import assert from 'node:assert/strict'
import { healCardSolutionFigures } from '../src/utils/extendTruncatedStem.js'

const URL15 =
  'https://cdn.mathpix.com/cropped/f53e8ce3-d097-4405-a7c6-a10c2f1f6367-15.jpg?height=351&width=551&top_left_y=998&top_left_x=1236'
const source = String.raw`\begin{itemize}
\item[35.] In an a.c. circuit, voltage and current are given by:
(1) 10 W
(2) 2.5 W
(3) 25 W
(4) 5 W
\end{itemize}

Ans. (2)
Sol. $\mathrm{P}_{\mathrm{av}}=\frac{\mathrm{V}_{0} \mathrm{I}_{0} \cos \phi}{2}=2.5$ watt
\begin{itemize}
\item[] *36. A stone of mass 900 g is tied to a string and moved in a vertical circle of radius 1 m making 10 rpm. The tension in the string, when the stone is at the lowest point is (if $\pi^{2}=9.8$ and $\mathrm{g}=9.8 \mathrm{~m} / \mathrm{s}^{2}$ ):
(1) 17.8 N
(2) 8.82 N
(3) 97 N
(4) 9.8 N
\end{itemize}

Ans. (4)
\begin{itemize}
\item[] Sol.
$$\begin{aligned}
& \mathrm{T}-\mathrm{mg}=\mathrm{m} \ell \omega^{2} \\
& \mathrm{~T}=\mathrm{mg}+\mathrm{m} \ell \omega^{2} \\
& \mathrm{~T}=9.8 \mathrm{~N} .
\end{aligned}$$
![](${URL15})
\item[37.] In the given circuit, the current in resistance $\mathrm{R}_{3}$ is:
(1) 2.5 A
(2) 1 A
(3) 1.5 A
(4) 2 A
\end{itemize}

Ans. (2)
\begin{itemize}
\item[] Sol.
$$\begin{aligned}
& R_{e q .}=2+2+1=5 \Omega \\
& i=10 / 5=2 \mathrm{~A}
\end{aligned}$$
\item[] *38. A particle is moving in a straight line.
(1) 6 m/s
(2) 10 m/s
(3) 8 m/s
(4) 4 m/s
\end{itemize}

Ans. (3)
`.replace('${URL15}', URL15)

const tensionSol = String.raw`$$\begin{aligned}
& \mathrm{T}-\mathrm{mg}=\mathrm{m} \ell \omega^{2} \\
& \mathrm{~T}=\mathrm{mg}+\mathrm{m} \ell \omega^{2} \\
& \mathrm{~T}=9.8 \mathrm{~N} .
\end{aligned}$$`

for (const form of [`![](${URL15})`, `\\includegraphics{${URL15}}`]) {
  const q = { printedNumber: 36, questionNumber: 36, solution: `${tensionSol}\n${form}` }
  const out = healCardSolutionFigures(q, source, null)
  assert.ok(!out.solution.includes('f53e8ce3'), `stolen crop still in Q36 Sol. (${form.slice(0, 14)})`)
  assert.ok(out.solution.includes('9.8'), 'Sol. text must survive')
}
console.log('PASS q36 stolen figure dropped')
