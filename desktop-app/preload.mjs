import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('ztaiDesktop', Object.freeze({
  selectWorkspace: () => ipcRenderer.invoke('ztai:select-workspace'),
  openExternal: url => ipcRenderer.invoke('ztai:open-external', url),
  runtime: 'electron',
}))

