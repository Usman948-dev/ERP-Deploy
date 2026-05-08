import { useState, useEffect } from 'react';

// PASS THE USER PROP IN HERE
export default function Inventory({ user }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('All');

  // --- MODAL STATE ---
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState({ code: '', name: '', price: '', cost: '', stock: '', category: 'Shop FG', subCategory: '', uom: 'Pcs' });
  const [isCreatingSub, setIsCreatingSub] = useState(false);
  const [isCreatingUOM, setIsCreatingUOM] = useState(false); 

  const API_URL = 'http://157.173.96.166:5001/api'; 

  // --- BULLETPROOF CASHIER SECURITY CHECK ---
  const userRole = typeof user === 'string' ? user : (user?.Role || user?.role || user?.Name || '');
  const isCashier = userRole.toLowerCase() === 'cashier';

  useEffect(() => {
    fetchInventory();
  }, []);

  const fetchInventory = async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch(`${API_URL}/products/all`); 
      if (!res.ok) throw new Error('Failed to fetch inventory data');
      
      const data = await res.json();

      const normalizedData = data.map((item, index) => {
        const barcode = item.Barcode ?? item.barcode ?? item.Code ?? item.code;
        const itemName = item.Name ?? item.name ?? item.ProductName ?? item.productName ?? 'Unnamed';
        
        const knownRawMaterials = ["gas", "oil", "water", "diesel", "petrol", "yarn", "thread", "raw silk"];
        const isLegacyRM = knownRawMaterials.includes(itemName.toLowerCase().trim());
        const fallbackCat = isLegacyRM ? 'Raw Material' : 'Shop FG';

        const rawCat = item.Type ?? item.type ?? item.InventoryType ?? item.inventoryType ?? item.Category ?? item.category ?? fallbackCat;

        let mainCat = 'Shop FG';
        let subCat = '';

        if (rawCat.includes('-')) {
            const parts = rawCat.split('-');
            mainCat = parts[0].trim();
            subCat = parts.slice(1).join('-').trim();
        } else {
            if (rawCat.toLowerCase().includes('raw')) {
                mainCat = 'Raw Material';
            } else if (rawCat.toLowerCase() === 'shop fg') {
                mainCat = 'Shop FG';
            } else {
                mainCat = 'Shop FG'; 
                subCat = rawCat;     
            }
        }

        return {
          id: barcode || item.id || item.Id || `item-${index}`, 
          code: barcode || 'N/A',
          name: itemName,
          price: item.Price ?? item.price ?? 0,
          cost: item.Cost ?? item.cost ?? 0, 
          stock: item.Stock ?? item.stock ?? item.StockQty ?? item.stockQty ?? 0,
          category: mainCat,
          subCategory: subCat,
          uom: item.UOM ?? item.uom ?? item.Unit ?? item.unit ?? 'Pcs' 
        };
      });

      setProducts(normalizedData);
    } catch (err) {
      console.error(err);
      setError('Could not connect to the database. Is the C# API running?');
    } finally {
      setLoading(false);
    }
  };

  const existingSubCategories = [...new Set(
      products.filter(p => p.category === formData.category && p.subCategory).map(p => p.subCategory)
  )];

  const existingUOMs = [...new Set([
      'Pcs', 'Kg', 'Grams', 'Ltr', 'ml', 
      ...products.map(p => p.uom)
  ])].filter(Boolean);

  // SECURE DROPDOWN: Hides "Raw Material" from the category filter if Cashier
  const allUniqueCategories = [...new Set([
      'Shop FG',
      ...(!isCashier ? ['Raw Material'] : []),
      ...products.filter(p => !isCashier || p.category !== 'Raw Material').map(p => p.category),
      ...products.filter(p => !isCashier || p.category !== 'Raw Material').map(p => p.subCategory)
  ])].filter(Boolean);

  const handleAddNew = () => {
    setEditingItem(null);
    setFormData({ code: '', name: '', price: '', cost: '', stock: '', category: 'Shop FG', subCategory: '', uom: 'Pcs' });
    setIsCreatingSub(false); 
    setIsCreatingUOM(false);
    setIsModalOpen(true);
  };

  const handleEdit = (item) => {
    setEditingItem(item);
    setFormData({ 
        code: item.code, 
        name: item.name, 
        price: item.price, 
        cost: item.cost, 
        stock: item.stock, 
        category: item.category,
        subCategory: item.subCategory,
        uom: item.uom 
    });
    setIsCreatingSub(false); 
    setIsCreatingUOM(false);
    setIsModalOpen(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this item?")) return;
    
    try {
        const res = await fetch(`${API_URL}/products/${id}`, { method: 'DELETE' });
        if (res.ok) {
            alert("Item deleted successfully!");
            fetchInventory(); 
        } else {
            alert("Failed to delete item from database.");
        }
    } catch (err) { alert("Network error deleting item."); }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const isEditing = !!editingItem;
    const endpoint = `${API_URL}/products`;
    const method = isEditing ? 'PUT' : 'POST';

    const finalType = formData.subCategory.trim() !== '' 
        ? `${formData.category} - ${formData.subCategory.trim()}` 
        : formData.category;

    try {
        const res = await fetch(endpoint, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                Barcode: formData.code,
                Name: formData.name,
                Price: parseFloat(formData.price) || 0,
                Cost: parseFloat(formData.cost) || 0, 
                Stock: parseInt(formData.stock) || 0,
                Type: finalType,
                UOM: formData.uom.trim() || 'Pcs' 
            })
        });

        if (res.ok) {
            alert(`Item successfully ${isEditing ? 'updated' : 'added'}!`);
            setIsModalOpen(false);
            fetchInventory(); 
        } else {
            const errorText = await res.text();
            alert(`Failed to save to database. Error: ${errorText}`);
        }
    } catch (err) { alert("Network error saving item."); }
  };

  // --- NEW: EXPORT TO EXCEL (CSV) FUNCTION ---
  const handleExportExcel = () => {
    // 1. Define Headers (Hides Cost from Cashiers)
    const headers = isCashier
      ? ["Code", "Product Name", "Category", "Sub-Category", "Price", "Stock", "UOM"]
      : ["Code", "Product Name", "Category", "Sub-Category", "Cost", "Price", "Stock", "UOM"];

    const csvRows = [headers.join(",")];

    // Helper to escape commas inside product names
    const escapeCSV = (val) => `"${String(val ?? '').replace(/"/g, '""')}"`;

    // 2. Filter out raw materials for cashiers before exporting!
    const productsToExport = isCashier 
      ? products.filter(p => p.category !== 'Raw Material')
      : products;

    // 3. Loop through exported products to build rows
    productsToExport.forEach(item => {
      const row = isCashier
        ? [item.code, item.name, item.category, item.subCategory, item.price, item.stock, item.uom]
        : [item.code, item.name, item.category, item.subCategory, item.cost, item.price, item.stock, item.uom];

      csvRows.push(row.map(escapeCSV).join(","));
    });

    // 4. Create the file and trigger download
    const csvString = csvRows.join("\n");
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    const dateStr = new Date().toISOString().split('T')[0];
    link.setAttribute("download", `Inventory_Export_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // SECURE TABLE: Completely strips Raw Materials out if the user is a Cashier
  const filteredProducts = products.filter(product => {
    if (isCashier && product.category === 'Raw Material') return false;

    const matchesSearch = product.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          product.code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          product.category?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          product.subCategory?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesFilter = filterCategory === 'All' || 
                          product.category === filterCategory || 
                          product.subCategory === filterCategory;

    return matchesSearch && matchesFilter;
  });

  return (
    <div className="p-8 w-full max-w-7xl mx-auto relative font-sans">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-4xl font-black text-white tracking-tight italic uppercase">
            Inventory <span className="text-teal-400">Management</span>
          </h1>
          <p className="text-gray-400 mt-1 font-medium">View and manage your raw materials and stock.</p>
        </div>
        
        {/* BUTTONS: EXPORT AND ADD NEW */}
        <div className="flex gap-3 w-full md:w-auto">
          
          <button 
            onClick={handleExportExcel} 
            className="flex-1 md:flex-none bg-emerald-600 hover:bg-emerald-500 text-white font-black py-3 px-6 rounded-xl shadow-lg transition active:scale-95 flex items-center justify-center gap-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export Excel
          </button>

          {!isCashier && (
            <button onClick={handleAddNew} className="flex-1 md:flex-none bg-teal-500 hover:bg-teal-600 text-slate-900 font-black py-3 px-6 rounded-xl shadow-lg transition active:scale-95">
              + Add New Item
            </button>
          )}
        </div>
      </div>

      {/* DASHBOARD CONTROLS (Search + Filter) */}
      <div className="bg-gray-800 p-4 rounded-2xl shadow-xl mb-6 flex flex-col md:flex-row gap-4 items-center border border-gray-700">
        <input 
          type="text" 
          placeholder="Search by name, code, or category..." 
          className="w-full md:w-2/3 bg-transparent text-white outline-none font-bold"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        
        <div className="h-8 w-px bg-gray-600 hidden md:block"></div>
        
        <select 
          className="w-full md:w-1/3 bg-gray-900 text-teal-400 font-black p-3 rounded-xl border border-gray-700 outline-none cursor-pointer uppercase tracking-widest text-xs"
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
        >
          <option value="All">✦ SHOW ALL CATEGORIES</option>
          {allUniqueCategories.map(cat => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
      </div>

      {/* DATA TABLE */}
      <div className="bg-gray-800 rounded-2xl shadow-xl overflow-hidden border border-gray-700">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-white whitespace-nowrap">
            <thead className="bg-gray-900/50">
              <tr className="text-gray-400 font-bold uppercase tracking-widest text-[10px]">
                <th className="p-5">Code</th>
                <th className="p-5">Product Name</th>
                <th className="p-5">Category</th>
                <th className="p-5">Sub-Category</th>
                {!isCashier && <th className="p-5">Cost</th>}
                <th className="p-5">Price</th>
                <th className="p-5 text-center">Stock</th>
                <th className="p-5 text-center">UOM</th> 
                {!isCashier && <th className="p-5 text-right">Actions</th>}
              </tr>
            </thead>
            
            <tbody className="divide-y divide-gray-700/50">
              {loading ? (
                <tr><td colSpan={isCashier ? "7" : "9"} className="p-20 text-center text-gray-400 font-black animate-pulse">SYNCING WITH DATABASE...</td></tr>
              ) : error ? (
                <tr><td colSpan={isCashier ? "7" : "9"} className="p-20 text-center text-red-400 font-black">{error}</td></tr>
              ) : (
                filteredProducts.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-700/30 transition">
                    <td className="p-5 font-mono text-xs text-gray-400">{item.code}</td>
                    
                    <td className="p-5 font-bold uppercase">{item.name}</td>
                    
                    <td className="p-5">
                      <span className="bg-teal-900/40 border border-teal-500/50 px-2.5 py-1 rounded text-[10px] text-teal-400 font-black uppercase tracking-widest">
                        {item.category}
                      </span>
                    </td>

                    <td className="p-5">
                      {item.subCategory ? (
                        <span className="bg-amber-900/30 border border-amber-500/40 px-2.5 py-1 rounded text-[10px] text-amber-400 font-black uppercase tracking-widest">
                          {item.subCategory}
                        </span>
                      ) : (
                        <span className="text-gray-600 text-xs font-bold italic ml-2">--</span>
                      )}
                    </td>

                    {!isCashier && (
                      <td className="p-5 font-bold text-gray-400">OMR {parseFloat(item.cost || 0).toFixed(3)}</td>
                    )}

                    <td className="p-5 font-bold text-teal-400">OMR {parseFloat(item.price || 0).toFixed(3)}</td>
                    <td className="p-5 text-center">
                       <span className={`px-3 py-1 rounded-full font-black text-sm ${item.stock > 10 ? 'text-green-400' : 'text-orange-400'}`}>
                        {item.stock}
                       </span>
                    </td>

                    <td className="p-5 text-center">
                       <span className="bg-gray-900 px-3 py-1 rounded text-xs text-gray-300 font-bold border border-gray-700">
                         {item.uom}
                       </span>
                    </td>
                    
                    {!isCashier && (
                      <td className="p-5 text-right">
                        <button onClick={() => handleEdit(item)} className="text-teal-400 font-black text-xs mr-4 hover:underline">EDIT</button>
                        <button onClick={() => handleDelete(item.id)} className="text-red-400 font-black text-xs hover:underline">DEL</button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* --- POPUP MODAL FOR ADD/EDIT --- */}
      {isModalOpen && !isCashier && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4">
          <div className="bg-gray-800 p-8 rounded-3xl shadow-2xl w-full max-w-xl border border-gray-700">
            <h2 className="text-2xl font-black text-white mb-6 italic uppercase">
              {editingItem ? 'Edit Item' : 'Add New Item'}
            </h2>
            <form onSubmit={handleSave} className="space-y-4">
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase">Barcode / SKU</label>
                  <input type="text" required className="w-full p-3 mt-1 bg-gray-900 text-white rounded-xl border border-gray-700 outline-none focus:border-teal-500 font-mono" value={formData.code} onChange={e => setFormData({...formData, code: e.target.value})} disabled={!!editingItem} />
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase">Product Name</label>
                  <input type="text" required className="w-full p-3 mt-1 bg-gray-900 text-white rounded-xl border border-gray-700 outline-none focus:border-teal-500 font-bold" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase">Main Category</label>
                  <select className="w-full p-3 mt-1 bg-gray-900 text-white rounded-xl border border-gray-700 outline-none focus:border-teal-500 font-bold cursor-pointer" value={formData.category} onChange={e => { setFormData({...formData, category: e.target.value, subCategory: ''}); setIsCreatingSub(false); }}>
                    <option value="Shop FG">Finished Good</option>
                    <option value="Raw Material">Raw Material</option>
                  </select>
                </div>

                <div>
                  <div className="flex justify-between items-center">
                    <label className="text-[10px] font-black text-gray-400 uppercase">Sub-Category</label>
                    {isCreatingSub && (
                      <button type="button" onClick={() => { setIsCreatingSub(false); setFormData({...formData, subCategory: ''}); }} className="text-[8px] text-teal-400 hover:text-white uppercase font-black tracking-widest">Cancel</button>
                    )}
                  </div>
                  {!isCreatingSub ? (
                    <select className="w-full p-3 mt-1 bg-gray-900 text-white rounded-xl border border-gray-700 outline-none focus:border-teal-500 font-bold cursor-pointer" value={formData.subCategory} onChange={e => { if (e.target.value === '___NEW___') { setIsCreatingSub(true); setFormData({...formData, subCategory: ''}); } else { setFormData({...formData, subCategory: e.target.value}); } }}>
                      <option value="">-- None --</option>
                      {existingSubCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                      <option value="___NEW___" className="text-amber-400 font-black">✨ + NEW...</option>
                    </select>
                  ) : (
                    <input type="text" required autoFocus placeholder="e.g. Perfumes" className="w-full p-3 mt-1 bg-teal-900/20 text-teal-300 rounded-xl border border-teal-500/50 outline-none focus:border-teal-400 font-bold placeholder:text-teal-700" value={formData.subCategory} onChange={e => setFormData({...formData, subCategory: e.target.value})} />
                  )}
                </div>
              </div>

              <div className="grid grid-cols-4 gap-3">
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase">Cost</label>
                  <input type="number" step="0.001" required className="w-full p-3 mt-1 bg-gray-900 text-gray-300 rounded-xl border border-gray-700 outline-none focus:border-teal-500 font-bold" value={formData.cost} onChange={e => setFormData({...formData, cost: e.target.value})} />
                </div>
                
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase">Price</label>
                  <input type="number" step="0.001" required className="w-full p-3 mt-1 bg-gray-900 text-white rounded-xl border border-gray-700 outline-none focus:border-teal-500 font-bold" value={formData.price} onChange={e => setFormData({...formData, price: e.target.value})} />
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase">Stock</label>
                  <input type="number" required className="w-full p-3 mt-1 bg-gray-900 text-white rounded-xl border border-gray-700 outline-none focus:border-teal-500 font-bold" value={formData.stock} onChange={e => setFormData({...formData, stock: e.target.value})} />
                </div>
                
                <div>
                  <div className="flex justify-between items-center">
                    <label className="text-[10px] font-black text-gray-400 uppercase">UOM</label>
                    {isCreatingUOM && (
                      <button type="button" onClick={() => { setIsCreatingUOM(false); setFormData({...formData, uom: 'Pcs'}); }} className="text-[8px] text-teal-400 hover:text-white uppercase font-black tracking-widest">X</button>
                    )}
                  </div>
                  {!isCreatingUOM ? (
                    <select className="w-full p-3 mt-1 bg-gray-900 text-white rounded-xl border border-gray-700 outline-none focus:border-teal-500 font-bold cursor-pointer" value={formData.uom} onChange={e => { if (e.target.value === '___NEW___') { setIsCreatingUOM(true); setFormData({...formData, uom: ''}); } else { setFormData({...formData, uom: e.target.value}); } }}>
                      {existingUOMs.map(u => <option key={u} value={u}>{u}</option>)}
                      <option value="___NEW___" className="text-amber-400 font-black">✨ NEW...</option>
                    </select>
                  ) : (
                    <input type="text" required autoFocus placeholder="Box" className="w-full p-3 mt-1 bg-teal-900/20 text-teal-300 rounded-xl border border-teal-500/50 outline-none focus:border-teal-400 font-bold placeholder:text-teal-700" value={formData.uom} onChange={e => setFormData({...formData, uom: e.target.value})} />
                  )}
                </div>
              </div>
              
              <div className="flex gap-4 mt-8 pt-4 border-t border-gray-700">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 bg-gray-700 text-white font-black py-4 rounded-xl hover:bg-gray-600 transition uppercase tracking-widest text-xs">Cancel</button>
                <button type="submit" className="flex-1 bg-teal-500 text-slate-900 font-black py-4 rounded-xl hover:bg-teal-400 transition shadow-lg shadow-teal-500/30 uppercase tracking-widest text-xs">Save Item</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}