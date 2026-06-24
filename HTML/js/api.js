/**
 * AI 平行人生 — 后端 API 调用
 * 对接 FastAPI 后端，支持流式 SSE 生成
 */

const API = (() => {
  const BASE_URL = 'http://localhost:8000/api';

  /** 生成唯一 ID（本地 fallback） */
  function _uuid() {
    return 'xxxx-xxxx-xxxx'.replace(/x/g, () =>
      ((Math.random() * 16) | 0).toString(16)
    );
  }

  /** 后端健康检查 */
  async function healthCheck() {
    try {
      const res = await fetch(`${BASE_URL.replace('/api', '')}/api/health`, {
        signal: AbortSignal.timeout(3000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  /** 全局请求超时 + 重试包装器 */
  async function _fetchWithRetry(url, options = {}, retries = 2) {
    const timeout = options.timeout || 15000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    // 合并外部 signal
    const originalSignal = options.signal;
    if (originalSignal) {
      originalSignal.addEventListener('abort', () => controller.abort(), { once: true });
    }

    let lastError;
    for (let i = 0; i <= retries; i++) {
      try {
        const res = await fetch(url, {
          ...options,
          signal: controller.signal,
          headers: {
            ...options.headers,
            'X-Request-Id': _uuid(),
          },
        });
        clearTimeout(timeoutId);
        return res;
      } catch (err) {
        lastError = err;
        if (err.name === 'AbortError' && originalSignal?.aborted) {
          clearTimeout(timeoutId);
          throw err; // 主动中止，不重试
        }
        if (i < retries && err.name !== 'AbortError') {
          // 网络错误可重试，超时不可重试
          await new Promise(r => setTimeout(r, 1000 * (i + 1)));
          continue;
        }
        break;
      }
    }
    clearTimeout(timeoutId);
    throw lastError || new Error('请求超时');
  }

  /**
   * 流式生成叙事 — 通过 SSE 从后端获取
   * @param {Object} userInput - 用户输入的人生节点
   * @param {Object} callbacks { onThinking, onDone, onError }
   * @param {Array}  [chatMessages] - 聊天记录（保存到数据库供回看）
   * @param {AbortSignal} [externalSignal] 外部中止信号
   */
  async function generateNarrativeStream(userInput, { onThinking, onDone, onError }, chatMessages, externalSignal) {
    // 合并外部 signal
    const internalController = new AbortController();
    const onExternalAbort = () => internalController.abort();
    if (externalSignal) {
      if (externalSignal.aborted) {
        internalController.abort();
      } else {
        externalSignal.addEventListener('abort', onExternalAbort, { once: true });
      }
    }
    const signal = internalController.signal;

    try {
      if (signal.aborted) {
        onError && onError('已取消');
        return;
      }
      const res = await fetch(`${BASE_URL}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userInput, chatMessages: chatMessages || [] }),
        signal,
      });

      if (!res.ok) {
        const text = await res.text();
        onError(`API 错误 (${res.status}): ${text}`);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        let pendingEvent = null;
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            pendingEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            const dataStr = line.slice(6).trim();
            const eventType = pendingEvent || 'message';
            pendingEvent = null;

            try {
              const data = JSON.parse(dataStr);
              switch (eventType) {
                case 'thinking':
                  onThinking && onThinking(data.message || '');
                  break;
                case 'done':
                  reader.cancel().catch(() => {});
                  onDone && onDone(data);
                  return;
                case 'error':
                  reader.cancel().catch(() => {});
                  onError && onError(data.message || '未知错误');
                  return;
              }
            } catch (e) {
              console.warn('SSE parse warning:', e);
            }
          }
        }
      }

      // 流式读完但没有收到 done/error 事件
      onError && onError('后端未返回有效数据');
      return;
    } catch (err) {
      // 主动中止（外部 signal 触发）— 报告错误
      if ((err.name === 'AbortError' || signal.aborted) && externalSignal) {
        onError && onError('连接已中断');
        return;
      }
      // 意外的连接中断（无外部 signal）— 使用本地降级
      if (err.name === 'AbortError' || signal.aborted) {
        console.warn('连接意外中断，使用本地降级模式:', err.message);
        const mockData = _generateFallback(userInput);
        onDone && onDone(mockData);
        return;
      }
      // 网络错误 — 使用本地模拟降级
      console.warn('API 不可用，使用本地降级模式:', err.message);
      onThinking && onThinking('网络连接失败，使用本地模式...');

      // 延迟后使用降级数据
      setTimeout(() => {
        if (signal.aborted) return;
        const mockData = _generateFallback(userInput);
        onDone && onDone(mockData);
      }, 1500);
    } finally {
      if (externalSignal) {
        externalSignal.removeEventListener('abort', onExternalAbort);
      }
    }
  }

  /** 降级数据生成（后端不可用时） */
  function _generateFallback(input) {
    const choiceA = input.choiceA || '原来的选择';
    const choiceB = input.choiceB || '另一个选择';

    return {
      id: _uuid(),
      createdAt: new Date().toISOString(),
      title: `如果当初${input.choiceB || '做了不同的选择'}`,
      node: input,
      narratives: {
        real: [
          { type: 'diary', scene: `${input.time}，${input.location}`, content: `那是${input.time}，我站在${input.location}的街头，做了选择。最终我选择了${choiceA}。现在回想起来，那天的阳光、空气里的味道，都还那么清晰。`, emotion: '怀念', time: input.time || '' },
          { type: 'chat', scene: '和朋友聊起当初的决定', content: `朋友：你后悔吗？\n我：说不后悔是假的，但那时确实是最好的选择了。\n朋友：也是，每条路都有每条路的风景。`, emotion: '坦然', time: '一年后' },
          { type: 'photo', scene: `${choiceA}之后的日子`, content: `${input.location}的黄昏，窗外是万家灯火。这条路上有笑有泪，但回头看，都是值得的。`, emotion: '平静', time: '两年后' },
          { type: 'voicenote', scene: '深夜的一段录音', content: '有时候还是会想，如果当初选了另一条路会怎样。但今天想明白了——每条路都有遗憾，也都有惊喜。重要的是，我在认真地走着眼前的路。', emotion: '释然', time: '2023年' }
        ],
        parallel: [
          { type: 'chat', scene: `决定${choiceB}的那一刻`, content: `我：我想好了，我要${choiceB}。\n家人：你确定吗？\n我：不确定，但我想试试。`, emotion: '忐忑而坚定', time: input.time || '' },
          { type: 'moment', scene: '新的开始', content: `第一天。一切都陌生而新鲜。新的城市，新的节奏，新的自己。#新的开始`, emotion: '兴奋', time: input.time || '' },
          { type: 'photo', scene: `${choiceB}之后的风景`, content: '这条路比想象中难走，但看到的风景也确实不一样。认识了一些有趣的人，经历了一些从未想过的事。', emotion: '满足', time: '一年后' },
          { type: 'diary', scene: '写给自己的信', content: `亲爱的自己：\n谢谢你当初的勇气。虽然这条路也不容易，但你没有辜负那个勇敢做决定的自己。\n每一条路都有它的意义。`, emotion: '温暖', time: '两年后' }
        ]
      },
      reflection: {
        insight: '你一直拥有的，不是"完美选择"的能力，而是"把选择变成正确选择"的勇气。',
        message: '无论当初选择了哪条路，你都在认真生活、认真感受。每一条路都有属于它的阳光和风雨，而你已经足够勇敢。',
        themeColor: '#c8842c'
      }
    };
  }

  /** 向后端保存故事 */
  async function saveStory(storyData) {
    try {
      const res = await fetch(`${BASE_URL}/stories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userInput: storyData.node || {} }),
      });
      if (res.ok) {
        const saved = await res.json();
        // 用后端返回的 id 覆盖本地 id
        return { ...storyData, id: saved.id, createdAt: saved.createdAt };
      }
    } catch { /* ignore */ }
    return storyData; // fallback
  }

  /** 从后端获取故事列表 */
  async function fetchStories() {
    try {
      const res = await fetch(`${BASE_URL}/stories`, {
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const data = await res.json();
        return data.stories || [];
      }
    } catch { /* ignore */ }
    return []; // fallback
  }

  /** 从后端获取单个故事详情 */
  async function fetchStory(id) {
    try {
      // 不设 AbortSignal.timeout：之前的 5s 强制超时在慢网下会自己 abort 请求，
      // 在浏览器控制台留下 net::ERR_ABORTED 噪声。让请求自然完成，失败由后端超时保护。
      const res = await fetch(`${BASE_URL}/stories/${id}`);
      if (res.ok) {
        return await res.json();
      }
    } catch { /* ignore */ }
    return null;
  }

  /** 从后端删除故事 */
  async function deleteStory(id) {
    try {
      const res = await fetch(`${BASE_URL}/stories/${id}`, {
        method: 'DELETE',
      });
      return res.ok;
    } catch { /* ignore */ }
    return false;
  }

  /** LLM 驱动对话（流式）— SSE 实时读出 AI 回复
   * @param {Array} messages 对话历史
   * @param {Function} onToken  收到 token 回调
   * @param {Function} onDone   完成回调
   * @param {Function} onError  错误回调（被动中止时不会触发）
   * @param {AbortSignal} [externalSignal] 外部中止信号（页面卸载时触发）
   */
  async function chatStream(messages, onToken, onDone, onError, externalSignal) {
    // 合并外部 signal（页面卸载） + 内部 signal（重复请求时取消旧的）
    const internalController = new AbortController();
    const onExternalAbort = () => internalController.abort();
    if (externalSignal) {
      if (externalSignal.aborted) {
        internalController.abort();
      } else {
        externalSignal.addEventListener('abort', onExternalAbort, { once: true });
      }
    }
    const signal = internalController.signal;

    let lastError = null;
    let errored = false;  // 标记是否收到错误事件（防止后续 done 误触发）

    // 兜底：检测 token 内容是否为错误信息
    // 后端旧版本可能把错误作为普通 token yield 出来，这里做最后一道防线
    const looksLikeErrorToken = (text) => {
      if (!text || typeof text !== 'string') return false;
      const t = text.trim();
      return t.startsWith('（连接出错') ||
             t.startsWith('（AI 响应出错') ||
             t.startsWith('（AI 调用失败') ||
             t.startsWith('对不起，API 配置未完成') ||
             t.includes('getaddrinfo failed') ||
             t.includes('ConnectionError') ||
             t.includes('API 错误');
    };

    const attempt = async (retryCount = 0) => {
      if (signal.aborted) return; // 已被外部中止，直接返回（不重试、不报错）
      try {
        const res = await fetch(`${BASE_URL}/chat/stream`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages }),
          cache: 'no-store',
          signal,  // 透传 signal，abort 时 fetch 立即 reject
        });
        // 在 retry 前再确认一次
        if (signal.aborted) return;
        if (!res.ok) {
          const err = new Error(`HTTP ${res.status}`);
          lastError = err;
          if (retryCount === 0) {
            // 自动重试一次（首次握手失败时）
            await new Promise(r => setTimeout(r, 500));
            if (signal.aborted) return;
            return attempt(1);
          }
          throw err;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let firstTokenReceived = false;
        let pendingEvent = null;  // 跟踪 SSE 事件类型（event: xxx）

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          // 按行处理 SSE
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // 保留不完整行

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            // SSE 事件类型行
            if (trimmed.startsWith('event:')) {
              pendingEvent = trimmed.slice(6).trim();
              continue;
            }
            if (!trimmed.startsWith('data: ')) continue;
            try {
              const data = JSON.parse(trimmed.slice(6));
              const eventType = pendingEvent || 'message';
              pendingEvent = null;

              // 关键：处理后端发来的 error 事件
              if (eventType === 'error' || data.error) {
                errored = true;
                reader.cancel().catch(() => {});
                const msg = (data && (data.message || data.error)) || '连接中断';
                onError && onError(msg);
                return;
              }

              if (data.done) {
                // 释放 reader 锁，确保 SSE 连接关闭后再触发后续请求
                reader.cancel().catch(() => {});
                // 防御：如果之前已标记错误，不触发 onDone
                if (errored) return;
                onDone && onDone({
                  complete: data.complete || false,
                  fields: data.fields || {},
                  reply: data.reply || '',
                });
                return;
              }
              if (data.token) {
                firstTokenReceived = true;
                // 兜底：如果 token 看起来像错误（旧后端兼容），升级为 error
                if (looksLikeErrorToken(data.token)) {
                  errored = true;
                  reader.cancel().catch(() => {});
                  const msg = data.token.replace(/^[（(]/, '').replace(/[)）]$/, '').trim() || '网络连接失败';
                  onError && onError(msg);
                  return;
                }
                onToken && onToken(data.token);
              }
            } catch { /* skip malformed */ }
          }
        }
      } catch (err) {
        // 主动中止 — 静默返回，不触发 onError、不重试
        if (err.name === 'AbortError' || signal.aborted) return;
        lastError = err;
        // 偶发 abort 兼容兜底（极少数浏览器下 signal 未生效时）
        if (retryCount === 0 && /abort/i.test(err.message || '')) {
          await new Promise(r => setTimeout(r, 1000));
          if (signal.aborted) return;
          return attempt(1);
        }
        onError && onError(err.message || '连接中断');
      } finally {
        if (externalSignal) {
          externalSignal.removeEventListener('abort', onExternalAbort);
        }
      }
    };

    await attempt(0);
  }

  /** 上传文件（图片或音频） */
  async function uploadFile(file, onProgress) {
    const formData = new FormData();
    formData.append('file', file);

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${BASE_URL}/upload`);

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      };

      xhr.onload = () => {
        if (xhr.status === 200) {
          try {
            resolve(JSON.parse(xhr.responseText));
          } catch {
            reject(new Error('解析响应失败'));
          }
        } else {
          try {
            const err = JSON.parse(xhr.responseText);
            reject(new Error(err.detail || `上传失败 (${xhr.status})`));
          } catch {
            reject(new Error(`上传失败 (${xhr.status})`));
          }
        }
      };

      xhr.onerror = () => reject(new Error('网络错误'));
      xhr.send(formData);
    });
  }

  /** 提取字段 — 用户主动结束聊天时调用，让 LLM 从对话历史提取结构化字段 */
  async function extractFields(messages) {
    try {
      const res = await fetch(`${BASE_URL}/chat/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return data.fields || {};
    } catch (err) {
      throw err;
    }
  }

  /** 提交用户反馈 */
  async function submitFeedback(data) {
    const res = await fetch(`${BASE_URL}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  }

  return {
    BASE_URL,
    generateNarrativeStream,
    healthCheck,
    saveStory,
    fetchStories,
    fetchStory,
    deleteStory,
    chatStream,
    uploadFile,
    extractFields,
    submitFeedback,
  };
})();

// 暴露到 window，让 CardFactory 等组件可以拿到后端 base URL
if (typeof window !== 'undefined') window.API = API;