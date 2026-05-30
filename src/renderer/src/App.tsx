import { useState, useEffect, useRef } from 'react'
import type { Subject, Task, Attachment, Subtask, Tag, ScheduleEntry, Grade, SubjectGradeStat, Note, Semester, Theme, SubjectSort } from './types'
import Dashboard from './components/Dashboard'
import SubjectList from './components/SubjectList'
import SemesterManager from './components/SemesterManager'
import TaskList from './components/TaskList'
import TaskDetail from './components/TaskDetail'
import GradeList from './components/GradeList'
import NoteList from './components/NoteList'
import WeeklySchedule from './components/WeeklySchedule'
import MonthCalendar from './components/MonthCalendar'
import PomodoroTimer from './components/PomodoroTimer'
import StudyStats from './components/StudyStats'
import SettingsPanel from './components/SettingsPanel'
import { usePomodoro } from './hooks/usePomodoro'

type IpcResult<T> = { success: true; data: T } | { success: false; error: string }
type AppView    = 'dashboard' | 'tasks' | 'schedule' | 'calendar' | 'timer'
type SubjectTab = 'tasks' | 'grades' | 'notes'

async function unwrap<T>(p: Promise<IpcResult<T>>): Promise<T> {
  const r = await p
  if (!r.success) throw new Error(r.error)
  return r.data
}

