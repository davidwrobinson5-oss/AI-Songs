import { NextResponse } from 'next/server';

const BASE = 'https://apiv2.soundverse.ai';

type Tool = { id?: string; operation?: string; model?: string };

type Asset = {
  file_id?: string;
  id?: string;
  role?: string;
  name?: string;
  filename?: string;
  type?: string;
  mime_type?: string;
  [key: string]: unknown;
};

function safeRequestId(value: unknown) {
  const clean = String(value || '').replace(/[^A-Za-z0-9_.:-]/g, '').slice(0, 120);
  return clean || `${Date.now()}`;
}

async function getJson(apiKey: string, url: string) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
    cache: 'no-store',
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.message || data?.error || `Soundverse request failed (${response.status}).`);
  return data;
}

async function getToolId(apiKey: string, operation: string, model: string) {
  const data = await getJson(apiKey, `${BASE}/v1/tools`);
  const tools: Tool[] = Array.isArray(data) ? data : Array.isArray(data?.tools) ? data.tools : [];
  const tool = tools.find((item) => item.operation === operation && item.model === model);
  if (!tool?.id) throw new Error(`Soundverse ${operation} ${model} is not enabled.`);
  return tool.id;
}

function assetsFrom(data: any): Asset[] {
  if (Array.isArray(data?.output?.assets)) return data.output.assets;
  if (Array.isArray(data?.assets)) return data.assets;
  return [];
}

function assetFileId(asset: Asset) {
  return String(asset.file_id || asset.id || '');
}

function pickAudioAsset(assets: Asset[]) {
  return assets.find((asset) => assetFileId(asset)) || null;
}

async function signedDownload(apiKey: string, fileId: string) {
  const data = await getJson(apiKey, `${BASE}/v1/files/${encodeURIComponent(fileId)}/download`);
  const url = data?.download_url || data?.signed_url || data?.url;
  if (!url) throw new Error('Soundverse did not return a downloadable song URL.');
  return String(url);
}

async function startStemSplit(apiKey: string, songFileId: string, requestId: string) {
  const audioUrl = await signedDownload(apiKey, songFileId);
  const toolId = await getToolId(apiKey, 'separate_stems', '2stem');
  const response = await fetch(`${BASE}/v1/generations`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'Idempotency-Key': `ai-songs-stems-${safeRequestId(requestId)}`,
    },
    body: JSON.stringify({
      tool_id: toolId,
      license: 1,
      payload_json: JSON.stringify({ audio: { url: audioUrl } }),
    }),
    cache: 'no-store',
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.message || data?.error || 'Soundverse stem separation could not start.');
  const taskId = data?.task_id || data?.job_id || data?.id;
  if (!taskId) throw new Error('Soundverse did not return a stem-separation task ID.');
  return String(taskId);
}

function normalizedAssetText(asset: Asset) {
  return `${asset.role || ''} ${asset.name || ''} ${asset.filename || ''} ${asset.type || ''} ${asset.mime_type || ''} ${JSON.stringify(asset)}`.toLowerCase();
}

export async function GET(req: Request) {
  const apiKey = process.env.SOUNDVERSE_API_KEY?.trim();
  if (!apiKey) return NextResponse.json({ error: 'SOUNDVERSE_API_KEY is not configured.' }, { status: 503 });

  try {
    const url = new URL(req.url);
    const taskId = url.searchParams.get('taskId');
    const stage = url.searchParams.get('stage') || 'song';
    const requestId = safeRequestId(url.searchParams.get('requestId'));
    if (!taskId) return NextResponse.json({ error: 'taskId is required.' }, { status: 400 });

    const task = await getJson(apiKey, `${BASE}/v1/generations/${encodeURIComponent(taskId)}`);
    const status = String(task?.status || 'processing').toLowerCase();
    if (status === 'failed') {
      return NextResponse.json({ error: task?.error || task?.message || 'Soundverse generation failed.', detail: task }, { status: 502 });
    }
    if (status !== 'completed') {
      return NextResponse.json({ stage, taskId, status });
    }

    if (stage === 'song') {
      const songAsset = pickAudioAsset(assetsFrom(task));
      const songFileId = songAsset ? assetFileId(songAsset) : '';
      if (!songFileId) return NextResponse.json({ error: 'Soundverse song completed without an audio file.' }, { status: 502 });
      const stemTaskId = await startStemSplit(apiKey, songFileId, requestId);
      return NextResponse.json({ stage: 'stems', taskId: stemTaskId, status: 'queued', songFileId });
    }

    const assets = assetsFrom(task);
    const vocal = assets.find((asset) => /vocal/.test(normalizedAssetText(asset)) && !/instrumental|karaoke/.test(normalizedAssetText(asset)));
    const instrumental = assets.find((asset) => /instrumental|accompaniment|karaoke|music/.test(normalizedAssetText(asset)) && !/vocal/.test(normalizedAssetText(asset)));
    const fallback = assets.filter((asset) => assetFileId(asset));
    const vocalFileId = vocal ? assetFileId(vocal) : assetFileId(fallback[0] || {});
    const instrumentalFileId = instrumental ? assetFileId(instrumental) : assetFileId(fallback.find((asset) => assetFileId(asset) !== vocalFileId) || {});

    if (!vocalFileId || !instrumentalFileId) {
      return NextResponse.json({ error: 'Soundverse stem separation finished but both vocal and instrumental assets were not identifiable.', detail: task }, { status: 502 });
    }

    return NextResponse.json({
      stage: 'complete',
      status: 'completed',
      vocalFileId,
      instrumentalFileId,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not check Soundverse precision vocal status.' }, { status: 500 });
  }
}
