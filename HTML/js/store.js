/**
 * AI 平行人生 — 本地状态管理
 * 管理当前会话状态，代理 localStorage 持久化
 */

const Store = (() => {
  const STORAGE_KEY = 'parallel_life_stories';

  /** 当前会话状态 */
  let state = {
    currentStoryId: null,
    chatMessages: [],
    isGenerating: false,
    currentNarratives: null,
  };

  /** 订阅者列表 */
  const listeners = [];

  /** 获取所有本地故事 */
  function getStories() {
    return Helpers.storage.get(STORAGE_KEY, []);
  }

  /** 保存故事列表（覆盖式，用于从后端同步） */
  function saveStories(stories) {
    Helpers.storage.set(STORAGE_KEY, stories);
    notify('stories');
  }

  function getStory(id) {
    return getStories().find(s => s.id === id) || null;
  }

  /** 添加故事（按 id 去重，相同 id 则合并更新） */
  function addStory(story) {
    if (!story || !story.id) return;
    const stories = getStories();
    const idx = stories.findIndex(s => s.id === story.id);
    if (idx !== -1) {
      // 已存在 — 合并更新（不新增重复）
      stories[idx] = { ...stories[idx], ...story };
    } else {
      stories.unshift(story);
    }
    saveStories(stories);
  }

  /** 更新故事 */
  function updateStory(id, updates) {
    const stories = getStories();
    const idx = stories.findIndex(s => s.id === id);
    if (idx !== -1) {
      stories[idx] = { ...stories[idx], ...updates };
      saveStories(stories);
    }
  }

  /** 删除故事 */
  function deleteStory(id) {
    const stories = getStories().filter(s => s.id !== id);
    saveStories(stories);
  }

  /** 设置当前故事 ID */
  function setCurrentStoryId(id) {
    state.currentStoryId = id;
    notify('currentStory');
  }

  /** 设置聊天消息 */
  function setChatMessages(messages) {
    state.chatMessages = messages;
    notify('chatMessages');
  }

  /** 添加聊天消息 */
  function addChatMessage(msg) {
    state.chatMessages.push(msg);
    notify('chatMessages');
  }

  /** 设置生成状态 */
  function setGenerating(val) {
    state.isGenerating = val;
    notify('generating');
  }

  /** 设置当前叙事数据 */
  function setCurrentNarratives(data) {
    state.currentNarratives = data;
    notify('narratives');
  }

  /** 重置状态 */
  function resetSession() {
    state = {
      currentStoryId: null,
      chatMessages: [],
      isGenerating: false,
      currentNarratives: null,
    };
    notify('reset');
  }

  /** 聊天会话存档 key */
  const SESSION_KEY = 'parallel_life_chat_session';

  /** 保存聊天会话（messages / fields / isComplete 等），用于页面刷新后恢复 */
  function saveChatSession(data) {
    try {
      Helpers.storage.set(SESSION_KEY, { ...data, savedAt: Date.now() });
    } catch (e) {
      console.warn('saveChatSession failed:', e);
    }
  }

  /** 加载聊天会话 */
  function loadChatSession() {
    const data = Helpers.storage.get(SESSION_KEY, null);
    if (!data) return null;
    // 7 天内有效
    if (data.savedAt && Date.now() - data.savedAt > 7 * 24 * 60 * 60 * 1000) {
      clearChatSession();
      return null;
    }
    return data;
  }

  /** 清除聊天会话 */
  function clearChatSession() {
    try { localStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ }
  }

  /** 订阅状态变化 */
  function subscribe(fn) {
    listeners.push(fn);
    return () => {
      const idx = listeners.indexOf(fn);
      if (idx !== -1) listeners.splice(idx, 1);
    };
  }

  /** 通知所有订阅者 */
  function notify(key) {
    listeners.forEach(fn => {
      try { fn(key, state); } catch (e) { console.error('Store listener error:', e); }
    });
  }

  return {
    get state() { return { ...state }; },
    getStories,
    getStory,
    addStory,
    updateStory,
    deleteStory,
    saveStories,
    setCurrentStoryId,
    setChatMessages,
    addChatMessage,
    setGenerating,
    setCurrentNarratives,
    resetSession,
    saveChatSession,
    loadChatSession,
    clearChatSession,
    subscribe,
  };
})();