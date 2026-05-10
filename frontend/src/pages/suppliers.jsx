import { useState, useEffect } from 'react';

export default function Suppliers() {
  const [suppliers, setSuppliers] = useState([]);
  
  // Form State
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [loading, setLoading] = useState(false);

  // POINT THIS TO YOUR LIVE SERVER!
  const API_URL = 'http://157.173.96.166:5001/api';

  // Load suppliers immediately when the page opens
  useEffect(() => { 
    fetchSuppliers(); 
  }, []);

  const fetchSuppliers = async () => {
    try {
      const res = await fetch(`${API_URL}/suppliers/list`);
      if (res.ok) {
        setSuppliers(await res.json());
      }
    } catch (err) {
      console.error("Failed to fetch suppliers:", err);
    }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!name) return; // Prevent empty submissions
    
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/suppliers/add`, {
          method: 'POST', 
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ Name: name, ContactInfo: contact })
      });
      
      if (res.ok) {
          // Success! Clear the form and reload the table
          setName(''); 
          setContact(''); 
          fetchSuppliers();
          alert("Supplier registered successfully!");
      } else {
          // If C# crashes, this captures the exact SQL error and shows it to you
          const errText = await res.text();
          alert("Backend Error:\n" + errText); 
      }
    } catch (err) {
      alert("Failed to reach server. Is the C# API running?");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-black text-gray-900 tracking-tight">Supplier Management</h1>
        <p className="text-gray-500 font-medium mt-1">Register and manage your raw material vendors.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* LEFT COLUMN: ADD SUPPLIER FORM */}
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 h-fit">
          <h2 className="text-sm font-black text-gray-400 uppercase tracking-widest mb-6">Register Vendor</h2>
          
          <form onSubmit={handleAdd} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-gray-500 ml-1">COMPANY NAME *</label>
              <input 
                type="text" 
                placeholder="e.g. Apex Plastics Ltd." 
                required 
                className="w-full p-4 border-2 border-gray-100 rounded-xl outline-none focus:border-teal-500 transition font-bold text-gray-800" 
                value={name} 
                onChange={e => setName(e.target.value)} 
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-gray-500 ml-1">CONTACT INFO</label>
              <input 
                type="text" 
                placeholder="Phone number or Email" 
                className="w-full p-4 border-2 border-gray-100 rounded-xl outline-none focus:border-teal-500 transition font-bold text-gray-800" 
                value={contact} 
                onChange={e => setContact(e.target.value)} 
              />
            </div>

            <button 
              type="submit" 
              disabled={loading || !name}
              className="w-full mt-2 bg-teal-500 text-white font-black p-4 rounded-xl hover:bg-teal-600 transition shadow-lg shadow-teal-500/30 active:scale-95 disabled:opacity-50 disabled:active:scale-100"
            >
              {loading ? 'REGISTERING...' : 'REGISTER SUPPLIER'}
            </button>
          </form>
        </div>

        {/* RIGHT COLUMN: SUPPLIER REGISTRY TABLE */}
        <div className="lg:col-span-2 bg-white p-6 rounded-3xl shadow-sm border border-gray-100 overflow-x-auto">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-sm font-black text-gray-400 uppercase tracking-widest">Active Vendors</h2>
            <span className="px-3 py-1 bg-gray-100 text-gray-500 rounded-lg text-xs font-bold">
              {suppliers.length} Registered
            </span>
          </div>

          <table className="w-full text-left">
            <thead>
              <tr className="text-xs font-black text-gray-400 uppercase border-b-2 border-gray-50">
                <th className="pb-3 pl-2">Supplier Name</th>
                <th className="pb-3">Contact Information</th>
              </tr>
            </thead>
            <tbody>
              {suppliers.length === 0 && (
                <tr>
                  <td colSpan="2" className="py-12 text-center text-gray-400 font-bold italic">
                    No suppliers registered yet.
                  </td>
                </tr>
              )}
              {suppliers.map(s => (
                <tr key={s.id} className="border-b border-gray-50 hover:bg-gray-50 transition">
                  <td className="py-4 pl-2 font-black text-gray-800">{s.name}</td>
                  <td className="py-4 font-bold text-gray-500">
                    {s.contactInfo || <span className="text-gray-300 font-normal italic">No contact provided</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

      </div>
    </div>
  );
}