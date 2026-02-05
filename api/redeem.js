import { Redis } from '@upstash/redis';

export const config = { runtime: 'edge' };

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

const MAX_FREE_USES = 3;

// 服务端兑换码（从前端 config.js 迁移过来）
const REDEEM_CODES = {
  'STAR-7721': 3,
  'STAR-4458': 3,
  'STAR-9136': 3,
  'STAR-3067': 3,
  'STAR-8294': 3,
  'STAR-5510': 3,
  'STAR-6843': 3,
};

function getClientIP(req) {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')
    || 'unknown';
}

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { code } = await req.json();
  const ip = getClientIP(req);

  if (!code) {
    return new Response(JSON.stringify({ success: false, reason: '请输入兑换码' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const upperCode = code.trim().toUpperCase();
  const addUses = REDEEM_CODES[upperCode];

  if (!addUses) {
    return new Response(JSON.stringify({ success: false, reason: '兑换码无效' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 获取当前使用数据
  let usage;
  try {
    usage = await redis.get(`usage:${ip}`) || { count: 0, redeemed: [] };
  } catch (e) {
    console.error('[api/redeem] KV read error:', e);
    usage = { count: 0, redeemed: [] };
  }

  // 检查是否已兑换过
  if (usage.redeemed.includes(upperCode)) {
    return new Response(JSON.stringify({ success: false, reason: '此兑换码已使用过' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 兑换：记录码 + 减少计数（增加可用次数）
  usage.redeemed.push(upperCode);
  usage.count -= addUses;

  try {
    await redis.set(`usage:${ip}`, usage);
  } catch (e) {
    console.error('[api/redeem] KV write error:', e);
    return new Response(JSON.stringify({ success: false, reason: '服务器错误，请重试' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const remaining = MAX_FREE_USES - usage.count;
  return new Response(JSON.stringify({ success: true, addUses, remaining }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
