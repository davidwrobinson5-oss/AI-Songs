'use client';

import { FormEvent, useMemo, useState } from 'react';

const venueTypes = [
  'All live music venues',
  'Clubs and bars with live music',
  'Concert halls and theaters',
  'Festivals and outdoor stages',
  'Churches and faith events',
  'Coffeehouses and listening rooms',
];

export default function VenueMapWorkspace({ onNavigate }: { onNavigate: (screen: string) => void }) {
  const [location, setLocation] = useState('');
  const [searchedLocation, setSearchedLocation] = useState('near me');
  const [venueType, setVenueType] = useState(venueTypes[0]);
  const [status, setStatus] = useState('');

  const query = useMemo(() => {
    const category = venueType === venueTypes[0] ? 'live music venues that book bands and musicians' : venueType;
    return `${category} ${searchedLocation}`.trim();
  }, [searchedLocation, venueType]);

  const mapUrl = `https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed`;
  const mapsSearchUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;

  function search(event: FormEvent) {
    event.preventDefault();
    setSearchedLocation(location.trim() || 'near me');
    setStatus('Showing Google Maps results focused on venues that host live music. Confirm booking details with each venue.');
  }

  function useMyLocation() {
    if (!navigator.geolocation) {
      setStatus('Location services are not available. Enter a city, ZIP code, or address instead.');
      return;
    }
    setStatus('Finding your location…');
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setSearchedLocation(`near ${coords.latitude},${coords.longitude}`);
        setLocation('Current location');
        setStatus('Showing music-booking venues near your current location.');
      },
      () => setStatus('Pie could not access your location. Enter a city, ZIP code, or address instead.'),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  }

  return (
    <main className="growthWorkspace">
      <section className="hero">
        <p className="eyebrow">Find the Next Stage</p>
        <h1>Venue Map</h1>
        <p className="sub">Google Maps focused on venues that host live music and book artists, bands, and performers.</p>
      </section>

      <section className="panel" style={{ display: 'grid', gap: 12 }}>
        <form onSubmit={search} style={{ display: 'grid', gap: 10 }}>
          <label>
            <span className="controlLabel">City, ZIP code, or address</span>
            <input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Bremerton, WA" />
          </label>
          <label>
            <span className="controlLabel">Venue type</span>
            <select value={venueType} onChange={(event) => setVenueType(event.target.value)}>
              {venueTypes.map((type) => <option key={type}>{type}</option>)}
            </select>
          </label>
          <div className="mixButtons">
            <button className="primary" type="submit">🔎 Find Booking Venues</button>
            <button className="secondary" type="button" onClick={useMyLocation}>◎ Near Me</button>
          </div>
        </form>
        {status && <div className="statusBox">{status}</div>}
      </section>

      <section className="panel" style={{ padding: 10, overflow: 'hidden' }}>
        <iframe
          title="Google Maps live music venue search"
          src={mapUrl}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          allowFullScreen
          style={{ display: 'block', width: '100%', height: '58vh', minHeight: 430, border: 0, borderRadius: 16 }}
        />
        <a className="primary" href={mapsSearchUrl} target="_blank" rel="noreferrer" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>Open Full Google Maps</a>
      </section>

      <section className="panel">
        <h2>Turn a venue into a gig</h2>
        <p className="sub">When you find a venue, open Gigs to save the buyer or promoter, contact details, offer, show date, and next action.</p>
        <button type="button" className="secondary" onClick={() => onNavigate('gigs')}>Open Gigs</button>
      </section>
    </main>
  );
}
