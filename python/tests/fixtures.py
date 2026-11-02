"""Realistic (lightly trimmed) Mathpix OCR fixtures.

Everything here is shaped like output we actually see from Mathpix on JEE
Main / JEE Advanced / NEET scans and coaching-book PDFs: LaTeX itemize
scaffolding, ``\\item[Q.]`` markers, cdn.mathpix figure URLs, SECTION
instruction pages, marking-scheme bullets and printed answer keys.
"""

# A JEE Advanced style sitting: instruction page, three questions, a figure,
# a match-the-column question and a printed answer key at the end.
PYQ_PAPER = r"""
JEE (Advanced) 2024 Paper 1
ALLEN Career Institute
Page 3

\section*{SECTION 1 (Maximum Marks: 12)}
\begin{itemize}
\item[-] This section contains FOUR (04) questions.
\item[-] Each question has FOUR options. ONLY ONE of these four options is the correct answer.
\item[-] Full Marks : +3 If ONLY the correct option is chosen.
\item[-] Zero Marks : 0 If none of the options is chosen.
\item[-] Negative Marks : -1 In all other cases.
\end{itemize}

\item[Q.] 1 Let $f(x)=\frac{x^{2}+1}{x-1}$ for $x \neq 1$. The value of $f(3)$ is
(A) $5$
(B) $\frac{7}{2}$
(C) $4$
(D) $\frac{9}{2}$

\item[Q.] 2 A particle moves along a circle of radius $r$. Its moment of inertia about the
centre is $m r^{2} / 2$. The kinetic energy at angular speed $\omega$ is
\includegraphics{https://cdn.mathpix.com/cropped/2024_q2_disc.jpg?height=240&width=380&top_left_y=110&top_left_x=220}
(A) $\frac{1}{4} m r^{2} \omega^{2}$
(B) $\frac{1}{2} m r^{2} \omega^{2}$
(C) $m r^{2} \omega^{2}$
(D) $2 m r^{2} \omega^{2}$

Space for rough work
Page 4
ALLEN Career Institute

\item[Q.] 3 Match each entry in List-I with the appropriate entry in List-II.

List-I
\item[(P)] $\mathrm{NaCl}$ in water
\item[(Q)] $\mathrm{CH}_{3} \mathrm{COOH}$ in water
\item[(R)] Glucose in water
\item[(S)] $\mathrm{NH}_{3}$ in water

List-II
\item[(1)] Strong electrolyte
\item[(2)] Weak electrolyte
\item[(3)] Non electrolyte
\item[(4)] Weak base

(A) P-1, Q-2, R-3, S-4
(B) P-2, Q-1, R-4, S-3
(C) P-1, Q-3, R-2, S-4
(D) P-3, Q-2, R-1, S-4

\item[Q.] 4 The number of real roots of $$x^{4}-4 x^{2}+3=0$$ is
(A) $1$
(B) $2$
(C) $3$
(D) $4$

ANSWER KEY
1. (A) 2. (B) 3. (A) 4. (D)
"""

# Comprehension set: one passage, three child questions.
PASSAGE_PAPER = r"""
Paragraph

A thin uniform rod of mass $M$ and length $L$ is pivoted at one end and is free to
rotate in a vertical plane. The rod is released from rest in the horizontal
position. Air resistance is neglected throughout, and $g$ denotes the
acceleration due to gravity. All answers should be given in terms of $M$, $L$
and $g$ only.

Q.5 The moment of inertia of the rod about the pivot is
(A) $\frac{M L^{2}}{3}$
(B) $\frac{M L^{2}}{12}$
(C) $M L^{2}$
(D) $\frac{M L^{2}}{2}$

Q.6 The angular speed of the rod when it becomes vertical is
(A) $\sqrt{\frac{3 g}{L}}$
(B) $\sqrt{\frac{g}{L}}$
(C) $\sqrt{\frac{2 g}{L}}$
(D) $\sqrt{\frac{6 g}{L}}$

Q.7 The force exerted by the pivot when the rod is vertical is
(A) $2 M g$
(B) $\frac{5 M g}{2}$
(C) $M g$
(D) $\frac{3 M g}{2}$
"""

