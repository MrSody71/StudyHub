import { contextBridge, ipcRenderer } from 'electron'

const api = {
  subjects: {
    getAll:  ()                            => ipcRenderer.invoke('subjects:getAll'),
    create:  (data: unknown)               => ipcRenderer.invoke('subjects:create', data),
    update:  (id: number, data: unknown)   => ipcRenderer.invoke('subjects:update', id, data),
    delete:  (id: number)                  => ipcRenderer.invoke('subjects:delete', id)
  },
  tasks: {
    getBySubject: (subjectId: number)          => ipcRenderer.invoke('tasks:getBySubject', subjectId),
    create:       (data: unknown)              => ipcRenderer.invoke('tasks:create', data),
    update:       (id: number, data: unknown)  => ipcRenderer.invoke('tasks:update', id, data),
    delete:       (id: number)                 => ipcRenderer.invoke('tasks:delete', id)
  },
  attachments: {
    getByTask: (taskId: number)                       => ipcRenderer.invoke('attachments:getByTask', taskId),
    add:       (taskId: number, filePath: string)     => ipcRenderer.invoke('attachments:add', taskId, filePath),
    delete:    (id: number)                           => ipcRenderer.invoke('attachments:delete', id),
    open:      (id: number)                           => ipcRenderer.invoke('attachments:open', id)
  },
  settings: {
    get: (key: string)                => ipcRenderer.invoke('settings:get', key),
    set: (key: string, value: string) => ipcRenderer.invoke('settings:set', key, value)
  },
  dialog: {
    openFile: () => ipcRenderer.invoke('dialog:openFile')
  }
}

contextBridge.exposeInMainWorld('api', api)
