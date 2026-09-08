# Pie reset UI cleanup — 2026-09-08

Purpose: remove the obsolete floating global workspace reset control so Pie uses feature-local reset/clear actions instead.

The floating `WorkspaceResetButton` was still mounted from the root layout even after local reset controls were added to Lyrics and Video. This cleanup removes that global control and its CSS without changing saved songs, account data, or production APIs.

Rollback: revert the commit for this cleanup if the global reset needs to be restored temporarily.
