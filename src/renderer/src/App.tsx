import { useState, useEffect } from 'react'
import type { Subject, Task, Attachment, Subtask, Theme } from './types'
import SubjectList from './components/SubjectList'
import TaskList from './components/TaskList'
import TaskDetail from './components/TaskDetail'
import SettingsPanel from './components/SettingsPanel'

type IpcResult<T> = { success: true; data: T } | { success: false; error: string }

async function unwrap<T>(p: Promise<IpcResult<T>>): Promise<T> {
  const r = await p
  if (!r.success) throw new Error(r.error)
  return r.data
}

export default function App() {
  const [theme, setTheme]                   = useState<Theme>('light')
  const [subjects, setSubjects]             = useState<Subject[]>([])
  const [tasks, setTasks]                   = useState<Task[]>([])
  const [attachments, setAttachments]       = useState<Attachment[]>([])
  const [subtasks, setSubtasks]             = useState<Subtask[]>([])
  const [selectedSubjectId, setSelectedSubjectId] = useState<number | null>(null)
  const [selectedTaskId, setSelectedTaskId]       = useState<number | null>(null)
  const [showSettings, setShowSettings]     = useState(false)
  const [error, setError]                   = useState<string | null>(null)

  const selectedSubject = subjects.find((s) => s.id === selectedSubjectId) ?? null
  const selectedTask    = tasks.find((t) => t.id === selectedTaskId) ?? null

  useEffect(() => { void loadSubjects(); void loadTheme() }, [])

  useEffect(() => {
    setSelectedTaskId(null)
    if (selectedSubjectId !== null) void loadTasks(selectedSubjectId)
    else setTasks([])
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

  async function loadTasks(subjectId: number) {
    try { setTasks(await unwrap(window.api.tasks.getBySubject(subjectId))) }
    catch (e) { setError(String(e)) }
  }

  async function loadAttachments(taskId: number) {
    try { setAttachments(await unwrap(window.api.attachments.getByTask(taskId))) }
    catch (e) { setError(String(e)) }
  }

  async function loadSubtasks(taskId: number) {
    try { setSubtasks(await unwrap(window.api.subtasks.getByTask(taskId))) }
    catch (e) { setError(String(e)) }
  }

  // After any subtask mutation, refresh both the subtask list AND the task list
  // so progress counts in the center panel stay in sync.
  async function refreshSubtasks(taskId: number) {
    await loadSubtasks(taskId)
    if (selectedSubjectId !== null) await loadTasks(selectedSubjectId)
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
  }

  async function handleDeleteSubject(id: number) {
    if (!confirm('Удалить предмет и все его задания?')) return
    await unwrap(window.api.subjects.delete(id))
    setSubjects((prev) => prev.filter((s) => s.id !== id))
    if (selectedSubjectId === id) setSelectedSubjectId(null)
  }

  // ── Task handlers ────────────────────────────────────────────────────────
  async function handleCreateTask(data: Omit<Task, 'id' | 'created_at'>) {
    const t = await unwrap(window.api.tasks.create(data))
    setTasks((prev) => [t, ...prev])
    setSelectedTaskId(t.id)
  }

  async function handleUpdateTask(id: number, data: Partial<Omit<Task, 'id' | 'created_at' | 'subject_id'>>) {
    const t = await unwrap(window.api.tasks.update(id, data))
    setTasks((prev) => prev.map((x) => x.id === id ? { ...x, ...t } : x))
  }

  async function handleDeleteTask(id: number) {
    if (!confirm('Удалить задание?')) return
    await unwrap(window.api.tasks.delete(id))
    setTasks((prev) => prev.filter((t) => t.id !== id))
    if (selectedTaskId === id) setSelectedTaskId(null)
  }

  // ── Attachment handlers ──────────────────────────────────────────────────
  async function handleAddAttachment(taskId: number) {
    const filePath = await unwrap(window.api.dialog.openFile())
    if (!filePath) return
    const a = await unwrap(window.api.attachments.add(taskId, filePath))
    setAttachments((prev) => [a, ...prev])
  }

  async function handleDeleteAttachment(id: number) {
    if (!confirm('Удалить вложение?')) return
    await unwrap(window.api.attachments.delete(id))
    setAttachments((prev) => prev.filter((a) => a.id !== id))
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
    // Update local order to match
    if (selectedTaskId !== null) await loadSubtasks(selectedTaskId)
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
        <SubjectList
          subjects={subjects}
          selectedSubjectId={selectedSubjectId}
          onSelect={setSelectedSubjectId}
          onCreate={handleCreateSubject}
          onUpdate={handleUpdateSubject}
          onDelete={handleDeleteSubject}
        />
        <div className="sidebar-footer">
          <button className="settings-btn" onClick={() => setShowSettings(true)}>⚙ Настройки</button>
        </div>
      </div>

      <div className="main-panel">
        <TaskList
          subject={selectedSubject}
          tasks={tasks}
          selectedTaskId={selectedTaskId}
          onSelectTask={setSelectedTaskId}
          onCreateTask={handleCreateTask}
          onDeleteTask={handleDeleteTask}
          onUpdateTask={handleUpdateTask}
        />
      </div>

      {selectedTask && (
        <div className="detail-panel">
          <TaskDetail
            task={selectedTask}
            attachments={attachments}
            subtasks={subtasks}
            onUpdate={handleUpdateTask}
            onAddAttachment={handleAddAttachment}
            onDeleteAttachment={handleDeleteAttachment}
            onOpenAttachment={handleOpenAttachment}
            onCreateSubtask={handleCreateSubtask}
            onUpdateSubtask={handleUpdateSubtask}
            onDeleteSubtask={handleDeleteSubtask}
            onReorderSubtasks={handleReorderSubtasks}
            onClose={() => setSelectedTaskId(null)}
          />
        </div>
      )}

      {showSettings && (
        <SettingsPanel
          theme={theme}
          onThemeChange={handleThemeChange}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  )
}
