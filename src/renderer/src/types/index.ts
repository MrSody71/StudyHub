export type TaskStatus   = 'not_started' | 'in_progress' | 'done'
export type TaskPriority = 'low' | 'medium' | 'high'
export type Theme        = 'light' | 'dark'

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
  id:         number
  task_id:    number
  filename:   string
  filepath:   string
  size:       number
  mime_type:  string
  created_at: string
}

export interface ScheduleEntry {
  id:          number
  subject_id:  number | null
  title:       string
  day_of_week: number   // 0 = Monday … 6 = Sunday
  start_time:  string   // 'HH:MM'
  end_time:    string   // 'HH:MM'
  location:    string | null
  created_at:  string
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

export interface SessionStats {
  bySubject:     SubjectStat[]
  byDay:         DayStat[]
  todaySeconds:  number
  totalSeconds:  number
  totalSessions: number
}
