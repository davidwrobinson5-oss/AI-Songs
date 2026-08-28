'use client';

import { InviteMembersButton, OrganizationSwitcher, useOrganization, useOrganizationList, useUser } from '@clerk/nextjs';
import { useEffect, useMemo, useState } from 'react';

type BandPost = {
  id: string;
  authorId: string;
  authorName: string;
  authorImage?: string;
  kind: 'idea' | 'song' | 'lyrics' | 'arrangement' | 'mix';
  body: string;
  projectTitle?: string;
  parentId?: string;
  createdAt: string;
};

type BandMember = { userId: string; name: string; role: string; imageUrl?: string };
type BandData = { active: boolean; band?: { id: string; name: string }; posts: BandPost[]; members: BandMember[] };

type Props = {
  currentSongTitle: string;
  currentPrompt: string;
  onBuild: (title: string, prompt: string) => void;
};

const KINDS: Array<{ value: BandPost['kind']; label: string; icon: string }> = [
  { value: 'idea', label: 'Idea', icon: '💡' },
  { value: 'song', label: 'Song', icon: '🎵' },
  { value: 'lyrics', label: 'Lyrics', icon: '✍️' },
  { value: 'arrangement', label: 'Arrangement', icon: '🎼' },
  { value: 'mix', label: 'Mix', icon: '🎚️' },
];

function BandMark({ large = false }: { large?: boolean }) {
  return (
    <svg className={large ? 'bandMark bandMarkLarge' : 'bandMark'} viewBox="0 0 64 64" aria-hidden="true">
      <defs><linearGradient id="bandGradient" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ff4e8a"/><stop offset=".48" stopColor="#9b5cff"/><stop offset="1" stopColor="#4de1ff"/></linearGradient></defs>
      <circle cx="18" cy="25" r="7" fill="url(#bandGradient)"/><circle cx="32" cy="18" r="8" fill="url(#bandGradient)"/><circle cx="46" cy="25" r="7" fill="url(#bandGradient)"/>
      <path d="M7 48c1-9 5-14 11-14s10 5 11 14M22 48c1-12 4-19 10-19s9 7 10 19M35 48c1-9 5-14 11-14s10 5 11 14" fill="none" stroke="url(#bandGradient)" strokeWidth="5" strokeLinecap="round"/>
      <path d="M48 8v17.5a5.5 5.5 0 1 1-4-5.3V12l12-3v13.5a5.5 5.5 0 1 1-4-5.3V8z" fill="#fff" opacity=".94"/>
    </svg>
  );
}

