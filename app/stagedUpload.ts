'use client';

const CHUNK_BYTES = 2 * 1024 * 1024;

async function jsonRequest(url:string, init:RequestInit){
  const response=await fetch(url,{...init,credentials:'same-origin',cache:'no-store'});
  const data=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(data?.error||`Upload failed (${response.status}).`);
  return data;
}

function safeName(name:string){
  return (name||'upload.bin').replace(/[^a-zA-Z0-9._-]/g,'_').slice(-100)||'upload.bin';
}

export async function stagePieFile(file:File,onProgress?:(percent:number)=>void){
  const nonce=Math.random().toString(36).slice(2,10);
  const path=`pie-primary/staging/${Date.now()}_${nonce}_${safeName(file.name)}`;
  const started=await jsonRequest('/api/song-audio-upload',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({path,type:file.type||'application/octet-stream',size:file.size}),
  });
  const uploadUrl=String(started.uploadUrl||'');
  let offset=Number(started.offset||0);
  if(!uploadUrl||!Number.isFinite(offset)||offset<0) throw new Error('Pie could not start the file upload.');
  onProgress?.(Math.floor((offset/file.size)*100));

  while(offset<file.size){
    const end=Math.min(offset+CHUNK_BYTES,file.size);
    const chunk=file.slice(offset,end);
    const result=await jsonRequest('/api/song-audio-upload',{
      method:'PATCH',
      headers:{
        'Content-Type':'application/octet-stream',
        'x-pie-upload-url':uploadUrl,
        'x-pie-upload-offset':String(offset),
      },
      body:chunk,
    });
    const next=Number(result.offset);
    if(!Number.isFinite(next)||next<=offset) throw new Error('Pie upload stopped before completion.');
    offset=next;
    onProgress?.(Math.min(100,Math.floor((offset/file.size)*100)));
  }

  return path;
}