# A book PDF page: running header, chapter/exercise headings, and a trailing
# solutions section that must be cut.
BOOK_PAGE = r"""
Arihant Publications
Chapter 4 : Definite Integrals

EXERCISE 4.2

1. Evaluate $\int_{0}^{1} x^{2} d x$ and choose the correct value.
(A) $\frac{1}{3}$
(B) $\frac{1}{2}$
(C) $1$
(D) $\frac{2}{3}$

2. If $\int_{0}^{a} 3 x^{2} d x=8$, then the value of $a$ is
(A) $1$
(B) $2$
(C) $3$
(D) $4$

Arihant Publications

3. The area bounded by $y=x$ and $y=x^{2}$ between $x=0$ and $x=1$ equals
(A) $\frac{1}{6}$
(B) $\frac{1}{3}$
(C) $\frac{1}{2}$
(D) $\frac{2}{3}$

SOLUTIONS
1. (A) Using the power rule the integral is $1/3$.
2. (B) Solving $a^{3}=8$ gives $a=2$.
3. (A) The enclosed area is $1/6$.
"""

# Handwritten / phone-photo OCR: garbage runs between real questions.
HANDWRITTEN_NOTES = r"""
~~~~~~~~
q
1. Find the derivative of $x^{3}$ with respect to $x$.
|||
zzzz
^^^^^^
2. What is the value of $\sin 30^{\circ}$ plus $\cos 60^{\circ}$ ?
w
....
3. Solve for $x$ in the equation $2 x + 5 = 11$ and state the answer.
=====
"""

# Truncated stem: the denominator never arrived. Nothing may be invented.
TRUNCATED_STEM = r"""
Q.11 Let $f(x)=\frac{2 x+1}{
(A) $1$
(B) $2$
"""

# Match-the-column with only List-I printed - must be flagged, not emitted whole.
MATCH_ONE_LIST_ONLY = r"""
Q.12 Match each entry in List-I with the appropriate entry in List-II.

List-I
(P) $\mathrm{HCl}$
(Q) $\mathrm{CH}_{3} \mathrm{COOH}$
(R) $\mathrm{NaOH}$
(S) $\mathrm{NH}_{3}$

(A) P-1, Q-2, R-3, S-4
(B) P-2, Q-1, R-4, S-3
"""

# A figure printed between Q2 and Q3 belongs to Q2.
FIGURE_BETWEEN_QUESTIONS = r"""
Q.1 A block of mass $m$ rests on a rough incline. The friction force is
(A) $m g \sin \theta$
(B) $\mu m g \cos \theta$

Q.2 The circuit shown in the figure has two resistors in parallel. The
equivalent resistance is
![](https://cdn.mathpix.com/cropped/2024_circuit.jpg?height=200&width=300&top_left_y=80&top_left_x=100)
(A) $R / 2$
(B) $2 R$

Q.3 A light ray is incident normally on a glass slab. The deviation is
(A) $0^{\circ}$
(B) $90^{\circ}$
"""

# Same printed number twice; the second card is the richer one.
DUPLICATE_NUMBERS = r"""
Q.9 The value of $\lim_{x \to 0} \frac{\sin x}{x}$ is

Q.9 The value of $\lim_{x \to 0} \frac{\sin x}{x}$ is
(A) $0$
(B) $1$
(C) $\infty$
(D) does not exist
"""

# A question whose entire body is a Mathpix drawing.
FIGURE_ONLY_QUESTION = r"""
Q.20 \includegraphics{https://cdn.mathpix.com/cropped/2024_graph_only.jpg?height=300&width=420&top_left_y=60&top_left_x=90}

Q.21 The slope of the line $y = 2x + 3$ is
(A) $2$
(B) $3$
"""

# Directions-style comprehension with an explicit question range.
DIRECTIONS_PASSAGE = r"""
Directions (Q. 5 to 6) : Read the following passage and answer the questions.

An ideal monatomic gas is taken through a cycle consisting of an isothermal
expansion followed by an isobaric compression and finally an isochoric
process that returns the gas to its initial state. The gas constant is $R$ and
the number of moles is one throughout the whole cycle.

Q.5 The work done during the isothermal expansion is
(A) $R T \ln 2$
(B) $2 R T$

Q.6 The heat rejected during the isobaric compression is
(A) $\frac{5 R T}{2}$
(B) $R T$

Q.7 An unrelated question about a simple pendulum of length $L$ has time period
(A) $2 \pi \sqrt{L / g}$
(B) $\pi \sqrt{L / g}$
"""

GARBAGE_ONLY = "~~~~~\n|||\nq\n^^^^\n....\n"