export default function App() {
  const [theme, setTheme]                   = useState<Theme>('light')
  const [view, setView]                     = useState<AppView>('dashboard')
  const [dashRefreshKey, setDashRefreshKey] = useState(0)
  const [subjects, setSubjects]             = useState<Subject[]>([])
  const [archivedSubjects, setArchivedSubjects] = useState<Subject[]>([])
  const [semesters, setSemesters]           = useState<Semester[]>([])
  const [showSemesterMgr, setShowSemesterMgr] = useState(false)
  const [tasks, setTasks]                   = useState<Task[]>([])
  const [allDeadlineTasks, setAllDeadlineTasks] = useState<Task[]>([])
  const [scheduleEntries, setScheduleEntries] = useState<ScheduleEntry[]>([])
  const [tags, setTags]                     = useState<Tag[]>([])
  const [grades, setGrades]                 = useState<Grade[]>([])
  const [allGrades, setAllGrades]           = useState<Grade[]>([])
  const [gradeStats, setGradeStats]         = useState<SubjectGradeStat[]>([])
  const [gradeScale, setGradeScale]         = useState(100)
  const [notes, setNotes]                   = useState<Note[]>([])
  const [subjectTab, setSubjectTab]         = useState<SubjectTab>('tasks')
  const [attachments, setAttachments]       = useState<Attachment[]>([])
  const [subtasks, setSubtasks]             = useState<Subtask[]>([])
  const [selectedSubjectId, setSelectedSubjectId] = useState<number | null>(null)
  const [selectedTaskId, setSelectedTaskId]       = useState<number | null>(null)
  const [showSettings, setShowSettings]     = useState(false)
  const [subjectSort, setSubjectSort]       = useState<SubjectSort>('alpha')
  const [error, setError]                   = useState<string | null>(null)

  const [sessionVersion, setSessionVersion] = useState(0)

  // Pomodoro – instantiated at App level so it persists across view switches
  const [pomState, pomControls] = usePomodoro(() => {
    setSessionVersion((v) => v + 1)
    setDashRefreshKey((k) => k + 1)
  })

  // Used to auto-select a task after navigating from the calendar
  const autoSelectTaskRef = useRef<number | null>(null)

  const selectedSubject = subjects.find((s) => s.id === selectedSubjectId) ?? null
  const selectedTask    = tasks.find((t) => t.id === selectedTaskId) ?? null

  useEffect(() => {
    void loadSubjects()
    void loadArchivedSubjects()
    void loadSemesters()
    void loadTheme()
    void loadTags()
    void loadScheduleEntries()
    void loadGradeStats()
    void loadAllGrades()
    void loadGradeScale()
    void loadSubjectSort()
  }, [])

  // Reload view-specific data when switching views
  useEffect(() => {
    if (view === 'calendar') void loadAllDeadlineTasks()
    if (view === 'schedule') void loadScheduleEntries()
  }, [view])

  useEffect(() => {
    setSelectedTaskId(null)
    if (selectedSubjectId !== null) {
      void loadTasks(selectedSubjectId)
      void loadGrades(selectedSubjectId)
      void loadNotes(selectedSubjectId)
    } else {
      setTasks([])
      setGrades([])
      setNotes([])
    }
  }, [selectedSubjectId])

  useEffect(() => {
    if (selectedTaskId !== null) {
      void loadAttachments(selectedTaskId)
      void loadSubtasks(selectedTaskId)
    } else {
      setAttachments([])
      setSubtasks([])
    }
  }, [selectedTaskId])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  async function loadTheme() {
    try {
      const val = await unwrap(window.api.settings.get('theme'))
      if (val === 'light' || val === 'dark') setTheme(val)
    } catch { /* keep default */ }
  }

  async function loadSubjects() {
    try { setSubjects(await unwrap(window.api.subjects.getAll())) }
    catch (e) { setError(String(e)) }
  }

  async function loadArchivedSubjects() {
    try { setArchivedSubjects(await unwrap(window.api.subjects.getAll({ archived: true }))) }
    catch (e) { setError(String(e)) }
  }

  async function loadSemesters() {
    try { setSemesters(await unwrap(window.api.semesters.getAll())) }
    catch (e) { setError(String(e)) }
  }

  async function loadTasks(subjectId: number) {
    try {
      const loaded = await unwrap(window.api.tasks.getBySubject(subjectId))
      setTasks(loaded)
      // Auto-select task if navigating from calendar
      if (autoSelectTaskRef.current !== null) {
        const id = autoSelectTaskRef.current
        autoSelectTaskRef.current = null
        if (loaded.some((t) => t.id === id)) setSelectedTaskId(id)
      }
    } catch (e) { setError(String(e)) }
  }

  async function loadAllDeadlineTasks() {
    try { setAllDeadlineTasks(await unwrap(window.api.tasks.getAllWithDeadline())) }
    catch (e) { setError(String(e)) }
  }

  async function loadTags() {
    try { setTags(await unwrap(window.api.tags.getAll())) }
    catch (e) { setError(String(e)) }
  }

  async function loadScheduleEntries() {
    try { setScheduleEntries(await unwrap(window.api.schedule.getAll())) }
    catch (e) { setError(String(e)) }
  }

  async function loadGrades(subjectId: number) {
    try { setGrades(await unwrap(window.api.grades.getBySubject(subjectId))) }
    catch (e) { setError(String(e)) }
  }

  async function loadGradeStats() {
    try { setGradeStats(await unwrap(window.api.grades.getSubjectStats())) }
    catch (e) { setError(String(e)) }
  }

  async function loadAllGrades() {
    try { setAllGrades(await unwrap(window.api.grades.getAll())) }
    catch (e) { setError(String(e)) }
  }

  async function loadNotes(subjectId: number) {
    try { setNotes(await unwrap(window.api.notes.getBySubject(subjectId))) }
    catch (e) { setError(String(e)) }
  }

  async function loadGradeScale() {
    try {
      const r = await window.api.settings.get('grades.scale')
      if (r.success && r.data) setGradeScale(Number(r.data))
    } catch { /* keep default */ }
  }

  async function loadSubjectSort() {
    try {
      const r = await window.api.settings.get('subjects.sort')
      if (r.success && r.data && ['alpha', 'semester', 'grade'].includes(r.data)) {
        setSubjectSort(r.data as SubjectSort)
      }
    } catch { /* keep default */ }
  }

  async function handleSubjectSortChange(sort: SubjectSort) {
    setSubjectSort(sort)
    try { await window.api.settings.set('subjects.sort', sort) } catch { /* ignore */ }
  }

  async function loadAttachments(taskId: number) {
    try { setAttachments(await unwrap(window.api.attachments.getByTask(taskId))) }
    catch (e) { setError(String(e)) }
  }

  async function loadSubtasks(taskId: number) {
    try { setSubtasks(await unwrap(window.api.subtasks.getByTask(taskId))) }
    catch (e) { setError(String(e)) }
  }

  // ── Subject handlers ─────────────────────────────────────────────────────
  async function handleCreateSubject(data: { name: string; color: string; description?: string | null }) {
    const s = await unwrap(window.api.subjects.create(data))
    setSubjects((prev) => [...prev, s].sort((a, b) => a.name.localeCompare(b.name)))
    setSelectedSubjectId(s.id)
  }

  async function handleUpdateSubject(id: number, data: Partial<Omit<Subject, 'id' | 'created_at'>>) {
    const s = await unwrap(window.api.subjects.update(id, data))
    setSubjects((prev) => prev.map((x) => x.id === id ? s : x).sort((a, b) => a.name.localeCompare(b.name)))
    setArchivedSubjects((prev) => prev.map((x) => x.id === id ? s : x).sort((a, b) => a.name.localeCompare(b.name)))
  }

  async function handleDeleteSubject(id: number) {
    if (!confirm('Удалить предмет и все его задания?')) return
    await unwrap(window.api.subjects.delete(id))
    setSubjects((prev) => prev.filter((s) => s.id !== id))
    if (selectedSubjectId === id) setSelectedSubjectId(null)
  }

  async function handleArchiveSubject(id: number, archive: boolean) {
    const s = await unwrap(window.api.subjects.archive(id, archive))
    if (archive) {
      setSubjects((prev) => prev.filter((x) => x.id !== id))
      setArchivedSubjects((prev) => [...prev, s].sort((a, b) => a.name.localeCompare(b.name)))
      if (selectedSubjectId === id) setSelectedSubjectId(null)
    } else {
      setArchivedSubjects((prev) => prev.filter((x) => x.id !== id))
      setSubjects((prev) => [...prev, s].sort((a, b) => a.name.localeCompare(b.name)))
    }
  }

  // ── Semester handlers ────────────────────────────────────────────────────
  async function handleCreateSemester(data: { name: string; start_date?: string | null; end_date?: string | null }) {
    const s = await unwrap(window.api.semesters.create(data))
    setSemesters((prev) => [s, ...prev])
  }

  async function handleUpdateSemester(id: number, data: { name?: string; start_date?: string | null; end_date?: string | null }) {
    const s = await unwrap(window.api.semesters.update(id, data))
    setSemesters((prev) => prev.map((x) => x.id === id ? s : x))
  }

  async function handleDeleteSemester(id: number) {
    await unwrap(window.api.semesters.delete(id))
    setSemesters((prev) => prev.filter((s) => s.id !== id))
    // Reload subjects — their semester_id may now be NULL
    void loadSubjects()
    void loadArchivedSubjects()
  }

  async function handleSetActiveSemester(id: number | null) {
    await unwrap(window.api.semesters.setActive(id))
    setSemesters((prev) => prev.map((s) => ({ ...s, is_active: s.id === id ? 1 : 0 })))
    setDashRefreshKey((k) => k + 1)
  }

  // ── Task handlers ────────────────────────────────────────────────────────
  async function handleCreateTask(data: Omit<Task, 'id' | 'created_at'>) {
    const t = await unwrap(window.api.tasks.create(data))
    setTasks((prev) => [t, ...prev])
    setSelectedTaskId(t.id)
    setDashRefreshKey((k) => k + 1)
  }

  async function handleUpdateTask(id: number, data: Partial<Omit<Task, 'id' | 'created_at' | 'subject_id'>>) {
    const t = await unwrap(window.api.tasks.update(id, data))
    setTasks((prev) => prev.map((x) => x.id === id ? { ...x, ...t } : x))
    setDashRefreshKey((k) => k + 1)
  }

  async function handleDeleteTask(id: number) {
    if (!confirm('Удалить задание?')) return
    await unwrap(window.api.tasks.delete(id))
    setTasks((prev) => prev.filter((t) => t.id !== id))
    if (selectedTaskId === id) setSelectedTaskId(null)
    setDashRefreshKey((k) => k + 1)
  }

  async function handleCompleteRecurring(id: number) {
    const result = await unwrap(window.api.tasks.completeRecurring(id))
    setTasks((prev) => {
      const updated = prev.map((t) => t.id === id ? { ...t, ...result.task } : t)
      return result.spawned ? [result.spawned, ...updated] : updated
    })
    setDashRefreshKey((k) => k + 1)
  }

  // Navigate from calendar to a specific task
  function handleNavigateToTask(subjectId: number, taskId: number) {
    autoSelectTaskRef.current = taskId
    setView('tasks')
    setSelectedSubjectId(subjectId)
  }

  // ── Attachment handlers ──────────────────────────────────────────────────
  async function handleAddAttachment(taskId: number, paths?: string[]) {
    let filePaths = paths
    if (!filePaths) {
      filePaths = await unwrap(window.api.dialog.openFile()) ?? undefined
    }
    if (!filePaths || filePaths.length === 0) return

    const result = await unwrap(window.api.attachments.addMultiple(taskId, filePaths))
    if (result.added.length > 0) {
      setAttachments((prev) => [...result.added, ...prev])
    }

    const addedCount   = result.added.length
    const skippedCount = result.skipped.length
    if (addedCount > 0 || skippedCount > 0) {
      let title = addedCount > 0
        ? `Прикреплено файлов: ${addedCount}`
        : 'Файлы не добавлены'
      let body = skippedCount > 0
        ? `Пропущено (дубликаты): ${result.skipped.join(', ')}`
        : ''
      void window.api.notifications.show(title, body || title)
    }
  }

  async function handleDeleteAttachment(id: number) {
    const item = attachments.find((a) => a.id === id)
    const msg  = item?.is_folder ? 'Удалить папку и все вложенные файлы?' : 'Удалить вложение?'
    if (!confirm(msg)) return
    await unwrap(window.api.attachments.delete(id))
    setAttachments((prev) => prev.filter((a) => a.id !== id && a.parent_attachment_id !== id))
  }

  async function handleAddFolder(taskId: number, folderPath: string, displayName: string, replaceId?: number) {
    try {
      if (replaceId != null) {
        await unwrap(window.api.attachments.delete(replaceId))
        setAttachments((prev) => prev.filter((a) => a.id !== replaceId && a.parent_attachment_id !== replaceId))
      }
      const result = await unwrap(window.api.attachments.addFolder(taskId, folderPath, displayName))
      setAttachments((prev) => [result.folder, ...result.children, ...prev])
      void window.api.notifications.show(
        'Папка прикреплена',
        `${displayName} — ${result.children.length} файл(ов)`
      )
    } catch (e) {
      setError(String(e))
    }
  }

  async function handleOpenAttachment(id: number) {
    await unwrap(window.api.attachments.open(id))
  }

  // ── Subtask handlers ─────────────────────────────────────────────────────
  async function handleCreateSubtask(taskId: number, title: string) {
    const s = await unwrap(window.api.subtasks.create(taskId, title))
    setSubtasks((prev) => [...prev, s])
    if (selectedSubjectId !== null) await loadTasks(selectedSubjectId)
  }

  async function handleUpdateSubtask(id: number, data: { title?: string; is_done?: boolean }) {
    const s = await unwrap(window.api.subtasks.update(id, data))
    setSubtasks((prev) => prev.map((x) => x.id === id ? s : x))
    if (data.is_done !== undefined && selectedSubjectId !== null) {
      await loadTasks(selectedSubjectId)
    }
  }

  async function handleDeleteSubtask(id: number) {
    await unwrap(window.api.subtasks.delete(id))
    setSubtasks((prev) => prev.filter((s) => s.id !== id))
    if (selectedSubjectId !== null) await loadTasks(selectedSubjectId)
  }

  async function handleReorderSubtasks(taskId: number, orderedIds: number[]) {
    await unwrap(window.api.subtasks.reorder(taskId, orderedIds))
    if (selectedTaskId !== null) await loadSubtasks(selectedTaskId)
  }

  // ── Tag handlers ─────────────────────────────────────────────────────────
  async function handleCreateTag(name: string, color: string): Promise<Tag> {
    const tag = await unwrap(window.api.tags.create(name, color))
    setTags((prev) => [...prev, tag])
    return tag
  }

  async function handleUpdateTag(id: number, data: { name?: string; color?: string }) {
    const tag = await unwrap(window.api.tags.update(id, data))
    setTags((prev) => prev.map((t) => t.id === id ? tag : t))
    if (selectedSubjectId !== null) await loadTasks(selectedSubjectId)
  }

  async function handleDeleteTag(id: number) {
    await unwrap(window.api.tags.delete(id))
    setTags((prev) => prev.filter((t) => t.id !== id))
    if (selectedSubjectId !== null) await loadTasks(selectedSubjectId)
  }

  async function handleSetTaskTags(taskId: number, tagIds: number[]) {
    await unwrap(window.api.tags.setTaskTags(taskId, tagIds))
    if (selectedSubjectId !== null) await loadTasks(selectedSubjectId)
  }

  // ── Note handlers ────────────────────────────────────────────────────────
  async function handleCreateNote(subjectId: number, title: string): Promise<Note> {
    const note = await unwrap(window.api.notes.create(subjectId, title))
    setNotes((prev) => [note, ...prev])
    return note
  }

  function handleUpdateNote(id: number, data: { title?: string; content?: string }) {
    window.api.notes.update(id, data).then((r) => {
      if (r.success) setNotes((prev) => prev.map((n) => n.id === id ? r.data : n))
    }).catch(() => {/* non-fatal */})
  }

  async function handleDeleteNote(id: number) {
    await unwrap(window.api.notes.delete(id))
    setNotes((prev) => prev.filter((n) => n.id !== id))
  }

  // ── Grade handlers ───────────────────────────────────────────────────────
  async function handleCreateGrade(data: Omit<Grade, 'id' | 'created_at'>) {
    const g = await unwrap(window.api.grades.create(data))
    setGrades((prev) => [g, ...prev])
    setAllGrades((prev) => [g, ...prev])
    void loadGradeStats()
  }

  async function handleUpdateGrade(id: number, data: Partial<Omit<Grade, 'id' | 'created_at' | 'subject_id'>>) {
    const g = await unwrap(window.api.grades.update(id, data))
    setGrades((prev) => prev.map((x) => x.id === id ? g : x))
    setAllGrades((prev) => prev.map((x) => x.id === id ? g : x))
    void loadGradeStats()
  }

  async function handleDeleteGrade(id: number) {
    await unwrap(window.api.grades.delete(id))
    setGrades((prev) => prev.filter((g) => g.id !== id))
    setAllGrades((prev) => prev.filter((g) => g.id !== id))
    void loadGradeStats()
  }

  async function handleGradeScaleChange(scale: number) {
    setGradeScale(scale)
    await unwrap(window.api.settings.set('grades.scale', String(scale)))
  }

  // ── Schedule handlers ────────────────────────────────────────────────────
  async function handleCreateScheduleEntry(data: Omit<ScheduleEntry, 'id' | 'created_at'>) {
    const entry = await unwrap(window.api.schedule.create(data))
    setScheduleEntries((prev) => [...prev, entry].sort((a, b) =>
      a.day_of_week !== b.day_of_week ? a.day_of_week - b.day_of_week : a.start_time.localeCompare(b.start_time)
    ))
  }

  async function handleUpdateScheduleEntry(id: number, data: Partial<Omit<ScheduleEntry, 'id' | 'created_at'>>) {
    const entry = await unwrap(window.api.schedule.update(id, data))
    setScheduleEntries((prev) => prev.map((e) => e.id === id ? entry : e).sort((a, b) =>
      a.day_of_week !== b.day_of_week ? a.day_of_week - b.day_of_week : a.start_time.localeCompare(b.start_time)
    ))
  }

  async function handleDeleteScheduleEntry(id: number) {
    await unwrap(window.api.schedule.delete(id))
    setScheduleEntries((prev) => prev.filter((e) => e.id !== id))
  }

  async function handleThemeChange(t: Theme) {
    setTheme(t)
    await unwrap(window.api.settings.set('theme', t))
  }

  return (
    <div className="app">
      {error && (
        <div style={{ position:'fixed', top:10, right:10, background:'var(--danger)', color:'#fff', padding:'10px 16px', borderRadius:8, zIndex:9999, fontSize:13 }}>
          {error}
          <button onClick={() => setError(null)} style={{ marginLeft:10, background:'none', border:'none', color:'#fff', cursor:'pointer', fontSize:16 }}>×</button>
        </div>
      )}

      <div className="sidebar">
        <div className="sidebar-header">
          <span className="app-logo">📚</span>
          <span className="app-title">StudyHub</span>
        </div>

        {/* View navigator */}
        <div className="view-nav">
          <button className={`view-nav-btn${view === 'dashboard' ? ' active' : ''}`} onClick={() => setView('dashboard')}>
            <span className="view-nav-icon">🏠</span> Дашборд
          </button>
          <button className={`view-nav-btn${view === 'tasks'    ? ' active' : ''}`} onClick={() => setView('tasks')}>
            <span className="view-nav-icon">📋</span> Задания
          </button>
          <button className={`view-nav-btn${view === 'schedule' ? ' active' : ''}`} onClick={() => setView('schedule')}>
            <span className="view-nav-icon">🗓</span> Расписание
          </button>
          <button className={`view-nav-btn${view === 'calendar' ? ' active' : ''}`} onClick={() => setView('calendar')}>
            <span className="view-nav-icon">📅</span> Календарь
          </button>
          <button className={`view-nav-btn${view === 'timer' ? ' active' : ''}`} onClick={() => setView('timer')}>
            <span className="view-nav-icon">⏱</span> Таймер
            {pomState.status === 'running' && (
              <span className="pom-running-badge" />
            )}
          </button>
        </div>

        <SubjectList
          subjects={subjects}
          archivedSubjects={archivedSubjects}
          selectedSubjectId={selectedSubjectId}
          semesters={semesters}
          gradeStats={gradeStats}
          gradeScale={gradeScale}
          subjectSort={subjectSort}
          onSelect={(id) => { setSelectedSubjectId(id); if (view !== 'tasks') setView('tasks') }}
          onCreate={handleCreateSubject}
          onUpdate={handleUpdateSubject}
          onDelete={handleDeleteSubject}
          onArchive={handleArchiveSubject}
          onSortChange={handleSubjectSortChange}
        />
        <div className="sidebar-footer">
          <button className="semesters-btn" onClick={() => setShowSemesterMgr(true)}>
            🎓 Семестры
            {semesters.find((s) => s.is_active) && (
              <span className="semester-active-chip">
                {semesters.find((s) => s.is_active)!.name}
              </span>
            )}
          </button>
          {gradeStats.length > 0 && (() => {
            const totalW = gradeStats.reduce((s, x) => s + x.grade_count, 0)
            const overall = totalW > 0
              ? gradeStats.reduce((s, x) => s + x.weighted_avg * x.grade_count, 0) / totalW
              : null
            return overall !== null ? (
              <div className="sidebar-gpa">
                <span className="sidebar-gpa-label">Общий балл</span>
                <span className="sidebar-gpa-value">{(overall * gradeScale).toFixed(gradeScale <= 10 ? 2 : 1)} / {gradeScale}</span>
              </div>
            ) : null
          })()}
          <button className="settings-btn" onClick={() => setShowSettings(true)}>⚙ Настройки</button>
        </div>
      </div>

      {/* ── Dashboard view ───────────────────────────────────────────────── */}
      {view === 'dashboard' && (
        <div className="full-content-panel">
          <Dashboard
            refreshKey={dashRefreshKey}
            gradeScale={gradeScale}
            semesters={semesters}
            gradeStats={gradeStats}
            allGrades={allGrades}
            onNavigate={(subjectId, taskId) => {
              handleNavigateToTask(subjectId, taskId)
            }}
          />
        </div>
      )}

      {/* ── Tasks view ────────────────────────────────────────────────────── */}
      {view === 'tasks' && (
        <>
          <div className="main-panel">
            {/* Subject tab bar */}
            {selectedSubject && (
              <div className="subject-tab-bar">
                <button
                  className={`subject-tab${subjectTab === 'tasks' ? ' active' : ''}`}
                  style={subjectTab === 'tasks' ? { borderColor: selectedSubject.color, color: selectedSubject.color } : {}}
                  onClick={() => setSubjectTab('tasks')}
                >
                  📋 Задания
                </button>
                <button
                  className={`subject-tab${subjectTab === 'grades' ? ' active' : ''}`}
                  style={subjectTab === 'grades' ? { borderColor: selectedSubject.color, color: selectedSubject.color } : {}}
                  onClick={() => setSubjectTab('grades')}
                >
                  ★ Оценки
                  {(() => {
                    const stat = gradeStats.find((s) => s.subject_id === selectedSubject.id)
                    if (!stat) return null
                    const score = (stat.weighted_avg * gradeScale).toFixed(gradeScale <= 10 ? 2 : 1)
                    return <span className="subject-tab-badge">{score}</span>
                  })()}
                </button>
                <button
                  className={`subject-tab${subjectTab === 'notes' ? ' active' : ''}`}
                  style={subjectTab === 'notes' ? { borderColor: selectedSubject.color, color: selectedSubject.color } : {}}
                  onClick={() => setSubjectTab('notes')}
                >
                  📝 Заметки
                  {notes.length > 0 && <span className="subject-tab-badge">{notes.length}</span>}
                </button>
              </div>
            )}

            {subjectTab === 'notes' && selectedSubject ? (
              <NoteList
                subject={selectedSubject}
                notes={notes}
                onCreate={handleCreateNote}
                onUpdate={handleUpdateNote}
                onDelete={handleDeleteNote}
              />
            ) : subjectTab === 'grades' && selectedSubject ? (
              <GradeList
                subject={selectedSubject}
                grades={grades}
                scale={gradeScale}
                onCreate={handleCreateGrade}
                onUpdate={handleUpdateGrade}
                onDelete={handleDeleteGrade}
              />
            ) : (
            <TaskList
              subject={selectedSubject}
              tasks={tasks}
              allTags={tags}
              selectedTaskId={selectedTaskId}
              onSelectTask={setSelectedTaskId}
              onCreateTask={handleCreateTask}
              onDeleteTask={handleDeleteTask}
              onUpdateTask={handleUpdateTask}
              onCompleteRecurring={handleCompleteRecurring}
            />
            )}
          </div>

          {selectedTask && (
            <div className="detail-panel">
              <TaskDetail
                task={selectedTask}
                attachments={attachments}
                subtasks={subtasks}
                allTags={tags}
                onUpdate={handleUpdateTask}
                onCompleteRecurring={handleCompleteRecurring}
                onSetTaskTags={handleSetTaskTags}
                onCreateTag={handleCreateTag}
                onAddAttachment={handleAddAttachment}
                onAddFolder={handleAddFolder}
                onDeleteAttachment={handleDeleteAttachment}
                onOpenAttachment={handleOpenAttachment}
                onCreateSubtask={handleCreateSubtask}
                onUpdateSubtask={handleUpdateSubtask}
                onDeleteSubtask={handleDeleteSubtask}
                onReorderSubtasks={handleReorderSubtasks}
                onSessionSaved={() => { setSessionVersion((v) => v + 1); setDashRefreshKey((k) => k + 1) }}
                onClose={() => setSelectedTaskId(null)}
              />
            </div>
          )}
        </>
      )}

      {/* ── Schedule view ─────────────────────────────────────────────────── */}
      {view === 'schedule' && (
        <div className="full-content-panel">
          <WeeklySchedule
            entries={scheduleEntries}
            subjects={subjects}
            onCreate={handleCreateScheduleEntry}
            onUpdate={handleUpdateScheduleEntry}
            onDelete={handleDeleteScheduleEntry}
          />
        </div>
      )}

      {/* ── Calendar view ─────────────────────────────────────────────────── */}
      {view === 'calendar' && (
        <div className="full-content-panel">
          <MonthCalendar
            allTasks={allDeadlineTasks}
            subjects={subjects}
            onNavigateToTask={handleNavigateToTask}
          />
        </div>
      )}

      {/* ── Timer view ────────────────────────────────────────────────────── */}
      {view === 'timer' && (
        <div className="full-content-panel timer-layout">
          <PomodoroTimer
            state={pomState}
            controls={pomControls}
            subjects={subjects}
            tasks={tasks.length > 0 ? tasks : allDeadlineTasks}
          />
          <StudyStats sessionVersion={sessionVersion} />
        </div>
      )}

      {showSettings && (
        <SettingsPanel
          theme={theme}
          tags={tags}
          gradeScale={gradeScale}
          onThemeChange={handleThemeChange}
          onGradeScaleChange={handleGradeScaleChange}
          onCreateTag={handleCreateTag}
          onUpdateTag={handleUpdateTag}
          onDeleteTag={handleDeleteTag}
          onClose={() => setShowSettings(false)}
        />
      )}

      {showSemesterMgr && (
        <SemesterManager
          semesters={semesters}
          onCreate={handleCreateSemester}
          onUpdate={handleUpdateSemester}
          onDelete={handleDeleteSemester}
          onSetActive={handleSetActiveSemester}
          onClose={() => setShowSemesterMgr(false)}
        />
      )}
    </div>
  )
}
