import fs from 'node:fs';

const storePath = 'app/songStore.ts';
let store = fs.readFileSync(storePath, 'utf8');
if (!store.includes('export async function renameSong(')) {
  store += `

export async function renameSong(songId: string, title: string) {
  const cleanTitle = title.trim().slice(0, 120);
  if (!cleanTitle) throw new Error('Song title cannot be empty.');
  const db = await openDb();
  try {
    const readTx = db.transaction(SONGS, 'readonly');
    const song = await requestToPromise(readTx.objectStore(SONGS).get(songId) as IDBRequest<SavedSong | undefined>);
    await transactionDone(readTx);
    if (!song) throw new Error('Song not found.');

    const updated: SavedSong = { ...song, title: cleanTitle, updatedAt: new Date().toISOString() };
    const writeTx = db.transaction(SONGS, 'readwrite');
    writeTx.objectStore(SONGS).put(updated);
    await transactionDone(writeTx);
    return updated;
  } finally {
    db.close();
  }
}
`;
  fs.writeFileSync(storePath, store);
}

const pagePath = 'app/page.tsx';
let source = fs.readFileSync(pagePath, 'utf8');

source = source.replace(
  "import { getSongVersions, listSongs, saveVersion, type SavedSong, type SavedVersion } from './songStore';",
  "import { getSongVersions, listSongs, renameSong, saveVersion, type SavedSong, type SavedVersion } from './songStore';",
);

const stateNeedle = `  const [songMenuId, setSongMenuId] = useState<string | null>(null);`;
if (!source.includes('const [renameSongTarget, setRenameSongTarget]')) {
  if (!source.includes(stateNeedle)) throw new Error('Compact Songs menu state not found.');
  source = source.replace(stateNeedle, `${stateNeedle}
  const [renameSongTarget, setRenameSongTarget] = useState<SavedSong | null>(null);
  const [renameSongValue, setRenameSongValue] = useState('');
  const [renameSongBusy, setRenameSongBusy] = useState(false);`);
}

const newSongNeedle = `  function newSong() {`;
if (!source.includes('async function commitSongRename')) {
  if (!source.includes(newSongNeedle)) throw new Error('newSong helper not found.');
  source = source.replace(newSongNeedle, `  function beginSongRename(song: SavedSong) {
    setSongMenuId(null);
    setRenameSongTarget(song);
    setRenameSongValue(song.title);
  }

  async function commitSongRename(event: React.FormEvent) {
    event.preventDefault();
    if (!renameSongTarget || renameSongBusy || !renameSongValue.trim()) return;
    setRenameSongBusy(true);
    try {
      const updated = await renameSong(renameSongTarget.id, renameSongValue);
      if (currentSongId === updated.id) setSongTitle(updated.title);
      await refreshLibrary();
      setRenameSongTarget(null);
      setRenameSongValue('');
    } catch (error) {
      setSaveStatus(error instanceof Error ? error.message : 'Could not rename song.');
    } finally {
      setRenameSongBusy(false);
    }
  }

${newSongNeedle}`);
}

const editNeedle = `<button role="menuitem" onClick={() => { setSongMenuId(null); loadSavedVersion(song, latest); }}>✎ Edit latest</button>`;
const renameButton = `${editNeedle}
                            <button role="menuitem" onClick={() => beginSongRename(song)}>✎ Rename</button>`;
if (!source.includes('onClick={() => beginSongRename(song)}')) {
  if (!source.includes(editNeedle)) throw new Error('Song action menu edit item not found.');
  source = source.replace(editNeedle, renameButton);
}

const navNeedle = `        <nav className="bottomNav noPrint">`;
if (!source.includes('className="songRenameBackdrop"')) {
  if (!source.includes(navNeedle)) throw new Error('Songs bottom navigation not found.');
  source = source.replace(navNeedle, `        {renameSongTarget && (
          <div className="songRenameBackdrop" role="presentation" onClick={() => !renameSongBusy && setRenameSongTarget(null)}>
            <form className="songRenameSheet" onSubmit={commitSongRename} onClick={(event) => event.stopPropagation()}>
              <div className="songRenameHead">
                <div><small>SONG OPTIONS</small><strong>Rename song</strong></div>
                <button type="button" aria-label="Close rename" onClick={() => setRenameSongTarget(null)} disabled={renameSongBusy}>×</button>
              </div>
              <input autoFocus value={renameSongValue} onChange={(event) => setRenameSongValue(event.target.value)} maxLength={120} aria-label="Song title" />
              <div className="songRenameActions">
                <button type="button" className="secondary" onClick={() => setRenameSongTarget(null)} disabled={renameSongBusy}>Cancel</button>
                <button type="submit" className="primary" disabled={renameSongBusy || !renameSongValue.trim()}>{renameSongBusy ? 'Saving…' : 'Save name'}</button>
              </div>
            </form>
          </div>
        )}

${navNeedle}`);
}

fs.writeFileSync(pagePath, source);

const cssPath = 'app/globals.css';
let css = fs.readFileSync(cssPath, 'utf8');
const marker = '/* AI SONGS RENAME SHEET */';
if (!css.includes(marker)) {
  css += `
${marker}
.songRenameBackdrop{position:fixed;inset:0;z-index:12000;display:flex;align-items:flex-end;justify-content:center;padding:16px;background:rgba(0,0,0,.62);backdrop-filter:blur(7px)}
.songRenameSheet{width:min(460px,100%);display:grid;gap:14px;padding:18px;border-radius:24px;background:linear-gradient(165deg,rgba(29,27,39,.99),rgba(12,12,18,.995));border:1px solid rgba(255,255,255,.13);box-shadow:0 28px 80px rgba(0,0,0,.62)}
.songRenameHead{display:flex;align-items:center;justify-content:space-between;gap:12px}.songRenameHead>div{display:grid;gap:3px}.songRenameHead small{font-size:9px;letter-spacing:.14em;color:#81818e;font-weight:850}.songRenameHead strong{font-size:20px}.songRenameHead>button{width:40px;height:40px;border:0;border-radius:50%;background:rgba(255,255,255,.06);color:#b8b8c1;font-size:25px}.songRenameSheet input{width:100%;min-height:52px;padding:13px 15px;border-radius:14px!important;font-size:17px!important}.songRenameActions{display:grid;grid-template-columns:1fr 1.25fr;gap:10px}.songRenameActions button{min-height:48px}@media(min-width:700px){.songRenameBackdrop{align-items:center}}
`;
  fs.writeFileSync(cssPath, css);
}

console.log('Added a styled Rename action to each song 3-dot menu.');
