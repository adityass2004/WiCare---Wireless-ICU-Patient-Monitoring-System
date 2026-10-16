export class SeededRNG {
  private initialState: number;
  private state: number;

  constructor(seed: number) {
    this.initialState = seed >>> 0;
    if (this.initialState === 0) this.initialState = 0xdeadbeef;
    this.state = this.initialState;
  }

  reset(seed?: number): void {
    this.initialState = (seed ?? this.initialState) >>> 0;
    if (this.initialState === 0) this.initialState = 0xdeadbeef;
    this.state = this.initialState;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  gaussian(mean = 0, std = 1): number {
    let u = 0;
    let v = 0;
    while (u === 0) u = this.next();
    while (v === 0) v = this.next();
    const n = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    return mean + n * std;
  }

  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }
}
