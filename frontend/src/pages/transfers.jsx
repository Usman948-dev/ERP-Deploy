import { useState, useEffect } from 'react';
import { API_URL } from '../config';

export default function Transfers({ user }) {
    // --- STATE MANAGEMENT ---
    const [shopItem, setShopItem] = useState('');
    const [qtyNeeded, setQtyNeeded] = useState('');
    const [transfers, setTransfers] = useState([]);
    const [loading, setLoading] = useState(true);

    // --- AUTOCOMPLETE STATES ---
    const [availableProducts, setAvailableProducts] = useState([]);
    const [filteredProducts, setFilteredProducts] = useState([]);
    const [showDropdown, setShowDropdown] = useState(false);

    // --- BULLETPROOF MANAGER CHECK ---
    // Scans props and local storage to ensure ONLY a Manager can approve
    const activeRole = user?.Role || user?.role || user?.Name || user?.name || 
                       JSON.parse(localStorage.getItem('user') || '{}')?.Role || 
                       JSON.parse(localStorage.getItem('user') || '{}')?.Name || 
                       localStorage.getItem('role') || '';

    const isManager = activeRole.toLowerCase().includes('manager');

    // --- API CALLS ---
    const fetchProducts = async () => {
        try {
            const res = await fetch(`${API_URL}/products/all`); 
            if (res.ok) {
                const data = await res.json();
                setAvailableProducts(data);
            }
        } catch (error) {
            console.error('Error fetching products:', error);
        }
    };

    const fetchTransfers = async () => {
        try {
            const res = await fetch(`${API_URL}/transfers/list`);
            if (res.ok) {
                setTransfers(await res.json());
            }
            setLoading(false);
        } catch (error) {
            console.error('Error fetching transfers:', error);
            setLoading(false);
        }
    };

    // Fetch lists when page loads
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional fetch-on-mount, see React docs 'Fetching data'
        fetchTransfers();
        fetchProducts(); 
    }, []);

    // --- SEARCH LOGIC ---
    const handleSearchInput = (e) => {
        const value = e.target.value;
        setShopItem(value);

        if (value.length > 0) {
            const filtered = availableProducts.filter(product => {
                const name = String(product.Name || product.name || product.ProductName || '').toLowerCase();
                const code = String(product.Barcode || product.barcode || product.Code || product.code || '').toLowerCase();
                const search = value.toLowerCase();
                
                return name.includes(search) || code.includes(search);
            });
            setFilteredProducts(filtered);
            setShowDropdown(true);
        } else {
            setShowDropdown(false);
        }
    };

    const selectProduct = (product) => {
        const name = product.Name || product.name || product.ProductName || 'Unknown Item';
        setShopItem(name);
        setShowDropdown(false);
    };

    const handleRequest = async (e) => {
        e.preventDefault();
        
        if (!shopItem || qtyNeeded <= 0) {
            alert('Please enter a valid item name and quantity greater than 0.');
            return;
        }

        try {
            const res = await fetch(`${API_URL}/transfers/request`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ShopItem: shopItem,
                    QtyNeeded: parseInt(qtyNeeded)
                })
            });
            
            if (res.ok) {
                alert('Stock transfer requested successfully!');
                setShopItem('');
                setQtyNeeded('');
                fetchTransfers(); 
            } else {
                const errText = await res.text();
                alert(`Failed to request stock. Server says: ${errText}`);
            }
        } catch (error) {
            console.error('Error requesting stock:', error);
            alert('Server connection failed. Check console for details.');
        }
    };

    const handleApprove = async (transferId) => {
        if (!isManager) {
            alert("Error: STRICTLY RESTRICTED. Only Managers can approve stock transfers.");
            return;
        }

        try {
            const res = await fetch(`${API_URL}/transfers/approve`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ TransferID: transferId })
            });
            
            if (res.ok) {
                alert('Transfer approved! Stock moved to shop.');
                fetchTransfers();
            } else {
                const errText = await res.text();
                alert(`Failed to approve transfer. Server says: ${errText}`);
            }
        } catch (error) {
            console.error('Error approving transfer:', error);
            alert('Server connection failed.');
        }
    };

    // --- UI RENDER ---
    return (
        <div className="p-6 bg-gray-50 min-h-screen font-sans">
            <h1 className="text-3xl font-bold text-gray-800 mb-8">Stock Transfers</h1>

            {/* 1. STOCK REQUEST FORM */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 mb-8">
                <h2 className="text-xl font-semibold text-gray-800 mb-4">Request Stock from Warehouse</h2>
                <form onSubmit={handleRequest} className="flex flex-col md:flex-row gap-4 items-end">
                    
                    <div className="flex-1 w-full relative">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Item Name / Barcode</label>
                        <input
                            type="text"
                            value={shopItem}
                            onChange={handleSearchInput}
                            onFocus={() => shopItem.length > 0 && setShowDropdown(true)}
                            className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none transition font-bold text-gray-800"
                            placeholder="e.g. Oudh Al Layl 100ml"
                            autoComplete="off"
                            required
                        />
                        
                        {/* AUTOCOMPLETE DROPDOWN */}
                        {showDropdown && filteredProducts.length > 0 && (
                            <ul className="absolute z-50 w-full bg-white border border-gray-200 mt-1 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                                {filteredProducts.map((product, index) => {
                                    const name = product.Name || product.name || product.ProductName || 'Unknown';
                                    const code = product.Barcode || product.barcode || product.Code || product.code || 'N/A';
                                    return (
                                        <li 
                                            key={index}
                                            onClick={() => selectProduct(product)}
                                            className="px-4 py-3 hover:bg-teal-50 cursor-pointer text-sm text-gray-700 border-b border-gray-100 last:border-none transition"
                                        >
                                            <span className="font-black uppercase">{name}</span>
                                            <span className="text-xs text-gray-400 ml-2 font-mono">({code})</span>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                        {showDropdown && filteredProducts.length === 0 && (
                            <ul className="absolute z-50 w-full bg-white border border-gray-200 mt-1 rounded-lg shadow-lg">
                                <li className="px-4 py-3 text-sm font-bold text-red-500">No products found matching "{shopItem}"</li>
                            </ul>
                        )}
                    </div>

                    <div className="w-full md:w-40">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Qty Needed</label>
                        <input
                            type="number"
                            value={qtyNeeded}
                            onChange={(e) => setQtyNeeded(e.target.value)}
                            className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none transition font-bold"
                            min="1"
                            placeholder="0"
                            required
                        />
                    </div>
                    <button
                        type="submit"
                        className="w-full md:w-auto bg-teal-600 text-white px-8 py-2.5 rounded-lg font-black uppercase tracking-widest hover:bg-teal-700 transition shadow-md active:scale-95"
                    >
                        Submit Request
                    </button>
                </form>
            </div>

            {/* 2. TRANSFER REGISTRY TABLE */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <h2 className="text-xl font-semibold text-gray-800 mb-4">Transfer Registry</h2>
                
                {loading ? (
                    <div className="text-center py-12 text-gray-500 font-bold animate-pulse uppercase tracking-widest">Loading transfers data...</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-black text-gray-400 uppercase tracking-wider">ID</th>
                                    <th className="px-6 py-3 text-left text-xs font-black text-gray-400 uppercase tracking-wider">Item Details</th>
                                    <th className="px-6 py-3 text-left text-xs font-black text-gray-400 uppercase tracking-wider">Requested Qty</th>
                                    <th className="px-6 py-3 text-left text-xs font-black text-gray-400 uppercase tracking-wider">Requested By</th>
                                    <th className="px-6 py-3 text-left text-xs font-black text-gray-400 uppercase tracking-wider">Date</th>
                                    <th className="px-6 py-3 text-right text-xs font-black text-gray-400 uppercase tracking-wider">Status & Action</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-100">
                                {transfers.map((transfer) => (
                                    <tr key={transfer.id} className="hover:bg-gray-50 transition">
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-black text-gray-400">#{transfer.id}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-black uppercase text-gray-800">{transfer.item}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-teal-600 font-black">{transfer.qty} UNITS</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-500">{transfer.requestedBy}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-500">
                                            {new Date(transfer.date).toLocaleDateString()}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                                            {transfer.status === 'Pending' ? (
                                                <div className="flex items-center justify-end gap-3">
                                                    <span className="px-3 py-1 bg-yellow-100 text-yellow-800 text-xs rounded-full font-black uppercase">
                                                        Pending
                                                    </span>
                                                    {isManager && (
                                                        <button
                                                            onClick={() => handleApprove(transfer.id)}
                                                            className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider hover:bg-blue-700 transition shadow-md active:scale-95"
                                                        >
                                                            Approve
                                                        </button>
                                                    )}
                                                </div>
                                            ) : (
                                                <span className="px-3 py-1 bg-green-100 text-green-800 text-xs rounded-full font-black uppercase inline-block">
                                                    Completed
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                                {transfers.length === 0 && (
                                    <tr>
                                        <td colSpan="6" className="px-6 py-12 text-center text-gray-400 font-bold italic">
                                            No stock transfers found in the database.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};