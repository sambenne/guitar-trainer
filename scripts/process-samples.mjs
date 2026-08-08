/**
 * One-off: convert FreePats FSS Steel String Guitar (small) WAVs into the
 * compact set bundled at public/samples/. Trims to ~2.8s, fades the tail,
 * downsamples 44.1kHz → 22.05kHz mono PCM16.
 *
 * Usage: node scripts/process-samples.mjs <extracted-archive-dir>
 */
import { mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';

const srcDir = process.argv[2];
if (!srcDir) {
  console.error('Usage: node scripts/process-samples.mjs <FSS archive dir>');
  process.exit(1);
}

// Samples covering MIDI 40 (E2) → 70; keycenter from the bundled SFZ.
const WANTED = [
  { file: 'E2.wav', out: 'e2.wav', midi: 40 },
  { file: 'A2.wav', out: 'a2.wav', midi: 45 },
  { file: 'D#3.wav', out: 'ds3.wav', midi: 51 },
  { file: 'G#3.wav', out: 'gs3.wav', midi: 56 },
  { file: 'C4.wav', out: 'c4.wav', midi: 60 },
  { file: 'D#4.wav', out: 'ds4.wav', midi: 63 },
  { file: 'F#4.wav', out: 'fs4.wav', midi: 66 },
  { file: 'A4.wav', out: 'a4.wav', midi: 69 },
];

const MAX_SECONDS = 2.8;
const FADE_SECONDS = 0.5;
const OUT_RATE = 22050;

function readWav(path) {
  const buf = readFileSync(path);
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error(`${path} is not a WAV file`);
  }
  let offset = 12;
  let fmt = null;
  let data = null;
  while (offset + 8 <= buf.length) {
    const id = buf.toString('ascii', offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    if (id === 'fmt ') {
      fmt = {
        format: buf.readUInt16LE(offset + 8),
        channels: buf.readUInt16LE(offset + 10),
        rate: buf.readUInt32LE(offset + 12),
        bits: buf.readUInt16LE(offset + 22),
      };
    } else if (id === 'data') {
      data = buf.subarray(offset + 8, offset + 8 + size);
    }
    offset += 8 + size + (size % 2);
  }
  if (!fmt || !data) throw new Error(`${path}: missing fmt/data chunk`);
  if (fmt.format !== 1 || fmt.bits !== 16 || fmt.channels !== 1) {
    throw new Error(`${path}: expected mono PCM16, got fmt=${fmt.format} ch=${fmt.channels} bits=${fmt.bits}`);
  }
  return { rate: fmt.rate, samples: new Int16Array(data.buffer, data.byteOffset, data.length / 2) };
}

function writeWav(path, samples, rate) {
  const header = Buffer.alloc(44);
  const dataSize = samples.length * 2;
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28); // byte rate
  header.writeUInt16LE(2, 32); // block align
  header.writeUInt16LE(16, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(dataSize, 40);
  writeFileSync(path, Buffer.concat([header, Buffer.from(samples.buffer, samples.byteOffset, dataSize)]));
}

const outDir = 'public/samples';
mkdirSync(outDir, { recursive: true });

for (const { file, out, midi } of WANTED) {
  const { rate, samples } = readWav(join(srcDir, 'samples', file));
  const keepIn = Math.min(samples.length, Math.floor(MAX_SECONDS * rate));
  const ratio = rate / OUT_RATE; // 2 for 44.1k → 22.05k
  const outLen = Math.floor(keepIn / ratio);
  const fadeStart = outLen - Math.floor(FADE_SECONDS * OUT_RATE);
  const result = new Int16Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const srcIdx = Math.floor(i * ratio);
    // Cheap anti-alias: average the pair being decimated
    let v = srcIdx + 1 < keepIn ? (samples[srcIdx] + samples[srcIdx + 1]) / 2 : samples[srcIdx];
    if (i >= fadeStart) {
      const t = (outLen - i) / (outLen - fadeStart);
      v *= t * t; // smooth fade to silence
    }
    result[i] = Math.max(-32768, Math.min(32767, Math.round(v)));
  }
  writeWav(join(outDir, out), result, OUT_RATE);
  console.log(`${out}  midi=${midi}  ${(result.length / OUT_RATE).toFixed(2)}s  ${Math.round((result.length * 2 + 44) / 1024)}KB`);
}

copyFileSync(join(srcDir, 'readme.txt'), join(outDir, 'FREEPATS-README.txt'));
console.log('License/attribution copied to FREEPATS-README.txt');
