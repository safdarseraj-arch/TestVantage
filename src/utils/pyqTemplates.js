import { downloadTextFile } from './csvQuestions.js'
import { PYQ_CSV_TEMPLATE, PYQ_JSON_TEMPLATE } from './pyqImport.js'

export function downloadPyqJsonTemplate() {
  downloadTextFile('testvantage-pyq-template.json', PYQ_JSON_TEMPLATE, 'application/json', {
    label: 'PYQ import template',
  })
}

export function downloadPyqCsvTemplate() {
  downloadTextFile('testvantage-pyq-template.csv', PYQ_CSV_TEMPLATE, 'text/csv', {
    label: 'PYQ import template',
  })
}

/** One click: JSON template (primary). CSV available via downloadPyqCsvTemplate. */
export function downloadPyqTemplate() {
  downloadPyqJsonTemplate()
}
