import { useCallback, useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import PyqImportPanel from '../components/PyqImportPanel'
import PyqGeminiGeneratePanel from '../components/PyqGeminiGeneratePanel'
import PyqTemplateDownloadButton from '../components/PyqTemplateDownloadButton'
import PyqStudyModesPanel from '../components/PyqStudyModesPanel'
import PreparePageHero from '../components/PreparePageHero'
import { useAuth } from '../context/AuthContext'
import {
  SUB_BANK_TYPE_PYQ,
  SUB_BANK_TYPE_SIMILAR_PYQ,
  subBankPracticeLabel,
  subBankPracticeRoutePrefix,
} from '../utils/subBankType.js'
import { bumpMasterPoolCache } from '../utils/masterPool.js'

/** @typedef {import('../utils/subBankType.js').SubBankType} SubBankType */

/**
 * Shared shell for /practice/pyq and /practice/similar-pyq (six study modes each).
 * @param {{ subBankType: SubBankType }} props
 */
export function PracticeSubBankPage({ subBankType }) {
  const { isAdmin } = useAuth()
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const location = useLocation()

  const bumpRefresh = useCallback(() => {
    bumpMasterPoolCache()
    setRefreshKey((k) => k + 1)
  }, [])

  const bankLabel = subBankPracticeLabel(subBankType)
  const isPyq = subBankType === SUB_BANK_TYPE_PYQ

  return (
    <div
      className={`page pyq-page student-portal-page prepare-mode-page prepare-mode-page--pyq-bank prepare-mode-page--${subBankType}`}
    >
      <PreparePageHero
        modeId={isPyq ? 'pyq-bank' : 'similar-pyq-bank'}
        lead={
          isPyq
            ? 'Six PYQ modes — pick one, then choose syllabus or year/paper. Pool = master bank with sub_bank_type pyq.'
            : 'Same six modes as PYQ Bank, but every question comes from the similar_pyq sub-bank (AI similar / replica practice).'
        }
        actions={
          <>
            <PyqTemplateDownloadButton className="btn btn-ghost btn-sm" variant="both" />
            <Link to="/tests" className="btn btn-ghost btn-sm">
              Mock tests
            </Link>
          </>
        }
      />

      <nav className="pyq-sub-bank-tabs" aria-label="Practice sub-bank">
        {[SUB_BANK_TYPE_PYQ, SUB_BANK_TYPE_SIMILAR_PYQ].map((id) => {
          const to = subBankPracticeRoutePrefix(id)
          const active = location.pathname.startsWith(to)
          return (
            <Link
              key={id}
              to={to}
              className={`btn btn-sm ${active ? 'btn-primary' : 'btn-ghost'}`}
              aria-current={active ? 'page' : undefined}
            >
              {subBankPracticeLabel(id)}
            </Link>
          )
        })}
      </nav>

      {error && <p className="upload-error">{error}</p>}

      <PyqStudyModesPanel
        subBankType={subBankType}
        refreshKey={refreshKey}
        onError={setError}
      />

      {isAdmin && isPyq && (
        <>
          <p className="form-hint official-pyq-admin-hint">
            Official NTA / Advanced / NEET papers:{' '}
            <Link to="/official-pyq">Approve official papers</Link> — import stays pending until you
            Approve &amp; publish to PYQ and Question Bank. Gemini PYQ-style is labelled separately
            and is not an official NTA dump.
          </p>
          <PyqGeminiGeneratePanel onImported={bumpRefresh} />
          <PyqImportPanel onImported={bumpRefresh} />
        </>
      )}

      {isAdmin && !isPyq && (
        <p className="form-hint">
          Similar PYQ items are published from Question Bank (Gemini similar / replica). They are tagged{' '}
          <code>sub_bank_type=similar_pyq</code> automatically.
        </p>
      )}
    </div>
  )
}

export function PracticePyqBankPage() {
  return <PracticeSubBankPage subBankType={SUB_BANK_TYPE_PYQ} />
}

export function PracticeSimilarPyqBankPage() {
  return <PracticeSubBankPage subBankType={SUB_BANK_TYPE_SIMILAR_PYQ} />
}

/** Legacy /pyq → canonical practice route */
export function PyqLegacyRedirect() {
  return <Navigate to="/practice/pyq" replace />
}
