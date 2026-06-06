export type TaskStatus   = 'not_started' | 'in_progress' | 'done'
export type TaskPriority = 'low' | 'medium' | 'high'
export type Theme        = 'light' | 'dark'
export type SubjectSort  = 'alpha' | 'semester' | 'grade'
export type AppView      = 'dashboard' | 'subjects' | 'tasks' | 'schedule' | 'calendar' | 'timer' | 'wallet'

export interface Semester {
  id:         number
  name:       string
  start_date: string | null
  end_date:   string | null
  is_active:  number   // 0 | 1
  created_at: string
}

export interface Tag {
  id:         number
  name:       string
  color:      string
  created_at: string
}

export interface Subject {
  id:          number
  name:        string
  color:       string
  description: string | null
  semester_id: number | null
  is_archived: number   // 0 | 1
  created_at:  string
}

export interface Task {
  id:                    number
  subject_id:            number
  title:                 string
  description:           string | null
  status:                TaskStatus
  priority:              TaskPriority
  due_date:              string | null
  created_at:            string
  // Aggregated from subtasks — present in getBySubject queries
  subtask_total?:        number
  subtask_done?:         number
  // Aggregated from task_tags
  tags?:                 Tag[]
  // Recurrence
  recurrence_rule?:      string | null
  recurrence_parent_id?: number | null
}

export interface Subtask {
  id:         number
  task_id:    number
  title:      string
  is_done:    number   // 0 | 1  (SQLite boolean)
  sort_order: number
  created_at: string
}

export interface Attachment {
  id:                   number
  task_id:              number | null  // null for subject-level attachments (Moodle files)
  subject_id:           number | null  // set for subject-level Moodle attachments
  filename:             string
  filepath:             string
  size:                 number
  mime_type:            string
  is_folder:            number         // 0 | 1
  parent_attachment_id: number | null
  moodle_file_url:      string | null  // Moodle fileurl — used for dedup
  storage_path:         string | null  // Supabase Storage path (web version)
  created_at:           string
}

export interface ScheduleEntry {
  id:          number
  subject_id:  number | null
  title:       string
  day_of_week: number        // 0 = Monday … 6 = Sunday
  start_time:  string        // 'HH:MM'
  end_time:    string        // 'HH:MM'
  location:    string | null
  teacher:     string | null
  entry_date:  string | null // 'YYYY-MM-DD', null = recurring weekly
  created_at:  string
}

export interface BatchImportEntry {
  subject_name: string | null
  title:        string
  day_of_week:  number        // 0 = Mon … 6 = Sun
  start_time:   string        // 'HH:MM'
  end_time:     string        // 'HH:MM'
  location:     string | null
  date?:        string | null // 'YYYY-MM-DD' for date-specific imports
  teacher:      string | null
}

export interface BatchImportResult {
  created:         number
  subjectsCreated: number
}

export interface TulguConfig {
  groupNumber: string   // e.g. "Б260221"
  interval:    string   // '3h' | '6h' | '12h' | '24h' | 'manual'
}

export interface TulguStatus {
  isSyncing:   boolean
  lastUpdated: string | null
  lastError:   string | null
  lastErrorAt: string | null
}

export interface ScheduleDiff {
  added:   string[]
  removed: string[]
  moved:   string[]
}

export interface TulguSyncResult {
  changed: boolean
  diff:    ScheduleDiff
}

export interface TaskStats {
  total:      number
  done:       number
  inProgress: number
  notStarted: number
  overdue:    number
}

export interface SubjectProgress {
  subject_id:    number
  subject_name:  string
  subject_color: string
  total:         number
  done:          number
  pct:           number
}

export interface DeadlineTask {
  id:            number
  subject_id:    number
  title:         string
  due_date:      string
  priority:      string
  status:        string
  subject_name:  string
  subject_color: string
}

export interface DayActivity {
  date:          string
  total_seconds: number
}

