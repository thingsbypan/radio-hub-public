// Shared passive tap. The existing listening connection is never rerouted.
(() => {
  if (window.EchoCatchAudio) return;
  let source, processor, silent, identity, queue = [], count = 0, rate = 0, error = null;
  function detach() {
    try { source?.disconnect(processor); } catch (_) {}
    if (processor) { processor.onaudioprocess = null; processor.disconnect(); }
    silent?.disconnect(); source = processor = silent = null; queue = []; count = 0;
  }
  function attach(node, key, playing = () => true) {
    if (node === source && key === identity) return;
    detach(); identity = key; error = null;
    if (!node?.context) return;
    try {
      source = node; rate = node.context.sampleRate;
      processor = node.context.createScriptProcessor(4096, 2, 1);
      silent = node.context.createGain(); silent.gain.value = 0;
      processor.onaudioprocess = e => {
        if (!playing() || node.context.state !== 'running') return;
        const input = e.inputBuffer, data = new Float32Array(input.length);
        for (let ch = 0; ch < input.numberOfChannels; ch++) {
          const channel = input.getChannelData(ch);
          for (let i = 0; i < data.length; i++) data[i] += channel[i] / input.numberOfChannels;
        }
        queue.push(Array.from(data)); count += data.length;
        while (count > rate * 30 && queue.length > 1) count -= queue.shift().length;
      };
      node.connect(processor); processor.connect(silent); silent.connect(node.context.destination);
    } catch (e) { error = e.message; detach(); }
  }
  window.EchoCatchAudio = { attach, detach, drain() { const chunks = queue; queue = []; count = 0; return { chunks, rate, key: identity, error }; } };
})();
