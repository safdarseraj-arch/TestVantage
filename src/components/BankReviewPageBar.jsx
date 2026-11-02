import { useRef } from 'react'

export default function BankReviewPageBar({
  page,
  totalPages,
  start,
  end,
  total,
  onPage,
  sticky = true,
  disableNextOnLastPage = true,
  questionJump = false,
}) {
  const sliceSize = Math.max(1, (Number(end) || 0) - (Number(start) || 0) || 1)
  const pages = Math.max(
    1,
    Number(totalPages) || 1,
    Math.ceil(Number(total || 0) / sliceSize) || 1,
  )
  const current = Math.max(0, Number(page) || 0)
  const prevDisabled = current <= 0
  const nextDisabled = disableNextOnLastPage && (pages <= 1 || current >= pages - 1)

  function go(next, event) {
    event.preventDefault()
    event.stopPropagation()
    if (typeof onPage === 'function') onPage(next)
  }

  function isMouseClick(event) {
    return event.type === 'click' && event.detail > 0
  }

  function onPrevPointerDown(event) {
    if (event.button != null && event.button !== 0) return
    if (prevDisabled) return
    go(current - 1, event)
  }

  function onNextPointerDown(event) {
    if (event.button != null && event.button !== 0) return
    if (nextDisabled) return
    go(current + 1, event)
  }

  const jumpRef = useRef(null)
  const maxQuestion = Math.max(0, Number(total) || 0)

  function jumpToQuestion(event) {
    event.preventDefault()
    event.stopPropagation()
    const raw = String(jumpRef.current?.value ?? '').trim()
    const n = Number(raw)
    if (!raw || !Number.isInteger(n) || n < 1 || n > maxQuestion) return
    go(n - 1, event)
  }

  return (
    <div
      className={`bank-review-page-bar${sticky ? ' bank-review-page-bar--sticky' : ' bank-review-page-bar--static'}`}
    >
      <span className="bank-review-page-range">
        Showing {total === 0 ? 0 : start + 1}-{end} of {total}
      </span>
      <div className="bank-review-page-nav">
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          data-testid="bank-review-prev"
          disabled={prevDisabled}
          onPointerDown={onPrevPointerDown}
          onClick={(event) => {
            if (prevDisabled || isMouseClick(event)) return
            go(current - 1, event)
          }}
        >
          Previous
        </button>
        <span className="bank-review-page-pos">
          Page {current + 1} of {pages}
        </span>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          data-testid="bank-review-next"
          disabled={nextDisabled}
          onPointerDown={onNextPointerDown}
          onClick={(event) => {
            if (nextDisabled || isMouseClick(event)) return
            go(current + 1, event)
          }}
        >
          Next
        </button>
        {questionJump ? (
          <form className="bank-review-q-jump" onSubmit={jumpToQuestion}>
            <label>
              Go to Q
              <input
                ref={jumpRef}
                type="text"
                inputMode="numeric"
                aria-label="Go to question number"
                data-testid="official-pyq-jump"
                placeholder={maxQuestion ? `1–${maxQuestion}` : ''}
              />
            </label>
            <button type="submit" className="btn btn-ghost btn-sm">
              Go
            </button>
          </form>
        ) : null}
      </div>
    </div>
  )
}