export interface DashboardData {
  taskStats:         TaskStats
  subjectProgress:   SubjectProgress[]
  upcomingDeadlines: DeadlineTask[]
  weekStudySeconds:  number
  activityByDay:     DayActivity[]
  overallGpa:        number | null
  streak:            number
}

export interface Note {
  id:         number
  subject_id: number
  title:      string
  content:    string
  updated_at: string
  created_at: string
}

export interface Grade {
  id:         number
  subject_id: number
  title:      string
  value:      number
  max_value:  number
  weight:     number
  date:       string | null
  created_at: string
}

export interface SubjectGradeStat {
  subject_id:    number
  subject_name:  string
  subject_color: string
  weighted_avg:  number   // ratio 0–1
  grade_count:   number
}

export type SessionType = 'pomodoro' | 'short_break' | 'long_break' | 'manual'

export interface StudySession {
  id:               number
  subject_id:       number | null
  task_id:          number | null
  type:             SessionType
  duration_seconds: number
  started_at:       string
  ended_at:         string | null
  created_at:       string
}

export interface SubjectStat {
  subject_id:    number
  subject_name:  string
  subject_color: string
  total_seconds: number
  session_count: number
}

export interface DayStat {
  date:          string
  total_seconds: number
  session_count: number
}

// ── Moodle ТулГУ ─────────────────────────────────────────────────────────────

export interface MoodleStatus {
  isLoggedIn: boolean
  userId:     number | null
  fullname:   string | null
  lastSyncAt: string | null
  lastError:  string | null
}

export interface MoodleCourse {
  id:         number
  fullname:   string
  shortname:  string
  subject_id: number | null  // null = not yet mapped to a local subject
}

export interface MoodleSyncProgress {
  stage:   'courses' | 'assignments' | 'files' | 'done' | 'error'
  message: string
}

export interface MoodleSyncResult {
  assignmentsCreated: number
  filesDownloaded:    number
  filesSkipped:       number
}

// ── Wallet ────────────────────────────────────────────────────────────────────

export type WalletTransactionType = 'income' | 'expense'

export interface WalletCategory {
  id:         number
  name:       string
  icon:       string
  color:      string
  type:       WalletTransactionType
  sort_order: number
  is_deleted: number   // 0 | 1
  updated_at: string
  created_at: string
}

export interface WalletTransaction {
  id:          number
  category_id: number | null
  amount:      number
  type:        WalletTransactionType
  note:        string | null
  date:        string   // 'YYYY-MM-DD'
  is_deleted:  number   // 0 | 1
  updated_at:  string
  created_at:  string
  // Joined from wallet_categories
  category_name?:  string | null
  category_icon?:  string | null
  category_color?: string | null
}

export interface WalletCategoryStat {
  category_id:    number | null
  category_name:  string
  category_icon:  string
  category_color: string
  type:           WalletTransactionType
  total:          number
  count:          number
}

export interface WalletDayStat {
  date:    string
  income:  number
  expense: number
}

export interface WalletStats {
  totalIncome:  number
  totalExpense: number
  balance:      number
  byCategory:   WalletCategoryStat[]
  byDay:        WalletDayStat[]
}

// ── Support ───────────────────────────────────────────────────────────────────

export type TicketStatus = 'open' | 'in_progress' | 'closed'

export interface SupportTicket {
  id:         string
  user_id:    string
  subject:    string
  status:     TicketStatus
  created_at: string
  updated_at: string
  // Present in admin RPC result
  email?:     string
  unread?:    number
}

export interface SupportMessage {
  id:         string
  ticket_id:  string
  sender:     'user' | 'admin'
  message:    string
  is_read:    boolean
  created_at: string
}

// ─────────────────────────────────────────────────────────────────────────────

export interface SessionStats {
  bySubject:     SubjectStat[]
  byDay:         DayStat[]
  todaySeconds:  number
  totalSeconds:  number
  totalSessions: number
}
