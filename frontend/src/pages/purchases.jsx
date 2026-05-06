import { useState, useEffect } from 'react';

export default function Purchases({ user }) {
  const [suppliers, setSuppliers] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [history, setHistory] = useState([]);
  
  // --- FORM STATES ---
  const [supplierSearch, setSupplierSearch] = useState('');
  const [itemSearch, setItemSearch] = useState('');
  const [qty, setQty] = useState('');
  const [unitCost, setUnitCost] = useState(''); 
  const [amountPaid, setAmountPaid] = useState('');
  
  // --- CART & MODAL STATES ---
  const [cart, setCart] = useState([]); 
  const [selectedBill, setSelectedBill] = useState(null); 
  
  const [showSupplierDropdown, setShowSupplierDropdown] = useState(false);
  const [showItemDropdown, setShowItemDropdown] = useState(false);
  const [loading, setLoading] = useState(false);

  const BASE_URL = 'http://157.173.96.166:5001/api';

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const supRes = await fetch(`${BASE_URL}/suppliers/list`);
      if (supRes.ok) {
        const supData = await supRes.json();
        setSuppliers(supData.map(s => ({
          id: s.SupplierId ?? s.supplierId ?? s.SupplierID ?? s.supplierID ?? s.id ?? s.Id,
          name: s.Name ?? s.name ?? s.SupplierName ?? s.supplierName
        })));
      }

      const invRes = await fetch(`${BASE_URL}/products/all`);
      if (invRes.ok) {
        const invData = await invRes.json();
        const knownRawMaterials = ["gas", "oil", "water", "diesel", "petrol", "yarn", "thread", "raw silk"];
        
        const rawMaterials = invData
          .filter(i => {
             const name = (i.Name ?? i.name ?? i.ProductName ?? i.productName ?? "").toLowerCase().trim();
             const type = (i.Type ?? i.type ?? i.InventoryType ?? i.inventoryType ?? i.Category ?? i.category ?? "").toLowerCase();
             return type.includes('raw') || knownRawMaterials.some(rm => name.includes(rm));
          })
          .map(i => ({
            name: i.Name ?? i.name ?? i.ProductName ?? i.productName ?? 'Unnamed',
            barcode: i.Barcode ?? i.barcode ?? i.Code ?? i.code
          }));
          
        setInventory(rawMaterials);
      }

      const histRes = await fetch(`${BASE_URL}/purchases/history`);
      if (histRes.ok) {
        const histData = await histRes.json();
        setHistory(histData.map(h => ({
            id: h.PurchaseID ?? h.purchaseID ?? h.PurchaseId ?? h.purchaseId ?? h.id ?? h.Id,
            date: h.PurchaseDate ?? h.purchaseDate ?? h.date,
            supplier: h.SupplierName ?? h.supplierName ?? h.Supplier ?? h.supplier ?? 'UNKNOWN VENDOR',
            purchasedBy: h.PurchasedBy ?? h.purchasedBy ?? 'Admin',
            cost: h.TotalCost ?? h.totalCost ?? h.cost ?? 0,
            paid: h.AmountPaid ?? h.amountPaid ?? h.paid ?? 0,
            items: h.Items ?? h.items ?? [] 
        })));
      }
    } catch (err) { console.error("Fetch Data Error:", err); }
  };

  const handleAddToCart = (e) => {
    e.preventDefault();
    const selectedItem = inventory.find(i => 
      `${i.name} (${i.barcode})` === itemSearch || 
      i.name.toLowerCase() === itemSearch.toLowerCase().trim() ||
      i.barcode === itemSearch.trim()
    );

    if (!selectedItem) return alert("Please select a valid raw material.");
    if (!qty || qty <= 0) return alert("Please enter a valid quantity.");
    if (!unitCost || unitCost <= 0) return alert("Please enter a valid unit cost.");

    const newItem = {
      ...selectedItem,
      qty: parseInt(qty),
      unitCost: parseFloat(unitCost),
      lineTotal: parseInt(qty) * parseFloat(unitCost)
    };

    setCart([...cart, newItem]);
    
    setItemSearch('');
    setQty('');
    setUnitCost('');
  };

  const removeFromCart = (indexToRemove) => {
    setCart(cart.filter((_, index) => index !== indexToRemove));
  };

  const grandTotalCost = cart.reduce((sum, item) => sum + item.lineTotal, 0);
  const balance = (grandTotalCost - parseFloat(amountPaid || 0)).toFixed(3);

  const handlePurchase = async () => {
    if (cart.length === 0) return alert("Your bill is empty. Please add items.");
    
    const selectedSupplier = suppliers.find(s => s.name.toLowerCase() === supplierSearch.toLowerCase().trim());
    if (!selectedSupplier) return alert("Please select a valid supplier from the list.");

    setLoading(true);
    
    const payload = {
      SupplierID: parseInt(selectedSupplier.id), 
      TotalAmount: grandTotalCost, 
      AmountPaid: parseFloat(amountPaid || 0),
      PurchasedBy: user?.Name || 'Admin',
      Items: cart.map(item => ({
          Barcode: item.barcode,
          Quantity: item.qty,
          UnitCost: item.unitCost
      }))
    };

    try {
      const res = await fetch(`${BASE_URL}/purchases/add`, {
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      if (res.ok) {
        alert("Bill Successfully Logged! Stock and AP updated.");
        setSupplierSearch(''); 
        setAmountPaid('');
        setCart([]);
        fetchData(); 
      } else {
        const errText = await res.text();
        alert("Backend Error:\n" + errText);
      }
    } catch (err) {
      alert("Failed to reach server.");
    } finally {
      setLoading(false);
    }
  };

  const filteredSuppliers = suppliers.filter(s => s.name.toLowerCase().includes(supplierSearch.toLowerCase()));
  const filteredInventory = inventory.filter(i => i.name.toLowerCase().includes(itemSearch.toLowerCase()) || i.barcode.includes(itemSearch));

  return (
    <div className="p-8 bg-gray-50 min-h-screen font-sans">
      <h1 className="text-4xl font-black mb-8 text-gray-900 tracking-tighter italic uppercase">
        Raw Material <span className="text-teal-500">Procurement</span>
      </h1>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* PURCHASE CART FORM */}
        <div className="bg-white p-8 rounded-[2rem] shadow-xl border border-gray-100 h-fit space-y-6">
          <h2 className="text-xs font-black text-gray-400 uppercase tracking-widest">1. Select Supplier</h2>
          
          <div className="space-y-1 relative">
            <input 
              type="text"
              placeholder="Search Supplier..." 
              required autoComplete="off"
              className="w-full p-4 bg-gray-50 rounded-2xl border-none font-bold outline-none focus:ring-2 focus:ring-teal-500/20" 
              value={supplierSearch} 
              onChange={e => { setSupplierSearch(e.target.value); setShowSupplierDropdown(true); }} 
              onFocus={() => setShowSupplierDropdown(true)}
              onBlur={() => setTimeout(() => setShowSupplierDropdown(false), 200)}
            />
            {showSupplierDropdown && supplierSearch && (
              <ul className="absolute z-50 w-full mt-1 bg-white border border-gray-100 rounded-xl shadow-2xl max-h-48 overflow-y-auto">
                {filteredSuppliers.map(s => (
                  <li key={s.id} onMouseDown={() => setSupplierSearch(s.name)} className="p-3 text-sm font-bold text-gray-700 hover:bg-teal-50 cursor-pointer">{s.name}</li>
                ))}
              </ul>
            )}
          </div>

          <div className="border-t border-dashed border-gray-200 my-4 pt-4">
            <h2 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4">2. Add Items to Bill</h2>
            <form onSubmit={handleAddToCart} className="space-y-4 bg-gray-50 p-4 rounded-2xl border border-gray-100">
              
              <div className="space-y-1 relative">
                <input 
                  type="text" placeholder="Search Material..." autoComplete="off"
                  className="w-full p-3 bg-white rounded-xl border border-gray-200 font-bold outline-none focus:border-teal-400" 
                  value={itemSearch} 
                  onChange={e => { setItemSearch(e.target.value); setShowItemDropdown(true); }} 
                  onFocus={() => setShowItemDropdown(true)}
                  onBlur={() => setTimeout(() => setShowItemDropdown(false), 200)}
                />
                {showItemDropdown && itemSearch && (
                  <ul className="absolute z-50 w-full mt-1 bg-white border border-gray-100 rounded-xl shadow-2xl max-h-48 overflow-y-auto">
                    {filteredInventory.map(i => (
                      <li key={i.barcode} onMouseDown={() => setItemSearch(`${i.name} (${i.barcode})`)} className="p-3 text-sm font-bold text-gray-700 hover:bg-teal-50 cursor-pointer flex justify-between">
                        <span>{i.name}</span> <span className="text-gray-400 text-xs">[{i.barcode}]</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <input type="number" placeholder="Qty" className="p-3 bg-white rounded-xl border border-gray-200 font-bold" value={qty} onChange={e => setQty(e.target.value)} />
                <input type="number" step="0.001" placeholder="Unit Price" className="p-3 bg-white rounded-xl border border-gray-200 font-bold" value={unitCost} onChange={e => setUnitCost(e.target.value)} />
              </div>
              
              <button type="submit" className="w-full bg-teal-50 text-teal-700 font-black p-3 rounded-xl hover:bg-teal-100 transition uppercase tracking-widest text-xs">
                + Add To Bill
              </button>
            </form>
          </div>

          {/* ACTIVE CART */}
          {cart.length > 0 && (
            <div className="bg-gray-900 text-white rounded-2xl p-4 shadow-inner space-y-2">
              <h3 className="text-[10px] uppercase tracking-widest text-gray-400 font-black mb-2">Current Bill Items</h3>
              {cart.map((item, idx) => (
                <div key={idx} className="flex justify-between items-center text-xs bg-gray-800 p-2 rounded-lg">
                  <div>
                    <p className="font-bold">{item.name}</p>
                    <p className="text-[9px] text-gray-400">{item.qty} x OMR {item.unitCost.toFixed(3)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-black text-teal-400">OMR {item.lineTotal.toFixed(3)}</span>
                    <button onClick={() => removeFromCart(idx)} className="text-red-400 hover:text-red-300 font-black">X</button>
                  </div>
                </div>
              ))}
              <div className="border-t border-gray-700 pt-2 mt-2 flex justify-between items-center">
                 <span className="text-xs text-gray-400 uppercase font-black">Grand Total</span>
                 <span className="text-xl font-black text-white">OMR {grandTotalCost.toFixed(3)}</span>
              </div>
            </div>
          )}

          <div className="p-5 bg-teal-50 rounded-[1.5rem] border border-teal-100">
              <label className="text-[10px] font-black text-teal-600 uppercase mb-2 block">Initial Payment (Cash Paid)</label>
              <input 
                type="number" step="0.001" placeholder="0.000" 
                className="w-full bg-white p-4 rounded-xl font-black text-2xl text-teal-700 outline-none border-none" 
                value={amountPaid} onChange={e => setAmountPaid(e.target.value)} 
              />
              {grandTotalCost > 0 && (
                <p className="text-[10px] text-teal-500 mt-3 font-bold uppercase">
                  Balance of <span className="text-red-500">OMR {balance}</span> will go to Accounts Payable
                </p>
              )}
          </div>

          <button onClick={handlePurchase} disabled={loading || cart.length === 0} className="w-full bg-gray-900 text-white font-black p-5 rounded-2xl hover:bg-teal-500 transition shadow-xl active:scale-95 disabled:opacity-50">
            {loading ? "SAVING..." : "CONFIRM PROCUREMENT"}
          </button>
        </div>

        {/* REGISTRY TABLE */}
        <div className="lg:col-span-2 bg-white p-8 rounded-[2rem] shadow-sm border border-gray-100 overflow-x-auto">
          <h2 className="text-sm font-black text-gray-400 uppercase tracking-widest mb-6">Recent Procurement Bills</h2>
          
          <table className="w-full text-left">
            <thead>
              <tr className="text-[10px] font-black text-gray-400 uppercase border-b pb-4">
                <th className="pb-4">Bill ID / Date</th>
                <th className="pb-4">Supplier</th>
                <th className="pb-4 text-right">Cost</th>
                <th className="pb-4 text-right pr-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {history.length === 0 ? (
                <tr><td colSpan="4" className="py-20 text-center text-gray-400 font-bold italic underline decoration-teal-500/20">No history found.</td></tr>
              ) : (
                history.map(h => (
                  <tr 
                    key={h.id} 
                    onClick={() => setSelectedBill(h)} 
                    className="group hover:bg-teal-50/50 transition cursor-pointer"
                  >
                    <td className="py-5">
                      <div className="text-xs font-black text-gray-900">#BILL-{h.id}</div>
                      <div className="text-[10px] font-bold text-gray-400">{new Date(h.date).toLocaleString()}</div>
                    </td>
                    <td className="py-5 font-black text-gray-800 uppercase tracking-tight">{h.supplier}</td>
                    <td className="py-5 text-right font-black text-gray-900">OMR {parseFloat(h.cost).toFixed(3)}</td>
                    <td className="py-5 text-right pr-2">
                      <span className={`text-[9px] font-black px-3 py-1 rounded-full uppercase tracking-widest ${h.cost > h.paid ? 'bg-orange-100 text-orange-600' : 'bg-green-100 text-green-600'}`}>
                          {h.cost > (h.paid || 0) ? 'Credit/AP' : 'Paid'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* --- BILL DETAILS MODAL --- */}
      {selectedBill && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4">
          <div className="bg-white p-8 rounded-3xl shadow-2xl w-full max-w-2xl border border-gray-100">
            
            <div className="flex justify-between items-start mb-6 border-b border-gray-100 pb-4">
              <div>
                <h2 className="text-3xl font-black text-gray-900 italic uppercase">Bill <span className="text-teal-500">#{selectedBill.id}</span></h2>
                <p className="text-xs font-bold text-gray-400 mt-1 uppercase tracking-widest">{new Date(selectedBill.date).toLocaleString()}</p>
              </div>
              <button onClick={() => setSelectedBill(null)} className="text-gray-400 hover:text-red-500 font-black text-xl">X</button>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6 p-4 bg-gray-50 rounded-2xl">
              <div>
                <p className="text-[10px] text-gray-400 uppercase font-black tracking-widest">Supplier</p>
                <p className="text-sm font-black text-gray-900 uppercase">{selectedBill.supplier}</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-400 uppercase font-black tracking-widest">Purchased By</p>
                <p className="text-sm font-black text-gray-900 uppercase">{selectedBill.purchasedBy}</p>
              </div>
            </div>

            {/* FIXED: Added case-insensitive checks so the quantity and name render properly! */}
            <div className="bg-gray-900 text-white rounded-2xl p-5 shadow-inner mb-6">
              <h3 className="text-[10px] uppercase tracking-widest text-teal-400 font-black mb-4 border-b border-gray-700 pb-2">Line Items</h3>
              {selectedBill.items && selectedBill.items.length > 0 ? (
                  selectedBill.items.map((i, idx) => (
                    <div key={idx} className="flex justify-between text-xs mb-3 border-b border-gray-800 pb-2">
                       <span className="font-bold">{i.Name ?? i.name ?? i.Barcode ?? i.barcode ?? "Unknown"}</span>
                       <span className="text-gray-400">
                         {i.Quantity ?? i.quantity ?? 0} x OMR {parseFloat(i.UnitCost ?? i.unitCost ?? i.Cost ?? i.cost ?? 0).toFixed(3)}
                       </span>
                    </div>
                  ))
              ) : (
                  <p className="text-xs text-gray-500 italic">Detailed line items not available for this legacy bill.</p>
              )}
            </div>

            <div className="flex justify-between items-center text-sm font-black uppercase text-gray-400">
               <span>Total Billed: <span className="text-gray-900">OMR {parseFloat(selectedBill.cost).toFixed(3)}</span></span>
               <span>Total Paid: <span className="text-teal-600">OMR {parseFloat(selectedBill.paid).toFixed(3)}</span></span>
            </div>
            
          </div>
        </div>
      )}

    </div>
  );
}