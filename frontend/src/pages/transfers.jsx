import React, { useState, useEffect } from 'react';
import axios from 'axios';

// Update this to your live server IP
const API_URL = 'http://157.173.96.166:5001/api';

const Transfers = () => {
    // --- STATE MANAGEMENT ---
    const [shopItem, setShopItem] = useState('');
    const [qtyNeeded, setQtyNeeded] = useState('');
    const [transfers, setTransfers] = useState([]);
    const [loading, setLoading] = useState(true);

    // --- NEW: AUTOCOMPLETE STATES ---
    const [availableProducts, setAvailableProducts] = useState([]);
    const [filteredProducts, setFilteredProducts] = useState([]);
    const [showDropdown, setShowDropdown] = useState(false);

    // Simulated user context
    const currentUser = { name: 'Admin', role: 'Manager' };

    // Fetch lists when page loads
    useEffect(() => {
        fetchTransfers();
        fetchProducts(); // Load products for the search bar!
    }, []);

    // --- API CALLS ---
    const fetchProducts = async () => {
        try {
            // Adjust this URL if your products endpoint is named differently!
            const response = await axios.get(`${API_URL}/products`); 
            setAvailableProducts(response.data);
        } catch (error) {
            console.error('Error fetching products for search:', error);
        }
    };

    const fetchTransfers = async () => {
        try {
            const response = await axios.get(`${API_URL}/transfers/list`);
            setTransfers(response.data);
            setLoading(false);
        } catch (error) {
            console.error('Error fetching transfers:', error);
            setLoading(false);
        }
    };

    // --- SEARCH LOGIC ---
    const handleSearchInput = (e) => {
        const value = e.target.value;
        setShopItem(value);

        // Filter the products based on what the user types
        if (value.length > 0) {
            const filtered = availableProducts.filter(product => 
                // Assuming your product object has a 'name' or 'barcode' property
                (product.name && product.name.toLowerCase().includes(value.toLowerCase())) ||
                (product.barcode && product.barcode.toLowerCase().includes(value.toLowerCase()))
            );
            setFilteredProducts(filtered);
            setShowDropdown(true);
        } else {
            setShowDropdown(false);
        }
    };

    const selectProduct = (productName) => {
        setShopItem(productName);
        setShowDropdown(false); // Hide the dropdown once clicked
    };

    const handleRequest = async (e) => {
        e.preventDefault();
        
        if (!shopItem || qtyNeeded <= 0) {
            alert('Please enter a valid item name and quantity greater than 0.');
            return;
        }

        try {
            await axios.post(`${API_URL}/transfers/request`, {
                ShopItem: shopItem,
                QtyNeeded: parseInt(qtyNeeded)
            });
            
            alert('Stock transfer requested successfully!');
            setShopItem('');
            setQtyNeeded('');
            fetchTransfers();
            
        } catch (error) {
            console.error('Error requesting stock:', error);
            alert('Failed to request stock. Check console for details.');
        }
    };

    const handleApprove = async (transferId) => {
        if (currentUser.role !== 'Manager' && currentUser.role !== 'Admin') {
            alert("Error: Only managers can approve stock transfers.");
            return;
        }

        try {
            await axios.post(`${API_URL}/transfers/approve`, {
                TransferID: transferId
            });
            
            alert('Transfer approved! Stock moved to shop.');
            fetchTransfers();
            
        } catch (error) {
            console.error('Error approving transfer:', error);
            alert('Failed to approve transfer. Check console for details.');
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
                    
                    {/* AUTOCOMPLETE CONTAINER */}
                    <div className="flex-1 w-full relative">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Item Name / Barcode</label>
                        <input
                            type="text"
                            value={shopItem}
                            onChange={handleSearchInput}
                            onFocus={() => shopItem.length > 0 && setShowDropdown(true)}
                            className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none transition"
                            placeholder="e.g. Oudh Al Layl 100ml"
                            autoComplete="off"
                            required
                        />
                        
                        {/* THE FLOATING DROPDOWN MENU */}
                        {showDropdown && filteredProducts.length > 0 && (
                            <ul className="absolute z-50 w-full bg-white border border-gray-200 mt-1 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                                {filteredProducts.map((product, index) => (
                                    <li 
                                        key={index}
                                        onClick={() => selectProduct(product.name)}
                                        className="px-4 py-2 hover:bg-teal-50 cursor-pointer text-sm text-gray-700 border-b last:border-none"
                                    >
                                        <span className="font-semibold">{product.name}</span>
                                        <span className="text-xs text-gray-400 ml-2">({product.barcode})</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                        {showDropdown && filteredProducts.length === 0 && (
                            <ul className="absolute z-50 w-full bg-white border border-gray-200 mt-1 rounded-lg shadow-lg">
                                <li className="px-4 py-2 text-sm text-gray-500">No products found.</li>
                            </ul>
                        )}
                    </div>

                    <div className="w-full md:w-40">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Qty Needed</label>
                        <input
                            type="number"
                            value={qtyNeeded}
                            onChange={(e) => setQtyNeeded(e.target.value)}
                            className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none transition"
                            min="1"
                            placeholder="0"
                            required
                        />
                    </div>
                    <button
                        type="submit"
                        className="w-full md:w-auto bg-teal-600 text-white px-8 py-2.5 rounded-lg font-medium hover:bg-teal-700 transition shadow-sm"
                    >
                        Submit Request
                    </button>
                </form>
            </div>

            {/* 2. TRANSFER REGISTRY TABLE */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <h2 className="text-xl font-semibold text-gray-800 mb-4">Transfer Registry</h2>
                
                {loading ? (
                    <div className="text-center py-8 text-gray-500">Loading transfers data...</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">ID</th>
                                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Item Details</th>
                                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Requested Qty</th>
                                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Requested By</th>
                                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Date</th>
                                    <th className="px-6 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Status & Action</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-100">
                                {transfers.map((transfer) => (
                                    <tr key={transfer.id} className="hover:bg-gray-50 transition">
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">#{transfer.id}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{transfer.item}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-semibold">{transfer.qty} units</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{transfer.requestedBy}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                            {new Date(transfer.date).toLocaleDateString()}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                                            {transfer.status === 'Pending' ? (
                                                <div className="flex items-center justify-end gap-3">
                                                    <span className="px-3 py-1 bg-yellow-100 text-yellow-800 text-xs rounded-full font-semibold">
                                                        Pending
                                                    </span>
                                                    <button
                                                        onClick={() => handleApprove(transfer.id)}
                                                        className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-xs font-medium hover:bg-blue-700 transition shadow-sm"
                                                    >
                                                        Approve
                                                    </button>
                                                </div>
                                            ) : (
                                                <span className="px-3 py-1 bg-green-100 text-green-800 text-xs rounded-full font-semibold inline-block">
                                                    Completed
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                                {transfers.length === 0 && (
                                    <tr>
                                        <td colSpan="6" className="px-6 py-8 text-center text-gray-500">
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

export default Transfers;