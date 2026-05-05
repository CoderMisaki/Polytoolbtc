(function initMasakoAuth(windowObj) {
  const AuthState = { client: null, session: null, onChange: null };

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

  async function initSupabaseAuth({ url, anonKey, onAuthChange } = {}) {
    if (!windowObj.supabase?.createClient) throw new Error('Supabase SDK belum dimuat.');

    // Inisialisasi standar. SDK v2 akan otomatis mengurus URL fragment
    AuthState.client = windowObj.supabase.createClient(url, anonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
      }
    });
    AuthState.onChange = onAuthChange || null;

    // Listener utama yang menangkap hasil redirect
    AuthState.client.auth.onAuthStateChange((event, session) => {
      console.log('Auth Event:', event);
      if (session) {
        applySession(session);
        // Bersihkan token panjang dari URL agar rapi
        if (windowObj.location.hash || windowObj.location.search) {
          windowObj.history.replaceState(null, '', windowObj.location.pathname);
        }
      } else if (event === 'SIGNED_OUT') {
        applySession(null);
      }
    });

    // Cek apakah ada token di URL (tanda baru balik dari Google)
    const isRedirecting = windowObj.location.hash.includes('access_token=') || 
                          windowObj.location.search.includes('code=');

    // Ambil session saat ini
    const { data: { session } } = await AuthState.client.auth.getSession();
    
    if (session) {
      applySession(session);
    } else if (!isRedirecting) {
      // Jika TIDAK ADA session dan BUKAN sedang redirect, baru munculkan login
      applySession(null);
    } else {
      // Fallback: Jika ada token di URL tapi setelah 3 detik SDK gagal memprosesnya,
      // baru paksa munculkan layar login untuk mencegah blank screen.
      setTimeout(() => {
        if (!windowObj.MasakoAuth.isAuthenticated) {
          applySession(null);
        }
      }, 3000);
    }
  }

  async function signInWithGoogle() {
    return AuthState.client.auth.signInWithOAuth({
      provider: 'google',
      options: {
        // Arahkan ke root URL (pastikan sama dengan Dashboard Supabase)
        redirectTo: windowObj.location.origin + '/'
      }
    });
  }

  async function signOut() {
    if (AuthState.client) await AuthState.client.auth.signOut();
    applySession(null);
    windowObj.location.reload();
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
