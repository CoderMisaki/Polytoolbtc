(function initMasakoAuth(windowObj) {
  const AuthState = { provider: null, client: null, session: null, token: null, user: null, onChange: null };

  function applySession(session) {
    AuthState.session = session;
    AuthState.user = session?.user || null;
    AuthState.token = session?.access_token || null;
    windowObj.MasakoAuth = {
      ...windowObj.MasakoAuth,
      user: AuthState.user,
      token: AuthState.token,
      isAuthenticated: Boolean(AuthState.token)
    };
    if (typeof AuthState.onChange === 'function') AuthState.onChange(windowObj.MasakoAuth);
  }

  async function initSupabaseAuth({ url, anonKey, onAuthChange } = {}) {
    if (!windowObj.supabase?.createClient) throw new Error('Supabase SDK belum dimuat.');
    if (!url || !anonKey) throw new Error('SUPABASE_URL / SUPABASE_ANON_KEY belum di-set.');
    AuthState.provider = 'supabase';
    AuthState.client = windowObj.supabase.createClient(url, anonKey);
    AuthState.onChange = onAuthChange || null;
    const { data } = await AuthState.client.auth.getSession();
    applySession(data?.session || null);
    AuthState.client.auth.onAuthStateChange((_event, session) => applySession(session));
  }

  async function signInWithGoogle() { return AuthState.client.auth.signInWithOAuth({ provider: 'google' }); }
  async function signOut() { if (AuthState.client) await AuthState.client.auth.signOut(); applySession(null); }

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
