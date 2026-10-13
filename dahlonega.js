(() => {
  if (location.origin !== 'https://websdr.lumpkinschools.com') return;
  window.echoDahlonegaReady = true;
  let scheduled = false;
  const startStyle = document.createElement('span').style;
  for (const [name,value] of Object.entries({ 'background-color':'#302a20', 'background-image':'none', 'border-radius':'4px', 'box-shadow':'none', 'border':'1px solid #a28556', 'padding':'12px 18px' })) startStyle.setProperty(name,value,'important');
  function fit() {
    const spectrum = document.querySelector('.spectrum-display-container'), audio = document.querySelector('.audio-controls');
    if (!spectrum || !audio) return;
    const extra = audio.getBoundingClientRect().bottom - spectrum.getBoundingClientRect().height;
    const value = `${Math.max(120, Math.min(560, Math.floor(innerHeight - extra - 14)))}px`;
    if (document.documentElement.style.getPropertyValue('--radiohub-spectrum-height') !== value) document.documentElement.style.setProperty('--radiohub-spectrum-height',value);
  }
  function tidy() {
    scheduled = false;
    // Dismiss only the optional first-run tutorial and widget advert, not errors.
    document.querySelector('.wt-card .wt-btn-secondary')?.click();
    const toast = document.getElementById('notification-toast');
    if (toast?.textContent.startsWith('Instance has Widgets enabled') && toast.style.display !== 'none') toast.style.display = 'none';
    const wrapper = document.getElementById('dock-overlay-wrapper');
    const container = document.querySelector('.container');
    if (wrapper && container && wrapper.parentElement !== container) {
      document.querySelector('.spectrum-display-panel').after(wrapper);
    }
    const button = document.getElementById('audio-start-button');
    if (button) {
      // The server reapplies inline theme rules after its async config arrives.
      for (const name of startStyle) {
        const value = startStyle.getPropertyValue(name);
        if (button.style.getPropertyValue(name) !== value || button.style.getPropertyPriority(name) !== 'important') button.style.setProperty(name,value,'important');
      }
    }
    const label = button?.querySelector('span:last-child');
    if (!button?.disabled && label?.textContent.trim() === 'Click to Start') label.textContent = 'Start receiver';
    fit();
  }
  const observer = new MutationObserver(() => {
    if (!scheduled) { scheduled = true; setTimeout(tidy, 100); }
  });
  observer.observe(document.body, { childList: true, attributes: true, attributeFilter: ['style'], subtree: true });
  const resize = new ResizeObserver(fit);
  for (const element of document.querySelectorAll('.controls,.audio-controls,.spectrum-display-container')) resize.observe(element);
  window.addEventListener('resize', fit);
  tidy();
  window.addEventListener('beforeunload', () => { observer.disconnect(); resize.disconnect(); window.removeEventListener('resize',fit); }, { once: true });
})();
