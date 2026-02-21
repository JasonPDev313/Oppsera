import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import jwt from 'jsonwebtoken';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../apps/web/.env.local') });
config({ path: resolve(__dirname, '../.env.local') });

// Alex Admin — has active membership with Sunset Golf tenant
const userId = '01KHWPH6ATM7SVF5KRDB3B6X1P';
const token = jwt.sign(
  { sub: userId },
  'oppsera-dev-secret-do-not-use-in-production',
  { algorithm: 'HS256', expiresIn: '1h' },
);

console.log('Testing semantic/ask with user:', userId);
console.log('Token:', token.substring(0, 30) + '...');

const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 60000);

try {
  const start = Date.now();
  const res = await fetch('http://localhost:3000/api/v1/semantic/ask', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      message: 'are you running and can I ask you questions',
      sessionId: 'test-debug-2',
      turnNumber: 1,
      timezone: 'America/New_York',
    }),
    signal: controller.signal,
  });
  clearTimeout(timeout);

  const elapsed = Date.now() - start;
  console.log(`\nHTTP ${res.status} in ${elapsed}ms`);

  const body = await res.json();
  console.log('Response:', JSON.stringify(body, null, 2).substring(0, 2000));
} catch (err) {
  clearTimeout(timeout);
  console.error('FAILED:', err.message);
}
