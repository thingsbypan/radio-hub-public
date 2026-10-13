// Dahlonega exposes its listening sink and post-filter audio meter nodes.
(() => {
  if (location.origin !== 'https://websdr.lumpkinschools.com') return;
  const finite = value => value !== null && value !== undefined && String(value).trim() !== '' && Number.isFinite(Number(value)) ? Number(value) : null;
  function metadata() {
    const input = document.getElementById('frequency');
    let hz = finite(input?.getAttribute('data-hz-value'));
    if (hz === null) {
      const value = finite(input?.value), unit = document.getElementById('frequency-unit')?.textContent.trim().toLowerCase();
      if (value !== null && ['hz','khz','mhz'].includes(unit)) hz = value * ({hz:1,khz:1000,mhz:1000000}[unit]);
    }
    const low = finite(window.currentBandwidthLow), high = finite(window.currentBandwidthHigh);
    return { frequency: hz === null ? null : hz / 1000, frequency_unit: 'kHz', frequency_khz: hz === null ? null : hz / 1000,
      mode: typeof window.currentMode === 'string' ? window.currentMode.toUpperCase() : null,
      filter_width_hz: low !== null && high !== null ? Math.abs(high - low) : null,
      signal_dbm: null, snr_db: null, active_band: null };
  }
  clearInterval(window.echoCatchTimer);
  window.echoCatchRead = () => ({ ...EchoCatchAudio.drain(), metadata: metadata() });
  window.echoCatchTimer = setInterval(() => {
    const m = metadata(), context = window.audioContext;
    const playing = () => context?.state === 'running' && window.ws?.readyState === 1 && document.getElementById('audio-start-overlay')?.classList.contains('hidden');
    const node = context?._sinkGain || window.vuAnalyser;
    EchoCatchAudio.attach(node?.context === context ? node : null, JSON.stringify([m.frequency, m.mode, m.filter_width_hz]), playing);
  }, 100);
  window.addEventListener('beforeunload', () => { clearInterval(window.echoCatchTimer); EchoCatchAudio.detach(); }, { once: true });
})();
