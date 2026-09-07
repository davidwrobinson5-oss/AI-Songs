type Mp3Version = 1 | 2 | 2.5;

function readAscii(bytes: Uint8Array, offset: number, length: number) {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

function wavDurationMs(bytes: Uint8Array) {
  if (bytes.length < 44 || readAscii(bytes, 0, 4) !== 'RIFF' || readAscii(bytes, 8, 4) !== 'WAVE') throw new Error('UNSUPPORTED_COST_AUDIO');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 12;
  let byteRate = 0;
  let dataSize = 0;
  while (offset + 8 <= bytes.length) {
    const id = readAscii(bytes, offset, 4);
    const size = view.getUint32(offset + 4, true);
    const start = offset + 8;
    if (id === 'fmt ' && size >= 16 && start + 12 <= bytes.length) byteRate = view.getUint32(start + 8, true);
    if (id === 'data') { dataSize = Math.min(size, Math.max(0, bytes.length - start)); break; }
    offset = start + size + (size % 2);
  }
  if (!byteRate || !dataSize) throw new Error('UNSUPPORTED_COST_AUDIO');
  return Math.ceil((dataSize / byteRate) * 1000);
}

const BITRATE_V1_L3 = [0,32,40,48,56,64,80,96,112,128,160,192,224,256,320,0];
const BITRATE_V2_L3 = [0,8,16,24,32,40,48,56,64,80,96,112,128,144,160,0];
const SAMPLE_RATES: Record<Mp3Version, number[]> = { 1: [44100,48000,32000], 2: [22050,24000,16000], 2.5: [11025,12000,8000] };

function syncSafe(bytes: Uint8Array, offset: number) {
  return ((bytes[offset] & 0x7f) << 21) | ((bytes[offset + 1] & 0x7f) << 14) | ((bytes[offset + 2] & 0x7f) << 7) | (bytes[offset + 3] & 0x7f);
}

function mp3DurationMs(bytes: Uint8Array) {
  let offset = 0;
  if (bytes.length >= 10 && readAscii(bytes, 0, 3) === 'ID3') offset = Math.min(bytes.length, 10 + syncSafe(bytes, 6));
  let totalSeconds = 0;
  let frames = 0;

  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff || (bytes[offset + 1] & 0xe0) !== 0xe0) { offset += 1; continue; }
    const versionBits = (bytes[offset + 1] >> 3) & 0x03;
    const layerBits = (bytes[offset + 1] >> 1) & 0x03;
    if (versionBits === 1 || layerBits !== 1) { offset += 1; continue; }
    const version: Mp3Version = versionBits === 3 ? 1 : versionBits === 2 ? 2 : 2.5;
    const bitrateIndex = (bytes[offset + 2] >> 4) & 0x0f;
    const sampleIndex = (bytes[offset + 2] >> 2) & 0x03;
    const padding = (bytes[offset + 2] >> 1) & 0x01;
    if (sampleIndex === 3 || bitrateIndex === 0 || bitrateIndex === 15) { offset += 1; continue; }
    const bitrateKbps = (version === 1 ? BITRATE_V1_L3 : BITRATE_V2_L3)[bitrateIndex];
    const sampleRate = SAMPLE_RATES[version][sampleIndex];
    if (!bitrateKbps || !sampleRate) { offset += 1; continue; }
    const frameLength = Math.floor(((version === 1 ? 144 : 72) * bitrateKbps * 1000) / sampleRate + padding);
    if (frameLength < 4 || offset + frameLength > bytes.length) break;
    totalSeconds += (version === 1 ? 1152 : 576) / sampleRate;
    frames += 1;
    offset += frameLength;
  }

  if (frames < 2 || totalSeconds <= 0) throw new Error('UNSUPPORTED_COST_AUDIO');
  return Math.ceil(totalSeconds * 1000);
}

export async function verifiedAudioDurationMs(file: File) {
  const type = (file.type || '').toLowerCase().split(';')[0];
  if (!['audio/mpeg','audio/mp3','audio/wav','audio/x-wav'].includes(type)) throw new Error('UNSUPPORTED_COST_AUDIO');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const duration = type === 'audio/wav' || type === 'audio/x-wav' ? wavDurationMs(bytes) : mp3DurationMs(bytes);
  if (!Number.isFinite(duration) || duration < 250 || duration > 60 * 60 * 1000) throw new Error('UNSUPPORTED_COST_AUDIO');
  return duration;
}

export function costAudioError(error: unknown) {
  return error instanceof Error && error.message === 'UNSUPPORTED_COST_AUDIO'
    ? 'For protected-cost reference and remix uploads, use a valid MP3 or WAV file.'
    : 'Could not verify the uploaded audio duration.';
}
