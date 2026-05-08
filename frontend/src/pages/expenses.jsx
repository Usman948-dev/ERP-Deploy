import { useState, useEffect } from 'react';

// POINT THIS TO YOUR LIVE CONTABO SERVER!
const API_URL = 'http://157.173.96.166:5001/api';

export default function Expenses({ user }) {
  const [expenses, setExpenses] = useState([]);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // --- BULLETPROOF ADMIN CHECK ---
  // This ensures the system recognizes you as Admin regardless of how Login.jsx is built
  const isAdmin = user === 'Admin' || user?.Role === 'Admin' || user?.role === 'admin' || user?.Name === 'Admin';
  const userName = typeof user === 'string' ? user : (user?.Name || 'Staff');

  useEffect(() => {
    fetchExpenses();
  }, [startDate, endDate]);

  const fetchExpenses = async () => {
    try {
      let url = `${API_URL}/expenses`;
      if (startDate && endDate) {
        url += `?startDate=${startDate}&endDate=${endDate}`;
      }
      const res = await fetch(url);
      if (res.ok) {
        setExpenses(await res.json());
      } else {
        console.error("Backend error:", await res.text());
      }
    } catch (err) { console.error("Failed to fetch expenses", err); }
  };

  const handleAddExpense = async (e) => {
    e.preventDefault();
    if (!description || !amount) return;

    try {
      const res = await fetch(`${API_URL}/expenses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          Description: description,
          Amount: parseFloat(amount),
          AddedBy: userName,
          // If you are recognized as Admin, tell the C# backend to auto-approve!
          Role: isAdmin ? 'Admin' : 'Cashier' 
        })
      });

      if (res.ok) {
        setDescription('');
        setAmount('');
        fetchExpenses();
        const data = await res.json();
        alert(data.message);
      }
    } catch (err) { 
        console.error(err);
        alert("Server connection failed."); 
    }
  };

  const handleStatusUpdate = async (id, newStatus) => {
    try {
      const res = await fetch(`${API_URL}/expenses/${id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newStatus)
      });
      if (res.ok) fetchExpenses();
    } catch (err) { alert("Error updating status."); }
  };

  return (
    <div className="p-8">
      <h1 className="text-3xl font-black mb-8 text-gray-800 tracking-tight">Operating Expenses</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* ADD EXPENSE FORM */}
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 h-fit">
          <h2 className="text-sm font-black text-gray-400 uppercase tracking-widest mb-6">Record New Expense</h2>
          <form onSubmit={handleAddExpense} className="flex flex-col gap-4">
            <input 
              type="text" 
              placeholder="Description (e.g. Utility Bill)" 
              className="w-full p-4 border-2 border-gray-100 rounded-xl outline-none focus:border-teal-500 transition"
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
            <input 
              type="number" 
              placeholder="Amount (OMR)" 
              className="w-full p-4 border-2 border-gray-100 rounded-xl outline-none focus:border-teal-500 transition"
              value={amount}
              onChange={e => setAmount(e.target.value)}
            />
            <button type="submit" className="w-full mt-2 bg-teal-500 text-white p-4 rounded-xl font-black hover:bg-teal-600 transition shadow-lg shadow-teal-500/30">
              SUBMIT EXPENSE
            </button>
            <p className="text-xs text-gray-400 font-bold text-center mt-2 px-2">
              {isAdmin ? 'As Admin, this will be automatically approved.' : 'Will be marked as Pending until Admin approval.'}
            </p>
          </form>
        </div>

        {/* REGISTRY & FILTERS */}
        <div className="lg:col-span-2 bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
          
          <div className="flex flex-wrap justify-between items-center mb-6 gap-4">
            <h2 className="text-sm font-black text-gray-400 uppercase tracking-widest">Expense Registry</h2>
            <div className="flex items-center gap-2 bg-gray-50 p-2 rounded-xl border border-gray-100">
              <input type="date" className="bg-transparent text-sm font-bold text-gray-600 outline-none" value={startDate} onChange={e => setStartDate(e.target.value)} />
              <span className="text-gray-300 font-black">to</span>
              <input type="date" className="bg-transparent text-sm font-bold text-gray-600 outline-none" value={endDate} onChange={e => setEndDate(e.target.value)} />
              <button onClick={() => {setStartDate(''); setEndDate('');}} className="text-xs font-black text-red-400 hover:text-red-600 ml-2 px-2">CLEAR</button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-xs font-black text-gray-400 uppercase border-b-2 border-gray-50">
                  <th className="pb-3 pl-2">Date</th>
                  <th className="pb-3">Description</th>
                  <th className="pb-3">Amount</th>
                  <th className="pb-3">User</th>
                  <th className="pb-3">Status</th>
                  {/* ONLY SHOW APPROVAL HEADER IF ADMIN */}
                  {isAdmin && <th className="pb-3 text-right pr-2">Approval</th>}
                </tr>
              </thead>
              <tbody>
                {expenses.length === 0 && (
                  <tr><td colSpan="6" className="text-center py-8 text-gray-400 font-bold italic">No expenses found. (Refresh or clear filters)</td></tr>
                )}
                {expenses.map(exp => (
                  <tr key={exp.id} className="border-b border-gray-50 hover:bg-gray-50 transition">
                    <td className="py-4 pl-2 text-sm font-bold text-gray-500">{new Date(exp.date).toLocaleDateString()}</td>
                    <td className="py-4 font-black text-gray-800">{exp.description}</td>
                    <td className="py-4 font-black text-red-500">OMR {exp.amount.toFixed(3)}</td>
                    <td className="py-4 text-sm font-bold text-gray-600">{exp.addedBy}</td>
                    <td className="py-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-black ${
                        exp.status === 'Approved' ? 'bg-green-100 text-green-700' : 
                        exp.status === 'Pending' ? 'bg-orange-100 text-orange-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {exp.status.toUpperCase()}
                      </span>
                    </td>
                    
                    {/* ONLY SHOW APPROVAL BUTTONS IF ADMIN */}
                    {isAdmin && (
                      <td className="py-4 text-right pr-2">
                        {exp.status === 'Pending' ? (
                          <div className="flex gap-2 justify-end">
                            <button onClick={() => handleStatusUpdate(exp.id, 'Approved')} className="bg-green-500 text-white px-3 py-1.5 rounded-lg text-xs font-black hover:bg-green-600 active:scale-95 transition">APPROVE</button>
                            <button onClick={() => handleStatusUpdate(exp.id, 'Rejected')} className="bg-red-500 text-white px-3 py-1.5 rounded-lg text-xs font-black hover:bg-red-600 active:scale-95 transition">REJECT</button>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-300 font-bold uppercase">{exp.status}</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}