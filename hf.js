(() => {
  const bridge = window.echoHF, main = document.createElement('main');
  main.className = 'hf-full';
  main.append(EchoFramework.tabs('hf'));
  const toolbar = document.createElement('header'); toolbar.className = 'hf-toolbar module-header';
  const title = document.createElement('h1'); title.textContent = 'HF / SDR'; toolbar.append(title);
  const select = document.createElement('select'); select.setAttribute('aria-label', 'Remote receiver');
  const status = document.createElement('span'); status.setAttribute('role','status');
  const reload = document.createElement('button'); reload.title = 'Hard reload receiver'; reload.setAttribute('aria-label',reload.title);
  const icon = document.createElement('i'); icon.dataset.lucide = 'refresh-cw'; reload.append(icon);
  toolbar.append(select,status,reload); main.append(toolbar);
  const viewport = document.createElement('div'); viewport.className = 'hf-full-viewport'; main.append(viewport); document.body.append(main);
  function bounds() { const r = viewport.getBoundingClientRect(); bridge.bounds({x:r.x,y:r.y,width:r.width,height:r.height}); }
  const observer = new ResizeObserver(bounds); observer.observe(viewport); window.addEventListener('resize',bounds);
  const unsubscribe = bridge.onStatus(data => { select.value=data.id; status.textContent=data.error || (data.ready?'Receiver loaded':'Connecting...'); });
  const fail = error => { status.textContent=error.message; };
  bridge.catalog().then(data => { for(const receiver of data.receivers)select.add(new Option(receiver.label,receiver.id));select.value=data.selected;bounds();return bridge.select(data.selected); }).catch(fail);
  select.addEventListener('change',()=>bridge.select(select.value).catch(fail));
  reload.addEventListener('click',()=>bridge.command('reload').catch(fail));
  window.addEventListener('beforeunload',()=>{observer.disconnect();unsubscribe();},{once:true});
  lucide.createIcons();
})();
