import { Redis } from '@upstash/redis';

export const config = { runtime: 'edge' };

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash';
const MAX_FREE_USES = 3;

function getClientIP(req) {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')
    || 'unknown';
}

async function getUsage(ip) {
  try {
    return await redis.get(`usage:${ip}`) || { count: 0, redeemed: [] };
  } catch (e) {
    console.error('[api/gemini] Redis read error:', e);
    return { count: 0, redeemed: [] };
  }
}

async function setUsage(ip, data) {
  try {
    await redis.set(`usage:${ip}`, data);
  } catch (e) {
    console.error('[api/gemini] Redis write error:', e);
  }
}

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) {
    return new Response(JSON.stringify({ error: 'Server configuration error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { action, question, contents, generationConfig, readingToken, systemInstruction } = await req.json();
  const ip = getClientIP(req);

  // --- action: classify (non-streaming, check + count) ---
  if (action === 'classify') {
    const usage = await getUsage(ip);
    const remaining = MAX_FREE_USES - usage.count;

    if (remaining <= 0) {
      return new Response(JSON.stringify({ error: '体验次数已用完', remaining: 0 }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 在分类时就计次（无论结果是否有效都消耗 1 次）
    usage.count += 1;
    await setUsage(ip, usage);
    const newRemaining = MAX_FREE_USES - usage.count;

    // 短输入直接返回 D（无效），不调用 Gemini（零成本）
    // 不发放 token，防止被用于直接调用 reading
    if (!question || question.trim().length < 2) {
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: 'D' }], role: 'model' } }],
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'X-Remaining-Uses': String(newRemaining),
        },
      });
    }

    // 生成 token（状态机：new → used）
    // reading 只接受 new 并转为 used（一次性），followup 只接受 used
    const token = crypto.randomUUID();
    await redis.set(`rtoken:${token}`, 'new', { ex: 1800 }); // 30 分钟过期

    const url = `${GEMINI_BASE}:generateContent?key=${GEMINI_API_KEY}`;
    const geminiRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents, generationConfig }),
    });

    const data = await geminiRes.text();
    return new Response(data, {
      status: geminiRes.status,
      headers: {
        'Content-Type': 'application/json',
        'X-Remaining-Uses': String(newRemaining),
        'X-Reading-Token': token,
      },
    });
  }

  // --- action: reading (streaming, no counting — already counted at classify) ---
  if (action === 'reading') {
    // 验证 token 状态必须是 new（一次性消费）
    if (!readingToken) {
      return new Response(JSON.stringify({ error: 'Missing token' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    // 原子操作：getdel 取出并删除，只有一个并发请求能拿到 'new'
    const tokenStatus = await redis.getdel(`rtoken:${readingToken}`);
    if (tokenStatus !== 'new') {
      return new Response(JSON.stringify({ error: 'Invalid or used token' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    // 竞态安全：只有赢家到达这里，写入 'used' 供 followup 使用
    await redis.set(`rtoken:${readingToken}`, 'used', { ex: 1800 });

    const url = `${GEMINI_BASE}:streamGenerateContent?alt=sse&key=${GEMINI_API_KEY}`;
    const geminiRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents, generationConfig, ...(systemInstruction && { systemInstruction }) }),
    });

    if (!geminiRes.ok) {
      const errorText = await geminiRes.text();
      return new Response(errorText, {
        status: geminiRes.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(geminiRes.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
      },
    });
  }

  // --- action: followup-classify (non-streaming, no counting) ---
  if (action === 'followup-classify') {
    // 验证 token 状态必须是 used（已完成 reading）
    if (!readingToken) {
      return new Response(JSON.stringify({ error: 'Missing token' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const tokenStatus = await redis.get(`rtoken:${readingToken}`);
    if (tokenStatus !== 'used') {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 不计次、不改 token 状态
    const url = `${GEMINI_BASE}:generateContent?key=${GEMINI_API_KEY}`;
    const geminiRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents, generationConfig }),
    });

    if (!geminiRes.ok) {
      const errorText = await geminiRes.text();
      return new Response(errorText, {
        status: geminiRes.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const data = await geminiRes.text();
    return new Response(data, {
      status: geminiRes.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // --- action: followup (streaming, no counting) ---
  if (action === 'followup') {
    // 验证 token 状态必须是 used（已完成 reading）
    if (!readingToken) {
      return new Response(JSON.stringify({ error: 'Missing token' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const tokenStatus = await redis.get(`rtoken:${readingToken}`);
    if (tokenStatus !== 'used') {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const url = `${GEMINI_BASE}:streamGenerateContent?alt=sse&key=${GEMINI_API_KEY}`;
    const geminiRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents, generationConfig, ...(systemInstruction && { systemInstruction }) }),
    });

    if (!geminiRes.ok) {
      const errorText = await geminiRes.text();
      return new Response(errorText, {
        status: geminiRes.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(geminiRes.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
      },
    });
  }

  return new Response(JSON.stringify({ error: 'Invalid action' }), {
    status: 400,
    headers: { 'Content-Type': 'application/json' },
  });
}
