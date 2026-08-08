/** Synthesized metronome click — no audio samples, so nothing extra to cache offline. */

export function scheduleClick(
  ctx: AudioContext,
  destination: AudioNode,
  time: number,
  accent: boolean,
  volume: number,
): void {
  if (volume <= 0) return;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'square';
  osc.frequency.value = accent ? 1200 : 850;

  const peak = volume * (accent ? 0.5 : 0.3);
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(peak, time + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);

  osc.connect(gain);
  gain.connect(destination);
  osc.start(time);
  osc.stop(time + 0.07);
}
