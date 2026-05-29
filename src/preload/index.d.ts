import type { Subject, Task, Attachment } from '../renderer/src/types'

type IpcResult<T> = { success: true; data: T } | { success: false; error: string }

declare global {
  interface Window {
    api: {
      subjects: {
        getAll:  ()                                                          => Promise<IpcResult<Subject[]>>
        create:  (data: { name: string; color: string; description?: string | null }) => Promise<IpcResult<Subject>>
        update:  (id: number, data: Partial<Omit<Subject, 'id' | 'created_at'>>) => Promise<IpcResult<Subject>>
        delete:  (id: number)                                               => Promise<IpcResult<null>>
      }
      tasks: {
        getBySubject: (subjectId: number)                                   => Promise<IpcResult<Task[]>>
        create:       (data: Omit<Task, 'id' | 'created_at'>)              => Promise<IpcResult<Task>>
        update:       (id: number, data: Partial<Omit<Task, 'id' | 'created_at' | 'subject_id'>>) => Promise<IpcResult<Task>>
        delete:       (id: number)                                          => Promise<IpcResult<null>>
      }
      attachments: {
        getByTask: (taskId: number)                                         => Promise<IpcResult<Attachment[]>>
        add:       (taskId: number, filePath: string)                       => Promise<IpcResult<Attachment>>
        delete:    (id: number)                                             => Promise<IpcResult<null>>
        open:      (id: number)                                             => Promise<IpcResult<null>>
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
