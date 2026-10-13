(() => {
  const finite = v => v !== null && v !== undefined && String(v).trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null;
  function metadata() {
    if (typeof window.setfreqif !== 'function') return {frequency:null,frequency_unit:null,frequency_khz:null,mode:null,filter_width_hz:null,signal_dbm:null,snr_db:null,active_band:null};
    const frequency = finite(document.querySelector('input[name="frequency"]')?.value);
    const mode = typeof window.mode === 'string' ? window.mode.toUpperCase() : null;
    const bandwidth = finite(document.getElementById('numericalbandwidth6')?.textContent);
    return { frequency, frequency_unit: 'kHz', frequency_khz: frequency, mode,
      filter_width_hz: bandwidth === null ? null : bandwidth * 1000,
      signal_dbm: finite(document.getElementById('numericalsmeter')?.textContent), snr_db: null,
      active_band: typeof window.bandinfo?.[window.band]?.name === 'string' ? window.bandinfo[window.band].name : null };
  }
  clearInterval(window.echoCatchTimer);
  window.echoCatchRead = () => { const m = metadata(); return { ...EchoCatchAudio.drain(), metadata: m }; };
  window.echoCatchTimer = setInterval(() => {
    const m = metadata(); EchoCatchAudio.attach(window.soundapplet?.p, JSON.stringify([m.frequency, m.mode, m.filter_width_hz]));
  }, 100);
})();
