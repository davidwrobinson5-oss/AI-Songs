'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type MapboxMap = {
  on:(event:string,handler:()=>void)=>void;
  remove:()=>void;
  addControl:(control:unknown,position?:string)=>void;
  getBounds:()=>{getWest:()=>number;getSouth:()=>number;getEast:()=>number;getNorth:()=>number};
  fitBounds:(bounds:[[number,number],[number,number]],options:{padding:number;maxZoom:number})=>void;
};
type MapboxMarker = { setLngLat:(coordinates:[number,number])=>MapboxMarker; setPopup:(popup:unknown)=>MapboxMarker; addTo:(map:MapboxMap)=>MapboxMarker; remove:()=>void };
type MapboxGlobal = { accessToken:string; Map:new(options:Record<string,unknown>)=>MapboxMap; Marker:new(options?:Record<string,unknown>)=>MapboxMarker; Popup:new(options?:Record<string,unknown>)=>{setText:(text:string)=>unknown}; NavigationControl:new()=>unknown; };
declare global { interface Window { mapboxgl?:MapboxGlobal } }
type PlaceResult={id:string;name:string;address:string;coordinates:[number,number]};
const MAPBOX_VERSION='3.30.0';

export default function MapboxOpportunityMap({query,location,token}:{query:string;location:string;token:string}){
  const containerRef=useRef<HTMLDivElement>(null);const mapRef=useRef<MapboxMap|null>(null);const markerRefs=useRef<MapboxMarker[]>([]);const autoRef=useRef(false);const requestRef=useRef<AbortController|null>(null);
  const [autoSearch,setAutoSearch]=useState(false);const [moved,setMoved]=useState(false);const [loading,setLoading]=useState(false);const [error,setError]=useState('');const [results,setResults]=useState<PlaceResult[]>([]);
  const search=useCallback(async(useCurrentArea:boolean)=>{
    const map=mapRef.current;if(!map)return;requestRef.current?.abort();const controller=new AbortController();requestRef.current=controller;setLoading(true);setError('');
    try{
      const searchText=useCurrentArea?query:`${query} ${location}`.trim();
      const params=new URLSearchParams({q:searchText,access_token:token,limit:'10',types:'poi'});
      if(useCurrentArea){const b=map.getBounds();params.set('bbox',[b.getWest(),b.getSouth(),b.getEast(),b.getNorth()].join(','))}
      const response=await fetch(`https://api.mapbox.com/search/searchbox/v1/forward?${params}`,{signal:controller.signal});if(!response.ok)throw new Error('Mapbox place search is unavailable.');
      const data=await response.json();
      const next:PlaceResult[]=(Array.isArray(data.features)?data.features:[]).flatMap((feature:any)=>{const coordinates=feature?.geometry?.coordinates;if(!Array.isArray(coordinates)||coordinates.length<2)return [];return [{id:String(feature.id||`${coordinates[0]}-${coordinates[1]}`),name:String(feature.properties?.name||feature.text||'Music opportunity'),address:String(feature.properties?.full_address||feature.properties?.place_formatted||''),coordinates:[Number(coordinates[0]),Number(coordinates[1])] as [number,number]}];});
      markerRefs.current.forEach(marker=>marker.remove());markerRefs.current=[];if(window.mapboxgl){markerRefs.current=next.map(place=>new window.mapboxgl!.Marker({color:'#EA4335'}).setLngLat(place.coordinates).setPopup(new window.mapboxgl!.Popup({offset:18}).setText(`${place.name}${place.address?` — ${place.address}`:''}`)).addTo(map))}
      setResults(next);setMoved(false);if(!useCurrentArea&&next.length){const lngs=next.map(place=>place.coordinates[0]),lats=next.map(place=>place.coordinates[1]);map.fitBounds([[Math.min(...lngs),Math.min(...lats)],[Math.max(...lngs),Math.max(...lats)]],{padding:54,maxZoom:13})}
    }catch(reason){if((reason as Error).name!=='AbortError')setError(reason instanceof Error?reason.message:'Map search failed.')}finally{setLoading(false)}
  },[query,location,token]);
  useEffect(()=>{autoRef.current=autoSearch},[autoSearch]);
  useEffect(()=>{let cancelled=false;const cssId='pie-mapbox-css',scriptId='pie-mapbox-js';if(!document.getElementById(cssId)){const link=document.createElement('link');link.id=cssId;link.rel='stylesheet';link.href=`https://api.mapbox.com/mapbox-gl-js/v${MAPBOX_VERSION}/mapbox-gl.css`;document.head.appendChild(link)}const start=()=>{if(cancelled||!containerRef.current||!window.mapboxgl||mapRef.current)return;window.mapboxgl.accessToken=token;const map=new window.mapboxgl.Map({container:containerRef.current,style:'mapbox://styles/mapbox/streets-v12',center:[-122.6465,47.7359],zoom:10});mapRef.current=map;map.addControl(new window.mapboxgl.NavigationControl(),'top-right');map.on('load',()=>search(false));map.on('moveend',()=>{setMoved(true);if(autoRef.current)search(true)});};const existing=document.getElementById(scriptId) as HTMLScriptElement|null;if(window.mapboxgl)start();else if(existing)existing.addEventListener('load',start,{once:true});else{const script=document.createElement('script');script.id=scriptId;script.src=`https://api.mapbox.com/mapbox-gl-js/v${MAPBOX_VERSION}/mapbox-gl.js`;script.async=true;script.onload=start;script.onerror=()=>setError('Mapbox could not load.');document.head.appendChild(script)}return()=>{cancelled=true;requestRef.current?.abort();markerRefs.current.forEach(marker=>marker.remove());mapRef.current?.remove();mapRef.current=null};},[search,token]);
  useEffect(()=>{if(mapRef.current)search(false)},[query,location,search]);
  const research=(place:PlaceResult,kind:'music'|'booking')=>{const phrase=kind==='music'?`${place.name} ${place.address} live music open mic bands events`:`${place.name} ${place.address} booking contact talent buyer musician submissions`;return `https://www.google.com/search?q=${encodeURIComponent(phrase)}`;};
  return <div style={{display:'grid',gap:10}}>
    <div ref={containerRef} style={{width:'100%',height:'52vh',minHeight:390,borderRadius:16,overflow:'hidden'}}/>
    <div className="mixButtons"><button type="button" className="primary" onClick={()=>search(true)} disabled={loading}>{loading?'Searching…':moved?'Search This Area':'Reassess This Area'}</button><button type="button" className={autoSearch?'chip activeChip':'chip'} onClick={()=>setAutoSearch(value=>!value)} aria-pressed={autoSearch}>{autoSearch?'✓ Auto-Search On':'Auto-Search Off'}</button></div>
    <small className="sub">{results.length} matching opportunities in the current results. Move or zoom the map, then search this area—or turn on automatic search.</small>
    {results.length>0&&<div style={{display:'grid',gap:8}}>{results.map(place=><div className="statusBox" key={place.id} style={{display:'grid',gap:5}}><strong>{place.name}</strong>{place.address&&<small>{place.address}</small>}<div className="mixButtons"><a className="secondary" href={research(place,'music')} target="_blank" rel="noreferrer" style={{textAlign:'center',textDecoration:'none'}}>Check Live Music / Open Mic</a><a className="secondary" href={research(place,'booking')} target="_blank" rel="noreferrer" style={{textAlign:'center',textDecoration:'none'}}>Research Booking Contact</a></div></div>)}</div>}
    {error&&<div className="errorBox">{error}</div>}
  </div>
}
