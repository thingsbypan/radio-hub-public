# Radio Hub / Radio Terminal

## Implemented foundation

- HF / SDR: `receivers.js` registers remote receivers. `hf.html` / `hf.js` provide tabs and a compact source toolbar; `hf-host.js` owns an isolated, full-width Electron WebContentsView. Twente receives the existing cleanup, theme, and graphs, with its original control row visible beneath the waterfall. Other receivers retain native controls.
- NOAA: `noaa.html`, `noaa.js`, `noaa.css`, and `radar.js` own weather radio, forecasts, imagery, and radar.
- AM/FM: `radio.html`, `radio.js`, and `radio.css` own directory search, regional defaults, favorites, streams, HLS, and audio analysis.
- `modules.js` registers local module entry points and menu shortcuts. `main.js` owns navigation and normal resizable window creation. Switching pages unloads the previous receiver, stopping its audio and timers.

Layout correction: the user prefers the original module layouts, with only consistent navigation tabs. `dashboard/framework.js` supplies `tabs()`, styled by `tabs.css`. `module-layout.js` inserts or replaces navigation without moving controls or adding analytics sidebars. NOAA and AM/FM retain their original wide layouts. HF gives the real receiver the full available width beneath a compact source toolbar and tabs, with native controls visible again. The earlier three-column framework is no longer mounted. Tabs release the previous module, including HF remote contents. The native Receiver menu and hard reload remain available.





`preload.js` exposes only catalog, receiver selection, view bounds, typed tuning commands, and status messages. `hf-host.js` validates the sending main frame and exact local HF URL, accepts catalog IDs rather than arbitrary URLs, and allowlists command values. Remote receivers have no preload or Node access. All remote tuning commands currently target Twente only.

## Shared analytics components

`dashboard/components.js` exposes `EchoDashboard` in a renderer and pure `metricModel` through CommonJS for tests. `dashboard/components.css` provides shared styling. The components themselves require no Node access.

```javascript
EchoDashboard.metric(container, {
  label: 'Signal strength',
  value: measuredDbm, // number or null, never a placeholder estimate
  unit: 'dBm',
  min: -120,
  max: 0,
  source: 'Receiver S-meter',
  observedAt: sampleTimeISO,
  maxAgeMs: 5000,
});
EchoDashboard.status(statusNode, 'not-connected', 'Not connected');
const plot = EchoDashboard.history(graphNode, { min: 0, max: 9 });
plot.setData(samples); // chronological { time: Unix milliseconds, value: number | null }
plot.destroy(); // call during module cleanup
```

States: `live`, `stale`, `unavailable`, `error`, `loading`, `not-connected`. Missing readings display `--`, not zero. A live metric requires a finite number and valid observation time. Expired readings retain their value with a stale label. Null graph samples break the line. Empty histories show no-data text, never simulated activity. A meter is rendered only when its real domain is provided; its fill is not a generic quality percentage.


`EchoDashboard.metadata(container, values)` renders source metadata with text nodes. `EchoDashboard.audioPlot(canvas, status, getSource)` renders spectrum or waveform from the existing analyser and publishes measured RMS/peak dBFS. It does not create an audio pipeline. NOAA and AM/FM retain their original source switching, HLS handling, CORS fallback, and cleanup. No analysable stream means no plotted samples or invented metrics. Call the returned `destroy()` on unload. `EchoFramework.audioAnalytics` consumes these measurements and source metadata events for the right panel and footer.

## Future data adapters

Each adapter should own fetching, validation, timestamps, units, freshness limits, and cancellation. Components only render supplied observations. Keep RF dBm, audio dBFS, orbital telemetry, and network health separate. Do not infer RF signal strength or SNR from an internet audio stream. Do not label buffering, connection uptime, or codec bitrate as a made-up quality percentage.



Future local RTL-SDR access belongs in a separate, narrowly scoped hardware adapter, not Node-enabled remote webpages. A future receiver map can consume the catalog plus validated coordinates; no map backend is required yet.

## Log Catch (1.1)

`catch-host.js` owns user files and validated local IPC. `catch-core.js` provides a bounded 30-second PCM buffer, PCM16 mono WAV encoding, atomic text updates, and standard ZIP export. `catch-audio.js` adds a silent parallel branch to an existing audio node; it never reroutes listening audio. `catch-websdr.js` reads the exposed WebSDR controls and audio node. NOAA and AM/FM supply their existing media source nodes and explicit station metadata. No AI or analysis service is connected.

