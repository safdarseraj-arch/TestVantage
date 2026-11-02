import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { loadAssignments } from '../utils/assignmentsStore'
import { getClassesForTeacher, loadClasses } from '../utils/classesStore'
import { isLiveOrgSyncEnabled, pullOrgFromServer } from '../utils/orgServerSync'
import { loadSchools } from '../utils/schoolsStore'
import { listStudents, listTeachers } from '../utils/users'

/** Shared org data for schools pages — refresh after any mutation. */
export function useOrgData() {
  const { session, isAdmin } = useAuth()
  const [schools, setSchools] = useState(() => loadSchools())
  const [classes, setClasses] = useState(() => loadClasses())
  const [assignments, setAssignments] = useState(() => loadAssignments())

  const refresh = useCallback(() => {
    setSchools(loadSchools())
    setClasses(loadClasses())
    setAssignments(loadAssignments())
  }, [])

  useEffect(() => {
    if (!isLiveOrgSyncEnabled()) return
    pullOrgFromServer()
      .then((result) => {
        if (result.ok) refresh()
      })
      .catch(() => {})
  }, [refresh])

  const students = useMemo(() => listStudents(), [classes, schools])
  const teachers = useMemo(() => listTeachers(), [classes])

  const teacherClassIds = useMemo(() => {
    if (isAdmin) return null
    if (session?.role === 'teacher' && session?.userId) {
      return getClassesForTeacher(session.userId).map((c) => c.id)
    }
    return []
  }, [isAdmin, session])

  const visibleClasses = useMemo(() => {
    if (isAdmin) return classes
    if (teacherClassIds) return classes.filter((c) => teacherClassIds.includes(c.id))
    return []
  }, [classes, isAdmin, teacherClassIds])

  return {
    schools,
    classes,
    visibleClasses,
    assignments,
    students,
    teachers,
    isAdmin,
    session,
    refresh,
  }
}
