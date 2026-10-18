import { describe, it, expect } from 'vitest';
import { NetworkEmulator } from '../src/emulator.js';

function makeEmulator(config: ConstructorParameters<typeof NetworkEmulator>[0]) {
  return new NetworkEmulator(config);
}

describe('NetworkEmulator loss statistics', () => {
  it('measures approximately matches configured loss rate over many packets', () => {
    const em = makeEmulator({ lossRate: 0.2, fixedDelayMs: 0, jitterMs: 0, seed: 42 });
    const sent: string[] = [];
    const raw = (topic: string) => { sent.push(topic); };
    for (let i = 0; i < 5000; i++) {
      em.publish(`t/${i}`, Buffer.from('x'), { qos: 0 }, raw);
    }
    const stats = em.getStats();
    expect(stats.attempted).toBe(5000);
    expect(stats.dropped + stats.sent).toBe(5000);
    const measured = stats.dropped / stats.attempted;
    expect(measured).toBeGreaterThan(0.17);
    expect(measured).toBeLessThan(0.23);
  });

  it('zero loss drops nothing', () => {
    const em = makeEmulator({ lossRate: 0, fixedDelayMs: 0, jitterMs: 0, seed: 1 });
    let _sent = 0;
    for (let i = 0; i < 1000; i++) em.publish('t', Buffer.from('x'), { qos: 0 }, () => { _sent++; });
    expect(em.getStats().dropped).toBe(0);
    expect(em.getStats().sent).toBe(1000);
  });

  it('100% loss sends nothing', () => {
    const em = makeEmulator({ lossRate: 1, fixedDelayMs: 0, jitterMs: 0, seed: 1 });
    let _sent = 0;
    for (let i = 0; i < 1000; i++) em.publish('t', Buffer.from('x'), { qos: 0 }, () => { _sent++; });
    expect(em.getStats().sent).toBe(0);
    expect(em.getStats().dropped).toBe(1000);
  });

  it('delay truly delays messages by fixedDelayMs', async () => {
    const em = makeEmulator({ lossRate: 0, fixedDelayMs: 50, jitterMs: 0, seed: 1 });
    const times: number[] = [];
    const start = Date.now();
    em.publish('t', Buffer.from('x'), { qos: 0 }, () => { times.push(Date.now() - start); });
    await em.flush();
    expect(times[0]).toBeGreaterThanOrEqual(45);
    expect(em.getStats().delayed).toBe(1);
  });

  it('disconnect window drops all messages during the window', () => {
    const em = makeEmulator({
      lossRate: 0,
      fixedDelayMs: 0,
      jitterMs: 0,
      seed: 1,
      disconnectWindows: [{ startMs: 0, durationMs: 100000 }],
    });
    let sent = 0;
    for (let i = 0; i < 100; i++) em.publish('t', Buffer.from('x'), { qos: 0 }, () => { sent++; });
    expect(em.getStats().inDisconnect).toBe(100);
    expect(sent).toBe(0);
  });
});
