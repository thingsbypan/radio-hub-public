# Log Catch

Press **● LOG CATCH** while listening. Radio Hub saves up to the previous 30 seconds immediately, then adds 12 seconds of audio. The button shows how much audio is currently buffered. You can add an optional note while the recording finishes.

Open **Catch Library** to play a catch, open its screenshot, edit its note, or choose **EXPORT FOR RADIOBOT**. Export creates a standard ZIP and selects it in Explorer. Drag that ZIP into your RadioBot conversation yourself.

Files belong to you and live in **Documents → Echo Base → Radio Catches**. Each folder contains WAV audio, a PNG screenshot when available, JSON metadata, notes, and a text summary. Exported ZIPs sit beside the folders. Deleting a catch sends its folder to the Recycle Bin; previously exported ZIPs remain independent copies.

The buffer needs time to fill after playback starts. Changing receiver, frequency, mode, or filter resets it. A change during recording saves a partial catch up to that change. Missing measurements are null; Radio Hub never guesses station IDs or signal metrics.

Twente capture is verified with live audio and screenshot. Other WebSDR receivers can capture when they expose the same audio/controls. NOAA and AM/FM capture from their existing audio graphs; feeds that permit listening but block audio access will save context and screenshots with an explicit audio-unavailable status. When Windows cannot capture the native receiver view, Radio Hub tries to save the actual receiver canvases and markers with context instead. The metadata identifies that fallback. An unavailable screenshot never discards audio.

Radio Hub captures. RadioBot analyzes. No AI is added to Radio Hub.
