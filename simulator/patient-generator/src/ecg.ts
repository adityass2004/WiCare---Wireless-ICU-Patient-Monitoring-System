export function ecgSample(phase: number): number {
  const p = phase - Math.floor(phase);
  let v = 0;
  v += 0.15 * Math.exp(-Math.pow((p - 0.1) / 0.02, 2));
  v -= 0.1 * Math.exp(-Math.pow((p - 0.18) / 0.005, 2));
  v += 1.2 * Math.exp(-Math.pow((p - 0.2) / 0.008, 2));
  v -= 0.25 * Math.exp(-Math.pow((p - 0.23) / 0.006, 2));
  v += 0.3 * Math.exp(-Math.pow((p - 0.4) / 0.04, 2));
  return v;
}

export function ecgAdvance(phase: number, dtSeconds: number, heartRateBpm: number): number {
  if (heartRateBpm <= 0) return phase;
  const beatPeriodSeconds = 60 / heartRateBpm;
  return (phase + dtSeconds / beatPeriodSeconds) % 1;
}
