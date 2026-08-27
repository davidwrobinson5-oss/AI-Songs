import { NextResponse } from 'next/server';

const BASE = 'https://apiv2.soundverse.ai';

export async function GET() {
  const apiKey = process.env.SOUNDVERSE_API_KEY?.trim();
  if (!apiKey) return NextResponse.json({ error: 'SOUNDVERSE_API_KEY is not configured.' }, { status: 503 });

  const response = await fetch(`${BASE}/v1/tools`, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
    cache: 'no-store',
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return NextResponse.json(data, { status: response.status });

  const raw = Array.isArray(data) ? data : Array.isArray(data?.tools) ? data.tools : [];
  const tools = raw
    .filter((tool: any) => {
      const text = JSON.stringify(tool).toLowerCase();
      return text.includes('melody_to_song') || text.includes('generate_singing') || text.includes('stem');
    })
    .map((tool: any) => ({
      id: tool.id || tool.tool_id || tool.toolId,
      name: tool.name,
      model: tool.model,
      operation: tool.operation,
      schema: tool.schema || tool.input_schema || tool.inputSchema || tool.payload_schema || tool.payloadSchema,
      raw: tool,
    }));

  return NextResponse.json({ tools });
}
