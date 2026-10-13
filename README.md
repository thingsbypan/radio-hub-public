# Radio Hub 1.2.1

A Windows x64 desktop console for HF/SDR receivers, NOAA weather radio and maps, and worldwide AM/FM internet streams. No SDR hardware is required for the online receivers.

## Install and use

Download `Radio-Hub-Setup-1.2.1-x64.exe`, run the installer, then open Radio Hub from the desktop or Start menu. It installs for your Windows account. Windows may warn because this release is unsigned; distribute the SHA-256 checksum alongside the download.

The app opens in a normal resizable window. Use the three tabs or Ctrl+1 / Ctrl+2 / Ctrl+3. F11 toggles fullscreen manually. HF/SDR provides a receiver selector; tuning controls depend on the receiver. NOAA offers state/station selection, ZIP-code forecasts, radar and GOES weather imagery. AM/FM offers station search and favorites. LOG CATCH saves available audio, screenshots and notes; Catch Library plays and exports saved catches.

## Availability and privacy

An internet connection is required for receivers, streams, station searches, maps and forecasts. Provider outages, blocked connections, CORS restrictions and changed stream URLs can prevent playback. Some HF receivers use unencrypted HTTP. Online streams are relays, not local radio reception; their timing can be delayed. Weather information is not an emergency alert service.

The NOAA directory is a bundled snapshot dated September 30, 2026. First run starts with the alphabetically first state; select your own state, station and ZIP code. Pelham and Ashburn remain regional metadata entries without configured audio streams. Saved selections are preserved. Forecast queries send the requested location to public weather/location providers. Map providers receive map requests. Radio Browser receives station searches and a station-selection request. Remote receiver sites may use cookies.

Preferences and cookies stay in `%APPDATA%\websdr-terminal`. Saved catches stay under your Windows Documents folder in `Echo Base\Radio Catches` for compatibility with older versions. The installer contains no developer profile, personal catches or saved browser credentials. Uninstall preserves those user files. There is no automatic update service; new versions must be downloaded and installed.

## Release scope

Only HF/SDR, NOAA and AM/FM are included. Space, satellite observation playback and unfinished ambience functionality have been removed. NOAA's weather satellite images remain part of NOAA. The app no longer chooses a specific monitor or starts fullscreen.

## Development

Use Node/npm and Windows: `npm.cmd ci`, `npm.cmd test`, `npm.cmd start`. Build the installer with `npm.cmd run build:win`; output is in `release`. Runtime tests are `tests/release-smoke.js` and `tests/catch-smoke.js`, run with Electron and `ELECTRON_RUN_AS_NODE` unset. They use isolated temporary storage. `tests/hf-downloads-smoke.js` additionally requires the live Twente receiver.

Dependency license notices are in `THIRD-PARTY-NOTICES.txt`; the distributed Electron runtime includes its own licenses. Automated release checks exercise an isolated profile; human listening and physical GUI review are separate. No paid API or subscription is required. Third-party internet providers remain necessary for online functionality.

By Pan / Things by Pan — https://things.rocks — thingsbypan@gmail.com

ISC license.
