from pathlib import Path

service_path = Path('android-recorder/app/src/main/java/app/pie/recorder/PlaybackCaptureService.kt')
service = service_path.read_text()

# The ad gate can intentionally pause capture. A stale ad/pause state must never
# prevent an already-confirmed song from finishing when Android reports that
# media playback itself has stopped.
if 'PAUSED_MEDIA_INACTIVE_STOP_MS' not in service:
    service = service.replace(
        '        private const val MEDIA_INACTIVE_STOP_MS = 800L\n',
        '        private const val MEDIA_INACTIVE_STOP_MS = 800L\n'
        '        private const val PAUSED_MEDIA_INACTIVE_STOP_MS = 2200L\n',
        1,
    )

if 'paused_media_inactive_auto_stop' not in service:
    old = '''                    if (isPaused) {
                        if (!wasPaused && read > 0) {
                            applyFadeOutToTail(wav, pcmBytes, sampleRate, channels)
                            wasPaused = true
                        }
                        lastSignalAt = now
                        mediaInactiveSince = 0L
                        if (read <= 0) try { Thread.sleep(20) } catch (_: InterruptedException) {}
                        continue
                    }
'''
    new = '''                    if (isPaused) {
                        if (!wasPaused && read > 0) {
                            applyFadeOutToTail(wav, pcmBytes, sampleRate, channels)
                            wasPaused = true
                        }
                        lastSignalAt = now

                        // Ad exclusion may leave paused=true if YouTube's accessibility
                        // tree keeps a stale ad label. Once real song content has been
                        // confirmed and captured, Android media activity is the final
                        // authority: sustained inactivity means playback ended/stopped.
                        if (
                            contentConfirmed.get() &&
                            heardAudio &&
                            now - startedAt >= MIN_ACTIVE_CAPTURE_MS
                        ) {
                            if (audioManager.isMusicActive) {
                                mediaInactiveSince = 0L
                            } else {
                                if (mediaInactiveSince == 0L) mediaInactiveSince = now
                                if (now - mediaInactiveSince >= PAUSED_MEDIA_INACTIVE_STOP_MS) {
                                    RecorderDiagnostics.record(this, "paused_media_inactive_auto_stop")
                                    autoFinished = true
                                    recording.set(false)
                                    break
                                }
                            }
                        } else {
                            mediaInactiveSince = 0L
                        }

                        if (read <= 0) try { Thread.sleep(20) } catch (_: InterruptedException) {}
                        continue
                    }
'''
    if old not in service:
        raise SystemExit('Could not locate paused capture block for stop watchdog')
    service = service.replace(old, new, 1)

service_path.write_text(service)

access_path = Path('android-recorder/app/src/main/java/app/pie/recorder/YouTubeAdAccessibilityService.kt')
access = access_path.read_text()

# "Sponsored" can exist elsewhere in YouTube's accessibility tree even while
# normal video content is playing. Treating that generic word as an authoritative
# ad marker can hold the recorder in ad/pause mode forever.
access = access.replace(
    '            "ad will end", "ad ends", "advertiser website", "sponsored"\n',
    '            "ad will end", "ad ends", "advertiser website"\n',
    1,
)

access_path.write_text(access)
print('Applied YouTube stop watchdog and removed generic sponsored false-positive marker')
