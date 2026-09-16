import { useState } from 'react';
import { API_URL } from '../config';

export default function ChangePassword({ user }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);

  const userName = typeof user === 'string' ? user : (user?.Name || 'Staff');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');
    setIsError(false);

    if (newPassword.length < 8) {
      setMessage('New password must be at least 8 characters.');
      setIsError(true);
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage('New password and confirmation do not match.');
      setIsError(true);
      return;
    }

    setLoading(true);
    try {
      // authFetch.js (see src/lib/authFetch.js) automatically attaches the
      // logged-in user's token to this request — the backend reads identity
      // from that token, not from anything in the request body, so a user
      // can only ever change their own password.
      const res = await fetch(`${API_URL}/auth/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword })
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        setIsError(false);
        setMessage(data.message || 'Password changed successfully.');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setIsError(true);
        setMessage(data.message || data.error || 'Failed to change password.');
      }
    } catch (err) {
      console.error(err);
      setIsError(true);
      setMessage('Failed to connect to the server. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 bg-gray-50 min-h-screen font-sans flex justify-center">
      <div className="w-full max-w-md">
        <div className="mb-8">
          <h1 className="text-3xl font-black tracking-tighter text-gray-900">Account Settings</h1>
          <p className="text-gray-400 font-bold text-sm mt-1">Logged in as {userName}</p>
        </div>

        <div className="bg-white p-8 rounded-[2rem] border border-gray-100 shadow-sm">
          <h2 className="text-gray-900 font-black uppercase text-sm tracking-widest mb-6 flex items-center gap-2">
            <div className="w-2 h-2 bg-teal-500 rounded-full"></div>
            Change Password
          </h2>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase">Current Password</label>
              <input
                type="password"
                required
                className="w-full p-4 mt-1 border-2 border-gray-100 rounded-xl outline-none focus:border-teal-500 transition font-bold"
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
              />
            </div>
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase">New Password</label>
              <input
                type="password"
                required
                placeholder="Min 8 characters"
                className="w-full p-4 mt-1 border-2 border-gray-100 rounded-xl outline-none focus:border-teal-500 transition font-bold placeholder:font-normal placeholder:text-gray-400"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
              />
            </div>
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase">Confirm New Password</label>
              <input
                type="password"
                required
                className="w-full p-4 mt-1 border-2 border-gray-100 rounded-xl outline-none focus:border-teal-500 transition font-bold"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
              />
            </div>

            {message && (
              <p className={`text-xs font-bold rounded-xl p-3 text-center border ${
                isError
                  ? 'text-red-600 bg-red-50 border-red-200'
                  : 'text-teal-600 bg-teal-50 border-teal-200'
              }`}>
                {message}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || !currentPassword || !newPassword || !confirmPassword}
              className="w-full mt-2 bg-teal-500 text-white p-4 rounded-xl font-black hover:bg-teal-600 transition shadow-lg shadow-teal-500/30 disabled:opacity-50 active:scale-95"
            >
              {loading ? 'UPDATING...' : 'UPDATE PASSWORD'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
