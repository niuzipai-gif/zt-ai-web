import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('ztaiDesktop', Object.freeze({
  openExternal: url => ipcRenderer.invoke('ztai:open-external', url),
  runtime: 'electron',
}))

