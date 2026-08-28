type SupabaseRequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  body?: unknown;
  prefer?: string;
};

function getConfig() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url) throw new Error('SUPABASE_URL_MISSING');
  if (!key) throw new Error('SUPABASE_SECRET_MISSING');
  return { url: url.replace(/\/$/, ''), key };
}

export function isSupabaseServerConfigured() {
  return Boolean((process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY));
}

export async function supabaseRest<T>({ method = 'GET', path, body, prefer }: SupabaseRequestOptions): Promise<T> {
  const { url, key } = getConfig();
  const headers: Record<string, string> = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
  if (prefer) headers.Prefer = prefer;
  const response = await fetch(`${url}/rest/v1/${path.replace(/^\//, '')}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`SUPABASE_${response.status}:${text.slice(0, 500)}`);
  }
  if (response.status === 204) return undefined as T;
  return await response.json() as T;
}

export async function supabaseStorageRequest<T>(path: string, init: RequestInit): Promise<T> {
  const { url, key } = getConfig();
  const response = await fetch(`${url}/storage/v1/${path.replace(/^\//, '')}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      ...(init.headers || {}),
    },
    cache: 'no-store',
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`SUPABASE_STORAGE_${response.status}:${text.slice(0, 500)}`);
  }
  if (response.status === 204) return undefined as T;
  const type = response.headers.get('content-type') || '';
  return (type.includes('application/json') ? await response.json() : await response.text()) as T;
}
