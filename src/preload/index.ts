import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'

const api = {
  subjects: {
    getAll:   (filter?: unknown)           => ipcRenderer.invoke('subjects:getAll', filter),
    create:   (data: unknown)              => ipcRenderer.invoke('subjects:create', data),
    update:   (id: number, data: unknown)  => ipcRenderer.invoke('subjects:update', id, data),
    delete:   (id: number)                 => ipcRenderer.invoke('subjects:delete', id),
    archive:  (id: number, archive: boolean) => ipcRenderer.invoke('subjects:archive', id, archive)
  },
  semesters: {
    getAll:    ()                           => ipcRenderer.invoke('semesters:getAll'),
    create:    (data: unknown)              => ipcRenderer.invoke('semesters:create', data),
    update:    (id: number, data: unknown)  => ipcRenderer.invoke('semesters:update', id, data),
    delete:    (id: number)                 => ipcRenderer.invoke('semesters:delete', id),
    setActive: (id: number | null)          => ipcRenderer.invoke('semesters:setActive', id)
  },
  tasks: {
    getBySubject:      (subjectId: number)         => ipcRenderer.invoke('tasks:getBySubject', subjectId),
    getAllWithDeadline: ()                          => ipcRenderer.invoke('tasks:getAllWithDeadline'),
    create:            (data: unknown)             => ipcRenderer.invoke('tasks:create', data),
    update:            (id: number, data: unknown) => ipcRenderer.invoke('tasks:update', id, data),
    delete:            (id: number)                => ipcRenderer.invoke('tasks:delete', id),
    completeRecurring: (id: number)                => ipcRenderer.invoke('tasks:completeRecurring', id)
  },
  attachments: {
    getByTask:   (taskId: number)                              => ipcRenderer.invoke('attachments:getByTask', taskId),
    add:         (taskId: number, filePath: string)            => ipcRenderer.invoke('attachments:add', taskId, filePath),
    addMultiple: (taskId: number, paths: string[])             => ipcRenderer.invoke('attachments:addMultiple', taskId, paths),
    addFolder:   (taskId: number, src: string, name: string)   => ipcRenderer.invoke('attachments:addFolder', taskId, src, name),
    delete:      (id: number)                                  => ipcRenderer.invoke('attachments:delete', id),
    open:        (id: number)                                  => ipcRenderer.invoke('attachments:open', id),
    export:      (files: Array<{ filepath: string; filename: string }>, destDir: string) =>
                   ipcRenderer.invoke('attachments:export', files, destDir)
  },
  subtasks: {
    getByTask: (taskId: number)                                    => ipcRenderer.invoke('subtasks:getByTask', taskId),
    create:    (taskId: number, title: string)                     => ipcRenderer.invoke('subtasks:create', taskId, title),
    update:    (id: number, data: { title?: string; is_done?: boolean }) => ipcRenderer.invoke('subtasks:update', id, data),
    delete:    (id: number)                                        => ipcRenderer.invoke('subtasks:delete', id),
    reorder:   (taskId: number, orderedIds: number[])              => ipcRenderer.invoke('subtasks:reorder', taskId, orderedIds)
  },
  tags: {
    getAll:      ()                                                     => ipcRenderer.invoke('tags:getAll'),
    create:      (name: string, color: string)                         => ipcRenderer.invoke('tags:create', name, color),
    update:      (id: number, data: { name?: string; color?: string }) => ipcRenderer.invoke('tags:update', id, data),
    delete:      (id: number)                                          => ipcRenderer.invoke('tags:delete', id),
    setTaskTags: (taskId: number, tagIds: number[])                    => ipcRenderer.invoke('tags:setTaskTags', taskId, tagIds)
  },
  schedule: {
    getAll:  ()                            => ipcRenderer.invoke('schedule:getAll'),
    create:  (data: unknown)               => ipcRenderer.invoke('schedule:create', data),
    update:  (id: number, data: unknown)   => ipcRenderer.invoke('schedule:update', id, data),
    delete:  (id: number)                  => ipcRenderer.invoke('schedule:delete', id)
  },
  dashboard: {
    getData: (semesterId?: number | null) => ipcRenderer.invoke('dashboard:getData', semesterId),
  },
  notes: {
    getBySubject: (subjectId: number)                          => ipcRenderer.invoke('notes:getBySubject', subjectId),
    create:       (subjectId: number, title: string)           => ipcRenderer.invoke('notes:create', subjectId, title),
    update:       (id: number, data: unknown)                  => ipcRenderer.invoke('notes:update', id, data),
    delete:       (id: number)                                 => ipcRenderer.invoke('notes:delete', id),
    search:       (query: string)                              => ipcRenderer.invoke('notes:search', query),
  },
  grades: {
    getBySubject:    (subjectId: number)          => ipcRenderer.invoke('grades:getBySubject', subjectId),
    getAll:          ()                           => ipcRenderer.invoke('grades:getAll'),
    create:          (data: unknown)              => ipcRenderer.invoke('grades:create', data),
    update:          (id: number, data: unknown)  => ipcRenderer.invoke('grades:update', id, data),
    delete:          (id: number)                 => ipcRenderer.invoke('grades:delete', id),
    getSubjectStats: ()                           => ipcRenderer.invoke('grades:getSubjectStats')
  },
  sessions: {
    create:   (data: unknown) => ipcRenderer.invoke('sessions:create', data),
    getStats: ()              => ipcRenderer.invoke('sessions:getStats')
  },
  notifications: {
    show: (title: string, body: string) => ipcRenderer.invoke('notifications:show', title, body)
  },
  settings: {
    get: (key: string)                => ipcRenderer.invoke('settings:get', key),
    set: (key: string, value: string) => ipcRenderer.invoke('settings:set', key, value)
  },
  dialog: {
    openFile:      () => ipcRenderer.invoke('dialog:openFile'),
    openDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),
  },
  updater: {
    checkForUpdates: () => ipcRenderer.invoke('updater:checkForUpdates'),
    downloadUpdate:  () => ipcRenderer.invoke('updater:downloadUpdate'),
    quitAndInstall:  () => ipcRenderer.invoke('updater:quitAndInstall'),
    getVersion:      () => ipcRenderer.invoke('updater:getVersion'),
    onUpdateAvailable:    (cb: (info: { version: string }) => void) =>
      ipcRenderer.on('updater:update-available', (_e: IpcRendererEvent, info) => cb(info)),
    onUpdateNotAvailable: (cb: () => void) =>
      ipcRenderer.on('updater:update-not-available', () => cb()),
    onDownloadProgress:   (cb: (percent: number) => void) =>
      ipcRenderer.on('updater:download-progress', (_e: IpcRendererEvent, pct) => cb(pct)),
    onUpdateDownloaded:   (cb: (info: { version: string }) => void) =>
      ipcRenderer.on('updater:update-downloaded', (_e: IpcRendererEvent, info) => cb(info)),
    onError:              (cb: (msg: string) => void) =>
      ipcRenderer.on('updater:error', (_e: IpcRendererEvent, msg) => cb(msg)),
    removeAllListeners:   (channel: string) =>
      ipcRenderer.removeAllListeners(channel),
  }
}

contextBridge.exposeInMainWorld('api', api)
