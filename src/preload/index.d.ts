import type { Subject, Task, Attachment, Subtask, Tag, ScheduleEntry, StudySession, SessionStats } from '../renderer/src/types'

type IpcResult<T> = { success: true; data: T } | { success: false; error: string }

declare global {
  interface Window {
    api: {
      subjects: {
        getAll:  ()                                                                => Promise<IpcResult<Subject[]>>
        create:  (data: { name: string; color: string; description?: string | null }) => Promise<IpcResult<Subject>>
        update:  (id: number, data: Partial<Omit<Subject, 'id' | 'created_at'>>) => Promise<IpcResult<Subject>>
        delete:  (id: number)                                                     => Promise<IpcResult<null>>
      }
      tasks: {
        getBySubject:      (subjectId: number)                                        => Promise<IpcResult<Task[]>>
        getAllWithDeadline: ()                                                         => Promise<IpcResult<Task[]>>
        create:            (data: Omit<Task, 'id' | 'created_at' | 'tags' | 'subtask_total' | 'subtask_done'>) => Promise<IpcResult<Task>>
        update:            (id: number, data: Partial<Omit<Task, 'id' | 'created_at' | 'subject_id' | 'tags' | 'subtask_total' | 'subtask_done'>>) => Promise<IpcResult<Task>>
        delete:            (id: number)                                               => Promise<IpcResult<null>>
        completeRecurring: (id: number)                                               => Promise<IpcResult<{ task: Task; spawned: Task | null }>>
      }
      attachments: {
        getByTask: (taskId: number)                     => Promise<IpcResult<Attachment[]>>
        add:       (taskId: number, filePath: string)   => Promise<IpcResult<Attachment>>
        delete:    (id: number)                         => Promise<IpcResult<null>>
        open:      (id: number)                         => Promise<IpcResult<null>>
      }
      subtasks: {
        getByTask: (taskId: number)                                          => Promise<IpcResult<Subtask[]>>
        create:    (taskId: number, title: string)                           => Promise<IpcResult<Subtask>>
        update:    (id: number, data: { title?: string; is_done?: boolean }) => Promise<IpcResult<Subtask>>
        delete:    (id: number)                                              => Promise<IpcResult<null>>
        reorder:   (taskId: number, orderedIds: number[])                    => Promise<IpcResult<null>>
      }
      tags: {
        getAll:      ()                                                          => Promise<IpcResult<Tag[]>>
        create:      (name: string, color: string)                              => Promise<IpcResult<Tag>>
        update:      (id: number, data: { name?: string; color?: string })      => Promise<IpcResult<Tag>>
        delete:      (id: number)                                               => Promise<IpcResult<null>>
        setTaskTags: (taskId: number, tagIds: number[])                         => Promise<IpcResult<null>>
      }
      schedule: {
        getAll:  ()                                                                   => Promise<IpcResult<ScheduleEntry[]>>
        create:  (data: Omit<ScheduleEntry, 'id' | 'created_at'>)                   => Promise<IpcResult<ScheduleEntry>>
        update:  (id: number, data: Partial<Omit<ScheduleEntry, 'id' | 'created_at'>>) => Promise<IpcResult<ScheduleEntry>>
        delete:  (id: number)                                                         => Promise<IpcResult<null>>
      }
      sessions: {
        create:   (data: Omit<StudySession, 'id' | 'created_at'>) => Promise<IpcResult<StudySession>>
        getStats: ()                                               => Promise<IpcResult<SessionStats>>
      }
      notifications: {
        show: (title: string, body: string) => Promise<IpcResult<null>>
      }
      settings: {
        get: (key: string)                => Promise<IpcResult<string | null>>
        set: (key: string, value: string) => Promise<IpcResult<null>>
      }
      dialog: {
        openFile: () => Promise<IpcResult<string | null>>
      }
    }
  }
}
