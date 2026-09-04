'use client';

import { useEffect, useMemo, useState } from 'react';

type Props = { onNavigate: (screen: string) => void };

type MerchItem = {
  id: string;
  name: string;
  sku: string;
  category: string;
  cost: number;
  price: number;
  inventory: number;
  reorderAt: number;
};

const categories = ['T-Shirt', 'Hoodie', 'Hat', 'Poster', 'Vinyl', 'CD', 'Sticker', 'Accessory', 'Bundle', 'Other'];

export default function MerchWorkspace({ onNavigate }: Props) {
  const [items, setItems] = useState<MerchItem[]>([]);
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [category, setCategory] = useState(categories[0]);
  const [cost, setCost] = useState('');
  const [price, setPrice] = useState('');
  const [inventory, setInventory] = useState('0');
  const [reorderAt, setReorderAt] = useState('10');

  useEffect(() => {
    try {
      const raw = localStorage.getItem('pie-merch-items-v1');
      const parsed = raw ? JSON.parse(raw) : [];
      setItems(Array.isArray(parsed) ? parsed : []);
    } catch {
      setItems([]);
    }
  }, []);

  function persist(next: MerchItem[]) {
    setItems(next);
    try { localStorage.setItem('pie-merch-items-v1', JSON.stringify(next)); } catch {}
  }

  function addItem() {
    if (!name.trim()) return;
    const next: MerchItem = {
      id: crypto.randomUUID(),
      name: name.trim(),
      sku: sku.trim(),
      category,
      cost: Math.max(0, Number(cost) || 0),
      price: Math.max(0, Number(price) || 0),
      inventory: Math.max(0, Math.floor(Number(inventory) || 0)),
      reorderAt: Math.max(0, Math.floor(Number(reorderAt) || 0)),
    };
    persist([next, ...items]);
    setName(''); setSku(''); setCost(''); setPrice(''); setInventory('0');
  }

  const summary = useMemo(() => {
    const units = items.reduce((sum, item) => sum + item.inventory, 0);
    const retailValue = items.reduce((sum, item) => sum + item.inventory * item.price, 0);
    const costValue = items.reduce((sum, item) => sum + item.inventory * item.cost, 0);
    const lowStock = items.filter((item) => item.inventory <= item.reorderAt).length;
    return { units, retailValue, costValue, lowStock };
  }, [items]);

  return (
    <main className="growthWorkspace">
      <section className="hero">
        <p className="eyebrow">Wear the Brand</p>
        <h1>Merch</h1>
        <p className="sub">Design, source, price, inventory, sell, fulfill, and measure merchandise tied to songs, releases, tours, campaigns, and the Pie brand.</p>
      </section>

      <section className="panel">
        <div className="controlGrid">
          <div className="statusBox"><small>PRODUCTS</small><strong>{items.length}</strong></div>
          <div className="statusBox"><small>UNITS ON HAND</small><strong>{summary.units.toLocaleString()}</strong></div>
          <div className="statusBox"><small>RETAIL VALUE</small><strong>${summary.retailValue.toLocaleString(undefined,{maximumFractionDigits:2})}</strong></div>
          <div className="statusBox"><small>LOW STOCK</small><strong>{summary.lowStock}</strong></div>
        </div>
      </section>

      <section className="panel">
        <p className="eyebrow">Quick Add</p>
        <h2>New Merch Product</h2>
        <div style={{display:'grid',gap:10}}>
          <div className="controlGrid">
            <label><span className="controlLabel">Product</span><input value={name} onChange={(event)=>setName(event.target.value)} placeholder="Pie logo tee" /></label>
            <label><span className="controlLabel">Category</span><select value={category} onChange={(event)=>setCategory(event.target.value)}>{categories.map((item)=><option key={item}>{item}</option>)}</select></label>
            <label><span className="controlLabel">SKU</span><input value={sku} onChange={(event)=>setSku(event.target.value)} placeholder="PIE-TEE-BLK-M" /></label>
            <label><span className="controlLabel">Inventory</span><input inputMode="numeric" value={inventory} onChange={(event)=>setInventory(event.target.value)} /></label>
            <label><span className="controlLabel">Unit cost</span><input inputMode="decimal" value={cost} onChange={(event)=>setCost(event.target.value)} placeholder="$12.00" /></label>
            <label><span className="controlLabel">Selling price</span><input inputMode="decimal" value={price} onChange={(event)=>setPrice(event.target.value)} placeholder="$30.00" /></label>
            <label><span className="controlLabel">Reorder at</span><input inputMode="numeric" value={reorderAt} onChange={(event)=>setReorderAt(event.target.value)} /></label>
          </div>
          <button type="button" className="primary" onClick={addItem}>＋ Add Product</button>
        </div>
      </section>

      {items.length > 0 && <section className="panel">
        <div className="songsSectionHead"><strong>Merch Catalog</strong><span>{items.length} products</span></div>
        <div style={{display:'grid',gap:8}}>
          {items.map((item)=>{
            const margin = item.price > 0 ? ((item.price-item.cost)/item.price)*100 : 0;
            const low = item.inventory <= item.reorderAt;
            return <article className="statusBox" key={item.id} style={{display:'grid',gap:5}}>
              <div style={{display:'flex',justifyContent:'space-between',gap:12}}><strong>{item.name}</strong><small>{item.category}</small></div>
              <small>{item.sku || 'No SKU'} · {item.inventory} on hand {low ? '· LOW STOCK' : ''}</small>
              <small>${item.cost.toFixed(2)} cost → ${item.price.toFixed(2)} retail · {Math.round(margin)}% gross margin</small>
              <div className="mixButtons"><button type="button" className="secondary" onClick={()=>persist(items.map((entry)=>entry.id===item.id?{...entry,inventory:entry.inventory+1}:entry))}>+1 Stock</button><button type="button" className="secondary" onClick={()=>persist(items.filter((entry)=>entry.id!==item.id))}>Remove</button></div>
            </article>;
          })}
        </div>
      </section>}

      <section className="growthCardGrid">
        <article className="panel growthFeatureCard"><strong>🎨 Product Designer</strong><small>Create merch concepts from Pie logos, song artwork, lyrics, campaigns, photos, and brand references. Track approved front/back designs and print-ready files.</small><button type="button" className="secondary">Open</button></article>
        <article className="panel growthFeatureCard"><strong>🏭 Suppliers + Print On Demand</strong><small>Compare blank products, printers, embroidery, vinyl/CD production, packaging, minimum orders, unit costs, lead times, and future print-on-demand connections.</small><button type="button" className="secondary">Open</button></article>
        <article className="panel growthFeatureCard"><strong>📦 Inventory</strong><small>Track sizes, colors, variants, locations, stock counts, reorder points, damaged units, reserved tour inventory, and incoming purchase orders.</small><button type="button" className="secondary">Open</button></article>
        <article className="panel growthFeatureCard"><strong>🛒 Store + Orders</strong><small>Future storefront and commerce connections can bring orders, customer details, taxes, shipping, discounts, bundles, and fulfillment status into Pie.</small><button type="button" className="secondary">Open</button></article>
        <article className="panel growthFeatureCard"><strong>🎟 Tour Merch</strong><small>Allocate inventory by show, record venue merch cuts, track cash/card sales, settlement, staff, best sellers, and remaining road stock.</small><button type="button" className="secondary" onClick={()=>onNavigate('travel')}>Travel / Tour</button></article>
        <article className="panel growthFeatureCard"><strong>📈 Merch Profitability</strong><small>Feed sales, product costs, fees, shipping, taxes, and inventory value into Accounting so Pie can calculate margin and profit by product, campaign, release, and tour.</small><button type="button" className="secondary" onClick={()=>onNavigate('accounting')}>Accounting</button></article>
        <article className="panel growthFeatureCard"><strong>📣 Merch Campaigns</strong><small>Tie drops, presales, limited editions, bundles, giveaways, fan segments, content calendars, and launch messaging directly to Marketing.</small><button type="button" className="secondary" onClick={()=>onNavigate('marketing')}>Marketing</button></article>
        <article className="panel growthFeatureCard"><strong>👥 Fan Orders</strong><small>Connect opted-in buyers back to the fan database for customer history, VIP/superfan segments, follow-up, and future releases.</small><button type="button" className="secondary" onClick={()=>onNavigate('marketing')}>Fan Database</button></article>
      </section>
    </main>
  );
}
