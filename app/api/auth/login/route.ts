import { NextResponse } from 'next/server';
import { authConfigured, createSessionToken, securePasswordMatches, SESSION_COOKIE, SESSION_SECONDS } from '../../../auth';
import { rateLimit, readJsonObject, safeClientError, textField } from '../../../security';

export async function POST(req: Request) {
  const limited = rateLimit(req, 'studio-login', 6, 15 * 60_000);
  if (limited) return limited;

  if (!authConfigured()) {
    return NextResponse.json({ error: 'Studio login has not been configured yet.' }, { status: 503 });
  }

  try {
    const body = await readJsonObject(req, 4_096);
    const password = textField(body.password, 256);
    const expected = process.env.AI_SONGS_PASSWORD || '';
    const matches = await securePasswordMatches(password, expected);

    if (!matches) {
      return NextResponse.json({ error: 'Incorrect studio password.' }, { status: 401 });
    }

    const secret = process.env.AI_SONGS_SESSION_SECRET || '';
    const token = await createSessionToken(secret);
    const response = NextResponse.json({ ok: true });
    response.cookies.set({
      name: SESSION_COOKIE,
      value: token,
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/',
      maxAge: SESSION_SECONDS,
      priority: 'high',
    });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: safeClientError(error, 'Could not sign in.') }, { status: 400 });
  }
}
