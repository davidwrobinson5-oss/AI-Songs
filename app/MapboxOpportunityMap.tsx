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
type MapboxPopup = { setDOMContent:(node:HTMLElement)=>MapboxPopup };
type MapboxGlobal = { accessToken:string; Map:new(options:Record<string,unknown>)=>MapboxMap; Marker:new(options?:Record<string,unknown>)=>MapboxMarker; Popup:new(options?:Record<string,unknown>)=>MapboxPopup; NavigationControl:new()=>unknown; };
declare global { interface Window { mapboxgl?:MapboxGlobal } }

export type PieVenue = {
  id:string;
  name:string;
  address:string;
  bookerName:string;
  bookerEmail:string;
  bookerPhone:string;
  venueType:string;
  setting:'Indoor'|'Outdoor'|'Indoor + Outdoor';
  seats:number;
  calendarUrl:string;
  liveMusicStatus?:string;
  openMicStatus?:string;
  bookingStatus?:string;
  bookingNotes?:string;
  lng?:number;
  lat?:number;
};

export type DiscoveredPlace={id:string;name:string;address:string;coordinates:[number,number]};
type VerifiedPoint={venue:PieVenue;coordinates:[number,number]};
const MAPBOX_VERSION='3.30.0';

function normalized(value:string){return value.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()}
function sameVenue(place:DiscoveredPlace,venue:PieVenue){
  const a=normalized(place.name),b=normalized(venue.name);
  if(a&&b&&(a===b||a.includes(b)||b.includes(a)))return true;
  const pa=normalized(place.address),va=normalized(venue.address);
  return Boolean(pa&&va&&(pa===va||pa.includes(va)||va.includes(pa)));
}
function popupShell(){const root=document.createElement('div');root.style.minWidth='230px';root.style.maxWidth='310px';root.style.color='#202124';root.style.fontFamily='Arial,sans-serif';root.style.fontSize='13px';root.style.lineHeight='1.35';return root}
function addPopupLine(root:HTMLElement,label:string,value:string){if(!value)return;const row=document.createElement('div');row.style.marginTop='5px';const strong=document.createElement('strong');strong.textContent=`${label}: `;row.appendChild(strong);row.appendChild(document.createTextNode(value));root.appendChild(row)}
function popupLink(label:string,href:string){const link=document.createElement('a');link.textContent=label;link.href=href;link.target='_blank';link.rel='noreferrer';link.style.display='inline-block';link.style.marginTop='8px';link.style.marginRight='10px';link.style.fontWeight='700';link.style.color='#1a73e8';link.style.textDecoration='none';return link}
function verifiedPopup(venue:PieVenue){
  const root=popupShell();const badge=document.createElement('div');badge.textContent='✓ VERIFIED IN PIE';badge.style.color='#188038';badge.style.fontWeight='800';badge.style.fontSize='11px';root.appendChild(badge);
  const title=document.createElement('strong');title.textContent=venue.name;title.style.display='block';title.style.fontSize='16px';title.style.marginTop='3px';root.appendChild(title);
  const address=document.createElement('div');address.textContent=venue.address;address.style.marginTop='3px';root.appendChild(address);
  addPopupLine(root,'Type',venue.venueType);addPopupLine(root,'Setting',venue.setting);addPopupLine(root,'Capacity',`${Number(venue.seats||0).toLocaleString()} seats`);
  addPopupLine(root,'Live music',venue.liveMusicStatus||'Unknown');addPopupLine(root,'Open mic',venue.openMicStatus||'Unknown');addPopupLine(root,'Booking',venue.bookingStatus||'Unknown');
  addPopupLine(root,'Booker',venue.bookerName);addPopupLine(root,'Email',venue.bookerEmail);addPopupLine(root,'Phone',venue.bookerPhone);addPopupLine(root,'Notes',venue.bookingNotes||'');
  if(venue.calendarUrl)root.appendChild(popupLink('Events / Submissions',venue.calendarUrl));
  if(venue.bookerEmail)root.appendChild(popupLink('Email Booker',`mailto:${venue.bookerEmail}`));
  if(venue.bookerPhone)root.appendChild(popupLink('Call',`tel:${venue.bookerPhone}`));
  return root;
}
function discoveryPopup(place:DiscoveredPlace,onAddDiscovery?:(place:DiscoveredPlace)=>void){
  const root=popupShell();const badge=document.createElement('div');badge.textContent='NEEDS VERIFICATION';badge.style.color='#b06000';badge.style.fontWeight='800';badge.style.fontSize='11px';root.appendChild(badge);
  const title=document.createElement('strong');title.textContent=place.name;title.style.display='block';title.style.fontSize='16px';title.style.marginTop='3px';root.appendChild(title);
  const address=document.createElement('div');address.textContent=place.address||'Address not supplied by Mapbox';address.style.marginTop='3px';root.appendChild(address);
  if(onAddDiscovery){const button=document.createElement('button');button.type='button';button.textContent='Add / Verify in Pie';button.style.marginTop='10px';button.style.padding='7px 10px';button.style.border='0';button.style.borderRadius='8px';button.style.cursor='pointer';button.style.background='#1a73e8';button.style.color='white';button.style.fontWeight='700';button.addEventListener('click',()=>onAddDiscovery(place));root.appendChild(button)}
  return root;
}

