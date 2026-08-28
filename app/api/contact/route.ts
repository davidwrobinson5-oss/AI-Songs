import { NextResponse } from 'next/server';
import { rateLimit, readJsonObject, safeClientError, textField } from '../../security';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cleanEmail(value: unknown) {
  const email = textField(value, 254).toLowerCase();
  if (!EMAIL_RE.test(email)) throw new Error('INVALID_EMAIL');
  return email;
}

export async function POST(req: Request) {
  const limited = rateLimit(req, 'contact', 5, 15 * 60_000);
  if (limited) return limited;

  try {
    const body = await readJsonObject(req, 24_000);
    const kind = textField(body.kind, 24);
    if (!['access', 'support'].includes(kind)) throw new Error('INVALID_KIND');

    // Honeypot for basic bot filtering. Legitimate clients leave this blank.
    const website = textField(body.website, 200);
    if (website) return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });

    const email = cleanEmail(body.email);
    const name = textField(body.name, 80);
    const subject = textField(body.subject, 120);
    const message = textField(body.message, 2500);

    const apiKey = process.env.RESEND_API_KEY?.trim();
    const supportEmail = process.env.AI_SONGS_SUPPORT_EMAIL?.trim();
    const fromEmail = process.env.AI_SONGS_FROM_EMAIL?.trim() || 'AI Songs <onboarding@resend.dev>';

    if (!apiKey || !supportEmail) {
      console.error('AI Songs contact email is not configured');
      return NextResponse.json(
        { error: 'Support email is not configured yet.' },
        { status: 503, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const title = kind === 'access' ? 'New AI Songs access request' : `AI Songs support request${subject ? `: ${subject}` : ''}`;
    const text = [
      kind === 'access' ? 'A new user requested access to AI Songs.' : 'A user submitted an AI Songs support request.',
      '',
      `Name: ${name || 'Not provided'}`,
      `Email: ${email}`,
      ...(subject ? [`Subject: ${subject}`] : []),
      '',
      message || (kind === 'access' ? 'No additional message.' : 'No message provided.'),
      '',
      'Open Clerk Dashboard to review/invite access requests.',
    ].join('\n');

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [supportEmail],
        reply_to: email,
        subject: title,
        text,
      }),
      cache: 'no-store',
    });

    if (!response.ok) {
      const detail = (await response.text().catch(() => '')).slice(0, 600);
      console.error('Resend contact notification failed', response.status, detail);
      return NextResponse.json(
        { error: 'Your request could not be delivered right now.' },
        { status: 502, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const clientError = error instanceof Error && error.message === 'INVALID_EMAIL'
      ? 'Enter a valid email address.'
      : safeClientError(error, 'Please check the form and try again.');

    return NextResponse.json(
      { error: clientError },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
