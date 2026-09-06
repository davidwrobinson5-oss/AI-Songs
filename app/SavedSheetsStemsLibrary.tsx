'use client';

import { useEffect, useState } from 'react';

type SavedSession = {
  id:string;
  sourceName:string;
  createdAt:number;
  updatedAt:number;
  status?:string;
};

const STORAGE_KEY='pie-sheets-stems-library-v1';
const ACTIVE_KEY='pie-sheets-stems-active-v1';

function readLibrary():SavedSession[]{
  try{
    const parsed=JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]');
    return Array.isArray(parsed)?parsed.filter(item=>item&&typeof item.id==='string'&&typeof item.sourceName==='string'):[];
  }catch{return []}
}

export default function SavedSheetsStemsLibrary(){
  const [library,setLibrary]=useState<SavedSession[]>([]);
  const [activeId,setActiveId]=useState('');

  function refresh(){
    setLibrary(readLibrary());
    setActiveId(localStorage.getItem(ACTIVE_KEY)||'');
  }

  useEffect(()=>{
    refresh();
    const onChange=()=>refresh();
    window.addEventListener('pie-sheets-stems-library-changed',onChange);
    window.addEventListener('storage',onChange);
    return()=>{
      window.removeEventListener('pie-sheets-stems-library-changed',onChange);
      window.removeEventListener('storage',onChange);
    };
  },[]);

  function openSession(id:string){
    localStorage.setItem(ACTIVE_KEY,id);
    setActiveId(id);
    window.dispatchEvent(new CustomEvent('pie-sheets-stems-library-action',{detail:{action:'open',id}}));
  }

  function deleteSession(id:string){
    const next=readLibrary().filter(item=>item.id!==id);
    localStorage.setItem(STORAGE_KEY,JSON.stringify(next));
    if(localStorage.getItem(ACTIVE_KEY)===id){
      if(next[0])localStorage.setItem(ACTIVE_KEY,next[0].id);
      else localStorage.removeItem(ACTIVE_KEY);
    }
    setLibrary(next);
    setActiveId(localStorage.getItem(ACTIVE_KEY)||'');
    window.dispatchEvent(new CustomEvent('pie-sheets-stems-library-action',{detail:{action:'delete',id}}));
    window.dispatchEvent(new Event('pie-sheets-stems-library-changed'));
  }

  return <section className="songsLibraryPanel fileLibraryPanel" style={{marginTop:16}}>
    <div className="songsSectionHead"><strong>Saved Sheets & Stems</strong><span>{library.length} {library.length===1?'file':'files'}</span></div>
    {library.length===0&&<div className="songsEmpty"><span>▤</span><strong>No saved files yet</strong><small>Your next sheet or stem job will appear here automatically.</small></div>}
    <div className="songsList fileLibraryList">
      {library.map((item,index)=><article className={`songListRow fileLibraryRow ${activeId===item.id?'fileLibraryRowActive':''}`} key={item.id}>
        <button type="button" className={`songCoverButton songCoverTone${index%4} fileThumb`} aria-label={`Open ${item.sourceName}`} onClick={()=>openSession(item.id)}>
          <span>▤</span>
        </button>
        <button type="button" className="songRowInfo" onClick={()=>openSession(item.id)}>
          <div className="songTitleLine"><strong>{item.sourceName}</strong>{activeId===item.id&&<span>OPEN</span>}</div>
          <small className="songDescription">Sheets & stems</small>
          <div className="songMeta"><span>{new Date(item.updatedAt).toLocaleDateString()}</span>{item.status&&<span>{item.status}</span>}</div>
        </button>
        <div className="songMenuWrap">
          <button type="button" className="songMenuButton" aria-label={`Options for ${item.sourceName}`} onClick={()=>deleteSession(item.id)}>•••</button>
        </div>
      </article>)}
    </div>
  </section>;
}
