import { useState, useEffect } from 'react';

export default function Products({ user }) {
  const [inventory, setInventory] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  
  // Controls which items are shown in the table
  const [filter, setFilter] = useState('All');
  
  const [formData, setFormData] = useState({
    barcode: '', name: '', price: '', stock: '', type: 'Shop FG'
  });

  const isStaff = user?.Role === 'Staff';

  useEffect(() => { 
    fetchInventory(); 
  }, []);

  const fetchInventory = async () => {
    try {
      const res = await fetch('http://localhost:5000/api/products/all');
      const data = await res.json();
      setInventory(data);
    } catch (e) { 
      console.error("Inventory Fetch Error:", e); 
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenEdit = (item) => {
    setFormData({ 
      barcode: item.barcode, 
      name: item.name, 
      price: item.price, 
      stock: item.stock, 
      type: item.type || 'Shop FG' 
    });
    setIsEditing(true);
    setShowModal(true);
  };

  const handleDelete = async (barcode) => {
    if (!window.confirm("CRITICAL: Delete this product from SQL?")) return;
    
    try {
      await fetch(`http://localhost:5000/api/products/${barcode}`, { method: 'DELETE' });
      fetchInventory();
    } catch (err) {
      alert("Failed to delete item.");
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const method = isEditing ? 'PUT' : 'POST';
    
    // SAFETY FIX: If the price or stock is empty (like for Raw Materials), send 0 instead of NaN
    const payload = {
      Barcode: formData.barcode,
      Name: formData.name,
      Price: parseFloat(formData.price) || 0, 
      Stock: parseInt(formData.stock) || 0,
      Type: formData.type || 'Shop FG'
    };

    try {
      const res = await fetch('http://localhost:5000/api/products', {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        setShowModal(false);
        setIsEditing(false);
        setFormData({ barcode: '', name: '', price: '', stock: '', type: 'Shop FG' });
        fetchInventory();
      } else {
        const errText = await res.text();
        alert(`Server Rejected Save:\n${errText}`);
      }
    } catch (err) {
      alert("Could not connect to the C# Server.");
    }
  };

  // Apply the selected filter before rendering the table rows
  const filteredInventory = inventory.filter(item => {
    if (filter === 'All') return true;
    return item.type === filter;
  });

  if (isLoading) return <div className="p-10 font-bold text-gray-400">Loading Inventory...</div>;

  return (
    <div className="p-8 bg-gray-50 min-h-screen">
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-3xl font-black text-gray-800 tracking-tight">Inventory Status</h1>
          <p className="text-gray-500 font-medium">Live stock levels and product catalog</p>
        </div>
        
        {/* HIDE ADD BUTTON FROM CASHIERS */}
        {!isStaff && (
          <button 
            onClick={() => { 
              setIsEditing(false); 
              setFormData({ barcode: '', name: '', price: '', stock: '', type: 'Shop FG' }); 
              setShowModal(true); 
            }} 
            className="bg-teal-600 hover:bg-teal-700 text-white px-8 py-3 rounded-xl font-bold shadow-lg shadow-teal-100 transition-all active:scale-95"
          >
            + Register New Item
          </button>
        )}
      </div>

      {/* FILTER TABS */}
      <div className="flex gap-2 mb-6 bg-white p-2 rounded-2xl w-fit shadow-sm border border-gray-100 overflow-x-auto">
        {['All', 'Raw Material', 'Warehouse FG', 'Shop FG'].map(tab => (
          <button 
            key={tab}
            onClick={() => setFilter(tab)}
            className={`px-6 py-2 rounded-xl font-bold text-sm transition-all whitespace-nowrap ${
              filter === tab 
                ? 'bg-gray-900 text-white shadow-md' 
                : 'text-gray-500 hover:bg-gray-100'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* INVENTORY TABLE */}
      <div className="bg-white rounded-3xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-800 text-white">
              <tr>
                <th className="p-5 font-bold uppercase text-xs tracking-widest">Barcode</th>
                <th className="p-5 font-bold uppercase text-xs tracking-widest">Name & Type</th>
                <th className="p-5 font-bold uppercase text-xs tracking-widest text-right">Price</th>
                <th className="p-5 font-bold uppercase text-xs tracking-widest text-right">Stock Level</th>
                {!isStaff && <th className="p-5 font-bold uppercase text-xs tracking-widest text-center">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {filteredInventory.map((item) => (
                <tr key={item.barcode} className="border-b last:border-0 hover:bg-gray-50 transition-colors">
                  <td className="p-5 font-mono text-gray-400 text-sm">{item.barcode}</td>
                  <td className="p-5">
                    <div className="font-black text-gray-800">{item.name}</div>
                    
                    {/* Visual Color Badges for different Inventory Types */}
                    <div className={`text-[10px] font-bold uppercase tracking-widest mt-1 w-fit px-2 py-0.5 rounded ${
                      item.type === 'Raw Material' ? 'bg-orange-100 text-orange-600' : 
                      item.type === 'Warehouse FG' ? 'bg-blue-100 text-blue-600' : 'bg-teal-100 text-teal-600'
                    }`}>
                      {item.type || 'Uncategorized'}
                    </div>
                  </td>
                  
                  <td className="p-5 text-right font-bold text-gray-600">
                    {item.type === 'Raw Material' ? '--' : `$${item.price.toFixed(2)}`}
                  </td>
                  
                  <td className="p-5 text-right">
                    <span className={`px-4 py-1 rounded-full text-sm font-black ${
                      item.stock < 10 ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-700'
                    }`}>
                      {item.stock} {item.stock < 10 ? 'LOW' : ''}
                    </span>
                  </td>

                  {/* ADMIN ACTIONS */}
                  {!isStaff && (
                    <td className="p-5 text-center whitespace-nowrap">
                      <button onClick={() => handleOpenEdit(item)} className="text-blue-600 mr-4 font-black hover:underline">Edit</button>
                      <button onClick={() => handleDelete(item.barcode)} className="text-red-500 font-black hover:underline">Delete</button>
                    </td>
                  )}
                </tr>
              ))}
              
              {/* EMPTY STATE */}
              {filteredInventory.length === 0 && (
                <tr>
                  <td colSpan="5" className="p-12 text-center text-gray-400 font-bold">No items found in this category.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ADD/EDIT MODAL */}
      {showModal && (
        <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white p-10 rounded-3xl shadow-2xl w-full max-w-md">
            <h2 className="text-2xl font-black text-gray-800 mb-6">
              {isEditing ? 'Modify Item' : 'Add Inventory Item'}
            </h2>
            
            <form onSubmit={handleSave} className="flex flex-col gap-4">
              <input 
                disabled={isEditing} 
                placeholder="Barcode (e.g., 012)" 
                className="p-4 border-2 border-gray-100 rounded-xl bg-gray-50 focus:border-teal-500 outline-none disabled:text-gray-400" 
                value={formData.barcode} 
                onChange={e => setFormData({...formData, barcode: e.target.value})} 
                required
              />
              <input 
                placeholder="Item Name (e.g., Oil)" 
                className="p-4 border-2 border-gray-100 rounded-xl focus:border-teal-500 outline-none" 
                value={formData.name} 
                onChange={e => setFormData({...formData, name: e.target.value})} 
                required
              />
              
              <div className="flex gap-4">
                <input 
                  type="number" 
                  step="0.01" 
                  placeholder="Selling Price ($)" 
                  className="flex-1 p-4 border-2 border-gray-100 rounded-xl focus:border-teal-500 outline-none disabled:bg-gray-100 disabled:placeholder-gray-300" 
                  value={formData.price} 
                  onChange={e => setFormData({...formData, price: e.target.value})} 
                  disabled={formData.type === 'Raw Material'} // Price is grayed out for RM
                />
                <input 
                  type="number" 
                  placeholder="Initial Stock" 
                  className="flex-1 p-4 border-2 border-gray-100 rounded-xl focus:border-teal-500 outline-none" 
                  value={formData.stock} 
                  onChange={e => setFormData({...formData, stock: e.target.value})} 
                />
              </div>

              <select 
                className="p-4 border-2 border-gray-100 rounded-xl bg-gray-50 focus:border-teal-500 outline-none font-bold text-gray-700 cursor-pointer" 
                value={formData.type} 
                onChange={e => setFormData({...formData, type: e.target.value})}
              >
                <option value="Shop FG">Shop FG (Ready for POS)</option>
                <option value="Warehouse FG">Warehouse FG (Bulk Storage)</option>
                <option value="Raw Material">Raw Material (Not for Sale)</option>
              </select>

              <div className="flex justify-end gap-3 mt-6">
                <button 
                  type="button" 
                  onClick={() => setShowModal(false)} 
                  className="px-6 py-4 text-gray-400 font-bold hover:text-gray-800 transition"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="bg-gray-900 text-white px-8 py-4 rounded-xl font-bold shadow-lg hover:bg-black transition active:scale-95"
                >
                  Confirm Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}