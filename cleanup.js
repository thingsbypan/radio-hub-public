(() => {
  const receiver = document.querySelector('body > .mainspan');

  // Leave the page intact if the site's receiver structure has changed.
  if (!receiver || !receiver.querySelector('#waterfalls') ||
      !receiver.querySelector('#audiostartbutton') ||
      !receiver.querySelector('form[name="freqform"]')) {
    return;
  }

  for (const node of Array.from(document.body.childNodes)) {
    if (node === receiver) break;

    if (node.nodeType === Node.ELEMENT_NODE) {
      if (!node.matches('script, style, link')) {
        node.setAttribute('data-terminal-intro', '');
      }
    } else if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
      // Legacy HTML includes introduction text outside paragraph elements.
      const wrapper = document.createElement('span');
      wrapper.setAttribute('data-terminal-intro', '');
      node.before(wrapper);
      wrapper.append(node);
    }
  }

  function enableFullWidth() {
    const toggle = receiver.querySelector('#wfwidecheckbox');
    if (toggle && !toggle.checked) toggle.click();
  }

  // Wait for WebSDR to finish restoring its saved settings first.
  if (document.readyState === 'complete') {
    enableFullWidth();
  } else {
    window.addEventListener('load', enableFullWidth, { once: true });
  }
})();
