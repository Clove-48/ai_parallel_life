/**
 * 生成过渡页 — AI 生成叙事时的过渡动画
 * 支持 SSE 流式加载和降级方案
 */
const GeneratingPage = {
  quotes: [
    '"平行时空里的你，也在仰望同一片星空。"',
    '"每一条路都有风景，重要的是你正在走的这条路。"',
    '"另一个你，正在替你勇敢地探索。"',
    '"选择没有对错，只有不同的风景与故事。"',
    '"你的每一个选择，都让现在的你无可替代。"',
    '"那条没走的路，也许正通向另一种精彩。"',
    '"人生没有白走的路，每一步都算数。"',
    '"你犹豫过的那些瞬间，都是未来的你在向你招手。"',
    '"所有的遗憾，都是另一条路上的风景。"',
    '"不必后悔，因为你已经足够勇敢。"',
    '"平行时空不是逃避，而是另一种理解自己的方式。"',
    '"回头看，每一个选择都恰到好处。"',
  ],
  quoteTimer: null,
  _abortController: null,

  render() {
    const randomQuote = this.quotes[Math.floor(Math.random() * this.quotes.length)];
    return `
    <div class="page page-generating">
      <div class="gen-spinner"></div>
      <div class="gen-title" id="gen-title">正在翻阅平行时空的你…</div>
      <div class="gen-sub" id="gen-sub">AI 正在读取你的记忆，推演另一条路上的故事</div>
      <div class="gen-progress">
        <div class="gen-progress-bar" id="gen-progress-bar"></div>
      </div>
      <div class="gen-quotes" id="gen-quote">${randomQuote}</div>
    </div>`;
  },

  mount() {
    // 轮换语录
    let idx = 1;
    this.quoteTimer = setInterval(() => {
      const el = document.getElementById('gen-quote');
      if (el) {
        el.style.opacity = '0';
        setTimeout(() => {
          el.textContent = this.quotes[idx % this.quotes.length];
          el.style.opacity = '1';
          idx++;
        }, 300);
      }
    }, 3000);

    // 开始生成叙事
    this._startGeneration();
  },

  /** 开始通过 SSE 流式生成叙事 */
  async _startGeneration() {
    const userInput = Store.state.currentNarratives || {};
    if (!userInput.time && !userInput.choiceA) {
      // 缺少输入，使用降级
      this._fallbackGenerate(userInput);
      return;
    }

    const progressBar = document.getElementById('gen-progress-bar');
    const titleEl = document.getElementById('gen-title');
    const subEl = document.getElementById('gen-sub');

    // 进度动画（模拟进度，实际完成时直接跳到 100%）
    let progress = 0;
    const progressTimer = setInterval(() => {
      progress = Math.min(progress + Math.random() * 8, 85);
      if (progressBar) progressBar.style.width = progress + '%';
    }, 500);

    // 通过 SSE 调用后端
    const startTime = Date.now();

    await API.generateNarrativeStream(userInput, {
      onThinking: (message) => {
        if (titleEl) titleEl.textContent = message;
        if (subEl) subEl.textContent = '请稍候，正在为你编织故事…';
      },
      onDone: async (storyData) => {
        clearInterval(progressTimer);
        if (progressBar) progressBar.style.width = '100%';

        // 保底 1.5s 展示时间
        const elapsed = Date.now() - startTime;
        const remain = Math.max(0, 1500 - elapsed);
        await Helpers.sleep(remain);

        // 保存故事到本地存储
        Store.addStory(storyData);
        Store.setCurrentStoryId(storyData.id);
        Store.setCurrentNarratives(storyData.narratives);

        // 异步尝试保存到后端（不阻塞跳转）
        API.saveStory(storyData).then(saved => {
          // 用后端返回的 id 更新本地记录
          if (saved && saved.id !== storyData.id) {
            Store.updateStory(storyData.id, { id: saved.id, createdAt: saved.createdAt });
            Store.setCurrentStoryId(saved.id);
          }
        }).catch(() => {});

        // 跳转到时间线页
        Router.navigate(`timeline/${storyData.id}`);
      },
      onError: (errorMsg) => {
        clearInterval(progressTimer);
        console.warn('SSE 生成错误，切换到降级模式:', errorMsg);
        this._fallbackGenerate(userInput);
      },
    });
  },

  /** 降级方案：后端不可用时的本地生成 */
  async _fallbackGenerate(userInput) {
    const titleEl = document.getElementById('gen-title');
    const subEl = document.getElementById('gen-sub');
    const progressBar = document.getElementById('gen-progress-bar');

    if (titleEl) titleEl.textContent = '正在翻阅平行时空的你…';
    if (subEl) subEl.textContent = '本地模式 — 无需网络即可体验';

    // 模拟进度
    let progress = 0;
    const progressTimer = setInterval(() => {
      progress = Math.min(progress + Math.random() * 15, 90);
      if (progressBar) progressBar.style.width = progress + '%';
    }, 400);

    await Helpers.sleep(2500);

    clearInterval(progressTimer);
    if (progressBar) progressBar.style.width = '100%';

    await Helpers.sleep(500);

    // 使用本地降级数据
    const story = this._generateLocalStory(userInput);
    Store.addStory(story);
    Store.setCurrentStoryId(story.id);
    Store.setCurrentNarratives(story.narratives);

    Router.navigate(`timeline/${story.id}`);
  },

  /** 本地降级故事生成 */
  _generateLocalStory(input) {
    const choiceA = input.choiceA || '原来的选择';
    const choiceB = input.choiceB || '另一个选择';
    const id = 'local-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);

    return {
      id,
      createdAt: new Date().toISOString(),
      title: `如果当初${input.choiceB || '做了不同的选择'}`,
      node: input,
      narratives: {
        real: [
          {
            type: 'diary',
            scene: `${input.time}，${input.location}`,
            content: `那是${input.time}，我站在${input.location}的街头，做了选择。最终我选择了${choiceA}。现在回想起来，那天的阳光、空气里的味道，都还那么清晰。`,
            emotion: '怀念',
            time: input.time || ''
          },
          {
            type: 'chat',
            scene: '和朋友聊起当初的决定',
            content: `朋友：你后悔吗？\n我：说不后悔是假的，但那时确实是最好的选择了。\n朋友：也是，每条路都有每条路的风景。`,
            emotion: '坦然',
            time: '一年后'
          },
          {
            type: 'photo',
            scene: `${choiceA}之后的日子`,
            content: `${input.location}的黄昏，窗外是万家灯火。这条路上有笑有泪，但回头看，都是值得的。`,
            emotion: '平静',
            time: '两年后'
          },
          {
            type: 'voicenote',
            scene: '深夜的一段录音',
            content: '有时候还是会想，如果当初选了另一条路会怎样。但今天想明白了——每条路都有遗憾，也都有惊喜。重要的是，我在认真地走着眼前的路。',
            emotion: '释然',
            time: '2023年'
          }
        ],
        parallel: [
          {
            type: 'chat',
            scene: `决定${choiceB}的那一刻`,
            content: `我：我想好了，我要${choiceB}。\n家人：你确定吗？\n我：不确定，但我想试试。`,
            emotion: '忐忑而坚定',
            time: input.time || ''
          },
          {
            type: 'moment',
            scene: '新的开始',
            content: `第一天。一切都陌生而新鲜。新的城市，新的节奏，新的自己。#新的开始`,
            emotion: '兴奋',
            time: input.time || ''
          },
          {
            type: 'photo',
            scene: `${choiceB}之后的风景`,
            content: '这条路比想象中难走，但看到的风景也确实不一样。认识了一些有趣的人，经历了一些从未想过的事。',
            emotion: '满足',
            time: '一年后'
          },
          {
            type: 'diary',
            scene: '写给自己的信',
            content: `亲爱的自己：\n谢谢你当初的勇气。虽然这条路也不容易，但你没有辜负那个勇敢做决定的自己。\n每一条路都有它的意义。`,
            emotion: '温暖',
            time: '两年后'
          }
        ]
      },
      reflection: {
        insight: '你一直拥有的，不是"完美选择"的能力，而是"把选择变成正确选择"的勇气。',
        message: '无论当初选择了哪条路，你都在认真生活、认真感受。每一条路都有属于它的阳光和风雨，而你已经足够勇敢。',
        themeColor: '#c8842c'
      }
    };
  },

  unmount() {
    if (this.quoteTimer) clearInterval(this.quoteTimer);
    if (this._abortController) this._abortController.abort();
  }
};