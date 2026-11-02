const KEY = 'testvantage-school-fees'

/**
 * Fee plan: { id, schoolId, title, amount, dueDate, classIds: string[], createdAt }
 * Payment: { id, schoolId, feeId, studentId, amount, paidAt, method, note? }
 */

function loadAll() {
  try {
    const raw = localStorage.getItem(KEY)
    const parsed = raw ? JSON.parse(raw) : { plans: [], payments: [] }
    return {
      plans: Array.isArray(parsed.plans) ? parsed.plans : [],
      payments: Array.isArray(parsed.payments) ? parsed.payments : [],
    }
  } catch {
    return { plans: [], payments: [] }
  }
}

function saveAll(data) {
  localStorage.setItem(KEY, JSON.stringify(data))
}

export function loadFeePlans(schoolId) {
  return loadAll().plans.filter((p) => p.schoolId === schoolId)
}

export function loadFeePayments(schoolId) {
  return loadAll().payments.filter((p) => p.schoolId === schoolId)
}

export function createFeePlan({ schoolId, title, amount, dueDate, classIds }) {
  const data = loadAll()
  const plan = {
    id: `fee-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    schoolId,
    title: String(title || '').trim() || 'Fee',
    amount: Number(amount) || 0,
    dueDate: dueDate || '',
    classIds: Array.isArray(classIds) ? classIds : [],
    createdAt: new Date().toISOString(),
  }
  data.plans.push(plan)
  saveAll(data)
  return plan
}

export function deleteFeePlan(feeId) {
  const data = loadAll()
  data.plans = data.plans.filter((p) => p.id !== feeId)
  data.payments = data.payments.filter((p) => p.feeId !== feeId)
  saveAll(data)
}

export function recordFeePayment({ schoolId, feeId, studentId, amount, method, note }) {
  const data = loadAll()
  const payment = {
    id: `pay-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    schoolId,
    feeId,
    studentId,
    amount: Number(amount) || 0,
    method: method || 'cash',
    note: note || '',
    paidAt: new Date().toISOString(),
  }
  data.payments.push(payment)
  saveAll(data)
  return payment
}

/**
 * Build dues list: for each plan × enrolled student in plan classes, unpaid = due.
 */
export function computeFeeDues(schoolId, schoolClasses, students) {
  const { plans, payments } = loadAll()
  const schoolPlans = plans.filter((p) => p.schoolId === schoolId)
  const schoolPayments = payments.filter((p) => p.schoolId === schoolId)
  const paidKey = new Set(schoolPayments.map((p) => `${p.feeId}:${p.studentId}`))
  const classById = Object.fromEntries(schoolClasses.map((c) => [c.id, c]))
  const studentById = Object.fromEntries(students.map((s) => [s.id, s]))
  const dues = []

  for (const plan of schoolPlans) {
    const targetClasses =
      plan.classIds?.length > 0
        ? plan.classIds.map((id) => classById[id]).filter(Boolean)
        : schoolClasses
    const studentIds = new Set(targetClasses.flatMap((c) => c.studentIds ?? []))
    for (const sid of studentIds) {
      if (paidKey.has(`${plan.id}:${sid}`)) continue
      const student = studentById[sid]
      if (!student) continue
      dues.push({
        feeId: plan.id,
        title: plan.title,
        amount: plan.amount,
        dueDate: plan.dueDate,
        studentId: sid,
        studentName: student.name || student.email || sid,
      })
    }
  }
  return dues
}

export function feesSummary(schoolId, schoolClasses, students) {
  const dues = computeFeeDues(schoolId, schoolClasses, students)
  const payments = loadFeePayments(schoolId)
  const collected = payments.reduce((n, p) => n + (Number(p.amount) || 0), 0)
  const outstanding = dues.reduce((n, d) => n + (Number(d.amount) || 0), 0)
  return {
    planCount: loadFeePlans(schoolId).length,
    duesCount: dues.length,
    outstanding,
    collected,
    dues: dues.slice(0, 8),
  }
}

/** Seed sample fee plans + a few payments if school has none. */
export function ensureDemoFees(schoolId, schoolClasses, students) {
  if (loadFeePlans(schoolId).length > 0) return false
  if (schoolClasses.length === 0) return false
  const classIds = schoolClasses.slice(0, 2).map((c) => c.id)
  const due = new Date()
  due.setDate(due.getDate() + 14)
  const dueDate = due.toISOString().slice(0, 10)
  const tuition = createFeePlan({
    schoolId,
    title: 'Term fee — April',
    amount: 8500,
    dueDate,
    classIds,
  })
  createFeePlan({
    schoolId,
    title: 'Transport (optional)',
    amount: 2200,
    dueDate,
    classIds: classIds.slice(0, 1),
  })
  const enrolled = schoolClasses.flatMap((c) => c.studentIds ?? [])
  const unique = [...new Set(enrolled)].slice(0, 2)
  for (const sid of unique) {
    recordFeePayment({
      schoolId,
      feeId: tuition.id,
      studentId: sid,
      amount: tuition.amount,
      method: 'upi',
      note: 'Demo payment',
    })
  }
  return true
}
