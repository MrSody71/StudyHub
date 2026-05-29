export type TaskStatus   = 'not_started' | 'in_progress' | 'done'
export type TaskPriority = 'low' | 'medium' | 'high'
export type Theme        = 'light' | 'dark'

export interface Subject {
  id:          number
  name:        string
  color:       string
  description: string | null
  created_at:  string
}

export interface Task {
  id:          number
  subject_id:  number
  title:       string
  description: string | null
  status:      TaskStatus
  priority:    TaskPriority
  due_date:    string | null
  created_at:  string
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
