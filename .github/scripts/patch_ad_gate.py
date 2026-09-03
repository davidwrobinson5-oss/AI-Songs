from pathlib import Path

service_path = Path('android-recorder/app/src/main/java/app/pie/recorder/PlaybackCaptureService.kt')
service = service_path.read_text()

if 'ACTION_CONTENT_CONFIRMED' not in service:
    service = service.replace(
        '        const val ACTION_RESUME = "app.pie.recorder.RESUME"\n',
        '        const val ACTION_RESUME = "app.pie.recorder.RESUME"\n'
        '        const val ACTION_CONTENT_CONFIRMED = "app.pie.recorder.CONTENT_CONFIRMED"\n'
        '        const val ACTION_DISCARD_UNCONFIRMED = "app.pie.recorder.DISCARD_UNCONFIRMED"\n',
        1,
    )

    service = service.replace(
        '    private val autoStopRequested = AtomicBoolean(false)\n',
        '    private val autoStopRequested = AtomicBoolean(false)\n'
        '    private val contentConfirmed = AtomicBoolean(false)\n'
        '    private val resetUnconfirmedRequested = AtomicBoolean(false)\n',
        1,
    )

    service = service.replace(
        '''            ACTION_PAUSE -> {
                paused.set(true)
                if (recording.get()) showRecordingNotification(true)
            }
            ACTION_RESUME -> {
                paused.set(false)
                if (recording.get()) showRecordingNotification(false)
            }
''',
        '''            ACTION_PAUSE -> {
                paused.set(true)
                if (!contentConfirmed.get()) resetUnconfirmedRequested.set(true)
                if (recording.get()) showRecordingNotification(true)
            }
            ACTION_RESUME -> {
                paused.set(false)
                if (recording.get()) showRecordingNotification(false)
            }
            ACTION_CONTENT_CONFIRMED -> {
                contentConfirmed.set(true)
                RecorderDiagnostics.record(this, "capture_content_confirmed")
            }
            ACTION_DISCARD_UNCONFIRMED -> {
                if (!contentConfirmed.get()) resetUnconfirmedRequested.set(true)
            }
''',
        1,
    )

    service = service.replace(
        '''        wantsPartSheets = intent.getBooleanExtra(EXTRA_PART_SHEETS, true)
        wantsChords = intent.getBooleanExtra(EXTRA_CHORDS, true)
        paused.set(false)
        autoStopRequested.set(false)
''',
        '''        wantsPartSheets = intent.getBooleanExtra(EXTRA_PART_SHEETS, true)
        wantsChords = intent.getBooleanExtra(EXTRA_CHORDS, true)
        contentConfirmed.set(!isYouTubeSource(sourceUrl))
        resetUnconfirmedRequested.set(false)
        paused.set(false)
        autoStopRequested.set(false)
''',
        1,
    )

    service = service.replace(
        '''                while (recording.get()) {
                    val now = SystemClock.elapsedRealtime()
                    val isPaused = paused.get()

                    val read = audioRecord?.read(
''',
        '''                while (recording.get()) {
                    val now = SystemClock.elapsedRealtime()

                    if (resetUnconfirmedRequested.getAndSet(false) && !contentConfirmed.get()) {
                        wav.setLength(44L)
                        wav.seek(44L)
                        pcmBytes = 0L
                        heardAudio = false
                        lastSignalAt = now
                        mediaInactiveSince = 0L
                        wasPaused = true
                        fadeInRemaining = 0
                        RecorderDiagnostics.record(this, "capture_discarded_unconfirmed_preroll")
                    }

                    val isPaused = paused.get()

                    val read = audioRecord?.read(
''',
        1,
    )

service_path.write_text(service)

access_path = Path('android-recorder/app/src/main/java/app/pie/recorder/YouTubeAdAccessibilityService.kt')
text = access_path.read_text()

