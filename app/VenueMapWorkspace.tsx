'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';

type Venue = { id:string; name:string; address:string; bookerName:string; bookerEmail:string; bookerPhone:string; venueType:string; setting:'Indoor'|'Outdoor'|'Indoor + Outdoor'; seats:number; calendarUrl:string };
const venueTypes=['Club / Bar','Concert Hall','Theater','Festival / Outdoor Stage','Church / Faith Event','Coffeehouse / Listening Room','Arena','Other'];

export default function VenueMapWorkspace({onNavigate}:{onNavigate:(screen:string)=>void}){
  const [location,setLocation]=useState('');
  const [searchedLocation,setSearchedLocation]=useState('near me');
  const [filter,setFilter]=useState('All live music venues');
  const [status,setStatus]=useState('');
  const [venues,setVenues]=useState<Venue[]>([]);
  const [name,setName]=useState(''); const [address,setAddress]=useState('');
  const [bookerName,setBookerName]=useState(''); const [bookerEmail,setBookerEmail]=useState(''); const [bookerPhone,setBookerPhone]=useState('');
  const [venueType,setVenueType]=useState(venueTypes[0]); const [setting,setSetting]=useState<Venue['setting']>('Indoor');
  const [seats,setSeats]=useState(''); const [calendarUrl,setCalendarUrl]=useState('');

  useEffect(()=>{try{const parsed=JSON.parse(localStorage.getItem('pie-booking-venues-v1')||'[]');setVenues(Array.isArray(parsed)?parsed:[])}catch{setVenues([])}},[]);
  const query=useMemo(()=>`${filter==='All live music venues'?'live music venues that book bands and musicians':filter} ${searchedLocation}`.trim(),[filter,searchedLocation]);
  const mapUrl=`https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed`;
  const mapsSearchUrl=`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  const complete=Boolean(name.trim()&&address.trim()&&bookerName.trim()&&(bookerEmail.trim()||bookerPhone.trim())&&Number(seats)>0&&calendarUrl.trim());

  function persist(next:Venue[]){setVenues(next);try{localStorage.setItem('pie-booking-venues-v1',JSON.stringify(next))}catch{}}
  function search(event:FormEvent){event.preventDefault();setSearchedLocation(location.trim()||'near me');setStatus('Google Maps results are filtered toward live-music venues. Verify booking information before saving a venue.')}
  function useMyLocation(){if(!navigator.geolocation){setStatus('Enter a city, ZIP code, or address to search.');return}setStatus('Finding your location…');navigator.geolocation.getCurrentPosition(({coords})=>{setSearchedLocation(`near ${coords.latitude},${coords.longitude}`);setLocation('Current location');setStatus('Showing music-booking venues near your current location.')},()=>setStatus('Pie could not access your location. Enter a city, ZIP code, or address instead.'),{timeout:10000,maximumAge:300000})}
  function saveVenue(event:FormEvent){event.preventDefault();if(!complete)return;persist([{id:crypto.randomUUID(),name:name.trim(),address:address.trim(),bookerName:bookerName.trim(),bookerEmail:bookerEmail.trim(),bookerPhone:bookerPhone.trim(),venueType,setting,seats:Number(seats),calendarUrl:calendarUrl.trim()},...venues]);setName('');setAddress('');setBookerName('');setBookerEmail('');setBookerPhone('');setSeats('');setCalendarUrl('');setStatus('Venue saved to the booking directory.')}

  return <div style={{display:'grid',gap:16}}>
    <section className="panel"><p className="eyebrow">Live Venue Map</p><h2>Find stages that book musicians.</h2><p className="sub">Search Google Maps for live-music venues, then save verified booking details below.</p>
      <form onSubmit={search} style={{display:'grid',gap:10,marginTop:14}}><input value={location} onChange={e=>setLocation(e.target.value)} placeholder="City, ZIP code, or address"/><select value={filter} onChange={e=>setFilter(e.target.value)}><option>All live music venues</option>{venueTypes.map(type=><option key={type}>{type}</option>)}</select><div className="mixButtons"><button className="primary" type="submit">🔎 Find Booking Venues</button><button className="secondary" type="button" onClick={useMyLocation}>◎ Near Me</button></div></form>{status&&<div className="statusBox" style={{marginTop:12}}>{status}</div>}
    </section>
    <section className="panel" style={{padding:10,overflow:'hidden'}}><iframe title="Google Maps live music venue search" src={mapUrl} loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen style={{display:'block',width:'100%',height:'52vh',minHeight:390,border:0,borderRadius:16}}/><a className="primary" href={mapsSearchUrl} target="_blank" rel="noreferrer" style={{display:'block',textAlign:'center',textDecoration:'none'}}>Open Full Google Maps</a></section>
    <section className="panel"><p className="eyebrow">Verified Booking Directory</p><h2>Add a venue</h2><p className="sub">Every saved venue must include complete booking and capacity information.</p>
      <form onSubmit={saveVenue} style={{display:'grid',gap:10,marginTop:14}}><input required value={name} onChange={e=>setName(e.target.value)} placeholder="Venue name"/><input required value={address} onChange={e=>setAddress(e.target.value)} placeholder="Street address · City, State"/><div className="controlGrid"><input required value={bookerName} onChange={e=>setBookerName(e.target.value)} placeholder="Booker / talent buyer name"/><input type="email" value={bookerEmail} onChange={e=>setBookerEmail(e.target.value)} placeholder="Booker email"/><input type="tel" value={bookerPhone} onChange={e=>setBookerPhone(e.target.value)} placeholder="Booker phone"/><select value={venueType} onChange={e=>setVenueType(e.target.value)}>{venueTypes.map(type=><option key={type}>{type}</option>)}</select><select value={setting} onChange={e=>setSetting(e.target.value as Venue['setting'])}><option>Indoor</option><option>Outdoor</option><option>Indoor + Outdoor</option></select><input required type="number" min="1" inputMode="numeric" value={seats} onChange={e=>setSeats(e.target.value)} placeholder="Number of seats"/></div><input required type="url" value={calendarUrl} onChange={e=>setCalendarUrl(e.target.value)} placeholder="https://venue.com/events-calendar"/><button className="primary" type="submit" disabled={!complete}>＋ Save Complete Venue</button></form>
    </section>
    {venues.length>0&&<section className="panel"><div className="songsSectionHead"><strong>Booking Venues</strong><span>{venues.length}</span></div><div style={{display:'grid',gap:10}}>{venues.map(venue=><article className="statusBox" key={venue.id} style={{display:'grid',gap:6}}><strong>{venue.name}</strong><small>{venue.address}</small><small>{venue.venueType} · {venue.setting} · {venue.seats.toLocaleString()} seats</small><small>Booker: {venue.bookerName}{venue.bookerEmail?` · ${venue.bookerEmail}`:''}{venue.bookerPhone?` · ${venue.bookerPhone}`:''}</small><div className="mixButtons"><a className="secondary" href={venue.calendarUrl} target="_blank" rel="noreferrer" style={{textAlign:'center',textDecoration:'none'}}>View Events Calendar</a><button className="secondary" type="button" onClick={()=>persist(venues.filter(item=>item.id!==venue.id))}>Remove</button></div></article>)}</div></section>}
    <button type="button" className="secondary" onClick={()=>onNavigate('calendar')}>Open Pie Calendar</button>
  </div>
}
