import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(process.cwd(), '../../.env') });

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  transpilePackages: ['@wicare/shared', 'lucide-react'],
  // Allows Next.js dev server access from LAN IP / phone without origin warnings
  allowedDevOrigins: [
    'localhost:3000',
    '127.0.0.1:3000',
    '10.*',
    '192.168.*',
    '172.*',
  ],
};

export default nextConfig;
