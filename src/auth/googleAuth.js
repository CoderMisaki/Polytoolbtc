(function initMasakoAuth(windowObj) {
  const AuthState = { provider: null, client: null, session: null, token: null, user: null };
  async function initSupabaseAuth({ url, anonKey }) {
    if (!windowObj.supabase?.createClient) throw new Error('Supabase SDK belum dimuat di halaman.');
    AuthState.provider = 'supabase';
    AuthState.client = windowObj.supabase.createClient(url, anonKey);
    const { data } = await AuthState.client.auth.getSession();
    applySession(data?.session || null);
    AuthState.client.auth.onAuthStateChange((_event, session) => applySession(session));
  }
  function applySession(session) {
    AuthState.session = session; AuthState.user = session?.user || null; AuthState.token = session?.access_token || null;
    windowObj.MasakoAuth = { ...windowObj.MasakoAuth, user: AuthState.user, token: AuthState.token, isAuthenticated: Boolean(AuthState.token) };
  }
  async function signInWithGoogle() { return AuthState.client.auth.signInWithOAuth({ provider: 'google' }); }
  async function signOut() { if (AuthState.provider === 'supabase') await AuthState.client.auth.signOut(); applySession(null); }
  async function getAccessToken() { if (AuthState.token) return AuthState.token; const { data } = await AuthState.client.auth.getSession(); applySession(data?.session || null); return AuthState.token; }
  windowObj.MasakoAuth = { initSupabaseAuth, signInWithGoogle, signOut, getAccessToken, user: null, token: null, isAuthenticated: false };
})(window);

window.setupAuthUI = function setupAuthUI() {
  const loginBtn = document.getElementById('btn-login-google');
  const logoutBtn = document.getElementById('btn-logout');
  const userLabel = document.getElementById('auth-user-label');

  function renderAuthState() {
    const user = window.MasakoAuth?.user;
    if (user) {
      if (userLabel) userLabel.textContent = `Login: ${user.email || user.id}`;
      if (loginBtn) loginBtn.style.display = 'none';
      if (logoutBtn) logoutBtn.style.display = 'inline-flex';
    } else {
      if (userLabel) userLabel.textContent = 'Belum login';
      if (loginBtn) loginBtn.style.display = 'inline-flex';
      if (logoutBtn) logoutBtn.style.display = 'none';
    }
  }

  if (loginBtn) loginBtn.addEventListener('click', async () => {
    await window.MasakoAuth.signInWithGoogle();
  });
  if (logoutBtn) logoutBtn.addEventListener('click', async () => {
    await window.MasakoAuth.signOut();
    renderAuthState();
  });

  setInterval(renderAuthState, 500);
  renderAuthState();
};
