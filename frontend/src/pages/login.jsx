import { useState } from 'react';
import { API_URL } from '../config';

export default function Login({ setUser }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // 'login' | 'forgot' | 'reset' — auto-starts in 'reset' mode if the page
  // was opened from a password-reset email link (?resetToken=...).
  const [mode, setMode] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('resetToken') ? 'reset' : 'login';
  });
  const [resetToken] = useState(() => new URLSearchParams(window.location.search).get('resetToken') || '');

  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotMessage, setForgotMessage] = useState('');

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetMessage, setResetMessage] = useState('');
  const [resetSucceeded, setResetSucceeded] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // CRITICAL FIX: Sending lowercase keys to match C# expectations
        body: JSON.stringify({ username: username, password: password })
      });

      if (res.ok) {
        const data = await res.json();
        // The backend now requires an auth token on every request —
        // store it so authFetch.js can attach it automatically.
        localStorage.setItem('authToken', data.token);
        // Set the user with the complex object so roles work perfectly
        setUser({ Name: data.name, Role: data.role });
      } else {
        // Upgraded error alert to show exact server complaints
        const errText = await res.text();
        alert(`Server Error (${res.status}): \n${errText || "Invalid credentials"}`);
      }
    } catch (err) {
      console.error(err);
      alert("Failed to connect to the server. Is the Cloudflare tunnel running?");
    } finally {
      setLoading(false);
    }
  };

  const handleForgotSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setForgotMessage('');

    try {
      const res = await fetch(`${API_URL}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail })
      });
      // The backend always returns the same generic message here on purpose
      // (whether or not the email matches an account) — see the SECURITY
      // NOTE in AuthController.ForgotPassword. The frontend just displays it.
      const data = await res.json();
      setForgotMessage(data.message || "If that email is registered, a password reset link has been sent.");
    } catch (err) {
      console.error(err);
      setForgotMessage("Failed to connect to the server. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleResetSubmit = async (e) => {
    e.preventDefault();
    setResetMessage('');

    if (newPassword.length < 8) {
      setResetMessage('Password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setResetMessage('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: resetToken, newPassword: newPassword })
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        setResetSucceeded(true);
        setResetMessage(data.message || 'Password updated. You can now log in with your new password.');
      } else {
        setResetMessage(data.message || data.error || 'This reset link is invalid or has expired. Please request a new one.');
      }
    } catch (err) {
      console.error(err);
      setResetMessage('Failed to connect to the server. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const backToLogin = () => {
    setMode('login');
    setForgotMessage('');
    setResetMessage('');
    // Drop ?resetToken= from the visible URL so refreshing doesn't re-enter reset mode
    window.history.replaceState({}, '', window.location.pathname);
  };

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="bg-white p-10 rounded-3xl shadow-2xl w-full max-w-md">
        
        <div className="text-center mb-10">
          <h2 className="text-4xl font-black tracking-tighter italic text-gray-900">
            B. Sl <span className="text-teal-500">ERP</span>
          </h2>
          <p className="text-gray-400 font-bold mt-2 text-sm uppercase tracking-widest">
            {mode === 'login' && 'System Authentication'}
            {mode === 'forgot' && 'Reset Your Password'}
            {mode === 'reset' && 'Choose A New Password'}
          </p>
        </div>

        {mode === 'login' && (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <input 
              type="text" 
              placeholder="Username" 
              className="w-full p-4 border-2 border-gray-100 rounded-xl outline-none focus:border-teal-500 transition font-bold"
              value={username}
              onChange={e => setUsername(e.target.value)}
            />
            <input 
              type="password" 
              placeholder="Password" 
              className="w-full p-4 border-2 border-gray-100 rounded-xl outline-none focus:border-teal-500 transition font-bold"
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
            
            <button 
              type="submit" 
              disabled={loading || !username || !password}
              className="w-full mt-4 bg-teal-500 text-white p-4 rounded-xl font-black hover:bg-teal-600 transition shadow-lg shadow-teal-500/30 disabled:opacity-50 active:scale-95"
            >
              {loading ? 'AUTHENTICATING...' : 'SECURE LOGIN'}
            </button>

            <button
              type="button"
              onClick={() => setMode('forgot')}
              className="text-center text-xs font-bold text-gray-400 hover:text-teal-500 transition mt-2"
            >
              Forgot your password?
            </button>
          </form>
        )}

        {mode === 'forgot' && (
          <form onSubmit={handleForgotSubmit} className="flex flex-col gap-4">
            <p className="text-xs text-gray-500 font-bold text-center -mt-4 mb-2">
              Enter the email on your account and we'll send you a reset link.
            </p>
            <input 
              type="email" 
              required
              placeholder="Email address" 
              className="w-full p-4 border-2 border-gray-100 rounded-xl outline-none focus:border-teal-500 transition font-bold"
              value={forgotEmail}
              onChange={e => setForgotEmail(e.target.value)}
            />

            {forgotMessage && (
              <p className="text-xs font-bold text-teal-600 bg-teal-50 border border-teal-200 rounded-xl p-3 text-center">
                {forgotMessage}
              </p>
            )}

            <button 
              type="submit" 
              disabled={loading || !forgotEmail}
              className="w-full mt-2 bg-teal-500 text-white p-4 rounded-xl font-black hover:bg-teal-600 transition shadow-lg shadow-teal-500/30 disabled:opacity-50 active:scale-95"
            >
              {loading ? 'SENDING...' : 'SEND RESET LINK'}
            </button>

            <button
              type="button"
              onClick={backToLogin}
              className="text-center text-xs font-bold text-gray-400 hover:text-teal-500 transition mt-2"
            >
              Back to login
            </button>
          </form>
        )}

        {mode === 'reset' && (
          <form onSubmit={handleResetSubmit} className="flex flex-col gap-4">
            {!resetSucceeded ? (
              <>
                <input 
                  type="password" 
                  required
                  placeholder="New password (min 8 characters)" 
                  className="w-full p-4 border-2 border-gray-100 rounded-xl outline-none focus:border-teal-500 transition font-bold"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                />
                <input 
                  type="password" 
                  required
                  placeholder="Confirm new password" 
                  className="w-full p-4 border-2 border-gray-100 rounded-xl outline-none focus:border-teal-500 transition font-bold"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                />

                {resetMessage && (
                  <p className="text-xs font-bold text-red-600 bg-red-50 border border-red-200 rounded-xl p-3 text-center">
                    {resetMessage}
                  </p>
                )}

                <button 
                  type="submit" 
                  disabled={loading || !newPassword || !confirmPassword}
                  className="w-full mt-2 bg-teal-500 text-white p-4 rounded-xl font-black hover:bg-teal-600 transition shadow-lg shadow-teal-500/30 disabled:opacity-50 active:scale-95"
                >
                  {loading ? 'UPDATING...' : 'SET NEW PASSWORD'}
                </button>
              </>
            ) : (
              <>
                <p className="text-sm font-bold text-teal-600 bg-teal-50 border border-teal-200 rounded-xl p-4 text-center">
                  {resetMessage}
                </p>
                <button 
                  type="button" 
                  onClick={backToLogin}
                  className="w-full mt-2 bg-teal-500 text-white p-4 rounded-xl font-black hover:bg-teal-600 transition shadow-lg shadow-teal-500/30 active:scale-95"
                >
                  GO TO LOGIN
                </button>
              </>
            )}
          </form>
        )}
        
      </div>
    </div>
  );
}