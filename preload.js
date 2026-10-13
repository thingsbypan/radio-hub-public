const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('echoCatch', {
  start: () => ipcRenderer.invoke('catch:start'),
  note: (id, note) => ipcRenderer.invoke('catch:note', id, note),
  list: () => ipcRenderer.invoke('catch:list'),
  buffer: () => ipcRenderer.invoke('catch:buffer'),
  audioFile: id => ipcRenderer.invoke('catch:audioFile', id),
  screenshot: id => ipcRenderer.invoke('catch:screenshot', id),
  reveal: id => ipcRenderer.invoke('catch:reveal', id),
  remove: id => ipcRenderer.invoke('catch:delete', id),
  export: id => ipcRenderer.invoke('catch:export', id),
  library: () => ipcRenderer.invoke('catch:library'),
  audio: data => ipcRenderer.send('catch:audio', data),
  onStatus: callback => { const listener = (_event, data) => callback(data); ipcRenderer.on('catch:status', listener); return () => ipcRenderer.removeListener('catch:status', listener); },
});
contextBridge.exposeInMainWorld('echoHF', {
  catalog: () => ipcRenderer.invoke('hf:catalog'),
  select: id => ipcRenderer.invoke('hf:select', id),
  bounds: box => ipcRenderer.send('hf:bounds', box),
  command: (command, value) => ipcRenderer.invoke('hf:command', command, value),
  onStatus: callback => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('hf:status', listener);
    return () => ipcRenderer.removeListener('hf:status', listener);
  },
});
