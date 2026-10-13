const twenteOrigin = new URL(require('./receivers').find(r => r.id === 'twente').url).origin;

function isTwenteLogbook(url) {
  try {
    const parsed = new URL(url);
    return parsed.origin === twenteOrigin && parsed.pathname === '/~~logbook';
  } catch (_) { return false; }
}

function install(session, ownsContents) {
  const onDownload = (event, item, contents) => {
    // Twente's embedded logbook can be served as a download. Cancel before
    // Electron opens Save As; leave recordings and other downloads alone.
    if (ownsContents(contents) && isTwenteLogbook(item.getURL())) event.preventDefault();
  };
  session.on('will-download', onDownload);
  return () => session.removeListener('will-download', onDownload);
}

module.exports = { isTwenteLogbook, install };