if 'youtube_content_gate_confirmed' not in text:
    # This script runs after patch_youtube_source_reassert.py, so these fields exist.
    text = text.replace(
        '    private var exactSourceLaunchDone = false\n',
        '    private var exactSourceLaunchDone = false\n'
        '    private var contentGateConfirmed = false\n'
        '    private var preContentPlaying = false\n'
        '    private var contentCandidateSince = 0L\n'
        '    private var sawPreRollAd = false\n',
        1,
    )

    text = text.replace(
        '''    private val resumeRunnable = Runnable {
        if (!CaptureSession.isActive(this) || adActive || pendingStop) return@Runnable
        sendCaptureAction(PlaybackCaptureService.ACTION_RESUME)
    }
''',
        '''    private val resumeRunnable = Runnable {
        if (!CaptureSession.isActive(this) || adActive || pendingStop || !contentGateConfirmed) return@Runnable
        sendCaptureAction(PlaybackCaptureService.ACTION_RESUME)
    }
''',
        1,
    )

    # Ad markers from an accessibility event are authoritative for entering ad mode,
    # but a single partial event is NOT authoritative for leaving it. Only the
    # periodic full-window monitor may clear adActive after a stable no-ad window.
    text = text.replace(
        '''        if (nowAd) {
            if (pendingStop && hasSeenPlaying) {
                RecorderDiagnostics.record(this, "youtube_ad_marker_ignored_during_pending_stop")
                return
            }

            adLastSeenAt = SystemClock.elapsedRealtime()
            adClearCandidateSince = 0L
            pendingStop = false
            handler.removeCallbacks(stoppedRunnable)
            handler.removeCallbacks(resumeRunnable)
            if (!adActive) {
                adActive = true
                RecorderDiagnostics.record(this, "youtube_ad_detected_capture_pause")
                sendCaptureAction(PlaybackCaptureService.ACTION_PAUSE)
            }
            return
        }

        if (adActive) {
            clearAdStateAndScheduleResume("youtube_ad_ended_capture_resume_pending")
        }

        val state = playbackState(root)
        logPlayerState(state)
''',
        '''        if (nowAd) {
            if (pendingStop && hasSeenPlaying) {
                RecorderDiagnostics.record(this, "youtube_ad_marker_ignored_during_pending_stop")
                return
            }

            adLastSeenAt = SystemClock.elapsedRealtime()
            adClearCandidateSince = 0L
            pendingStop = false
            if (!contentGateConfirmed) sawPreRollAd = true
            preContentPlaying = false
            contentCandidateSince = 0L
            handler.removeCallbacks(stoppedRunnable)
            handler.removeCallbacks(resumeRunnable)
            if (!adActive) {
                adActive = true
                RecorderDiagnostics.record(this, "youtube_ad_detected_capture_pause")
                sendCaptureAction(PlaybackCaptureService.ACTION_PAUSE)
            }
            return
        }

        if (adActive) {
            RecorderDiagnostics.record(this, "youtube_event_no_ad_marker_waiting_for_monitor_confirmation")
            return
        }

        val state = playbackState(root)
        logPlayerState(state)
        if (!contentGateConfirmed) {
            handlePreContentState(state, "event")
            return
        }
''',
        1,
    )

    text = text.replace(
        '''        if (nowAd) {
            adLastSeenAt = now
            adClearCandidateSince = 0L
            if (pendingStop && hasSeenPlaying) {
                RecorderDiagnostics.record(this, "youtube_monitor_ad_marker_ignored_pending_stop")
                return
            }
            pendingStop = false
            handler.removeCallbacks(stoppedRunnable)
            handler.removeCallbacks(resumeRunnable)
            if (!adActive) {
                adActive = true
                RecorderDiagnostics.record(this, "youtube_monitor_ad_detected_capture_pause")
                sendCaptureAction(PlaybackCaptureService.ACTION_PAUSE)
            }
            return
        }
''',
        '''        if (nowAd) {
            adLastSeenAt = now
            adClearCandidateSince = 0L
            if (pendingStop && hasSeenPlaying) {
                RecorderDiagnostics.record(this, "youtube_monitor_ad_marker_ignored_pending_stop")
                return
            }
            pendingStop = false
            if (!contentGateConfirmed) sawPreRollAd = true
            preContentPlaying = false
            contentCandidateSince = 0L
            handler.removeCallbacks(stoppedRunnable)
            handler.removeCallbacks(resumeRunnable)
            if (!adActive) {
                adActive = true
                RecorderDiagnostics.record(this, "youtube_monitor_ad_detected_capture_pause")
                sendCaptureAction(PlaybackCaptureService.ACTION_PAUSE)
            }
            return
        }
''',
        1,
    )

    text = text.replace(
        '''        val state = playbackState(root)
        logPlayerState(state)
        when (state) {
''',
        '''        val state = playbackState(root)
        logPlayerState(state)
        if (!contentGateConfirmed) {
            handlePreContentState(state, "monitor")
            return
        }
        when (state) {
''',
        1,
    )

    text = text.replace(
        '''    private fun clearAdStateAndScheduleResume(reason: String) {
        adActive = false
        adLastSeenAt = 0L
        adClearCandidateSince = 0L
        RecorderDiagnostics.record(this, reason)
        handler.removeCallbacks(resumeRunnable)
        if (!pendingStop) handler.postDelayed(resumeRunnable, RESUME_STABILITY_MS)
    }
''',
        '''    private fun clearAdStateAndScheduleResume(reason: String) {
        adActive = false
        adLastSeenAt = 0L
        adClearCandidateSince = 0L
        RecorderDiagnostics.record(this, reason)
        handler.removeCallbacks(resumeRunnable)
        contentCandidateSince = 0L
        preContentPlaying = false
        if (contentGateConfirmed && !pendingStop) handler.postDelayed(resumeRunnable, RESUME_STABILITY_MS)
    }
''',
        1,
    )

    helper_marker = '    private fun clearAdStateAndScheduleResume(reason: String) {\n'
    helper = '''    private fun handlePreContentState(state: PlayerState, source: String) {
        val now = SystemClock.elapsedRealtime()
        when (state) {
            PlayerState.PLAYING -> {
                preContentPlaying = true
                if (contentCandidateSince == 0L) {
                    contentCandidateSince = now
                    RecorderDiagnostics.record(this, "youtube_content_gate_candidate source=$source afterAd=$sawPreRollAd")
                    return
                }
                val required = if (sawPreRollAd) POST_AD_CONTENT_STABILITY_MS else STARTUP_CONTENT_STABILITY_MS
                if (now - contentCandidateSince < required) return

                contentGateConfirmed = true
                hasSeenPlaying = true
                pendingStop = false
                RecorderDiagnostics.record(this, "youtube_content_gate_confirmed source=$source afterAd=$sawPreRollAd")
                sendCaptureAction(PlaybackCaptureService.ACTION_CONTENT_CONFIRMED)
                sendCaptureAction(PlaybackCaptureService.ACTION_RESUME)
            }
            PlayerState.STOPPED, PlayerState.ENDED -> {
                if (preContentPlaying) {
                    RecorderDiagnostics.record(this, "youtube_preroll_transition_discard source=$source state=${state.name}")
                    sendCaptureAction(PlaybackCaptureService.ACTION_DISCARD_UNCONFIRMED)
                    sawPreRollAd = true
                }
                preContentPlaying = false
                contentCandidateSince = 0L
                pendingStop = false
                handler.removeCallbacks(stoppedRunnable)
                handler.removeCallbacks(resumeRunnable)
            }
            PlayerState.UNKNOWN -> Unit
        }
    }

'''
    if helper_marker not in text:
        raise SystemExit('Could not locate ad-state helper insertion point')
    text = text.replace(helper_marker, helper + helper_marker, 1)

    # Reset the content gate for every new capture session.
    reset_needle = '''        exactSourceLaunchScheduled = false
        exactSourceLaunchDone = false
        monitorRunning = false
'''
    reset_replacement = '''        exactSourceLaunchScheduled = false
        exactSourceLaunchDone = false
        contentGateConfirmed = false
        preContentPlaying = false
        contentCandidateSince = 0L
        sawPreRollAd = false
        monitorRunning = false
'''
    if reset_needle not in text:
        raise SystemExit('Could not locate content gate reset point')
    text = text.replace(reset_needle, reset_replacement, 1)

    # Broaden only ad-specific labels; avoid generic labels such as "Open" or
    # "Learn more" that could appear in normal video content.
    text = text.replace(
        '''        private val AD_MARKERS = listOf(
            "skip ad", "skip ads", "visit advertiser", "advertisement",
            "ad 1 of", "ad 2 of", "about this ad"
        )
''',
        '''        private val AD_MARKERS = listOf(
            "skip ad", "skip ads", "skip this ad", "visit advertiser", "advertisement",
            "ad 1 of", "ad 2 of", "about this ad", "why this ad", "video will play after ad",
            "ad will end", "ad ends", "advertiser website", "sponsored"
        )
''',
        1,
    )

    text = text.replace(
        '        private const val AD_END_MONITOR_STABILITY_MS = 750L\n',
        '        private const val AD_END_MONITOR_STABILITY_MS = 500L\n'
        '        private const val STARTUP_CONTENT_STABILITY_MS = 7000L\n'
        '        private const val POST_AD_CONTENT_STABILITY_MS = 500L\n',
        1,
    )

access_path.write_text(text)
print('Hardened YouTube ad exclusion: stable ad exit, preroll discard, and content-start gate')
