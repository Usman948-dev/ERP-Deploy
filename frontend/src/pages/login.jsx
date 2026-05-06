import { useState } from 'react';

export default function Login({ setUser }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Pointing directly to your new AuthController tunnel
      const res = await fetch('http://157.173.96.166:5001/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // CRITICAL FIX: Sending lowercase keys to match C# expectations
        body: JSON.stringify({ username: username, password: password })
      });

      if (res.ok) {
        const data = await res.json();
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

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="bg-white p-10 rounded-3xl shadow-2xl w-full max-w-md">
        
        <div className="text-center mb-10">
          <h2 className="text-4xl font-black tracking-tighter italic text-gray-900">
            B. Sl <span className="text-teal-500">ERP</span>
          </h2>
          <p className="text-gray-400 font-bold mt-2 text-sm uppercase tracking-widest">System Authentication</p>
        </div>

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
        </form>
        
      </div>
    </div>
  );
}