Pressing LOG CATCH writes the available pre-capture audio immediately, checkpoints subsequent audio for up to 12 seconds, and captures a PNG independently. Notes appear after initial storage succeeds. Each catch lives under the Electron Documents path, `Echo Base/Radio Catches/RadioCatch_.../`, with `audio.wav`, `waterfall.png` when available, `metadata.json`, `notes.txt`, and `summary.txt`. Unknown measurements stay null. Metadata records actual audio duration, pre-capture duration, source, timestamps, format, version, partial status, and capture failures. WAV headers are updated and flushed on each audio append. Interrupted sessions are recovered as partial on next launch.

The buffer resets on receiver, frequency, mode, filter, or sample-rate changes. A source/tuning change during post-capture finalizes the catch as partial rather than mixing unrelated audio. The Catch Library opens separately so listening continues; it offers WAV playback, screenshot/folder opening, note edits, ZIP export, and deletion through the Recycle Bin. ZIP export reveals the portable archive in Explorer. It does not send anything to ChatGPT.

WebSDR audio capture depends on its exposed `soundapplet.p` node; opaque receivers may provide only screenshots and receiver context. NOAA/AM/FM feeds using the plain non-CORS playback fallback cannot provide PCM to the buffer. A minimized/hidden receiver can prevent screenshot capture. Failures are recorded without losing available audio; an empty WAV is explicitly marked unavailable. Test scripts write only to temporary Documents directories.

Run `npm.cmd test` for buffer/WAV/ZIP and existing dashboard checks. `tests/catch-smoke.js` runs with Electron for a synthetic full capture/library/export test; `tests/catch-hf-smoke.js` performs a visible live Twente capture.

## Verification

From this folder in PowerShell:

```powershell
& 'C:\Program Files\nodejs\node.exe' --test tests/dashboard.test.js
```

Live receiver availability still needs runtime checks. Syntax and unit tests do not verify remote audio or satellite services.

## Naming compatibility

The current app name is Radio Hub. The source directory the project checkout, profile directory `%APPDATA%\websdr-terminal`, installer app ID `com.echobase.radioterminal`, and Documents capture directory `Echo Base/Radio Catches` remain stable to preserve settings, recordings, existing links, and installer upgrade identity. Internal `echo-` CSS classes, DOM identifiers, and events remain unchanged for component compatibility. Historical installers, exports, and logs retain their original names.

## Albany NOAA local coverage

See [NOAA-LOCAL.md](NOAA-LOCAL.md) for WXK53 Pelham and KWN50 Ashburn, stream search results, and regional metadata supplements. Both local transmitters currently display Stream unavailable; all original provider feeds remain available.


## Twente logbook download guard

Twente loads /~~logbook?nr=20 automatically in an iframe and can trigger two Save As dialogs on each HF load. hf-downloads.js cancels downloads from that exact Twente endpoint only when initiated by an HF receiver view, before Electron opens Save As. Other downloads remain allowed. The session listener is removed when the host window closes. Verified October 5, 2026: three live HF/tab-return cycles, all six logbook download attempts cancelled, receiver waterfall and tuning adapter loaded each time; Electron fixture also confirmed an unrelated recording download still saves. See dist/hf-downloads-verification.json and tests/hf-downloads-smoke.js.


## Dahlonega / UberSDR integration

Only the Georgia receiver gets dahlonega.css and dahlonega.js, injected at DOM ready. The adapter replaces the oversized welcome styling with a compact Start receiver prompt, dismisses the optional tutorial/widget notice, uses a responsive waterfall height and dark compact native controls, and places docked controls in normal document flow. Native tuning, modes, filters, volume and advanced controls remain connected. No other receiver theme was changed.

catch-ubersdr.js uses UberSDR's exposed sink gain or post-filter VU analyser for the existing passive PCM tap. Frequency is normalized from the native Hz value (or displayed unit); mode and filter endpoints come from native state. RF strength and SNR stay null because a calibrated source is not wired. Test: tests/dahlonega-smoke.js; live test saved a complete 13.312-second non-silent WAV at 12 kHz with screenshot and actual 7150 kHz USB metadata. Layout checked at 1280x580, 1280x720, and 1920x1080 and visually inspected. Evidence: dist/dahlonega-verification.json.

Catch atomic writes retry EPERM/EACCES/EBUSY replacement failures up to five times with brief bounded waits (230 ms total). The existing destination is never deleted; a lasting failure retains the pending .tmp file. Simulated Windows lock tests and the full capture/library/ZIP smoke passed. The October 5 Utah catch's pending metadata was recovered against its WAV header (41.1787 seconds), retaining backups and its partial status. The earlier Dahlonega catch marked audio unavailable contains no recoverable audio.


The final layout measures actual control heights with ResizeObserver and reserves space beneath the waterfall. Installed-monitor check: receiver viewport 1236x574; audio controls bottom 559.83 (fully inside), mode controls bottom 424; native listening context running and capture node present. Evidence: dist/dahlonega-installed-verification.json.

