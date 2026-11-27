/**
 * Known Official PYQ upload / solution problems the quality check and admin tools catch.
 * Shown on the Pending page so reviewers know what to look for — and what we auto-fix.
 */

/** @typedef {{ id: string, title: string, what: string, fix: string, auto?: boolean }} OfficialPyqKnownError */

/** @type {{ id: string, title: string, errors: OfficialPyqKnownError[] }[]} */
export const OFFICIAL_PYQ_KNOWN_UPLOAD_ERROR_GROUPS = [
  {
    id: 'figures',
    title: 'Figures & drawings',
    errors: [
      {
        id: 'stem-missing-figure',
        title: 'Question says “shown in the figure” but no figure',
        what: 'The stem mentions a figure, and the card has no picture.',
        fix: 'Crop from the original page → place on Question text.',
        auto: false,
      },
      {
        id: 'scan-figure-lost',
        title: 'Scan figure missing from the card',
        what: 'OCR/scan had a figure that did not land on the card.',
        fix: 'Quality check tries to put it back; else crop onto Question / Passage / Option.',
        auto: true,
      },
      {
        id: 'option-empty-structure',
        title: 'Empty structure in an option',
        what: 'An option has an empty <smiles> or lost drawing.',
        fix: 'Crop the structure onto that option letter.',
        auto: false,
      },
      {
        id: 'option-repeats-stem-figure',
        title: 'Option repeats the question figure',
        what: 'The same drawing appears under an option and in the stem.',
        fix: 'Quality check / Auto-fix removes the duplicate from the option.',
        auto: true,
      },
      {
        id: 'solution-missing-figure',
        title: 'Solution needs a figure',
        what: 'Solution text talks about a figure/diagram/graph, but no picture is in the solution.',
        fix: 'Crop from the original page → place on Solution (same tool as Question / Options).',
        auto: false,
      },
      {
        id: 'broken-includegraphics',
        title: 'Broken picture line',
        what: 'An \\includegraphics{…} address is cut off or invalid.',
        fix: 'Crop again, or delete that whole line before Save.',
        auto: false,
      },
    ],
  },
  {
    id: 'options',
    title: 'Options & lists',
    errors: [
      {
        id: 'empty-mcq-option',
        title: 'Empty MCQ option',
        what: 'Fewer than four filled options on a single/multiple-correct card.',
        fix: 'Re-parse, or type/crop the missing option.',
        auto: false,
      },
      {
        id: 'duplicate-options',
        title: 'Two options are the same',
        what: 'Duplicate option text after OCR.',
        fix: 'Edit the wrong option against the paper.',
        auto: false,
      },
      {
        id: 'glued-options',
        title: 'Two options glued in one box',
        what: 'OCR merged (A) and (B) into one slot.',
        fix: 'Local quality check splits them when it can.',
        auto: true,
      },
      {
        id: 'list-layout',
        title: 'List-I / List-II layout broken',
        what: 'Empty rows, List-II twice, heading inside a row, or same drawing under two labels.',
        fix: 'Quality check repairs common cases; Compare + Fix for the rest.',
        auto: true,
      },
    ],
  },
  {
    id: 'solutions',
    title: 'Answers & solutions',
    errors: [
      {
        id: 'key-line-as-solution',
        title: 'Solution is only the printed answer line',
        what: '“Ans. (B)” was saved as the worked solution.',
        fix: 'Cleared so Hybrid AI / institute PDF can fill a real solution.',
        auto: true,
      },
      {
        id: 'solution-in-stem',
        title: 'Printed solution stuck in the question',
        what: 'Answer/Sol. text sat inside the stem or an option.',
        fix: 'Moved to the solution field (or removed from the option).',
        auto: true,
      },
      {
        id: 'raw-pdf-solution',
        title: 'Institute solution looks like raw PDF letters',
        what: 'Font extraction garbage instead of readable maths.',
        fix: 'Re-read institute with Mathpix, or clear and Hybrid-fill leftovers.',
        auto: false,
      },
      {
        id: 'answer-not-in-options',
        title: 'Answer not among the options',
        what: 'Saved key does not match any option slot.',
        fix: 'Correct the answer key or the options against the paper.',
        auto: false,
      },
    ],
  },
  {
    id: 'math-display',
    title: 'Math display',
    errors: [
      {
        id: 'math-did-not-draw',
        title: 'Math did not draw',
        what: 'Broken TeX / leftover code on screen.',
        fix: 'Quality check cleans common cases; else edit the stem/option/solution.',
        auto: true,
      },
      {
        id: 'glued-words',
        title: 'Words glued together',
        what: '“whichpasses”, “,as” from OCR.',
        fix: 'Local spacing repair on quality check.',
        auto: true,
      },
    ],
  },
]
