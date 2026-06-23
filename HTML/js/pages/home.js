/**
 * 首页（欢迎引导页）
 */
const HomePage = {
  render() {
    return `
    <div class="page page-home">
      <header class="hero">
        <div class="container">
          <div class="hero-badge">生活娱乐 · 情感体验</div>
          <h1>AI 平行人生</h1>
          <div class="en-title">What If You Had Chosen Differently?</div>
          <p class="tagline">
            输入你人生中的任何一个关键节点，AI 为你推演另一条岔路上的故事——
            <mark>不是冷冰冰的推演报告，而是一次沉浸式的情感体验，一次与自己的温柔对话</mark>。
          </p>
          <button class="btn-primary" id="btn-start">
            开始体验
            <span>→</span>
          </button>
        </div>
      </header>

      <!-- 隐私承诺 — 直接融入首页，建立信任 -->
      <section class="privacy-promise">
        <div class="container">
          <div class="privacy-card">
            <div class="privacy-icon">🔒</div>
            <h3 class="privacy-title">这里没有注册，没有账号</h3>
            <p class="privacy-subtitle">你的故事只属于你自己</p>
            <ul class="privacy-list">
              <li>
                <span class="privacy-dot">·</span>
                <span>所有对话和记录只保存在你这台设备的浏览器中</span>
              </li>
              <li>
                <span class="privacy-dot">·</span>
                <span>不会上传到任何服务器，不会被用于 AI 训练</span>
              </li>
              <li>
                <span class="privacy-dot">·</span>
                <span>体验结束后，你可以随时一键清除本地记录</span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      <section class="home-examples">
        <div class="container">
          <h3>试试想象这些"如果当初"…</h3>
          <div class="example-chips">
            <span class="chip" data-example="如果当初去了另一座城市">如果当初去了另一座城市</span>
            <span class="chip" data-example="如果当初没有分手">如果当初没有分手</span>
            <span class="chip" data-example="如果当初选了另一份工作">如果当初选了另一份工作</span>
            <span class="chip" data-example="如果当初鼓起勇气表白">如果当初鼓起勇气表白</span>
            <span class="chip" data-example="如果当初选择了留学">如果当初选择了留学</span>
          </div>
        </div>
      </section>

      <footer class="footer-bar">
        <div class="container">
          <p>创意方案：<span>AI 平行人生</span> &nbsp;|&nbsp; 每个人心中都有一个"如果当初"</p>
          <p class="version-text">内测版 v1.0.0-beta</p>
          <p class="privacy-footer-note">你正在与一个不会记住你的 AI 对话。每一次体验都是独一无二的，就像每一个选择。</p>
        </div>
      </footer>
    </div>`;
  },

  mount() {
    document.getElementById('btn-start').onclick = () => {
      Store.resetSession();
      Router.navigate('chat');
    };

    document.querySelectorAll('.chip').forEach(el => {
      el.onclick = () => {
        Store.resetSession();
        // 预填示例到 Store
        Store.addChatMessage({
          role: 'ai',
          content: '每个人心中都有一个"如果当初"。你想回到哪个时刻？可以简单描述一下那个节点——是什么时候？在哪？你面临的选择是什么？'
        });
        Router.navigate('chat');
      };
    });
  },

  unmount() {}
};