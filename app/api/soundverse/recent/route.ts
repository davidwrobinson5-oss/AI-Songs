import { NextResponse } from 'next/server';

const BASE = 'https://apiv2.soundverse.ai';

function sanitizeAsset(asset: any) {
  return {
    keys: asset && typeof asset === 'object' ? Object.keys(asset) : [],
    id: asset?.id ?? null,
    file_id: asset?.file_id ?? null,
    blob_hash: asset?.blob_hash ?? null,
    role: asset?.role ?? null,
    name: asset?.name ?? null,
    filename: asset?.filename ?? null,
    type: asset?.type ?? null,
    mime_type: asset?.mime_type ?? null,
    has_url: Boolean(asset?.url),
  };
}

export async function GET() {
  const apiKey = process.env.SOUNDVERSE_API_KEY?.trim();
  if (!apiKey) return NextResponse.json({ error: 'SOUNDVERSE_API_KEY is not configured.' }, { status: 503 });

  try {
    const response = await fetch(`${BASE}/v1/generations`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
      cache: 'no-store',
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return NextResponse.json({ error: data?.message || data?.error || 'Could not load Soundverse generations.' }, { status: response.status });
    }

    const raw = Array.isArray(data) ? data : Array.isArray(data?.generations) ? data.generations : Array.isArray(data?.items) ? data.items : [];
    const recent = raw.slice(0, 10).map((item: any) => ({
      id: item?.id || item?.task_id || item?.job_id,
      status: item?.status,
      tool_id: item?.tool_id,
      operation: item?.operation,
      model: item?.model,
      error: item?.error || item?.error_message || item?.message || item?.detail || item?.output?.error || item?.output?.message || null,
      created_at: item?.created_at || item?.createdAt || null,
    }));

    const latestCompleted = recent.find((item: any) => item.status === 'completed' && item.id);
    let completedShape: any = null;
    if (latestCompleted?.id) {
      const detailResponse = await fetch(`${BASE}/v1/generations/${encodeURIComponent(String(latestCompleted.id))}`, {
        headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
        cache: 'no-store',
      });
      const detail = await detailResponse.json().catch(() => ({}));
      if (detailResponse.ok) {
        const assets = Array.isArray(detail?.output?.assets) ? detail.output.assets : Array.isArray(detail?.assets) ? detail.assets : [];
        completedShape = {
          id: latestCompleted.id,
          top_level_keys: detail && typeof detail === 'object' ? Object.keys(detail) : [],
          output_keys: detail?.output && typeof detail.output === 'object' ? Object.keys(detail.output) : [],
          assets: assets.map(sanitizeAsset),
        };
      }
    }

    return NextResponse.json({ recent, completedShape });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not inspect Soundverse generations.' }, { status: 500 });
  }
}
