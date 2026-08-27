import { NextResponse } from 'next/server';

const BASE = 'https://apiv2.soundverse.ai';

type Asset = {
  file_id?: string;
  blob_hash?: string;
  url?: string;
  mime_type?: string;
};

async function findAsset(apiKey: string, fileId: string): Promise<Asset | null> {
  const listRes = await fetch(`${BASE}/v1/generations`, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
    cache: 'no-store',
  });
  const list = await listRes.json().catch(() => ({}));
  if (!listRes.ok) return null;

  const items = Array.isArray(list)
    ? list
    : Array.isArray(list?.generations)
      ? list.generations
      : Array.isArray(list?.items)
        ? list.items
        : [];

  for (const item of items.slice(0, 20)) {
    const id = item?.id || item?.task_id || item?.job_id;
    if (!id || String(item?.status || '').toLowerCase() !== 'completed') continue;

    const detailRes = await fetch(`${BASE}/v1/generations/${encodeURIComponent(String(id))}`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
      cache: 'no-store',
    });
    const detail = await detailRes.json().catch(() => ({}));
    if (!detailRes.ok) continue;

    const assets: Asset[] = Array.isArray(detail?.output?.assets)
      ? detail.output.assets
      : Array.isArray(detail?.assets)
        ? detail.assets
        : [];
    const match = assets.find((asset) => String(asset?.file_id || '') === fileId);
    if (match) return match;
  }

  return null;
}

async function tryDownloadIdentifier(apiKey: string, identifier: string) {
  const response = await fetch(`${BASE}/v1/files/${encodeURIComponent(identifier)}/download`, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
    cache: 'no-store',
  });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

async function proxyAudio(url: string, apiKey: string, mimeType?: string) {
  const attempts = [
    { Authorization: `Bearer ${apiKey}` },
    {},
  ];

  for (const headers of attempts) {
    const audioRes = await fetch(url, { headers, cache: 'no-store' });
    if (!audioRes.ok) continue;
    const contentType = audioRes.headers.get('content-type') || mimeType || 'audio/mpeg';
    if (!contentType.startsWith('audio/') && !contentType.includes('octet-stream')) continue;
    const bytes = await audioRes.arrayBuffer();
    if (!bytes.byteLength) continue;
    return new NextResponse(bytes, {
      headers: {
        'Content-Type': contentType.startsWith('audio/') ? contentType : (mimeType || 'audio/mpeg'),
        'Cache-Control': 'no-store',
        'Content-Length': String(bytes.byteLength),
      },
    });
  }

  return null;
}

async function proxySignedLink(link: any, apiKey: string, mimeType?: string) {
  const signedUrl = link?.download_url || link?.signed_url || link?.url;
  if (!signedUrl) return null;
  return proxyAudio(String(signedUrl), apiKey, mimeType);
}

export async function GET(req: Request) {
  const apiKey = process.env.SOUNDVERSE_API_KEY?.trim();
  if (!apiKey) return NextResponse.json({ error: 'SOUNDVERSE_API_KEY is not configured.' }, { status: 503 });

  try {
    const fileId = new URL(req.url).searchParams.get('fileId');
    if (!fileId) return NextResponse.json({ error: 'fileId is required.' }, { status: 400 });

    // Preferred documented download endpoint using file_id.
    const fileAttempt = await tryDownloadIdentifier(apiKey, fileId);
    if (fileAttempt.response.ok) {
      const proxied = await proxySignedLink(fileAttempt.body, apiKey);
      if (proxied) return proxied;
    }

    const asset = await findAsset(apiKey, fileId);

    // Some completed Soundverse assets also expose a durable blob_hash. If the
    // file_id lookup returns NOT_FOUND, try that identifier before falling back
    // to the private asset locator.
    let blobStatus: number | null = null;
    if (asset?.blob_hash) {
      const blobAttempt = await tryDownloadIdentifier(apiKey, asset.blob_hash);
      blobStatus = blobAttempt.response.status;
      if (blobAttempt.response.ok) {
        const proxied = await proxySignedLink(blobAttempt.body, apiKey, asset.mime_type);
        if (proxied) return proxied;
      }
    }

    // Last-resort server-side attempt against the private storage locator.
    if (asset?.url) {
      const proxied = await proxyAudio(String(asset.url), apiKey, asset.mime_type);
      if (proxied) return proxied;
    }

    return NextResponse.json(
      {
        error: 'Could not download Soundverse audio.',
        fileDownloadStatus: fileAttempt.response.status,
        blobDownloadStatus: blobStatus,
        assetFound: Boolean(asset),
        assetHasUrl: Boolean(asset?.url),
        assetHasBlobHash: Boolean(asset?.blob_hash),
      },
      { status: 502 },
    );
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Could not proxy Soundverse file.' }, { status: 500 });
  }
}
