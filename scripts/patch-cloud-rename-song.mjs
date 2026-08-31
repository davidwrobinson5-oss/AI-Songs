import fs from 'node:fs';

const pagePath = 'app/page.tsx';
let source = fs.readFileSync(pagePath, 'utf8');

const oldBlock = `  async function commitSongRename(event: React.FormEvent) {\n    event.preventDefault();\n    if (!renameSongTarget || renameSongBusy || !renameSongValue.trim()) return;\n    setRenameSongBusy(true);\n    try {\n      const updated = await renameSong(renameSongTarget.id, renameSongValue);\n      if (currentSongId === updated.id) setSongTitle(updated.title);\n      await refreshLibrary();\n      setRenameSongTarget(null);\n      setRenameSongValue('');\n    } catch (error) {\n      setSaveStatus(error instanceof Error ? error.message : 'Could not rename song.');\n    } finally {\n      setRenameSongBusy(false);\n    }\n  }`;

const newBlock = `  async function commitSongRename(event: React.FormEvent) {\n    event.preventDefault();\n    if (!renameSongTarget || renameSongBusy || !renameSongValue.trim()) return;\n    setRenameSongBusy(true);\n    try {\n      const cleanTitle = renameSongValue.trim();\n      const cloudRes = await fetch('/api/song-library', {\n        method: 'POST',\n        credentials: 'same-origin',\n        headers: { 'Content-Type': 'application/json' },\n        body: JSON.stringify({ action: 'renameSong', songId: renameSongTarget.id, title: cleanTitle }),\n        cache: 'no-store',\n      });\n      const cloudData = await cloudRes.json().catch(() => ({}));\n      if (!cloudRes.ok) throw new Error(typeof cloudData?.error === 'string' ? cloudData.error : 'Could not rename song in cloud.');\n\n      const updated = await renameSong(renameSongTarget.id, cleanTitle);\n      if (currentSongId === updated.id) setSongTitle(updated.title);\n      await refreshLibrary();\n      window.dispatchEvent(new Event('pie-local-library-changed'));\n      setRenameSongTarget(null);\n      setRenameSongValue('');\n      setSaveStatus('Song renamed.');\n    } catch (error) {\n      setSaveStatus(error instanceof Error ? error.message : 'Could not rename song.');\n    } finally {\n      setRenameSongBusy(false);\n    }\n  }`;

if (!source.includes(newBlock)) {
  if (!source.includes(oldBlock)) throw new Error('Song rename handler not found for cloud rename patch.');
  source = source.replace(oldBlock, newBlock);
}

fs.writeFileSync(pagePath, source);
console.log('Made song rename cloud-first so titles persist across sync and deploys.');
