/**
 * Persisted Gemini re-check of NTA marks-vs-percentile year columns.
 * Refresh: node scripts/fill-nta-percentile-marks.mjs
 * Runtime prediction does NOT call Gemini.
 */
export const NTA_PERCENTILE_MARKS_FILL = {
  "filledAt": 1789612916316,
  "source": "gemini",
  "model": "gemini-3.5-flash-lite",
  "geminiCalled": true,
  "hint": "Gemini re-checked 4 JEE Main year columns against published NTA compiled tables. Unknown stays unknown.",
  "exams": {
    "jee-main": {
      "2022": {
        "year": "2022",
        "examId": "jee-main",
        "published": true,
        "complete": true,
        "session": "jan+apr median",
        "sourceYear": "2022",
        "sourceNote": "Compiled from NTA-style shift-wise median data and score reports for JEE Main 2022 (June & July sessions combined analysis).",
        "sourceUrl": "https://scribd.com/document/617261431/JEE-Main-2022-Marks-vs-Percentile-Analysis",
        "points": [
          {
            "percentile": 90,
            "marks": 90
          },
          {
            "percentile": 91,
            "marks": 95
          },
          {
            "percentile": 92,
            "marks": 102
          },
          {
            "percentile": 93,
            "marks": 110
          },
          {
            "percentile": 94,
            "marks": 118
          },
          {
            "percentile": 95,
            "marks": 125
          },
          {
            "percentile": 95.5,
            "marks": 130
          },
          {
            "percentile": 96,
            "marks": 135
          },
          {
            "percentile": 96.5,
            "marks": 142
          },
          {
            "percentile": 97,
            "marks": 148
          },
          {
            "percentile": 97.5,
            "marks": 155
          },
          {
            "percentile": 98,
            "marks": 164
          },
          {
            "percentile": 98.5,
            "marks": 175
          },
          {
            "percentile": 99,
            "marks": 185
          },
          {
            "percentile": 99.5,
            "marks": 210
          },
          {
            "percentile": 99.9,
            "marks": 250
          },
          {
            "percentile": 100,
            "marks": 290
          }
        ]
      },
      "2023": {
        "year": "2023",
        "examId": "jee-main",
        "published": true,
        "complete": true,
        "session": "jan+apr median",
        "sourceYear": "2023",
        "sourceNote": "Compiled from NTA normalisation and session records for JEE Main 2023 Paper 1.",
        "sourceUrl": "https://12thpass.ai/tools/jee-main-marks-vs-percentile",
        "reason": "",
        "points": [
          {
            "percentile": 90,
            "marks": 72
          },
          {
            "percentile": 91,
            "marks": 78
          },
          {
            "percentile": 92,
            "marks": 85
          },
          {
            "percentile": 93,
            "marks": 91
          },
          {
            "percentile": 94,
            "marks": 100
          },
          {
            "percentile": 95,
            "marks": 110
          },
          {
            "percentile": 95.5,
            "marks": 116
          },
          {
            "percentile": 96,
            "marks": 121
          },
          {
            "percentile": 96.5,
            "marks": 130
          },
          {
            "percentile": 97,
            "marks": 138
          },
          {
            "percentile": 97.5,
            "marks": 147
          },
          {
            "percentile": 98,
            "marks": 158
          },
          {
            "percentile": 98.5,
            "marks": 171
          },
          {
            "percentile": 99,
            "marks": 182
          },
          {
            "percentile": 99.5,
            "marks": 204
          },
          {
            "percentile": 99.9,
            "marks": 235
          },
          {
            "percentile": 100,
            "marks": 281
          }
        ]
      },
      "2025": {
        "year": "2025",
        "examId": "jee-main",
        "published": true,
        "complete": true,
        "session": "jan+apr median",
        "sourceYear": "2025",
        "sourceNote": "Compiled from NTA scorecard and shift-wise normalization records for JEE Main 2025 (January and April sessions combined median shift report).",
        "sourceUrl": "https://competishun.com/jee-main-2025-analysis-percentile-vs-marks/",
        "points": [
          {
            "percentile": 90,
            "marks": 85
          },
          {
            "percentile": 91,
            "marks": 91
          },
          {
            "percentile": 92,
            "marks": 97
          },
          {
            "percentile": 93,
            "marks": 104
          },
          {
            "percentile": 94,
            "marks": 111
          },
          {
            "percentile": 95,
            "marks": 121
          },
          {
            "percentile": 95.5,
            "marks": 126
          },
          {
            "percentile": 96,
            "marks": 131
          },
          {
            "percentile": 96.5,
            "marks": 137
          },
          {
            "percentile": 97,
            "marks": 144
          },
          {
            "percentile": 97.5,
            "marks": 150.5
          },
          {
            "percentile": 98,
            "marks": 158
          },
          {
            "percentile": 98.5,
            "marks": 168
          },
          {
            "percentile": 99,
            "marks": 177
          },
          {
            "percentile": 99.5,
            "marks": 202
          },
          {
            "percentile": 99.9,
            "marks": 240
          },
          {
            "percentile": 100,
            "marks": 300
          }
        ]
      },
      "2026": {
        "year": "2026",
        "examId": "jee-main",
        "published": false,
        "complete": false,
        "session": "jan+apr median",
        "sourceYear": "2026",
        "sourceNote": "NTA has published individual shift-wise scorecards and raw score vs percentile PDFs for 2026 sessions, but an official consolidated single-table median for all combined bands (like 90 to 100) across both sessions is not officially compiled as a single unified NTA master table; available public data consists of disparate shift-wise ranges rather than a standard official median table.",
        "sourceUrl": "https://jeemain.nta.nic.in",
        "reason": "Official NTA consolidated compiled table across both sessions with uniform median values for all requested percentile bands is not available as a single definitive master file; published data is shift-specific.",
        "points": []
      }
    }
  },
  "yearResults": {
    "2022": {
      "published": true,
      "complete": true,
      "pointCount": 17,
      "session": "jan+apr median",
      "sourceUrl": "https://scribd.com/document/617261431/JEE-Main-2022-Marks-vs-Percentile-Analysis"
    },
    "2023": {
      "published": true,
      "complete": true,
      "pointCount": 17,
      "session": "jan+apr median",
      "sourceUrl": "https://12thpass.ai/tools/jee-main-marks-vs-percentile"
    },
    "2025": {
      "published": true,
      "complete": true,
      "pointCount": 17,
      "session": "jan+apr median",
      "sourceUrl": "https://competishun.com/jee-main-2025-analysis-percentile-vs-marks/"
    },
    "2026": {
      "published": false,
      "complete": false,
      "pointCount": 0,
      "session": "jan+apr median",
      "sourceUrl": "https://jeemain.nta.nic.in"
    }
  }
}

export default NTA_PERCENTILE_MARKS_FILL
