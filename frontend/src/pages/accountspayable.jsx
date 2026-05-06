import { useState, useEffect } from 'react';

export default function AccountsPayable() {
  const [apList, setApList] = useState([]);
  const [loading, setLoading] = useState(true);

  // BASE URL consistent with your fixed Purchases page
  const BASE_URL = 'https://hughes-declared-marshall-bone.trycloudflare.com/api';

  useEffect(() => { fetchAP(); }, []);

  const fetchAP = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${BASE_URL}/purchases/ap-list`);
      if (res.ok) {
        const data = await res.json();
        setApList(data);
      }
    } catch (err) {
      console.error("AP Fetch Error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handlePayment = async (supplierId) => {
    const amount = prompt("Enter amount to pay:");
    if (!amount || isNaN(amount)) return;

    try {
      const res = await fetch(`${BASE_URL}/purchases/pay-ap`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ SupplierID: parseInt(supplierId), AmountToPay: parseFloat(amount) })
      });

      if (res.ok) {
        alert("Payment Recorded Successfully!");
        fetchAP(); // Refresh list
      } else {
        alert("Server error recording payment.");
      }
    } catch (err) {
      alert("Failed to connect to server.");
    }
  };

  return (
    <div className="p-8 bg-slate-900 min-h-screen text-slate-100 font-sans">
      
      {/* HEADER */}
      <div className="mb-10">
        <h1 className="text-4xl font-black tracking-tighter italic uppercase">
          Accounts <span className="text-amber-400">Payable</span>
        </h1>
        <p className="text-slate-500 font-bold text-xs uppercase tracking-widest mt-1">
          Outstanding Vendor Debts & Credit Management
        </p>
      </div>

      {/* DEBT OVERVIEW TABLE */}
      <div className="bg-slate-800 rounded-[2rem] border border-slate-700/50 shadow-2xl overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-950/50 border-b border-slate-700">
            <tr className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">
              <th className="p-6">Supplier / Vendor</th>
              <th className="p-6 text-right">Outstanding Balance</th>
              <th className="p-6 text-right">Management</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/30">
            {loading ? (
                <tr><td colSpan="3" className="p-20 text-center text-slate-500 font-black animate-pulse">RECONCILING LEDGER...</td></tr>
            ) : apList.length === 0 ? (
                <tr><td colSpan="3" className="p-20 text-center text-slate-600 italic">No outstanding debts found. All vendors are paid!</td></tr>
            ) : (
              apList.map(item => (
                <tr key={item.id} className="group hover:bg-slate-700/20 transition">
                  <td className="p-6">
                    <div className="font-black text-slate-100 uppercase tracking-tight text-lg">{item.supplierName}</div>
                    <div className="text-[10px] text-slate-500 font-bold uppercase mt-1">Direct Credit Line</div>
                  </td>
                  <td className="p-6 text-right">
                    <div className="text-2xl font-black text-amber-400 tracking-tighter">
                      OMR {parseFloat(item.balance).toFixed(3)}
                    </div>
                  </td>
                  <td className="p-6 text-right">
                    <button 
                      onClick={() => handlePayment(item.id)}
                      className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-black px-8 py-3 rounded-xl transition-all shadow-lg active:scale-95 text-xs uppercase tracking-widest"
                    >
                      Make Payment
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* FOOTER INFO */}
      <div className="mt-8 p-6 bg-slate-950 rounded-2xl border border-slate-800 flex justify-between items-center">
         <p className="text-slate-500 text-[10px] font-bold uppercase">OUD City Financial Terminal v1.0</p>
         <div className="flex items-center gap-2 text-green-500">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
            <span className="text-[10px] font-black uppercase">Live SQL Synchronization Active</span>
         </div>
      </div>
    </div>
  );
}