'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';

type Venue = { id:string; name:string; address:string; bookerName:string; bookerEmail:string; bookerPhone:string; venueType:string; setting:'Indoor'|'Outdoor'|'Indoor + Outdoor'; seats:number; calendarUrl:string };
const venueTypes=['Club / Bar','Concert Hall','Theater','Festival / Outdoor Stage','Church / Faith Event','Campground / Retreat Center','Coffeehouse / Listening Room','Arena','Casino / Resort','Lodge','Event / Convention Center','TV / News Station','Radio Station','Talent Showcase','Other'];
const discoveryModes=[
  ['All Music Opportunities','live music venues bars breweries event spaces open mic'],
  ['Open Mics','open mic music venues'],
  ['Bands','venues with live bands'],
  ['Bars + Breweries','bars breweries pubs with live music'],
  ['Event Venues','event venues that book bands and musicians'],
  ['Casinos + Resorts','casinos resorts with live music bands entertainment booking'],
  ['Lodges','lodges hotels with live music entertainment booking'],
  ['Event Centers','event centers convention centers that book bands musicians'],
  ['Churches','churches worship events concerts that book musicians bands guest artists'],
  ['Campgrounds + Retreats','campgrounds retreat centers camps with live music festivals concerts worship events'],
  ['TV + News','TV stations news channels local music interviews live performances artist opportunities'],
  ['Radio','radio stations music interviews in-studio performances local artist submissions'],
  ['Talent Showcases','music talent showcases artist auditions band submissions'],
] as const;

