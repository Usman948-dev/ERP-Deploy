import { useState, useEffect } from 'react';
import Barcode from 'react-barcode';

export default function BarcodeGen() {
  const [inventory, setInventory] = useState([]);
  
  // NEW: State to hold the user's search query
  const [searchTerm, setSearchTerm] = useState('');

  // --- FIXED: Point to your active Cloudflare Tunnel ---
  const API_URL = 'https://hughes-declared-marshall-bone.trycloudflare.com/api';

  useEffect(() => {
    fetch(`${API_URL}/products/all`)
      .then(res => res.json())
      .then(data => {
        // Normalize the data (fixes SQL capitalization mismatches)
        const normalizedData = data.map(p => ({
          ...p,
          id: p.id || p.Id || p.ProductID || p.barcode || p.Barcode,
          name: p.name || p.Name || p.ProductName || 'Unnamed Item',
          barcode: p.barcode || p.Barcode || p.Code || p.code,
          type: p.type || p.Type || p.Category || p.category || ''
        }));
        setInventory(normalizedData);
      })
      .catch(err => console.error("Fetch Error:", err));
  }, []);

  // --- FILTER LOGIC: Remove Raw Materials AND Apply Search Term ---
  const rawMaterials = ["gas", "oil", "water", "diesel", "petrol", "yarn", "thread", "raw silk"];
  
  const filteredInventory = inventory.filter(p => {
    const name = (p.name || "").toLowerCase().trim();
    const type = (p.type || "").toLowerCase();
    const barcodeCode = String(p.barcode || "").toLowerCase();
    const search = searchTerm.toLowerCase().trim();
    
    // Check if the item name is in the RM list, OR if its SQL Category/Type is 'Raw'
    const isRMByName = rawMaterials.includes(name);
    const isRMByType = type.includes('raw');
    
    // Check if it matches what the user typed in the search bar
    const matchesSearch = name.includes(search) || barcodeCode.includes(search);
    
    // Keep it ONLY if it is NOT a raw material AND it matches the search query
    return !isRMByName && !isRMByType && matchesSearch; 
  });

  const handlePrint = (barcodeId) => {
    const printContent = document.getElementById(barcodeId);
    const originalContent = document.body.innerHTML;

    // A simple trick to print ONLY the barcode
    document.body.innerHTML = printContent.innerHTML;
    window.print();
    document.body.innerHTML = originalContent;
    window.location.reload(); // Refresh to get the UI back
  };

  return (
    <div className="p-8 font-sans">
      {/* HEADER */}
      <div className="mb-8">
        <h1 className="text-4xl font-black text-gray-900 tracking-tighter italic uppercase">
          Barcode <span className="text-teal-500">Generator</span>
        </h1>
        <p className="text-gray-500 font-bold mt-1 uppercase tracking-widest text-xs">
          Print product labels for finished goods.
        </p>
      </div>

      {/* NEW: SEARCH BAR */}
      <div className="bg-white p-4 rounded-2xl shadow-xl mb-8 flex items-center border border-gray-100 max-w-2xl">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-teal-500 ml-2 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input 
          type="text" 
          placeholder="Search by product name or barcode..." 
          className="w-full bg-transparent text-gray-800 outline-none font-bold placeholder:text-gray-400"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        {searchTerm && (
            <button onClick={() => setSearchTerm('')} className="text-gray-400 hover:text-red-500 font-black px-3">X</button>
        )}
      </div>
      
      {/* BARCODE GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {filteredInventory.map((item) => (
          <div key={item.barcode} className="bg-white p-8 rounded-[2rem] shadow-xl border border-gray-100 flex flex-col items-center group hover:border-teal-500 transition">
            <h3 className="font-black text-gray-800 mb-4 uppercase tracking-tight text-center">{item.name}</h3>
            
            {/* The actual Barcode Component */}
            <div id={`label-${item.barcode}`} className="p-4 bg-white flex justify-center w-full">
              <Barcode 
                value={item.barcode || '00000'} 
                width={1.5} 
                height={50} 
                fontSize={14}
                font="monospace"
                background="#ffffff"
              />
            </div>

            <button 
              onClick={() => handlePrint(`label-${item.barcode}`)}
              className="mt-6 w-full bg-gray-900 text-white px-4 py-4 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-teal-500 shadow-lg transition active:scale-95"
            >
              Print Label
            </button>
          </div>
        ))}

        {filteredInventory.length === 0 && (
          <div className="col-span-full py-20 text-center text-gray-400 font-bold italic">
            {searchTerm ? "No products match your search." : "Loading products or no finished goods found..."}
          </div>
        )}
      </div>
    </div>
  );
}