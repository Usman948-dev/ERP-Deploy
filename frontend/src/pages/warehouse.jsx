import { useState, useEffect } from 'react';

export default function Warehouse() {
  const [inventory, setInventory] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

  // Use the physical network IP or the Cloudflare tunnel URL
  const API_URL = 'http://157.173.96.166:5001/api'; 

  useEffect(() => {
    fetchInventory();
  }, []);

  const fetchInventory = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/products/all`);
      if (res.ok) {
        const data = await res.json();
        setInventory(data);
      }
    } catch (err) {
      console.error("Fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  // UPDATED: Search now checks Name, Barcode, AND Category (Type)
  const filteredInventory = inventory.filter(item => {
    const searchLower = searchTerm.toLowerCase();
    const name = (item.Name || item.name || '').toLowerCase();
    const barcode = (item.Barcode || item.barcode || '').toLowerCase();
    const type = (item.Type || item.type || '').toLowerCase();

    return name.includes(searchLower) || 
           barcode.includes(searchLower) || 
           type.includes(searchLower);
  });

  return (
    <div className="p-8 w-full max-w-7xl mx-auto font-sans">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-4xl font-black text-gray-900 tracking-tighter italic uppercase">
            Warehouse <span className="text-teal-500">Inventory</span>
          </h1>
          <p className="text-gray-500 font-bold mt-1 uppercase tracking-widest text-xs">
            Live monitoring of bulk storage and shop floor levels.
          </p>
        </div>
        
        <button 
          onClick={fetchInventory}
          className="bg-gray-900 text-white px-6 py-3 rounded-xl font-black uppercase tracking-widest text-[10px] hover:bg-teal-500 transition shadow-lg active:scale-95"
        >
          🔄 Refresh Data
        </button>
      </div>

      <div className="bg-white p-8 rounded-[2rem] shadow-xl border border-gray-100">
        
        {/* SEARCH BAR */}
        <div className="mb-8 flex items-center gap-4">
          <div className="relative flex-grow max-w-md">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
            <input 
              type="text" 
              placeholder="Search by name, barcode, or FG..." 
              className="w-full pl-12 pr-4 py-4 bg-gray-50 text-gray-800 rounded-2xl border border-gray-100 outline-none font-bold focus:ring-2 focus:ring-teal-500/20 transition-all"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          
          <div className="hidden md:flex gap-6 ml-auto">
            <div className="text-right">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Total SKUs</p>
              <p className="text-xl font-black text-gray-900">{inventory.length}</p>
            </div>
          </div>
        </div>

        {/* INVENTORY TABLE */}
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-[10px] font-black text-gray-400 uppercase tracking-widest border-b-2 border-gray-50">
                <th className="pb-4 pl-4">Product Details</th>
                <th className="pb-4">Category</th>
                <th className="pb-4 text-center">Shop Floor (Active)</th>
                <th className="pb-4 text-center">Warehouse (Bulk)</th>
                <th className="pb-4 text-right pr-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr>
                  <td colSpan="5" className="py-20 text-center text-gray-400 font-black animate-pulse uppercase tracking-widest">
                    Synchronizing with Warehouse DB...
                  </td>
                </tr>
              ) : filteredInventory.length === 0 ? (
                <tr>
                  <td colSpan="5" className="py-20 text-center text-gray-400 font-bold italic">
                    No products found matching "{searchTerm}".
                  </td>
                </tr>
              ) : filteredInventory.map((item, idx) => {
                const wQty = item.WarehouseQty || item.warehouseQty || 0;
                const sQty = item.Stock || item.stock || 0;
                
                return (
                  <tr key={idx} className="hover:bg-teal-50/30 transition group">
                    <td className="py-5 pl-4">
                      <p className="font-black text-gray-900 uppercase tracking-tight leading-none">
                        {item.Name || item.name}
                      </p>
                      <p className="font-mono text-[10px] text-gray-400 mt-1 uppercase">
                        {item.Barcode || item.barcode}
                      </p>
                    </td>
                    <td className="py-5">
                      <span className="text-[10px] font-black text-gray-400 uppercase border border-gray-200 px-2 py-1 rounded-md group-hover:border-teal-200">
                        {item.Type || item.type || 'General'}
                      </span>
                    </td>
                    <td className="py-5 text-center">
                      <div className="flex flex-col items-center">
                        <span className="text-lg font-black text-gray-700">{sQty}</span>
                        <span className="text-[8px] font-black text-gray-400 uppercase">{item.UOM || 'Pcs'}</span>
                      </div>
                    </td>
                    <td className="py-5 text-center">
                      <div className="flex flex-col items-center">
                        <span className="text-lg font-black text-teal-600 bg-teal-50 px-4 py-1 rounded-xl">
                          {wQty}
                        </span>
                        <span className="text-[8px] font-black text-teal-500 uppercase mt-1">Landed Units</span>
                      </div>
                    </td>
                    <td className="py-5 text-right pr-4">
                      {wQty === 0 ? (
                        <span className="text-[9px] font-black text-red-500 bg-red-50 px-3 py-1 rounded-full uppercase tracking-widest">Out of Stock</span>
                      ) : wQty < 10 ? (
                        <span className="text-[9px] font-black text-orange-500 bg-orange-50 px-3 py-1 rounded-full uppercase tracking-widest">Low Stock</span>
                      ) : (
                        <span className="text-[9px] font-black text-green-500 bg-green-50 px-3 py-1 rounded-full uppercase tracking-widest">Healthy</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}