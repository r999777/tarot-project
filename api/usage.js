import { Redis } from '@upstash/redis';

export const config = { runtime: 'edge' };

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

const MAX_FREE_USES = 3;

function getClientIP(req) {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')
    || 'unknown';
}

export default async function handler(req) {
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const ip = getClientIP(req);

  let usage;
  try {
    usage = await redis.get(`usage:${ip}`) || { count: 0, redeemed: [] };
  } catch (e) {
    console.error('[api/usage] KV read error:', e);
    usage = { count: 0, redeemed: [] };
  }

  const remaining = MAX_FREE_USES - usage.count;
  return new Response(JSON.stringify({ remaining, maxFree: MAX_FREE_USES }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
