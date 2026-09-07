'use client';

export default function WorkspaceResetButton() {
  function resetWorkspace() {
    const confirmed = window.confirm('Reset the current Pie workspace and start fresh? Saved songs in Songs will not be deleted.');
    if (!confirmed) return;

    try {
      window.dispatchEvent(new Event('ai-songs-stop-all-audio'));
      sessionStorage.setItem('pieActiveScreen', 'create');
      sessionStorage.removeItem('pieWorkingSongId');
      sessionStorage.removeItem('pieWorkingVersionId');
    } catch {}

    // Reloading clears any stale React/audio state carried across workspaces.
    // The song library itself lives separately and is not deleted.
    window.location.assign('/?reset=1');
  }

  return (
    <button
      type="button"
      className="pieWorkspaceReset noPrint"
      onClick={resetWorkspace}
      aria-label="Reset current Pie workspace"
      title="Clear the current workspace without deleting saved songs"
    >
      <span aria-hidden="true">↻</span>
      <span>Reset</span>
    </button>
  );
}
