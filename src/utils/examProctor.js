/** Milliseconds hidden before tab-switch / app-switch counts as a proctor violation. */
export const PROCTOR_TAB_SWITCH_GRACE_MS = 2000

/** @returns {boolean} */
export function isExamProctoringEnabled() {
  return !import.meta.env.DEV
}

/** Show auto-submit rules on the instructions screen (including local dev). */
export function showExamProctorInstructions() {
  return true
}

/** Recoverable exits — save only; student can resume (e.g. sudden power loss while offline). */
export function isRecoverableExamExit() {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}
