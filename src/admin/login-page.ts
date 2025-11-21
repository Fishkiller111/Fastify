import { FastifyInstance, FastifyReply } from 'fastify';

async function adminLoginPageRoutes(fastify: FastifyInstance) {
  fastify.get('/admin-login', async (request, reply: FastifyReply) => {
    const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
    const lang = url.searchParams.get('lang') === 'en' ? 'en' : 'zh';
    const targetPath = lang === 'en' ? '/admin-en' : '/admin';

    const html = `<!DOCTYPE html>
<html lang="${lang === 'en' ? 'en' : 'zh-CN'}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${lang === 'en' ? 'Meme Admin Login' : 'Meme 管理后台登录'}</title>
  <style>
    :root {
      --bg-main: #050607;
      --bg-card: #0b0d12;
      --border-color: #2c2c34;
      --gold: #f5c24c;
      --gold-soft: #e0ae3f;
      --gold-dark: #c08f31;
      --text-main: #ffffff;
      --text-muted: #aaaaaa;
      --danger: #ff4d4f;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      min-height: 100vh;
      background: radial-gradient(circle at top, #11131a 0, var(--bg-main) 55%);
      color: var(--text-main);
      font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, -system-ui, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }

    .container {
      max-width: 420px;
      width: 100%;
    }

    .card {
      background: linear-gradient(145deg, rgba(245, 194, 76, 0.08), rgba(9, 9, 14, 0.95));
      border-radius: 16px;
      border: 1px solid rgba(245, 194, 76, 0.28);
      box-shadow: 0 18px 40px rgba(0, 0, 0, 0.55);
      padding: 28px 26px 26px;
      backdrop-filter: blur(16px);
    }

    .title {
      font-size: 22px;
      font-weight: 600;
      color: var(--gold);
      letter-spacing: 0.06em;
      text-transform: uppercase;
      margin-bottom: 8px;
    }

    .subtitle {
      font-size: 13px;
      color: var(--text-muted);
      margin-bottom: 24px;
    }

    .field-label {
      display: block;
      font-size: 13px;
      color: var(--gold);
      margin-bottom: 6px;
    }

    .input {
      width: 100%;
      padding: 10px 12px;
      border-radius: 8px;
      border: 1px solid var(--border-color);
      background: #05060a;
      color: var(--text-main);
      font-size: 13px;
      outline: none;
      transition: border-color 0.18s ease, box-shadow 0.18s ease, background 0.18s ease;
    }

    .input::placeholder {
      color: #55596b;
    }

    .input:focus {
      border-color: var(--gold);
      box-shadow: 0 0 0 1px rgba(245, 194, 76, 0.5);
      background: #04050a;
    }

    .hint {
      font-size: 12px;
      color: var(--text-muted);
      margin-top: 6px;
    }

    .actions {
      margin-top: 20px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .btn {
      width: 100%;
      border-radius: 999px;
      border: none;
      padding: 10px 14px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.16s ease, transform 0.08s ease, box-shadow 0.16s ease;
    }

    .btn-primary {
      background: linear-gradient(135deg, var(--gold) 0%, var(--gold-dark) 100%);
      color: #000000;
      box-shadow: 0 8px 20px rgba(245, 194, 76, 0.35);
    }

    .btn-primary:hover {
      transform: translateY(-1px);
      box-shadow: 0 10px 28px rgba(245, 194, 76, 0.5);
      background: linear-gradient(135deg, var(--gold-soft) 0%, var(--gold-dark) 100%);
    }

    .btn-primary:active {
      transform: translateY(0);
      box-shadow: 0 4px 14px rgba(245, 194, 76, 0.3);
    }

    .btn-secondary {
      background: transparent;
      color: var(--text-muted);
      border: 1px solid rgba(255, 255, 255, 0.08);
    }

    .btn-secondary:hover {
      background: rgba(255, 255, 255, 0.04);
    }

    .status {
      min-height: 18px;
      font-size: 12px;
      margin-top: 8px;
    }

    .status-error {
      color: var(--danger);
    }

    .status-success {
      color: var(--gold);
    }

    .footer {
      margin-top: 20px;
      font-size: 11px;
      color: var(--text-muted);
      text-align: center;
    }

    .footer span {
      color: var(--gold);
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <h1 class="title">ADMIN PANEL</h1>
      <p class="subtitle">${lang === 'en'
        ? 'Login with admin wallet address · only super_admin can access'
        : '使用管理员钱包地址登录后台 · 仅 <span style="color: var(--gold);">super_admin</span> 可访问'}</p>

      <div style="display:flex; justify-content:flex-end; margin-bottom:8px; font-size:11px; color:var(--text-muted);">
        <button type="button" id="lang-zh" style="background:transparent;border:none;color:${lang === 'zh' ? 'var(--gold)' : 'var(--text-muted)'};cursor:pointer;margin-right:6px;">中文</button>
        <span style="opacity:0.4;">|</span>
        <button type="button" id="lang-en" style="background:transparent;border:none;color:${lang === 'en' ? 'var(--gold)' : 'var(--text-muted)'};cursor:pointer;margin-left:6px;">EN</button>
      </div>

      <form id="admin-login-form">
        <label for="walletAddress" class="field-label">${lang === 'en' ? 'Admin wallet address' : '管理员钱包地址'}</label>
        <input
          id="walletAddress"
          name="walletAddress"
          class="input"
          type="text"
          placeholder="${lang === 'en' ? 'e.g. 0x1234... or your Solana address' : '例如：0x1234... 或你的 Solana 地址'}"
          autocomplete="off"
        />
        <div class="hint">${lang === 'en'
          ? "Backend will verify this wallet in users table and only role = 'super_admin' can login."
          : "后端会根据钱包地址在 users 表中查找，只有 role = 'super_admin' 的用户可以登录。"}</div>

        <div class="actions">
          <button type="submit" class="btn btn-primary">${lang === 'en' ? 'Login to Admin' : '登录后台'}</button>
          <button type="button" class="btn btn-secondary" id="go-admin-btn">${lang === 'en' ? 'Open Admin (EN)' : '直接访问 /admin'}</button>
        </div>

        <div id="status" class="status"></div>
      </form>

      <div class="footer">
        <span>Meme</span> ${lang === 'en' ? 'Admin Panel · Black-Gold Theme' : '管理后台 · 黑金主题'}
      </div>
    </div>
  </div>

  <script>
    const form = document.getElementById('admin-login-form');
    const statusEl = document.getElementById('status');
    const goAdminBtn = document.getElementById('go-admin-btn');
    const langZhBtn = document.getElementById('lang-zh');
    const langEnBtn = document.getElementById('lang-en');

    function setStatus(text, type) {
      statusEl.textContent = text || '';
      statusEl.className = 'status' + (type ? ' status-' + type : '');
    }

    langZhBtn?.addEventListener('click', () => {
      const url = new URL(window.location.href);
      url.searchParams.set('lang', 'zh');
      window.location.href = url.toString();
    });

    langEnBtn?.addEventListener('click', () => {
      const url = new URL(window.location.href);
      url.searchParams.set('lang', 'en');
      window.location.href = url.toString();
    });

    goAdminBtn.addEventListener('click', () => {
      window.location.href = '${targetPath}';
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const walletAddressInput = document.getElementById('walletAddress');
      const walletAddress = walletAddressInput.value.trim();

      if (!walletAddress) {
        setStatus(${lang === 'en' ? "'Please enter admin wallet address'" : "'请输入管理员钱包地址'"}, 'error');
        walletAddressInput.focus();
        return;
      }

      setStatus(${lang === 'en' ? "'Logging in...'" : "'正在登录...'"}, 'success');

      try {
        const res = await fetch('/api/auth/admin/login/wallet', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ walletAddress }),
          credentials: 'same-origin',
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          const msg = (data && data.error) || (${lang === 'en'
            ? "'Login failed, please check wallet address or permissions'"
            : "'登录失败，请检查钱包地址或权限'"});
          setStatus(msg, 'error');
          return;
        }

        setStatus(${lang === 'en' ? "'Login success, redirecting to admin...'" : "'登录成功，正在跳转到后台...'"}, 'success');

        // 后台已经通过 Set-Cookie 写入 admin_token，这里根据当前语言跳转到对应后台
        setTimeout(() => {
          window.location.href = '${targetPath}';
        }, 500);
      } catch (err) {
        console.error(err);
        setStatus(${lang === 'en' ? "'Network error, please try again later'" : "'网络错误，请稍后重试'"}, 'error');
      }
    });
  </script>
</body>
</html>`;

    reply.type('text/html; charset=utf-8').send(html);
  });
}

export default adminLoginPageRoutes;