export default function MapboxOpportunityMap({query,location,token,verifiedVenues,onAddDiscovery,onVenueGeocoded}:{query:string;location:string;token:string;verifiedVenues:PieVenue[];onAddDiscovery?:(place:DiscoveredPlace)=>void;onVenueGeocoded?:(id:string,lng:number,lat:number)=>void}){
  const containerRef=useRef<HTMLDivElement>(null);const mapRef=useRef<MapboxMap|null>(null);const markerRefs=useRef<MapboxMarker[]>([]);const autoRef=useRef(false);const requestRef=useRef<AbortController|null>(null);
  const [autoSearch,setAutoSearch]=useState(false);const [moved,setMoved]=useState(false);const [loading,setLoading]=useState(false);const [error,setError]=useState('');const [results,setResults]=useState<DiscoveredPlace[]>([]);const [verifiedPoints,setVerifiedPoints]=useState<VerifiedPoint[]>([]);

  const search=useCallback(async(useCurrentArea:boolean)=>{
    const map=mapRef.current;if(!map)return;requestRef.current?.abort();const controller=new AbortController();requestRef.current=controller;setLoading(true);setError('');
    try{
      const searchText=useCurrentArea?query:`${query} ${location}`.trim();
      const params=new URLSearchParams({q:searchText,access_token:token,limit:'10',types:'poi'});
      if(useCurrentArea){const b=map.getBounds();params.set('bbox',[b.getWest(),b.getSouth(),b.getEast(),b.getNorth()].join(','))}
      const response=await fetch(`https://api.mapbox.com/search/searchbox/v1/forward?${params}`,{signal:controller.signal});if(!response.ok)throw new Error('Mapbox place search is unavailable.');
      const data=await response.json();
      const next:DiscoveredPlace[]=(Array.isArray(data.features)?data.features:[]).flatMap((feature:any)=>{const coordinates=feature?.geometry?.coordinates;if(!Array.isArray(coordinates)||coordinates.length<2)return [];return [{id:String(feature.id||`${coordinates[0]}-${coordinates[1]}`),name:String(feature.properties?.name||feature.text||'Music opportunity'),address:String(feature.properties?.full_address||feature.properties?.place_formatted||''),coordinates:[Number(coordinates[0]),Number(coordinates[1])] as [number,number]}];});
      setResults(next);setMoved(false);if(!useCurrentArea&&next.length){const lngs=next.map(place=>place.coordinates[0]),lats=next.map(place=>place.coordinates[1]);map.fitBounds([[Math.min(...lngs),Math.min(...lats)],[Math.max(...lngs),Math.max(...lats)]],{padding:54,maxZoom:13})}
    }catch(reason){if((reason as Error).name!=='AbortError')setError(reason instanceof Error?reason.message:'Map search failed.')}finally{setLoading(false)}
  },[query,location,token]);

  useEffect(()=>{let cancelled=false;async function geocodeVerified(){const points:VerifiedPoint[]=[];const newlyResolved:{id:string;lng:number;lat:number}[]=[];for(const venue of verifiedVenues.slice(0,120)){if(cancelled)break;if(Number.isFinite(venue.lng)&&Number.isFinite(venue.lat)){points.push({venue,coordinates:[Number(venue.lng),Number(venue.lat)]});continue}if(!venue.address.trim())continue;try{const params=new URLSearchParams({q:`${venue.name} ${venue.address}`.trim(),access_token:token,limit:'1',types:'poi,address'});const response=await fetch(`https://api.mapbox.com/search/searchbox/v1/forward?${params}`);if(!response.ok)continue;const data=await response.json();const coordinates=data?.features?.[0]?.geometry?.coordinates;if(Array.isArray(coordinates)&&coordinates.length>=2){const point:[number,number]=[Number(coordinates[0]),Number(coordinates[1])];if(Number.isFinite(point[0])&&Number.isFinite(point[1])){points.push({venue,coordinates:point});newlyResolved.push({id:venue.id,lng:point[0],lat:point[1]})}}}catch{}}if(cancelled)return;setVerifiedPoints(points);for(const item of newlyResolved)onVenueGeocoded?.(item.id,item.lng,item.lat)}void geocodeVerified();return()=>{cancelled=true}},[verifiedVenues,token,onVenueGeocoded]);

  useEffect(()=>{const map=mapRef.current;if(!map||!window.mapboxgl)return;markerRefs.current.forEach(marker=>marker.remove());const markers:MapboxMarker[]=[];for(const point of verifiedPoints){markers.push(new window.mapboxgl.Marker({color:'#34A853'}).setLngLat(point.coordinates).setPopup(new window.mapboxgl.Popup({offset:18}).setDOMContent(verifiedPopup(point.venue))).addTo(map))}for(const place of results){if(verifiedPoints.some(point=>sameVenue(place,point.venue)))continue;markers.push(new window.mapboxgl.Marker({color:'#EA4335'}).setLngLat(place.coordinates).setPopup(new window.mapboxgl.Popup({offset:18}).setDOMContent(discoveryPopup(place,onAddDiscovery))).addTo(map))}markerRefs.current=markers;return()=>{markers.forEach(marker=>marker.remove())}},[results,verifiedPoints,onAddDiscovery]);

  useEffect(()=>{autoRef.current=autoSearch},[autoSearch]);
  useEffect(()=>{let cancelled=false;const cssId='pie-mapbox-css',scriptId='pie-mapbox-js';if(!document.getElementById(cssId)){const link=document.createElement('link');link.id=cssId;link.rel='stylesheet';link.href=`https://api.mapbox.com/mapbox-gl-js/v${MAPBOX_VERSION}/mapbox-gl.css`;document.head.appendChild(link)}const start=()=>{if(cancelled||!containerRef.current||!window.mapboxgl||mapRef.current)return;window.mapboxgl.accessToken=token;const map=new window.mapboxgl.Map({container:containerRef.current,style:'mapbox://styles/mapbox/streets-v12',center:[-122.6465,47.7359],zoom:10});mapRef.current=map;map.addControl(new window.mapboxgl.NavigationControl(),'top-right');map.on('load',()=>search(false));map.on('moveend',()=>{setMoved(true);if(autoRef.current)search(true)});};const existing=document.getElementById(scriptId) as HTMLScriptElement|null;if(window.mapboxgl)start();else if(existing)existing.addEventListener('load',start,{once:true});else{const script=document.createElement('script');script.id=scriptId;script.src=`https://api.mapbox.com/mapbox-gl-js/v${MAPBOX_VERSION}/mapbox-gl.js`;script.async=true;script.onload=start;script.onerror=()=>setError('Mapbox could not load.');document.head.appendChild(script)}return()=>{cancelled=true;requestRef.current?.abort();markerRefs.current.forEach(marker=>marker.remove());mapRef.current?.remove();mapRef.current=null};},[search,token]);
  useEffect(()=>{if(mapRef.current)search(false)},[query,location,search]);

  const unresolved=results.filter(place=>!verifiedPoints.some(point=>sameVenue(place,point.venue)));
  const research=(place:DiscoveredPlace,kind:'music'|'booking')=>{const phrase=kind==='music'?`${place.name} ${place.address} live music open mic bands events`:`${place.name} ${place.address} booking contact talent buyer musician submissions`;return `https://www.google.com/search?q=${encodeURIComponent(phrase)}`;};
  return <div style={{display:'grid',gap:10}}>
    <div ref={containerRef} style={{width:'100%',height:'52vh',minHeight:390,borderRadius:16,overflow:'hidden'}}/>
    <div className="mixButtons"><button type="button" className="primary" onClick={()=>search(true)} disabled={loading}>{loading?'Searching…':moved?'Search This Area':'Reassess This Area'}</button><button type="button" className={autoSearch?'chip activeChip':'chip'} onClick={()=>setAutoSearch(value=>!value)} aria-pressed={autoSearch}>{autoSearch?'✓ Auto-Search On':'Auto-Search Off'}</button></div>
    <div className="statusBox" style={{display:'flex',gap:14,flexWrap:'wrap'}}><strong>🟢 {verifiedPoints.length} verified in Pie</strong><strong>🔴 {unresolved.length} need verification</strong><span>Tap a pin for booking details.</span></div>
    {verifiedVenues.length>0&&<div style={{display:'grid',gap:8}}>{verifiedVenues.map(venue=><article className="statusBox" key={`verified-${venue.id}`} style={{display:'grid',gap:5}}><div style={{display:'flex',justifyContent:'space-between',gap:8,alignItems:'center'}}><strong>{venue.name}</strong><span style={{fontWeight:800,color:'#188038'}}>✓ VERIFIED</span></div><small>{venue.address}</small><small>{venue.venueType} · {venue.setting} · {Number(venue.seats||0).toLocaleString()} seats</small><small>Live music: {venue.liveMusicStatus||'Unknown'} · Open mic: {venue.openMicStatus||'Unknown'} · Booking: {venue.bookingStatus||'Unknown'}</small><small>Booker: {venue.bookerName}{venue.bookerEmail?` · ${venue.bookerEmail}`:''}{venue.bookerPhone?` · ${venue.bookerPhone}`:''}</small>{venue.bookingNotes&&<small>{venue.bookingNotes}</small>}<div className="mixButtons">{venue.calendarUrl&&<a className="secondary" href={venue.calendarUrl} target="_blank" rel="noreferrer" style={{textAlign:'center',textDecoration:'none'}}>Calendar / Submissions</a>}{venue.bookerEmail&&<a className="secondary" href={`mailto:${venue.bookerEmail}`} style={{textAlign:'center',textDecoration:'none'}}>Email Booker</a>}</div></article>)}</div>}
    {unresolved.length>0&&<div style={{display:'grid',gap:8}}>{unresolved.map(place=><article className="statusBox" key={place.id} style={{display:'grid',gap:5}}><div style={{display:'flex',justifyContent:'space-between',gap:8,alignItems:'center'}}><strong>{place.name}</strong><span style={{fontWeight:800,color:'#b06000'}}>NEEDS VERIFICATION</span></div>{place.address&&<small>{place.address}</small>}<div className="mixButtons"><button className="primary" type="button" onClick={()=>onAddDiscovery?.(place)}>Add / Verify in Pie</button><a className="secondary" href={research(place,'music')} target="_blank" rel="noreferrer" style={{textAlign:'center',textDecoration:'none'}}>Live Music / Open Mic</a><a className="secondary" href={research(place,'booking')} target="_blank" rel="noreferrer" style={{textAlign:'center',textDecoration:'none'}}>Booking Contact</a></div></article>)}</div>}
    {error&&<div className="errorBox">{error}</div>}
  </div>
}
