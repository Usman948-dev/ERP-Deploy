import { useState, useEffect } from 'react';

export default function Production({ user }) {
  // Security Check
  if (user?.Role === 'Cashier') {
    return <div className="p-20 text-white font-black text-center">ACCESS DENIED</div>;
  }

  const [products, setProducts] = useState([]);
  const [selectedFG, setSelectedFG] = useState('');
  const [yieldQty, setYieldQty] = useState('');
  const [electricity, setElectricity] = useState('');
  const [wastage, setWastage] = useState('');
  const [consumedMaterials, setConsumedMaterials] = useState([{ id: '', qty: '' }]);
  const [loading, setLoading] = useState(false);

  const [history, setHistory] = useState([]);
  const [selectedBatch, setSelectedBatch] = useState(null);

  const BASE_URL = 'https://hughes-declared-marshall-bone.trycloudflare.com/api';

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      // 1. Load Products/Inventory
      const res = await fetch(`${BASE_URL}/products/all`);
      if (res.ok) {
        const data = await res.json();
        const cleanData = data.map(p => {
          const barcode = p.Barcode || p.barcode || p.Code || p.code;
          return {
            id: barcode || p.id || p.Id, 
            name: p.Name || p.name || p.ProductName || p.productName || 'Unnamed Item',
            code: barcode || 'N/A',
            type: p.Type || p.type || p.InventoryType || 'Unknown' 
          };
        });
        setProducts(cleanData);
      }

      // 2. Load Production History
      const histRes = await fetch(`${BASE_URL}/production/history`);
      if (histRes.ok) {
        const histData = await histRes.json();
        setHistory(histData.map(h => ({
            id: h.BatchId ?? h.batchId ?? h.Id ?? h.id,
            date: h.ProductionDate ?? h.productionDate ?? h.date,
            fgName: h.FinishedGoodName ?? h.finishedGoodName ?? h.FgName ?? h.fgName ?? 'Unknown FG',
            yield: h.YieldQty ?? h.yieldQty ?? h.yield ?? 0,
            electricity: h.ElectricityCost ?? h.electricityCost ?? 0,
            wastage: h.Wastage ?? h.wastage ?? 0,
            loggedBy: h.LoggedBy ?? h.loggedBy ?? 'Admin',
            items: h.Materials ?? h.materials ?? [] 
        })));
      }
    } catch (err) {
      console.error("API Fetch Failed:", err);
    }
  };

  // --- SUBMISSION LOGIC WITH STRICT VALIDATION ---
  const handleRecordProduction = async () => {
    const validMaterialsRaw = consumedMaterials.filter(m => m.id.trim() !== '' && m.qty !== '');
    const qtyOut = parseFloat(yieldQty);

    if (!selectedFG || isNaN(qtyOut) || validMaterialsRaw.length === 0) {
      return alert("Missing Data: Please select FG, Yield, and at least one RM.");
    }

    // 1. Validate the Finished Good
    const fgMatch = selectedFG.match(/\((.*?)\)$/);
    const finalFgId = fgMatch ? fgMatch[1].trim() : selectedFG.trim();
    
    const fgExists = products.some(p => p.code === finalFgId || p.id === finalFgId);
    if (!fgExists) {
        return alert(`❌ ERROR: The output item "${selectedFG}" does not exist in your inventory. Please select a valid item from the dropdown.`);
    }

    // 2. Validate all Raw Materials
    const finalMaterials = [];
    for (const m of validMaterialsRaw) {
        const rmMatch = m.id.match(/\((.*?)\)$/);
        const rmCode = rmMatch ? rmMatch[1].trim() : m.id.trim();

        const rmExists = products.some(p => p.code === rmCode || p.id === rmCode);
        if (!rmExists) {
            return alert(`❌ ERROR: The raw material "${m.id}" does not exist in your inventory. You cannot use 'ghost' materials!`);
        }

        finalMaterials.push({
            Id: rmCode,
            QtyUsed: parseFloat(m.qty)
        });
    }

    setLoading(true);

    const payload = {
      FinishedGoodId: finalFgId, 
      YieldQty: qtyOut,
      ElectricityCost: parseFloat(electricity || 0),
      Wastage: parseFloat(wastage || 0),
      LoggedBy: user?.Name || "Project Manager",
      Materials: finalMaterials
    };

    try {
      const res = await fetch(`${BASE_URL}/production/record`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        alert("SUCCESS: Database Updated.");
        setConsumedMaterials([{ id: '', qty: '' }]);
        setYieldQty('');
        setSelectedFG('');
        setElectricity('');
        setWastage('');
        fetchData(); 
      } else {
        const errText = await res.text();
        alert("Server Error: " + errText);
      }
    } catch (err) {
      alert("Network Error. Is your tunnel active?");
    } finally {
      setLoading(false);
    }
  };

  const addMaterialRow = () => setConsumedMaterials([...consumedMaterials, { id: '', qty: '' }]);

  return (
    <div className="p-8 max-w-6xl mx-auto font-sans">
      <h1 className="text-4xl font-black text-white italic uppercase mb-8 tracking-tighter">
        Production <span className="text-teal-400">Log</span>
      </h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* --- LEFT COLUMN: PRODUCTION FORM --- */}
        <div className="bg-gray-800 rounded-[2.5rem] border border-gray-700 shadow-2xl p-8 space-y-8 h-fit">
          
          {/* --- UNIFIED DATALIST FOR EVERYTHING --- */}
          <datalist id="inventory-list">
            {products.map(p => <option key={`opt-${p.id}`} value={`${p.name} (${p.code})`} />)}
          </datalist>

          <section className="space-y-4">
            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">1. Finished Good (FG) Output</label>
            <div className="flex flex-col gap-4">
              
              <input 
                list="inventory-list"
                type="text"
                placeholder="Type to search Finished Goods..."
                className="p-5 bg-gray-700 text-white rounded-2xl outline-none border border-gray-600 focus:border-teal-500 font-bold w-full"
                value={selectedFG}
                onChange={e => setSelectedFG(e.target.value)}
              />

              <input 
                type="number" placeholder="Total Produced Qty" 
                className="p-5 bg-teal-900/10 text-teal-400 rounded-2xl border border-teal-500/30 outline-none font-black text-xl w-full"
                value={yieldQty} onChange={e => setYieldQty(e.target.value)}
              />
            </div>
          </section>

          <section className="space-y-4">
            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">2. Raw Materials (RM) Inputs</label>

            {consumedMaterials.map((row, index) => (
              <div key={`rm-row-${index}`} className="flex gap-3">
                
                <input 
                  list="inventory-list"
                  type="text"
                  placeholder="Type to search Raw Material..."
                  className="flex-grow p-5 bg-gray-700 text-white rounded-2xl border border-gray-600 outline-none focus:border-teal-500 font-bold"
                  value={row.id}
                  onChange={e => {
                    const newM = [...consumedMaterials];
                    newM[index].id = e.target.value;
                    setConsumedMaterials(newM);
                  }}
                />

                <input 
                  type="number" placeholder="Qty" 
                  className="w-28 p-5 bg-gray-700 text-white rounded-2xl border border-gray-600 outline-none font-bold text-center"
                  value={row.qty}
                  onChange={e => {
                    const newM = [...consumedMaterials];
                    newM[index].qty = e.target.value;
                    setConsumedMaterials(newM);
                  }}
                />
              </div>
            ))}
            <button onClick={addMaterialRow} className="text-teal-400 text-xs font-black uppercase tracking-widest hover:text-white transition">+ Add Material</button>
          </section>

          <section className="grid grid-cols-2 gap-4 border-t border-gray-700 pt-6">
            <input type="number" placeholder="Electricity Units" className="p-5 bg-gray-700 text-white rounded-2xl font-bold" value={electricity} onChange={e => setElectricity(e.target.value)} />
            <input type="number" placeholder="Wastage Qty" className="p-5 bg-gray-700 text-white rounded-2xl font-bold" value={wastage} onChange={e => setWastage(e.target.value)} />
          </section>

          <button 
            onClick={handleRecordProduction} disabled={loading}
            className="w-full bg-white hover:bg-teal-400 text-black font-black py-6 rounded-[1.5rem] transition shadow-2xl active:scale-[0.98] disabled:opacity-30 uppercase tracking-widest text-sm"
          >
            {loading ? "SAVING..." : "Record Production"}
          </button>
        </div>

        {/* --- RIGHT COLUMN: HISTORY TABLE --- */}
        <div className="bg-gray-800 p-8 rounded-[2.5rem] shadow-2xl border border-gray-700 overflow-x-auto h-fit">
          <h2 className="text-sm font-black text-gray-400 uppercase tracking-widest mb-6 border-b border-gray-700 pb-4">Recent Batches</h2>
          <table className="w-full text-left text-white">
            <thead>
              <tr className="text-[10px] font-black text-gray-500 uppercase">
                <th className="pb-4">Batch / Date</th>
                <th className="pb-4">Finished Good</th>
                <th className="pb-4 text-center">Yield</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {history.length === 0 ? (
                <tr><td colSpan="3" className="py-10 text-center text-gray-500 font-bold italic">No production history found.</td></tr>
              ) : (
                history.map(h => (
                  <tr 
                    key={h.id} 
                    onClick={() => setSelectedBatch(h)} 
                    className="group hover:bg-gray-700/50 transition cursor-pointer"
                  >
                    <td className="py-4">
                      <div className="text-xs font-black text-teal-400">#BATCH-{h.id}</div>
                      <div className="text-[10px] font-bold text-gray-500">{new Date(h.date).toLocaleDateString()}</div>
                    </td>
                    <td className="py-4 font-bold uppercase text-xs">{h.fgName}</td>
                    <td className="py-4 text-center font-black text-white text-lg">{h.yield}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

      </div>

      {/* --- BATCH DETAILS MODAL --- */}
      {selectedBatch && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 px-4 backdrop-blur-sm">
          <div className="bg-gray-800 p-8 rounded-3xl shadow-2xl w-full max-w-2xl border border-gray-700 relative">
            
            <div className="flex justify-between items-start mb-6 border-b border-gray-700 pb-4">
              <div>
                <h2 className="text-3xl font-black text-white italic uppercase">Batch <span className="text-teal-400">#{selectedBatch.id}</span></h2>
                <p className="text-xs font-bold text-gray-500 mt-1 uppercase tracking-widest">{new Date(selectedBatch.date).toLocaleString()}</p>
              </div>
              <button onClick={() => setSelectedBatch(null)} className="text-gray-500 hover:text-red-400 font-black text-xl transition">X</button>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6 p-5 bg-gray-900 rounded-2xl border border-gray-700">
              <div>
                <p className="text-[10px] text-gray-500 uppercase font-black tracking-widest">Finished Good Created</p>
                <p className="text-lg font-black text-teal-400 uppercase leading-tight">{selectedBatch.fgName}</p>
                <p className="text-xs text-white font-bold mt-1">YIELD: {selectedBatch.yield} Units</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-500 uppercase font-black tracking-widest">Logged By</p>
                <p className="text-sm font-black text-white uppercase">{selectedBatch.loggedBy}</p>
                <div className="mt-2 text-xs font-bold text-gray-400">
                  <p>ELEC: {selectedBatch.electricity} Units</p>
                  <p>WASTE: {selectedBatch.wastage} Units</p>
                </div>
              </div>
            </div>

            <div className="bg-gray-900 text-white rounded-2xl p-5 border border-gray-700">
              <h3 className="text-[10px] uppercase tracking-widest text-teal-400 font-black mb-4 border-b border-gray-800 pb-2">Raw Materials Consumed</h3>
              {selectedBatch.items && selectedBatch.items.length > 0 ? (
                  selectedBatch.items.map((i, idx) => (
                    <div key={idx} className="flex justify-between text-xs mb-3 border-b border-gray-800 pb-2 last:border-0 last:mb-0 last:pb-0">
                       <span className="font-bold text-gray-300 uppercase">{i.Name ?? i.name ?? i.MaterialId ?? i.Barcode ?? "Unknown Material"}</span>
                       <span className="text-teal-400 font-black">{i.QtyUsed ?? i.qtyUsed ?? i.Quantity ?? 0} Used</span>
                    </div>
                  ))
              ) : (
                  <p className="text-xs text-gray-500 font-bold italic">Detailed materials not available for this batch.</p>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}