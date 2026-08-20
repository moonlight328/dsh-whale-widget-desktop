// DSH 小鲸鱼 —— preload（contextBridge 隔离）
'use strict'
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('whaleAPI', {
  getStatus: () => ipcRenderer.invoke('whale:getStatus'),
  refresh: () => ipcRenderer.invoke('whale:refresh'),
  setKey: (key) => ipcRenderer.invoke('whale:setKey', key),
  setScale: (scale, h, v) => ipcRenderer.invoke('whale:setScale', { scale, h, v }),
  dragStart: () => ipcRenderer.invoke('whale:dragStart'),
  dragMove: () => ipcRenderer.invoke('whale:dragMove'),
  dragEnd: () => ipcRenderer.invoke('whale:dragEnd'),
  quit: () => ipcRenderer.invoke('whale:quit'),
  onSnap: (cb) => ipcRenderer.on('whale:snap', (_e, s) => cb(s)),
})
