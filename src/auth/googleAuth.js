(function initMasakoAuth(windowObj) {
  const AuthState = { client: null, session: null, onChange: null };
  const isReturningFromAuth = windowObj.location.hash.includes('access_token=');

  function applySession(session) {
    AuthState.session = session;
    windowObj.MasakoAuth = {
      ...windowObj.MasakoAuth,
      user: session?.user || null,
      token: session?.access_token || null,
      isAuthenticated: Boolean(session?.access_token)
    };
    if (typeof AuthState.onChange === 'function') AuthState.onChange(windowObj.MasakoAuth);
  }


  function parseTokensFromHash() {
    const hash = windowObj.location.hash || '';
    if (!hash || !hash.includes('access_token=')) return null;
    const params = new URLSearchParams(hash.replace(/^#/, ''));
    const access_token = params.get('access_token');
    const refresh_token = params.get('refresh_token');
    if (!access_token || !refresh_token) return null;
    return { access_token, refresh_token };
  }

  async function recoverSessionFromHash() {
    if (!AuthState.client) return false;
    const tokens = parseTokensFromHash();
    if (!tokens) return false;

    try {
      const { data, error } = await AuthState.client.auth.setSession(tokens);
      if (error) throw error;
      if (data?.session) {
        applySession(data.session);
        windowObj.history.replaceState({}, windowObj.document.title, windowObj.location.pathname + windowObj.location.search);
        return true;
      }
    } catch (err) {
      console.warn('Gagal memulihkan session dari hash OAuth:', err);
    }
    return false;
  }

  async function initSupabaseAuth({ url, anonKey, onAuthChange } = {}) {
    if (!windowObj.supabase?.createClient) throw new Error('Supabase SDK belum dimuat.');
    if (!url || !anonKey) throw new Error('SUPABASE_URL / SUPABASE_ANON_KEY belum di-set.');

    AuthState.client = windowObj.supabase.createClient(url, anonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
      }
    });
    AuthState.onChange = onAuthChange || null;

    if (isReturningFromAuth) {
      await recoverSessionFromHash();
    }

    AuthState.client.auth.onAuthStateChange((event, session) => {
      console.log('Auth Event Terdeteksi:', event);

      if (session) {
        applySession(session);

        if (windowObj.location.hash.includes('access_token=')) {
          windowObj.history.replaceState({}, windowObj.document.title, windowObj.location.pathname + windowObj.location.search);
        }
        return;
      }

      if (event === 'SIGNED_OUT') {
        applySession(null);
        return;
      }

      if (!isReturningFromAuth) {
        applySession(null);
      }
    });

    const waitMs = isReturningFromAuth ? 1200 : 300;
    setTimeout(async () => {
      const { data } = await AuthState.client.auth.getSession();
      if (data?.session) {
        applySession(data.session);

        if (windowObj.location.hash.includes('access_token=')) {
          windowObj.history.replaceState({}, windowObj.document.title, windowObj.location.pathname + windowObj.location.search);
        }
        return;
      }

      if (isReturningFromAuth) {
        setTimeout(async () => {
          const retry = await AuthState.client.auth.getSession();
          if (retry?.data?.session) {
            applySession(retry.data.session);
            if (windowObj.location.hash.includes('access_token=')) {
              windowObj.history.replaceState({}, windowObj.document.title, windowObj.location.pathname + windowObj.location.search);
            }
            return;
          }
          applySession(null);
        }, 1000);
        return;
      }

      applySession(null);
    }, waitMs);
  }

  async function signInWithGoogle() {
    return AuthState.client.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: 'https://polytoolbtc.vercel.app/'
      }
    });
  }

  async function signOut() {
    if (AuthState.client) await AuthState.client.auth.signOut();
    applySession(null);
    window.location.reload();
  }

  windowObj.MasakoAuth = { initSupabaseAuth, signInWithGoogle, signOut, user: null, token: null, isAuthenticated: false };
})(window);

window.setupAuthUI = function setupAuthUI() {
  const overlay = document.getElementById('auth-overlay');
  const loginBtn = document.getElementById('btn-login-google');
  const logoutBtn = document.getElementById('btn-logout');

  const showAuthGate = (isAuthed) => {
    if (overlay) overlay.classList.toggle('active', !isAuthed);
    if (logoutBtn) logoutBtn.style.display = isAuthed ? 'inline-flex' : 'none';
  };

  const clearSensitiveState = () => {
    Object.keys(localStorage)
      .filter((k) => k.startsWith('masako_'))
      .forEach((k) => localStorage.removeItem(k));

    if (window.FuturesEngine?.state) {
      window.FuturesEngine.state.positions = [];
      window.FuturesEngine.save?.();
    }

    if (window.MarketFeed?.stop) {
      window.MarketFeed.stop();
    }
  };

  const bootAppAfterLogin = () => {
    if (window.__MASAKO_APP_STARTED__) return;
    window.__MASAKO_APP_STARTED__ = true;
    if (typeof window.initApp === 'function') window.initApp();
  };

  window.MasakoAuth.initSupabaseAuth({
    url: window.SUPABASE_URL,
    anonKey: window.SUPABASE_ANON_KEY,
    onAuthChange: (auth) => {
      showAuthGate(Boolean(auth?.isAuthenticated));
      if (auth?.isAuthenticated) bootAppAfterLogin();
    }
  }).catch((err) => {
    console.error('Auth init gagal:', err);
    showAuthGate(false);
  });

  loginBtn?.addEventListener('click', async () => {
    await window.MasakoAuth.signInWithGoogle();
  });

  logoutBtn?.addEventListener('click', async () => {
    await window.MasakoAuth.signOut();
    clearSensitiveState();
    window.__MASAKO_APP_STARTED__ = false;
    showAuthGate(false);
  });
};