export default function BandWorkspace({ currentSongTitle, currentPrompt, onBuild }: Props) {
  const { isSignedIn } = useUser();
  const { organization, membership } = useOrganization();
  const { isLoaded, createOrganization, setActive, userInvitations, userMemberships } = useOrganizationList({
    userInvitations: { status: 'pending', infinite: true },
    userMemberships: { infinite: true },
  });
  const [data, setData] = useState<BandData>({ active: false, posts: [], members: [] });
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [bandName, setBandName] = useState('');
  const [kind, setKind] = useState<BandPost['kind']>('idea');
  const [draft, setDraft] = useState('');
  const [parent, setParent] = useState<BandPost | null>(null);

  const isAdmin = membership?.role === 'org:admin';
  const postsById = useMemo(() => new Map(data.posts.map((post) => [post.id, post])), [data.posts]);

  async function refresh() {
    if (!organization?.id) {
      setData({ active: false, posts: [], members: [] });
      return;
    }
    setLoading(true);
    try {
      const response = await fetch('/api/band', { cache: 'no-store' });
      const next = await response.json();
      if (!response.ok) throw new Error(next.error || 'Could not load the band.');
      setData(next);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not load the band.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); }, [organization?.id]);

  async function createBand() {
    const name = bandName.trim();
    if (!name || !createOrganization || !setActive) return;
    setLoading(true); setStatus('Creating band…');
    try {
      const created = await createOrganization({ name });
      await setActive({ organization: created.id });
      setBandName('');
      setStatus('Band created. Invite your bandmates when ready.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not create the band. Clerk Organizations may need to be enabled.');
    } finally { setLoading(false); }
  }

  async function acceptInvitation(invitation: NonNullable<typeof userInvitations>['data'][number]) {
    setLoading(true); setStatus('Joining band…');
    try {
      await invitation.accept();
      await setActive?.({ organization: invitation.publicOrganizationData.id });
      setStatus(`Joined ${invitation.publicOrganizationData.name}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not accept the invitation.');
    } finally { setLoading(false); }
  }

  async function postContribution(body = draft, postKind = kind, projectTitle = '') {
    const clean = body.trim();
    if (!clean || !organization?.id || loading) return;
    setLoading(true); setStatus('Sharing with the band…');
    try {
      const response = await fetch('/api/band', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'post', kind: postKind, body: clean, projectTitle, parentId: parent?.id || '' }),
      });
      const next = await response.json();
      if (!response.ok) throw new Error(next.error || 'Could not share this contribution.');
      setDraft(''); setParent(null); setStatus('Shared with the band.');
      await refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not share this contribution.');
    } finally { setLoading(false); }
  }

  function startBuild(post: BandPost) {
    setParent(post);
    setKind(post.kind);
    setDraft(post.body);
    document.querySelector('.bandComposer')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  if (!isSignedIn) {
    return <section className="panel bandWorkspace"><div className="bandEmpty"><BandMark large/><h2>Band requires an individual account</h2><p>Sign in with your AI Songs account so invitations and band membership can be verified.</p></div></section>;
  }

  if (!organization) {
    const memberships = userMemberships?.data || [];
    const invitations = userInvitations?.data || [];
    return (
      <section className="panel bandWorkspace">
        <div className="bandWelcome">
          <BandMark large />
          <p className="eyebrow">BAND COLLABORATION</p>
          <h2>Create together.</h2>
          <p className="sub">A Band is an invitation-only team workspace. Every member keeps their own account while collaborating inside the shared Band.</p>
        </div>
        {invitations.length > 0 && <div className="bandInvites"><strong>Band invitations</strong>{invitations.map((invitation) => <button key={invitation.id} onClick={() => void acceptInvitation(invitation)} disabled={loading}><span><b>{invitation.publicOrganizationData.name}</b><small>Invited as {invitation.role.replace('org:', '')}</small></span><em>Join</em></button>)}</div>}
        {memberships.length > 0 && <div className="bandExisting"><strong>Your Bands</strong>{memberships.map((item) => <button key={item.id} onClick={() => void setActive?.({ organization: item.organization.id })}><span>{item.organization.name}</span><b>Open ›</b></button>)}</div>}
        <div className="bandCreateCard"><strong>Start a new Band</strong><input value={bandName} onChange={(event) => setBandName(event.target.value)} maxLength={80} placeholder="Band name"/><button className="primary" onClick={() => void createBand()} disabled={!isLoaded || loading || !bandName.trim()}>Create Band</button></div>
        {status && <div className="statusBox">{status}</div>}
      </section>
    );
  }

  return (
    <section className="bandWorkspace">
      <div className="bandHeaderCard">
        <div className="bandHeaderIdentity"><BandMark/><div><p className="eyebrow">BAND WORKSPACE</p><h2>{organization.name}</h2><small>{data.members.length || organization.membersCount || 1} member{(data.members.length || organization.membersCount || 1) === 1 ? '' : 's'} · {membership?.role === 'org:admin' ? 'Admin' : 'Member'}</small></div></div>
        <div className="bandHeaderActions"><OrganizationSwitcher />{isAdmin && <InviteMembersButton><button className="bandInviteButton">＋ Invite</button></InviteMembersButton>}</div>
      </div>

      <div className="bandMemberRail">{data.members.map((member) => <div className="bandMember" key={member.userId}>{member.imageUrl ? <img src={member.imageUrl} alt=""/> : <span>{member.name.slice(0,1).toUpperCase()}</span>}<small>{member.name.split(' ')[0]}{member.role === 'org:admin' ? ' · admin' : ''}</small></div>)}</div>

      <div className="bandComposer panel">
        <div className="bandComposerTop"><div><p className="eyebrow">CONTRIBUTE</p><h2>{parent ? 'Build on this idea' : 'Share with the Band'}</h2></div>{parent && <button className="bandCancelBuild" onClick={() => { setParent(null); setDraft(''); }}>×</button>}</div>
        {parent && <div className="bandParentPreview">Building on <b>{parent.authorName}</b>: “{parent.body.slice(0,110)}{parent.body.length > 110 ? '…' : ''}”</div>}
        <div className="bandKindRail">{KINDS.map((item) => <button key={item.value} className={kind === item.value ? 'activeBandKind' : ''} onClick={() => setKind(item.value)}>{item.icon} {item.label}</button>)}</div>
        <textarea value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={320} placeholder="Share a hook idea, lyric change, arrangement thought, production note, or next direction…" />
        <div className="bandComposerActions"><button className="secondary" disabled={!currentPrompt.trim() || loading} onClick={() => void postContribution(currentPrompt, 'song', currentSongTitle)}>Share Current Project</button><button className="primary" disabled={!draft.trim() || loading} onClick={() => void postContribution()}>{loading ? 'Sharing…' : parent ? 'Add Your Build' : 'Post to Band'}</button></div>
      </div>

      <div className="bandFeedHead"><div><p className="eyebrow">SHARED WORK</p><h2>Band Board</h2></div><button onClick={() => void refresh()} disabled={loading}>↻</button></div>
      <div className="bandFeed">
        {data.posts.length === 0 && <div className="bandEmptyFeed"><BandMark/><strong>Start the first idea</strong><small>Post a hook, lyric, arrangement, mix note, or share your current song direction.</small></div>}
        {data.posts.map((post) => {
          const parentPost = post.parentId ? postsById.get(post.parentId) : undefined;
          const item = KINDS.find((candidate) => candidate.value === post.kind) || KINDS[0];
          return <article className="bandPost" key={post.id}>
            <div className="bandPostTop"><span className="bandPostAvatar">{post.authorImage ? <img src={post.authorImage} alt=""/> : post.authorName.slice(0,1).toUpperCase()}</span><div><strong>{post.authorName}</strong><small>{new Date(post.createdAt).toLocaleString()}</small></div><b>{item.icon} {item.label}</b></div>
            {parentPost && <div className="bandBuildLine">↳ Built on {parentPost.authorName}’s contribution</div>}
            {post.projectTitle && <h3>{post.projectTitle}</h3>}
            <p>{post.body}</p>
            <div className="bandPostActions"><button onClick={() => startBuild(post)}>＋ Build on this</button><button onClick={() => onBuild(post.projectTitle || `Build on ${post.authorName}`, post.body)}>↗ Open in Studio</button></div>
          </article>;
        })}
      </div>
      {status && <div className="statusBox bandStatus">{status}</div>}
    </section>
  );
}
