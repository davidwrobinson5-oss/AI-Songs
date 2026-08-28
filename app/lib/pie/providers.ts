export type PieChannel = 'email' | 'sms' | 'voice' | 'mail' | 'message';
export type PublishStatus = 'queued' | 'processing' | 'published' | 'failed';

export type ProviderResult = {
  ok: boolean;
  externalId?: string;
  status?: string;
  error?: string;
  data?: Record<string, unknown>;
};

export type Recipient = {
  fanId: string;
  email?: string;
  phone?: string;
  mailingAddress?: Record<string, unknown>;
  displayName?: string;
};

export interface CommunicationProvider {
  readonly name: string;
  readonly channel: PieChannel;
  send(input: {
    recipient: Recipient;
    subject?: string;
    body: string;
    mediaUrls?: string[];
    idempotencyKey: string;
  }): Promise<ProviderResult>;
}

export interface StorageProvider {
  readonly name: string;
  put(input: {
    key: string;
    body: ArrayBuffer | Uint8Array;
    contentType?: string;
  }): Promise<{ key: string; url?: string }>;
  remove(key: string): Promise<void>;
  signedUrl(key: string, expiresInSeconds?: number): Promise<string>;
}

export interface SocialProvider {
  readonly name: string;
  publish(input: {
    accountId: string;
    caption?: string;
    mediaUrls: string[];
    scheduledFor?: string;
    idempotencyKey: string;
  }): Promise<ProviderResult & { status?: PublishStatus }>;
}

export interface MusicDistributionProvider {
  readonly name: string;
  validateRelease(input: {
    releaseId: string;
    metadata: Record<string, unknown>;
    masterUrl: string;
    artworkUrl: string;
  }): Promise<{ ok: boolean; issues: string[] }>;
  submitRelease(input: {
    releaseId: string;
    metadata: Record<string, unknown>;
    masterUrl: string;
    artworkUrl: string;
    destinations?: string[];
    idempotencyKey: string;
  }): Promise<ProviderResult>;
  getStatus(externalId: string): Promise<ProviderResult>;
}

export type NormalizedProviderEvent = {
  provider: string;
  externalEventId: string;
  type: string;
  occurredAt?: string;
  data: Record<string, unknown>;
};

export interface WebhookAdapter {
  readonly provider: string;
  verify(rawBody: string, headers: Headers): Promise<boolean> | boolean;
  normalize(rawBody: string, headers: Headers): Promise<NormalizedProviderEvent[]> | NormalizedProviderEvent[];
}
