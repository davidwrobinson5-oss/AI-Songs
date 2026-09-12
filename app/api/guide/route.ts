import { createProviderFetch } from '../../providerFetch';
import OpenAI from 'openai';
import { NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';
import { rateLimit, readJsonObject, safeClientError, textField } from '../../security';
import { consumeUsage, resolvePieUserId, usageDeniedMessage } from '../../usageEntitlements';
import { TRIAL_LIMITS } from '../../billingConfig';
import { getPieContextSnapshot } from '../../pieContext';

import { hasOwnerAccess } from '../../ownerAccess';
import { pieDeploymentTarget } from '../../deploymentEnvironment';

const stageContext: Record<number, string> = {
  1: 'Raw Talent: experimenting, creating songs, and learning a repeatable creative workflow.',
  2: 'Hot Prospect: preparing a real release with ownership, calendar, assets, and a clear plan.',
  3: 'Talent Show Boss: prelaunch audience building, content, fan capture, media, video, and merch prep.',
  4: 'Local Hero: launch execution, distribution, outreach, release-day coordination, and local momentum.',
  5: 'Regional Hit: sustained campaigns, analytics, business discipline, accounting, and profitable repeatable promotion.',
  6: 'National Hitmaker: gigs, touring, live revenue, booking, band operations, travel, and market expansion.',
  7: 'International Rock Star: scaling from local/regional success into national markets with a team and repeatable operations.',
  8: 'World Legend: international campaigns, touring, rights, partnerships, and market-by-market global operations.',
};

const stageNames = ['', 'Raw Talent', 'Hot Prospect', 'Talent Show Boss', 'Local Hero', 'Regional Hit', 'National Hitmaker', 'International Rock Star', 'World Legend'];

type HistoryMessage = { role: 'user' | 'assistant'; content: string };

function fallback(level: number, context: any) {
  const next = Math.min(8, level + 1);
  const score = context?.score?.current ?? 0;
  return `Focus on the next measurable outcome for Stage ${level}.\n\n1. Finish the single highest-priority task that moves the current release or business objective forward.\n2. Close the weakest Pie Score dimension before adding more activity. Your current score is ${score}/1000.\n3. Review what is required to reach Stage ${next} and close the biggest gap first.\n\nUse Data, Marketing, Calendar, Gigs, Business, Accounting, Legal, and Live Support when the next step requires contacts, promotion, scheduling, revenue, rights, or professional help.`;
}

async function serverStage() {
  if (hasOwnerAccess(await resolvePieUserId(), pieDeploymentTarget())) return { level: 8, name: stageNames[8] };
  const user = await currentUser().catch(() => null);
  if (!user) return { level: 1, name: stageNames[1] };
  const p = (user.publicMetadata || {}) as Record<string, unknown>;
  const u = (user.unsafeMetadata || {}) as Record<string, unknown>;
  const hasProfile = Boolean(p.pieOnboardingCompleted || p.piePlanLevel || u.pieOnboardingStartedAt || u.pieOnboardingCompleted);
  if (!hasProfile) return { level: 8, name: stageNames[8] };
  const status = String(p.pieSubscriptionStatus || 'free').toLowerCase();
  const inactive = ['past_due', 'canceled', 'cancelled', 'unpaid', 'incomplete_expired'].includes(status);
  const level = inactive ? 1 : Math.max(1, Math.min(8, Number(p.piePlanLevel || 1)));
  return { level, name: stageNames[level] || `Stage ${level}` };
}

function readHistory(value: unknown): HistoryMessage[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(-12)
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const role = (item as Record<string, unknown>).role;
      const raw = (item as Record<string, unknown>).content;
      if ((role !== 'user' && role !== 'assistant') || typeof raw !== 'string') return null;
      const content = raw.trim().slice(0, 5000);
      if (!content) return null;
      return { role, content } as HistoryMessage;
    })
    .filter((item): item is HistoryMessage => Boolean(item));
}

export async function POST(req: Request) {
  const limited = rateLimit(req, 'pie-guide', 30, 60_000);
  if (limited) return limited;

  try {
    const body = await readJsonObject(req, 70_000);
    const question = textField(body.question, 5_000);
    if (!question) return NextResponse.json({ error: 'Ask your Pie AI Artist Manager a question.' }, { status: 400 });

    const history = readHistory(body.messages);
    const activeScreen = textField(body.activeScreen, 80) || 'unknown';
    const [{ level, name }, context] = await Promise.all([serverStage(), getPieContextSnapshot()]);

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ answer: fallback(level, context), contextUsed: Boolean(context), stage: { level, name } });
    }

    const entitlement = await consumeUsage('artist_manager_chat', TRIAL_LIMITS.otherMeteredAiJobsTotal);
    if (!entitlement.allowed) {
      return NextResponse.json({ error: usageDeniedMessage('Pie AI Artist Manager', entitlement) }, { status: 403 });
    }

    const client = new OpenAI({fetch:createProviderFetch('guide'), apiKey: process.env.OPENAI_API_KEY });
    const compactContext = JSON.stringify(context || {}).slice(0, 9000);
    const response = await client.responses.create({
      model: process.env.OPENAI_TEXT_MODEL || 'gpt-5.6',
      max_output_tokens: 1800,
      input: [
        {
          role: 'system',
          content: `You are Pie AI, the user's conversational AI artist manager inside the Pie music-business platform. The server-verified business stage is ${level}: ${name}. ${stageContext[level] || ''}\n\nThe user is currently working in the Pie workspace: ${activeScreen}.\n\nCurrent Pie operating snapshot: ${compactContext}\n\nAct like a capable long-term artist manager and operator, not a generic chatbot. Use the Pie snapshot when it is relevant, but never invent missing facts. You can help with songwriting strategy, releases, marketing, content, fan growth, gigs, touring, partnerships, sponsorships, budgeting, business planning, rights organization, analytics, and prioritization. Keep continuity with the conversation history. When the user asks what to do next, prioritize the few highest-value actions rather than producing busywork. When useful, point to the exact Pie workspace that should be used next. Distinguish facts from estimates and recommendations. Do not promise guaranteed success, chart placement, industry access, ad returns, bookings, or revenue. Do not present yourself as a lawyer, accountant, doctor, or other licensed professional; for consequential legal, tax, or regulated matters, explain the limit and recommend qualified professional review. Be concise by default, but expand when the user asks for detail.`,
        },
        ...history,
        { role: 'user', content: question },
      ],
    });

    return NextResponse.json(
      {
        answer: response.output_text.trim() || fallback(level, context),
        contextUsed: Boolean(context),
        stage: { level, name },
        usage: { count: entitlement.usageCount, limit: entitlement.usageLimit },
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return NextResponse.json({ error: safeClientError(error, 'Pie AI Artist Manager failed.') }, { status: 400 });
  }
}