export default function VenueMapWorkspace({onNavigate}:{onNavigate:(screen:string)=>void}){
  const [location,setLocation]=useState('Poulsbo, WA');
  const [searchedLocation,setSearchedLocation]=useState('Poulsbo, WA');
  const [filter,setFilter]=useState<string>(discoveryModes[0][0]);
  const [status,setStatus]=useState('');
  const [venues,setVenues]=useState<Venue[]>([]);
  const [name,setName]=useState(''); const [address,setAddress]=useState('');
  const [bookerName,setBookerName]=useState(''); const [bookerEmail,setBookerEmail]=useState(''); const [bookerPhone,setBookerPhone]=useState('');
  const [venueType,setVenueType]=useState(venueTypes[0]); const [setting,setSetting]=useState<Venue['setting']>('Indoor');
  const [seats,setSeats]=useState(''); const [calendarUrl,setCalendarUrl]=useState('');

  useEffect(()=>{try{const parsed=JSON.parse(localStorage.getItem('pie-booking-venues-v1')||'[]');setVenues(Array.isArray(parsed)?parsed:[])}catch{setVenues([])}},[]);
  const query=useMemo(()=>`${discoveryModes.find(([label])=>label===filter)?.[1]||discoveryModes[0][1]} ${searchedLocation}`.trim(),[filter,searchedLocation]);
  const mapUrl=`https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed`;
  const mapsSearchUrl=`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  const calendarSearchUrl=`https://www.google.com/search?q=${encodeURIComponent(`${query} events calendar booking contact submissions opportunities`)}`;
  const complete=Boolean(name.trim()&&address.trim()&&bookerName.trim()&&(bookerEmail.trim()||bookerPhone.trim())&&Number(seats)>=0&&seats!==''&&calendarUrl.trim());

  function persist(next:Venue[]){setVenues(next);try{localStorage.setItem('pie-booking-venues-v1',JSON.stringify(next))}catch{}}
  function search(event:FormEvent){event.preventDefault();setSearchedLocation(location.trim()||'near me');setStatus('Results are focused on live bookings, interviews, performances, showcases, and artist-submission opportunities. Verify the contact and calendar before saving.')}
  function useMyLocation(){if(!navigator.geolocation){setStatus('Enter a city, ZIP code, or address to search.');return}setStatus('Finding your location…');navigator.geolocation.getCurrentPosition(({coords})=>{setSearchedLocation(`near ${coords.latitude},${coords.longitude}`);setLocation('Current location');setStatus('Showing music-booking venues near your current location.')},()=>setStatus('Pie could not access your location. Enter a city, ZIP code, or address instead.'),{timeout:10000,maximumAge:300000})}
  function saveVenue(event:FormEvent){event.preventDefault();if(!complete)return;persist([{id:crypto.randomUUID(),name:name.trim(),address:address.trim(),bookerName:bookerName.trim(),bookerEmail:bookerEmail.trim(),bookerPhone:bookerPhone.trim(),venueType,setting,seats:Number(seats),calendarUrl:calendarUrl.trim()},...venues]);setName('');setAddress('');setBookerName('');setBookerEmail('');setBookerPhone('');setSeats('');setCalendarUrl('');setStatus('Venue saved to the booking directory.')}

  return <div style={{display:'grid',gap:16}}>
    <section className="panel"><p className="eyebrow">Live Opportunity Map</p><h2>Find stages, media, and showcases.</h2><p className="sub">Search open mics, bands, bars, casinos, lodges, event centers, churches, campgrounds, TV, radio, and talent showcases separately so opportunities do not disappear inside one narrow result list.</p>
      <form onSubmit={search} style={{display:'grid',gap:10,marginTop:14}}><input value={location} onChange={e=>setLocation(e.target.value)} placeholder="City, ZIP code, or address"/><select value={filter} onChange={e=>setFilter(e.target.value)}>{discoveryModes.map(([label])=><option key={label}>{label}</option>)}</select><div className="mixButtons"><button className="primary" type="submit">🔎 Find Music Opportunities</button><button className="secondary" type="button" onClick={useMyLocation}>◎ Near Me</button></div></form>{status&&<div className="statusBox" style={{marginTop:12}}>{status}</div>}
    </section>
    <section className="panel" style={{padding:10,overflow:'hidden'}}><iframe title="Google Maps live music opportunity search" src={mapUrl} loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen style={{display:'block',width:'100%',height:'52vh',minHeight:390,border:0,borderRadius:16}}/><div className="mixButtons"><a className="primary" href={mapsSearchUrl} target="_blank" rel="noreferrer" style={{display:'block',textAlign:'center',textDecoration:'none'}}>Open Full Google Maps</a><a className="secondary" href={calendarSearchUrl} target="_blank" rel="noreferrer" style={{display:'block',textAlign:'center',textDecoration:'none'}}>Verify Booking + Opportunities</a></div></section>
    <section className="panel"><p className="eyebrow">Verified Opportunity Directory</p><h2>Add an opportunity</h2><p className="sub">Save complete booking or media contact information. For radio or TV without a live audience, enter 0 for seats.</p>
      <form onSubmit={saveVenue} style={{display:'grid',gap:10,marginTop:14}}><input required value={name} onChange={e=>setName(e.target.value)} placeholder="Venue, station, showcase, or organization"/><input required value={address} onChange={e=>setAddress(e.target.value)} placeholder="Street address · City, State"/><div className="controlGrid"><input required value={bookerName} onChange={e=>setBookerName(e.target.value)} placeholder="Booker / producer / talent contact"/><input type="email" value={bookerEmail} onChange={e=>setBookerEmail(e.target.value)} placeholder="Contact email"/><input type="tel" value={bookerPhone} onChange={e=>setBookerPhone(e.target.value)} placeholder="Contact phone"/><select value={venueType} onChange={e=>setVenueType(e.target.value)}>{venueTypes.map(type=><option key={type}>{type}</option>)}</select><select value={setting} onChange={e=>setSetting(e.target.value as Venue['setting'])}><option>Indoor</option><option>Outdoor</option><option>Indoor + Outdoor</option></select><input required type="number" min="0" inputMode="numeric" value={seats} onChange={e=>setSeats(e.target.value)} placeholder="Audience seats (0 if none)"/></div><input required type="url" value={calendarUrl} onChange={e=>setCalendarUrl(e.target.value)} placeholder="Events, shows, submissions, or booking URL"/><button className="primary" type="submit" disabled={!complete}>＋ Save Complete Opportunity</button></form>
    </section>
    {venues.length>0&&<section className="panel"><div className="songsSectionHead"><strong>Booking + Media Opportunities</strong><span>{venues.length}</span></div><div style={{display:'grid',gap:10}}>{venues.map(venue=><article className="statusBox" key={venue.id} style={{display:'grid',gap:6}}><strong>{venue.name}</strong><small>{venue.address}</small><small>{venue.venueType} · {venue.setting} · {venue.seats.toLocaleString()} audience seats</small><small>Contact: {venue.bookerName}{venue.bookerEmail?` · ${venue.bookerEmail}`:''}{venue.bookerPhone?` · ${venue.bookerPhone}`:''}</small><div className="mixButtons"><a className="secondary" href={venue.calendarUrl} target="_blank" rel="noreferrer" style={{textAlign:'center',textDecoration:'none'}}>View Calendar / Submissions</a><button className="secondary" type="button" onClick={()=>persist(venues.filter(item=>item.id!==venue.id))}>Remove</button></div></article>)}</div></section>}
    <button type="button" className="secondary" onClick={()=>onNavigate('calendar')}>Open Pie Calendar</button>
  </div>
}
