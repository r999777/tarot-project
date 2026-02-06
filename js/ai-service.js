// ============================================
// AI Service - Claude/Gemini API 调用
// ============================================

import { CONFIG } from './config.js?v=23';

export class AIService {
  constructor() {
    this.abortController = null;
  }

  // 验证 Claude API Key
  async verifyClaude(apiKey) {
    try {
      const response = await fetch(CONFIG.API.CLAUDE, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 10,
          messages: [{ role: 'user', content: 'Hi' }],
        }),
      });

      if (response.ok) {
        return { success: true };
      }

      const errorData = await response.json().catch(() => ({}));
      if (response.status === 401) {
        return { success: false, error: 'API Key 无效' };
      }
      if (response.status === 429) {
        // 429 说明 key 有效但限流，也算验证成功
        return { success: true };
      }
      return { success: false, error: errorData.error?.message || `错误: ${response.status}` };
    } catch (error) {
      return { success: false, error: '网络连接失败' };
    }
  }

  // 验证 Gemini API Key
  async verifyGemini(apiKey) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Hi' }] }],
          generationConfig: { maxOutputTokens: 10 },
        }),
      });

      if (response.ok) {
        return { success: true };
      }

      const errorData = await response.json().catch(() => ({}));
      if (response.status === 400 || response.status === 403) {
        return { success: false, error: 'API Key 无效' };
      }
      if (response.status === 429) {
        return { success: true };
      }
      return { success: false, error: errorData.error?.message || `错误: ${response.status}` };
    } catch (error) {
      return { success: false, error: '网络连接失败' };
    }
  }

  // 验证 API Key（根据提供商）
  async verifyAPIKey(provider, apiKey) {
    if (provider === 'claude') {
      return this.verifyClaude(apiKey);
    } else {
      return this.verifyGemini(apiKey);
    }
  }

  // 获取问题类型（关键词匹配，用于 Claude）
  getQuestionType(question) {
    return CONFIG.getQuestionType(question);
  }

  // AI 意图分类器（通过服务端代理调用 Gemini）
  async classifyQuestionWithAI(question) {
    // 清空旧 token，防止 classify 失败时复用
    this.lastReadingToken = null;

    const classifierPrompt = CONFIG.CLASSIFIER_PROMPT.replace('{question}', question);

    const response = await fetch(CONFIG.API.GEMINI_PROXY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'classify',
        question: question,
        contents: [{ parts: [{ text: classifierPrompt }] }],
        generationConfig: {
          temperature: 0,      // 绝对理性，确保只返回 A/B/C
          maxOutputTokens: 10, // 限制输出，防止废话
        },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        throw new Error('体验次数已用完');
      }
      throw new Error('服务暂时不可用，请稍后重试');
    }

    // 分类时已计次，读取剩余次数和 reading token
    this.lastRemainingUses = parseInt(response.headers.get('X-Remaining-Uses'));
    this.lastReadingToken = response.headers.get('X-Reading-Token');

    const data = await response.json();
    const result = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim().toUpperCase();

    // 映射 AI 返回的 A/B/C/D 到内部类型
    switch (result) {
      case 'A': return 'direct';
      case 'B': return 'fortune';
      case 'C': return 'analysis';
      case 'D': return 'invalid';
      default:
        console.warn('[AI 分类器] 返回异常:', result, '回退到关键词匹配');
        return this.getQuestionType(question);
    }
  }

  // 构建用户消息（根据问题类型优化）
  buildUserMessage(question, cards, intuitionRecords = []) {
    const questionType = this.getQuestionType(question);

    // 根据问题类型选择不同的位置含义和牌阵名称
    let positions, spreadName;

    switch (questionType) {
      case 'direct':
        // 直球结果型：简化位置名称，突出判断依据
        positions = [
          { name: '第一张', meaning: '主要信号' },
          { name: '第二张', meaning: '辅助信号' },
          { name: '第三张', meaning: '变数因素' }
        ];
        spreadName = '三牌决断';
        break;

      case 'fortune':
        // 运势预测型：能量流视角
        positions = [
          { name: '基础能量', meaning: '影响期 - 当前的能量底色' },
          { name: '核心趋势', meaning: '爆发期 - 主要的运势走向' },
          { name: '潜在指引', meaning: '转化期 - 如何转化能量' }
        ];
        spreadName = '能量三角';
        break;

      case 'analysis':
      default:
        // 深度分析型：时间线视角
        positions = [
          { name: '过去', meaning: '根源 - 影响当前的过往因素' },
          { name: '现在', meaning: '镜像 - 当前的处境与状态' },
          { name: '未来', meaning: '启示 - 可能的发展趋势' }
        ];
        spreadName = '时间之流';
        break;
    }

    // 分析元素分布（使用 imageFilename 判断类型）
    const elements = { wands: 0, cups: 0, swords: 0, pentacles: 0, major: 0 };
    let reversedCount = 0;

    cards.forEach(card => {
      const filename = card.imageFilename || '';
      if (filename.startsWith('m')) elements.major++;
      else if (filename.startsWith('w')) elements.wands++;
      else if (filename.startsWith('c')) elements.cups++;
      else if (filename.startsWith('s')) elements.swords++;
      else if (filename.startsWith('p')) elements.pentacles++;

      if (card.isReversed) reversedCount++;
    });

    // 构建消息
    let message = `# 问题\n${question}\n\n`;

    message += `# 牌阵：${spreadName}\n\n`;

    cards.forEach((card, index) => {
      const pos = positions[index];
      const orientation = card.isReversed ? '逆位' : '正位';
      const filename = card.imageFilename || '';
      const cardType = filename.startsWith('m') ? '大阿卡纳' : '小阿卡纳';

      message += `## ${pos.name}（${pos.meaning}）\n`;
      message += `- 牌名：${card.nameCN}（${card.name}）\n`;
      message += `- 类型：${cardType}\n`;
      message += `- 正逆：${orientation}\n`;
      message += `- 关键词：${card.keywords.join('、')}\n\n`;
    });

    // 元素与正逆位统计（帮助 AI 快速判断）
    message += `# 牌面统计\n`;
    message += `- 正逆比例：${3 - reversedCount}正${reversedCount}逆\n`;

    const elementList = [];
    if (elements.major > 0) elementList.push(`大阿卡纳${elements.major}张`);
    if (elements.wands > 0) elementList.push(`权杖${elements.wands}张`);
    if (elements.cups > 0) elementList.push(`圣杯${elements.cups}张`);
    if (elements.swords > 0) elementList.push(`宝剑${elements.swords}张`);
    if (elements.pentacles > 0) elementList.push(`星币${elements.pentacles}张`);
    message += `- 元素分布：${elementList.join('、')}\n`;

    // 直觉记录（三层降级策略）
    if (intuitionRecords !== null) {
      // intuitionRecords 为 null 表示未启用，[] 表示启用但无数据
      let specificIntuition = '';
      let hasSpecificData = false;

      cards.forEach(card => {
        // 查找该牌的所有直觉记录
        const cardRecords = intuitionRecords.filter(r => r.cardId === card.id);
        if (cardRecords.length === 0) return;

        // 优先查找正逆位完全匹配的记录
        const exactMatch = cardRecords.find(r => r.isReversed === card.isReversed);
        const anyMatch = cardRecords[0]; // 最新的记录作为备选

        const positionStr = card.isReversed ? '逆位' : '正位';

        if (exactMatch) {
          // 完全匹配：直接使用
          specificIntuition += `- **${card.nameCN}【${positionStr}】**：「${exactMatch.feeling}」\n`;
          hasSpecificData = true;
        } else if (anyMatch) {
          // 位置不匹配：使用但标注需要转化
          const recordPosition = anyMatch.isReversed ? '逆位' : '正位';
          specificIntuition += `- **${card.nameCN}【${positionStr}】**：「${anyMatch.feeling}」\n`;
          specificIntuition += `  *(此感悟基于${recordPosition}，当前是${positionStr}，请适当转化)*\n`;
          hasSpecificData = true;
        }
      });

      message += '\n## 🔮 星际塔罗师的直觉感悟\n';

      if (hasSpecificData) {
        // 情况 A：至少有一张牌有直觉数据
        message += '> 以下是开发者对这些牌的亲身感悟，请重点参考并融入解读：\n\n';
        message += specificIntuition;
        message += '\n> 对于没有列出的牌，请保持一致的感性风格。\n';
      } else {
        // 情况 B：勾选了但这几张牌都没数据（优雅降级）
        message += '> 用户启用了「星际塔罗师能量」，但这几张牌尚未收录具体感悟。\n';
        message += '> **请切换到高共情模式**：用更感性、更像老朋友的口吻解读，而非教科书式罗列。\n';
      }
    }

    message += '\n---\n请根据以上信息进行解读。';

    return message;
  }

  // 调用 Claude API（流式）
  async callClaude(apiKey, userMessage, systemPrompt, onChunk) {
    this.abortController = new AbortController();

    const response = await fetch(CONFIG.API.CLAUDE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
        stream: true,
      }),
      signal: this.abortController.signal,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `API 错误: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
              onChunk(parsed.delta.text);
            }
          } catch (e) {
            // 忽略解析错误
          }
        }
      }
    }
  }

  // 调用 Gemini API（流式，通过服务端代理）
  async callGemini(userMessage, systemPrompt, onChunk) {
    this.abortController = new AbortController();

    const response = await fetch(CONFIG.API.GEMINI_PROXY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'reading',
        readingToken: this.lastReadingToken,
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ parts: [{ text: userMessage }] }],
        generationConfig: {
          maxOutputTokens: 2048,
          temperature: 1.2,          // 感性创作，增加神秘感和文采
          topP: 0.95,                // 让词汇选择更丰富
          topK: 40,
        },
      }),
      signal: this.abortController.signal,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMsg = typeof errorData.error === 'string' ? errorData.error : errorData.error?.message || `API 错误: ${response.status}`;
      throw new Error(errorMsg);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) {
              onChunk(text);
            }
          } catch (e) {
            // 忽略解析错误
          }
        }
      }
    }
  }

  // 获取解读（主入口）
  // Gemini 走服务端代理（不需要 apiKey），Claude 暂不处理
  async getReading(question, cards, onChunk, conversationHistory = [], intuitionRecords = [], questionType = null) {
    // 判断是否为追问（有对话历史）
    const isFollowup = conversationHistory.length > 0;

    // 短输入交给服务端 classify 处理（会计次但不调用 Gemini）

    let systemPrompt;

    if (isFollowup) {
      // 追问：复用三大模板 + 追加追问规则
      const template = CONFIG.getMainTemplate(questionType || 'analysis');
      const now = new Date();
      const currentDateStr = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`;
      systemPrompt = template.replace('{current_date}', currentDateStr) + CONFIG.FOLLOWUP_RULES;

      const messages = [
        ...conversationHistory,
        { role: 'user', content: question }
      ];
      await this.callGeminiWithHistory(messages, systemPrompt, onChunk);
    } else {
      // 首次解读：使用 AI 分类器（通过服务端代理）
      console.log('[AI] 意图分类中...');
      const questionType = await this.classifyQuestionWithAI(question);
      console.log('[AI] 分类结果:', questionType);

      // 无效输入：直接返回引导消息（不作为错误）
      if (questionType === 'invalid') {
        onChunk(CONFIG.INVALID_INPUT_MESSAGE);
        return;
      }

      // 根据问题类型获取 system prompt
      switch (questionType) {
        case 'direct':
          systemPrompt = CONFIG.SYSTEM_PROMPT_DIRECT;
          break;
        case 'fortune':
          systemPrompt = CONFIG.SYSTEM_PROMPT_FORTUNE;
          break;
        case 'analysis':
        default:
          systemPrompt = CONFIG.SYSTEM_PROMPT_ANALYSIS;
          break;
      }

      // 获取当前日期并替换占位符（格式：2026年2月3日）
      const now = new Date();
      const currentDateStr = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`;
      systemPrompt = systemPrompt.replace('{current_date}', currentDateStr);

      // 首次解读：构建完整的牌面信息
      const userMessage = this.buildUserMessage(question, cards, intuitionRecords);
      await this.callGemini(userMessage, systemPrompt, onChunk);
    }
  }

  // 调用 Claude API（带对话历史）
  async callClaudeWithHistory(apiKey, messages, systemPrompt, onChunk) {
    this.abortController = new AbortController();

    const response = await fetch(CONFIG.API.CLAUDE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        system: systemPrompt,
        messages: messages,
        stream: true,
      }),
      signal: this.abortController.signal,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `API 错误: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
              onChunk(parsed.delta.text);
            }
          } catch (e) {
            // 忽略解析错误
          }
        }
      }
    }
  }

  // 调用 Gemini API（带对话历史，通过服务端代理）
  async callGeminiWithHistory(messages, systemPrompt, onChunk) {
    this.abortController = new AbortController();

    // 转换消息格式为 Gemini 格式
    const contents = messages.map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }]
    }));

    const response = await fetch(CONFIG.API.GEMINI_PROXY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'followup',
        readingToken: this.lastReadingToken,
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: contents,
        generationConfig: {
          maxOutputTokens: 2048,
          temperature: 1.2,          // 感性创作，增加神秘感和文采
          topP: 0.95,                // 让词汇选择更丰富
          topK: 40,
        },
      }),
      signal: this.abortController.signal,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMsg = typeof errorData.error === 'string' ? errorData.error : errorData.error?.message || `API 错误: ${response.status}`;
      throw new Error(errorMsg);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) {
              onChunk(text);
            }
          } catch (e) {
            // 忽略解析错误
          }
        }
      }
    }
  }

  // 追问合并分类器：意图分类（ABCD）+ 补牌判断（0-3 张）
  async classifyFollowupIntent(question, cardSummary) {
    const prompt = CONFIG.FOLLOWUP_CLASSIFIER_PROMPT
      .replace('{question}', question)
      .replace('{card_summary}', cardSummary);

    const response = await fetch(CONFIG.API.GEMINI_PROXY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'followup-classify',
        readingToken: this.lastReadingToken,
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 100,
        },
      }),
    });

    if (!response.ok) {
      throw new Error('分类请求失败');
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    if (!text) {
      console.warn('[AI] 追问合并分类返回空内容，回退为 analysis + 0 张');
      return { type: 'analysis', cards: 0, reason: '' };
    }

    try {
      // 尝试解析 JSON（AI 可能输出 ```json 包裹）
      const cleaned = text.replace(/```json\s*|\s*```/g, '').trim();
      const result = JSON.parse(cleaned);

      // 映射 type 字母到内部类型
      const typeMap = { A: 'direct', B: 'fortune', C: 'analysis', D: 'invalid' };
      const type = typeMap[result.type?.toUpperCase()] || 'analysis';
      const cards = Math.max(0, Math.min(3, result.cards ?? 0));

      console.log('[AI] 追问分类结果:', { type, cards, reason: result.reason || '' });
      return { type, cards, reason: result.reason || '' };
    } catch (e) {
      console.warn('[AI] 追问分类解析失败:', text, '回退为 analysis + 0 张');
      return { type: 'analysis', cards: 0, reason: '' };
    }
  }

  // 带追加牌面的追问解读
  async getFollowupWithCards(question, newCards, onChunk, conversationHistory = [], questionType = null) {
    // 复用三大模板 + 追问规则 + 补牌上下文
    const template = CONFIG.getMainTemplate(questionType || 'analysis');
    const now = new Date();
    const currentDateStr = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`;
    const systemPrompt = template.replace('{current_date}', currentDateStr) + CONFIG.FOLLOWUP_RULES + CONFIG.FOLLOWUP_CARD_CONTEXT;

    // 构建追加牌面描述
    let cardInfo = '# 追加抽取的补充牌面\n\n';
    newCards.forEach((card, index) => {
      const orientation = card.isReversed ? '逆位' : '正位';
      const filename = card.card.imageFilename || '';
      const cardType = filename.startsWith('m') ? '大阿卡纳' : '小阿卡纳';
      cardInfo += `## 补充牌 ${index + 1}\n`;
      cardInfo += `- 牌名：${card.card.nameCN}（${card.card.name}）\n`;
      cardInfo += `- 类型：${cardType}\n`;
      cardInfo += `- 正逆：${orientation}\n`;
      cardInfo += `- 关键词：${card.card.keywords.join('、')}\n\n`;
    });

    const userMessage = `${question}\n\n---\n${cardInfo}`;

    const messages = [
      ...conversationHistory,
      { role: 'user', content: userMessage }
    ];
    await this.callGeminiWithHistory(messages, systemPrompt, onChunk);
  }

  // 中止当前请求
  abort() {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }
}

console.log('[ai-service.js] 模块加载完成');
