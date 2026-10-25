import { describe, it, expect } from 'vitest';
import {
  detectLanIp,
  generateAccessLinksMarkdown,
  isApipa,
  isLoopback,
  type NetworkInterfaceLike,
} from '../src/network.js';
import fs from 'node:fs';
import path from 'node:path';

describe('Dynamic Network & LAN IP Detection Subsystem', () => {
  it('1. correctly identifies APIPA (169.254.x.x) and loopback addresses', () => {
    expect(isApipa('169.254.42.30')).toBe(true);
    expect(isApipa('169.254.239.43')).toBe(true);
    expect(isApipa('192.168.1.10')).toBe(false);
    expect(isApipa('10.0.0.5')).toBe(false);

    expect(isLoopback('127.0.0.1')).toBe(true);
    expect(isLoopback('127.0.0.2')).toBe(true);
    expect(isLoopback('::1')).toBe(true);
    expect(isLoopback('192.168.1.1')).toBe(false);
  });

  it('2. prioritizes active physical Wi-Fi over Ethernet and virtual adapters', () => {
    const mockInterfaces: Record<string, NetworkInterfaceLike[]> = {
      'Loopback Pseudo-Interface 1': [
        { address: '127.0.0.1', family: 'IPv4', internal: true },
      ],
      'CloudflareWARP': [
        { address: '172.16.0.2', family: 'IPv4', internal: false },
      ],
      'Ethernet 2': [
        { address: '10.0.0.45', family: 'IPv4', internal: false },
      ],
      'Wi-Fi': [
        { address: '192.168.1.120', family: 'IPv4', internal: false },
      ],
    };

    const result = detectLanIp(mockInterfaces);
    expect(result.isLocalOnly).toBe(false);
    expect(result.primaryIp).toBe('192.168.1.120');
    expect(result.primaryInterface).toBe('Wi-Fi');

    // Adapter priority assertions: Wi-Fi (1), Ethernet (2), Virtual (4)
    const wifi = result.adapters.find((a) => a.name === 'Wi-Fi');
    const eth = result.adapters.find((a) => a.name === 'Ethernet 2');
    const warp = result.adapters.find((a) => a.name === 'CloudflareWARP');

    expect(wifi?.priority).toBe(1);
    expect(eth?.priority).toBe(2);
    expect(warp?.priority).toBe(4);
    expect(warp?.isVirtual).toBe(true);
  });

  it('3. selects physical Ethernet when Wi-Fi is absent', () => {
    const mockInterfaces: Record<string, NetworkInterfaceLike[]> = {
      'Loopback': [
        { address: '127.0.0.1', family: 'IPv4', internal: true },
      ],
      'vEthernet (Default Switch)': [
        { address: '172.28.16.1', family: 'IPv4', internal: false },
      ],
      'Local Area Connection': [
        { address: '192.168.0.50', family: 'IPv4', internal: false },
      ],
    };

    const result = detectLanIp(mockInterfaces);
    expect(result.isLocalOnly).toBe(false);
    expect(result.primaryIp).toBe('192.168.0.50');
    expect(result.primaryInterface).toBe('Local Area Connection');
  });

  it('4. excludes APIPA-only (169.254.x.x) and loopback-only interfaces with safe fallback to localhost', () => {
    const mockInterfaces: Record<string, NetworkInterfaceLike[]> = {
      'Loopback Pseudo-Interface 1': [
        { address: '127.0.0.1', family: 'IPv4', internal: true },
        { address: '::1', family: 'IPv6', internal: true },
      ],
      'Bluetooth Network Connection': [
        { address: '169.254.153.180', family: 'IPv4', internal: false },
      ],
      'Local Area Connection* 1': [
        { address: '169.254.239.43', family: 'IPv4', internal: false },
      ],
    };

    const result = detectLanIp(mockInterfaces);
    expect(result.isLocalOnly).toBe(true);
    expect(result.primaryIp).toBe('localhost');
    expect(result.primaryInterface).toBe('None (Localhost Only)');
    expect(result.warning).toContain('No active physical Wi-Fi or Ethernet network adapter detected');
  });

  it('5. handles empty interfaces cleanly with localhost fallback', () => {
    const result = detectLanIp({});
    expect(result.isLocalOnly).toBe(true);
    expect(result.primaryIp).toBe('localhost');
    expect(result.adapters).toEqual([]);
  });

  it('6. generates complete and accurate access-links markdown document', () => {
    const mockResult = {
      primaryIp: '192.168.1.99',
      primaryInterface: 'Wi-Fi 6E',
      isLocalOnly: false,
      adapters: [
        {
          name: 'Wi-Fi 6E',
          address: '192.168.1.99',
          netmask: '255.255.255.0',
          isVirtual: false,
          isWifi: true,
          isEthernet: false,
          priority: 1,
        },
      ],
    };

    const ports = {
      web: 3000,
      api: 4000,
      simulator: 4001,
      mqtt: 1883,
    };

    const md = generateAccessLinksMarkdown(mockResult, ports, 'Oct 25, 2026, 6:00:00 PM');

    // Verify all required links are included in markdown
    expect(md).toContain('http://192.168.1.99:3000');
    expect(md).toContain('http://192.168.1.99:4001');
    expect(md).toContain('http://192.168.1.99:4000/health');
    expect(md).toContain('http://192.168.1.99:4001/status');
    expect(md).toContain('mqtt://192.168.1.99:1883');

    // Verify localhost equivalents
    expect(md).toContain('http://localhost:3000');
    expect(md).toContain('http://localhost:4001');
    expect(md).toContain('http://localhost:4000/health');
    expect(md).toContain('http://localhost:4001/status');
    expect(md).toContain('mqtt://localhost:1883');

    // Verify metadata
    expect(md).toContain('Wi-Fi 6E');
    expect(md).toContain('Oct 25, 2026, 6:00:00 PM');
    expect(md).toContain('Windows Firewall Guidance');
  });

  it('7. generates clear localhost-only warning when no LAN adapter is available', () => {
    const mockLocalOnly = {
      primaryIp: 'localhost',
      primaryInterface: 'None (Localhost Only)',
      isLocalOnly: true,
      adapters: [],
      warning: 'No active physical Wi-Fi or Ethernet network adapter detected.',
    };

    const ports = { web: 3000, api: 4000, simulator: 4001, mqtt: 1883 };
    const md = generateAccessLinksMarkdown(mockLocalOnly, ports);

    expect(md).toContain('Localhost-Only Mode');
    expect(md).toContain('http://localhost:3000');
    expect(md).not.toContain('http://undefined');
  });

  it('8. Regression check: ensures no hardcoded LAN IP addresses exist in active application source files', () => {
    const rootDir = path.resolve(__dirname, '../../..');

    const filesToCheck = [
      path.join(rootDir, '.env.example'),
      path.join(rootDir, 'apps/api/src/server.ts'),
      path.join(rootDir, 'apps/api/src/env.ts'),
      path.join(rootDir, 'apps/web/src/lib/api.ts'),
      path.join(rootDir, 'apps/web/src/lib/health.ts'),
      path.join(rootDir, 'simulator/service/src/index.ts'),
      path.join(rootDir, 'packages/shared/src/network.ts'),
    ];

    const hardcodedIpRegex = /\b10\.197\.188\.\d+\b|\b172\.16\.0\.2\b/;

    for (const file of filesToCheck) {
      if (fs.existsSync(file)) {
        const content = fs.readFileSync(file, 'utf-8');
        expect(
          hardcodedIpRegex.test(content),
          `Found hardcoded stale LAN IP in ${file}`
        ).toBe(false);
      }
    }
  });
});
