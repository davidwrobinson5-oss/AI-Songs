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

  return <div className="sheetSourceCard" style={{marginTop:16}}>
    <p className="eyebrow">SAVED SHEETS & STEMS</p>
    <h2>Recent audio jobs</h2>
    <p className="sub">{library.length?'Your saved transcription jobs stay available when you switch screens.':'No saved jobs yet. Your next audio transcription will appear here automatically.'}</p>
    {library.length>0&&<div style={{display:'grid',gap:10}}>{library.map(item=><div className="statusBox" key={item.id} style={{display:'grid',gap:8}}>
      <div><strong>{item.sourceName}</strong><small style={{display:'block',marginTop:4}}>{new Date(item.updatedAt).toLocaleString()}</small>{item.status&&<small style={{display:'block',marginTop:4}}>{item.status}</small>}</div>
      <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
        <button type="button" className="secondary" onClick={()=>openSession(item.id)} disabled={activeId===item.id}>Open</button>
        <button type="button" className="secondary" onClick={()=>deleteSession(item.id)}>Delete</button>
      </div>
    </div>)}</div>}
  </div>;
}
