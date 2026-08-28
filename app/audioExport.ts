'use client';

import * as lame from '@breezystack/lamejs';

function writeString(view: DataView, offset: number, value: string) {
  for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
}

function floatToInt16(input: Float32Array) {
  const output = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const sample = Math.max(-1, Math.min(1, input[i] || 0));
    output[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return output;
}

function audioBufferToWav(buffer: AudioBuffer) {
  const channels = Math.min(2, Math.max(1, buffer.numberOfChannels));
  const sampleRate = buffer.sampleRate;
  const blockAlign = channels * 2;
  const dataLength = buffer.length * blockAlign;
  const arrayBuffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(arrayBuffer);
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataLength, true);
  const channelData = Array.from({ length: channels }, (_, i) => buffer.getChannelData(Math.min(i, buffer.numberOfChannels - 1)));
  let offset = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let channel = 0; channel < channels; channel++) {
      const sample = Math.max(-1, Math.min(1, channelData[channel][i] || 0));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

async function decodeAudio(blob: Blob) {
  const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) throw new Error('This browser cannot convert audio formats.');
  const context = new AudioContextCtor();
  try {
    return await context.decodeAudioData((await blob.arrayBuffer()).slice(0));
  } finally {
    await context.close().catch(() => undefined);
  }
}

async function audioBufferToMp3(buffer: AudioBuffer, bitrate = 192) {
  const channels = Math.min(2, Math.max(1, buffer.numberOfChannels));
  const sampleRate = buffer.sampleRate;
  const safeBitrate = Math.max(64, Math.min(320, Math.round(bitrate)));
  const encoder = new lame.Mp3Encoder(channels, sampleRate, safeBitrate);
  const left = floatToInt16(buffer.getChannelData(0));
  const right = channels === 2 ? floatToInt16(buffer.getChannelData(Math.min(1, buffer.numberOfChannels - 1))) : undefined;
  const blockSize = 1152;
  const chunks: BlobPart[] = [];

  for (let i = 0; i < left.length; i += blockSize) {
    const leftChunk = left.subarray(i, i + blockSize);
    const encoded = channels === 2 && right
      ? encoder.encodeBuffer(leftChunk, right.subarray(i, i + blockSize))
      : encoder.encodeBuffer(leftChunk);
    if (encoded.length) chunks.push(new Uint8Array(encoded));
  }

  const flushed = encoder.flush();
  if (flushed.length) chunks.push(new Uint8Array(flushed));
  return new Blob(chunks, { type: 'audio/mpeg' });
}

export async function exportAudioBlob(
  blob: Blob,
  format: 'mp3' | 'wav',
  options: { bitrate?: number; force?: boolean } = {},
) {
  if (!options.force) {
    if (format === 'wav' && /wav/i.test(blob.type)) return blob;
    if (format === 'mp3' && /(mpeg|mp3)/i.test(blob.type)) return blob;
  }
  const decoded = await decodeAudio(blob);
  return format === 'wav' ? audioBufferToWav(decoded) : audioBufferToMp3(decoded, options.bitrate || 192);
}
