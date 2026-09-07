'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';

const stageNames = ['', 'Raw Talent', 'Hot Prospect', 'Talent Show Boss', 'Local Hero', 'Regional Hit', 'National Hitmaker', 'International Rock Star', 'World Legend'];
const starterPrompts = [
  'What should I do next?',
  'Build my plan for this week',
  'What am I missing before release?',
  'How do I grow from where I am now?',
];

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

const STORAGE_KEY = 'pie-ai-artist-manager-chat-v1';

export default function PieGuide() {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [usageLabel, setUsageLabel] = useState('');
  const [activeScreen, setActiveScreen] = useState('create');
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  // Until Clerk is explicitly re-enabled, preserve the existing beta experience
  // without requiring a ClerkProvider during server rendering.
  const level = 8;
  const stageName = useMemo(() => stageNames[level] || `Stage ${level}`, [level]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      const parsed = saved ? JSON.parse(saved) : [];
      if (Array.isArray(parsed)) {
        setMessages(parsed.filter((item) => item && (item.role === 'user' || item.role === 'assistant') && typeof item.content === 'string').slice(-40));
      }
      setActiveScreen(sessionStorage.getItem('pieActiveScreen') || 'create');
    } catch {}
  }, []);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-40))); } catch {}
    requestAnimationFrame(() => {
      const node = scrollerRef.current;
      if (node) node.scrollTop = node.scrollHeight;
    });
  }, [messages, open]);

  function newChat() {
    setMessages([]);
    setQuestion('');
    setUsageLabel('');
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  }

  async function askGuide(event?: FormEvent, promptOverride?: string) {
    event?.preventDefault();
    const text = (promptOverride ?? question).trim();
    if (!text || busy) return;

    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: text };
    const prior = messages.slice(-12).map(({ role, content }) => ({ role, content }));
    setMessages((current) => [...current, userMessage]);
    setQuestion('');
    setBusy(true);

    try {
      let screen = activeScreen;
      try { screen = sessionStorage.getItem('pieActiveScreen') || activeScreen; } catch {}
      setActiveScreen(screen);

      const response = await fetch('/api/guide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: text, messages: prior, activeScreen: screen }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Pie AI is unavailable right now.');

      setMessages((current) => [...current, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data.answer || 'No guidance was returned.',
      }]);

      if (data?.usage?.limit != null) setUsageLabel(`${data.usage.count}/${data.usage.limit} manager chats used`);
      else setUsageLabel('');
    } catch (error) {
      setMessages((current) => [...current, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: error instanceof Error ? error.message : 'Pie AI is unavailable right now.',
      }]);
    } finally {
      setBusy(false);
    }
  }

  return <>
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label="Open Pie AI Artist Manager"
      title="Pie AI Artist Manager"
      style={{position:'fixed',right:16,bottom:'calc(76px + env(safe-area-inset-bottom))',zIndex:19999,width:56,height:56,borderRadius:'50%',border:'1px solid rgba(255,255,255,.16)',background:'#7c3aed',color:'#fff',fontSize:25,boxShadow:'0 12px 30px rgba(0,0,0,.42)'}}
    >
      🥧
    </button>

    {open && <div role="dialog" aria-modal="true" aria-label="Pie AI Artist Manager" style={{position:'fixed',inset:0,zIndex:2147483500,background:'rgba(0,0,0,.72)',display:'flex',alignItems:'flex-end',justifyContent:'center',padding:10}}>
      <section style={{width:'min(760px,100%)',height:'min(88vh,760px)',display:'grid',gridTemplateRows:'auto auto 1fr auto',borderRadius:'24px 24px 18px 18px',background:'#111118',border:'1px solid rgba(255,255,255,.12)',color:'#fff',overflow:'hidden'}}>
        <header style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'flex-start',padding:'16px 16px 12px',borderBottom:'1px solid rgba(255,255,255,.08)'}}>
          <div>
            <div style={{fontSize:11,color:'#9b7cff',fontWeight:900,letterSpacing:'.1em'}}>PIE AI</div>
            <h2 style={{margin:'4px 0 2px'}}>Your AI Artist Manager</h2>
            <div style={{color:'#9899a8',fontSize:12}}>Stage {level} · {stageName} · {activeScreen}</div>
          </div>
          <div style={{display:'flex',gap:6}}>
            <button type="button" onClick={newChat} className="secondary" style={{padding:'7px 10px',fontSize:12}}>＋ New Chat</button>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close Pie AI" style={{border:0,background:'transparent',color:'#aaa9bd',fontSize:26,lineHeight:1}}>×</button>
          </div>
        </header>

        {messages.length === 0 && <div style={{padding:'14px 16px 4px'}}>
          <p style={{color:'#a8a9b6',fontSize:13,lineHeight:1.5,margin:'0 0 10px'}}>Ask Pie anything about your music career, release, songs, marketing, gigs, business, fan growth, analytics, or what to do next. Pie AI can use your current Pie context to keep the advice connected to your actual work.</p>
          <div style={{display:'flex',gap:7,flexWrap:'wrap'}}>{starterPrompts.map((prompt) => <button key={prompt} type="button" onClick={() => void askGuide(undefined, prompt)} className="secondary">{prompt}</button>)}</div>
        </div>}

        <div ref={scrollerRef} style={{overflowY:'auto',padding:'14px 14px 18px',display:'flex',flexDirection:'column',gap:10}}>
          {messages.map((message) => (
            <div key={message.id} style={{alignSelf:message.role === 'user' ? 'flex-end' : 'flex-start',maxWidth:'88%',padding:'11px 13px',borderRadius:16,background:message.role === 'user' ? '#6d28d9' : '#0c0d14',border:message.role === 'user' ? '1px solid #7c3aed' : '1px solid #292a36',whiteSpace:'pre-wrap',fontSize:13,lineHeight:1.55}}>
              {message.content}
            </div>
          ))}
          {busy && <div style={{alignSelf:'flex-start',padding:'11px 13px',borderRadius:16,background:'#0c0d14',border:'1px solid #292a36',fontSize:13,color:'#c5c6d0'}}>Pie is thinking…</div>}
        </div>

        <form onSubmit={(event) => void askGuide(event)} style={{padding:12,borderTop:'1px solid rgba(255,255,255,.08)',display:'grid',gap:8,background:'#0d0e14'}}>
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Message your AI artist manager…"
            style={{minHeight:78,maxHeight:180,resize:'vertical'}}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void askGuide();
              }
            }}
          />
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:10}}>
            <small style={{color:'#777988'}}>{usageLabel || 'Pie AI uses your included Pie credits.'}</small>
            <button type="submit" className="primary" disabled={busy || !question.trim()}>{busy ? 'Thinking…' : 'Send'}</button>
          </div>
        </form>
      </section>
    </div>}
  </>;
}
