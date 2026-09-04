import OpenAI from 'openai';
import { NextResponse } from 'next/server';
import { rateLimit, readJsonObject, safeClientError, textField } from '../../security';

const stageContext: Record<number,string> = {
  1: 'Raw Talent: experimenting, creating songs, and learning a repeatable creative workflow.',
  2: 'Hot Prospect: preparing a real release with ownership, calendar, assets, and a clear plan.',
  3: 'Talent Show Boss: prelaunch audience building, content, fan capture, media, video, and merch prep.',
  4: 'Local Hero: launch execution, distribution, outreach, release-day coordination, and local momentum.',
  5: 'Regional Hit: sustained campaigns, analytics, business discipline, accounting, and profitable repeatable promotion.',
  6: 'National Hitmaker: gigs, touring, live revenue, booking, band operations, travel, and market expansion.',
  7: 'International Rock Star: scaling from local/regional success into national markets with a team and repeatable operations.',
  8: 'World Legend: international campaigns, touring, rights, partnerships, and market-by-market global operations.',
};

function fallback(level: number) {
  const next = Math.min(8, level + 1);
  return `Focus on the next measurable outcome for Stage ${level}.\n\n1. Finish the single highest-priority task that moves the current release or business objective forward.\n2. Update your calendar and contact pipeline so every next action has an owner and date.\n3. Review what is required to reach Stage ${next} and close the biggest gap first.\n\nUse the Data, Marketing, Calendar, Gigs, Business, and Live Support tools when the next step requires contacts, promotion, scheduling, revenue, operations, or professional help.`;
}

export async function POST(req: Request) {
  const limited = rateLimit(req, 'pie-guide', 20, 60_000);
  if (limited) return limited;
  try {
    const body = await readJsonObject(req, 16_000);
    const question = textField(body.question, 5_000);
    const level = Math.max(1, Math.min(8, Number(body.level) || 1));
    const stageName = textField(body.stageName, 100, `Stage ${level}`);
    if (!question) return NextResponse.json({ error: 'Ask the Pie Guide a question.' }, { status: 400 });
    if (!process.env.OPENAI_API_KEY) return NextResponse.json({ answer: fallback(level) });

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await client.responses.create({
      model: process.env.OPENAI_TEXT_MODEL || 'gpt-5.6',
      max_output_tokens: 1100,
      input: [
        { role: 'system', content: `You are Pie Guide, an AI artist-manager and business coach inside a music platform. The user's current business stage is ${level}: ${stageName}. ${stageContext[level] || ''} Give practical, prioritized guidance. Prefer 3-5 concrete next actions, explain why each matters, and point to relevant Pie areas such as Music, Songs, Video, Marketing, Data, Merch, Gigs, Calendar, Travel, Business, Accounting, Licensing, Legal, Band, or Live Support. Do not pretend to be a lawyer, accountant, booking agent, or tax professional; for regulated or professional matters, recommend Pie Live Support route the user to qualified professionals. Do not promise guaranteed success, chart placement, or industry access. Keep the answer concise and action-oriented.` },
        { role: 'user', content: question },
      ],
    });
    return NextResponse.json({ answer: response.output_text.trim() || fallback(level) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ error: safeClientError(error, 'Pie Guide failed.') }, { status: 400 });
  }
}
