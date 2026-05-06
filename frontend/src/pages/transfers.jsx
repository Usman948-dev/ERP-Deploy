import { useState, useEffect } from 'react';

export default function Reports() {
  const [sales, setSales] = useState([]);
  const [returns, setReturns] = useState([]); 
  const [loading, setLoading] = useState(true);

  // --- TAB STATE ---
  const [activeTab, setActiveTab] = useState('receipts'); 

  // --- MODAL STATE ---
  const [selectedBill, setSelectedBill] = useState(null);

  // --- SET UP DEFAULT 30-DAY DATE RANGE ---
  const today = new Date();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(today.getDate() - 30);

  const formatDate = (date) => date.toISOString().split('T')[0];

  const [startDate, setStartDate] = useState(formatDate(thirtyDaysAgo));
  const [endDate, setEndDate] = useState(formatDate(today));

  // --- PRODUCT REPORT STATES ---
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [productSearch, setProductSearch] = useState('');

  const API_URL = 'https://hughes-declared-marshall-bone.trycloudflare.com/api';

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    try {
      const salesRes = await fetch(`${API_URL}/sales/history`);
      if (salesRes.ok) {
        const salesData = await salesRes.json();
        setSales(salesData);
      }

      const returnsRes = await fetch(`${API_URL}/sales/returns`);
      if (returnsRes.ok) {
        const returnsData = await returnsRes.json();
        setReturns(returnsData);
      }
    } catch (err) {
      console.error("Failed to fetch history:", err);
    } finally {
      setLoading(false);
    }
  };

  const getProductName = (item) => {
    const name = item.productName || item.ProductName || item.name || item.Name;
    const code = item.barcode || item.Barcode || item.code || item.Code;
    if (name && name !== 'Unknown Product' && name !== 'Unknown') return name;
    return code || 'Unknown Item';
  };

  // --- FILTER SALES BASED ON SELECTED DATES ---
  const filteredSales = sales.filter(sale => {
    if (!sale.saleDate) return false;
    const saleDate = new Date(sale.saleDate);
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    return saleDate >= start && saleDate <= end;
  });

  const periodTotal = filteredSales.reduce((sum, sale) => sum + (sale.totalAmount || 0), 0);

  // --- FILTER RETURNS BASED ON SELECTED DATES ---
  const filteredReturns = returns.filter(ret => {
    if (!ret.returnDate && !ret.ReturnDate) return false;
    const rDate = new Date(ret.returnDate || ret.ReturnDate);
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    return rDate >= start && rDate <= end;
  });

  const totalRefunded = filteredReturns.reduce((sum, ret) => {
      const price = parseFloat(ret.RefundAmount || ret.refundAmount || ret.Price || ret.price || 0);
      return sum + price;
  }, 0);

  // --- PRE-CALCULATE RETURN IDs TO GROUP THEM BY RETURN LOG ID ---
  // If multiple items are returned in the exact same event, they should share a return ID. 
  // However, since we now have `ReturnLogID` representing individual rows, grouping by `SaleID` and `ReturnDate` might be better.
  const returnIdMap = {};
  let returnCounter = 1;
  filteredReturns.forEach(ret => {
      const sId = ret.SaleId || ret.saleId;
      // Group by sale ID and a simplified timestamp (e.g., minute level) to catch items returned together
      const timeGroup = new Date(ret.returnDate || ret.ReturnDate).toISOString().substring(0, 16); 
      const groupKey = `${sId}-${timeGroup}`;

      if (!returnIdMap[groupKey]) {
          returnIdMap[groupKey] = `RE${String(returnCounter).padStart(2, '0')}`;
          returnCounter++;
      }
  });

  // --- EXCEL EXPORT LOGIC ---
  const exportToExcel = () => {
    if (activeTab === 'returns') {
        if (filteredReturns.length === 0) return alert("No return data to export!");
        let csvContent = "RETURNS REPORT\n";
        csvContent += `Period: ${startDate} to ${endDate}\n\n`;
        csvContent += "RETURN ID,RECEIPT REF,DATE,ITEM NAME,BARCODE,QTY RETURNED,REFUND AMOUNT\n";

        filteredReturns.forEach((ret) => {
            const timeGroup = new Date(ret.returnDate || ret.ReturnDate).toISOString().substring(0, 16);
            const returnId = returnIdMap[`${ret.SaleId || ret.saleId}-${timeGroup}`]; // Grouped ID
            const dateStr = new Date(ret.returnDate || ret.ReturnDate).toLocaleString().replace(/,/g, "");
            const itemName = getProductName(ret).replace(/,/g, "");
            const barcode = ret.barcode || ret.Barcode || 'N/A';
            const qty = ret.ReturnedQty || ret.returnedQty || ret.Quantity || 1;
            const refund = parseFloat(ret.RefundAmount || ret.refundAmount || ret.Price || 0).toFixed(3);
            
            csvContent += `${returnId},#${ret.SaleId || ret.saleId || 'N/A'},${dateStr},${itemName},${barcode},${qty},OMR ${refund}\n`;
        });

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `Returns_Report_${startDate}_to_${endDate}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } else {
        if (filteredSales.length === 0) return alert("No sales data to export!");
        let csvContent = "BILL REPORT\n";
        csvContent += `Period: ${startDate} to ${endDate}\n\n`;
        csvContent += "BILL ID,DATE,CASHIER,ITEM NAME,QTY,UNIT RATE,SUBTOTAL\n";

        filteredSales.forEach(sale => {
            const dateStr = new Date(sale.saleDate).toLocaleString().replace(/,/g, "");
            csvContent += `BILL #${sale.id},${dateStr},${sale.cashierName},,,,\n`;
            if (sale.items && sale.items.length > 0) {
                sale.items.forEach(item => {
                const name = getProductName(item).replace(/,/g, ""); 
                const qty = item.Quantity ?? item.Qty ?? 1;
                const rate = (item.Price ?? 0).toFixed(3);
                const sub = (qty * rate).toFixed(3);
                csvContent += `,,,${name},${qty},${rate},${sub}\n`;
                });
            }
            csvContent += `,,,,,,TOTAL: OMR ${sale.totalAmount.toFixed(3)}\n\n`;
        });

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `Sales_Report_${startDate}_to_${endDate}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
  };

  // --- ANALYTICS CALCULATIONS ---
  const allUniqueProducts = [...new Set(
    filteredSales.flatMap(sale => (sale.items || []).map(item => getProductName(item)))
  )].sort((a, b) => a.localeCompare(b));

  const toggleProduct = (productName) => {
    setSelectedProducts(prev => prev.includes(productName) ? prev.filter(p => p !== productName) : [...prev, productName]);
  };

  const productStats = {};
  filteredSales.forEach(sale => {
    (sale.items || []).forEach(item => {
      const name = getProductName(item);
      const qty = Number(item.Quantity ?? item.quantity ?? 1);
      const price = Number(item.Price ?? item.price ?? 0);
      if (selectedProducts.length === 0 || selectedProducts.includes(name)) {
        if (!productStats[name]) productStats[name] = { qty: 0, revenue: 0 };
        productStats[name].qty += qty;
        productStats[name].revenue += (qty * price);
      }
    });
  });

  const productReport = Object.keys(productStats).map(name => ({
    name, qty: productStats[name].qty, revenue: productStats[name].revenue
  })).sort((a, b) => b.revenue - a.revenue);

  return (
    <div className="p-8 font-sans">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-4xl font-black text-gray-900 tracking-tighter italic uppercase">
            Sales <span className="text-teal-500">Reports</span>
          </h1>
          <p className="text-gray-500 font-bold mt-1 uppercase tracking-widest text-xs">
            Filter and review your transaction history.
          </p>
        </div>
        <button onClick={exportToExcel} className="bg-gray-900 text-white px-6 py-4 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-teal-600 transition shadow-xl flex items-center gap-2">
          📥 Export Excel
        </button>
      </div>

      <div className="bg-white p-8 rounded-[2rem] shadow-xl border border-gray-100">
        
        {/* --- TABS --- */}
        <div className="flex gap-4 mb-6 border-b border-gray-100 pb-4 overflow-x-auto">
          <button onClick={() => setActiveTab('receipts')} className={`whitespace-nowrap font-black uppercase tracking-widest text-xs px-6 py-3 rounded-xl transition ${activeTab === 'receipts' ? 'bg-gray-900 text-white shadow-lg' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
              Receipts History
          </button>
          <button onClick={() => setActiveTab('products')} className={`whitespace-nowrap font-black uppercase tracking-widest text-xs px-6 py-3 rounded-xl transition ${activeTab === 'products' ? 'bg-teal-500 text-slate-900 shadow-lg' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
              Product Analytics
          </button>
          <button onClick={() => setActiveTab('returns')} className={`whitespace-nowrap font-black uppercase tracking-widest text-xs px-6 py-3 rounded-xl transition ${activeTab === 'returns' ? 'bg-rose-500 text-white shadow-lg' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
              Return Records
          </button>
        </div>

        {/* --- FILTERS --- */}
        <div className="flex flex-col md:flex-row flex-wrap gap-6 mb-8 p-6 bg-gray-50 rounded-2xl border border-gray-100 items-end">
          <div className="flex flex-col space-y-2">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">Start Date</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="p-4 rounded-xl border-none shadow-sm outline-none font-bold text-gray-700 focus:ring-2 focus:ring-teal-500/20 bg-white cursor-pointer" />
          </div>
          <div className="flex flex-col space-y-2">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">End Date</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="p-4 rounded-xl border-none shadow-sm outline-none font-bold text-gray-700 focus:ring-2 focus:ring-teal-500/20 bg-white cursor-pointer" />
          </div>
          
          <div className={`md:ml-auto px-6 py-4 rounded-xl border flex flex-col items-start md:items-end w-full md:w-auto shadow-sm ${activeTab === 'returns' ? 'bg-rose-50 border-rose-100' : 'bg-teal-50 border-teal-100'}`}>
             <span className={`text-[10px] font-black uppercase tracking-widest ${activeTab === 'returns' ? 'text-rose-600' : 'text-teal-600'}`}>
                 {activeTab === 'returns' ? 'Total Refunded' : 'Filtered Revenue Total'}
             </span>
             <span className={`text-2xl font-black tracking-tighter ${activeTab === 'returns' ? 'text-rose-800' : 'text-teal-800'}`}>
                 OMR {activeTab === 'returns' ? totalRefunded.toFixed(3) : periodTotal.toFixed(3)}
             </span>
          </div>
        </div>

        {/* --- TAB 1: RECEIPTS --- */}
        {activeTab === 'receipts' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[10px] font-black text-gray-400 uppercase tracking-widest border-b-2 border-gray-50">
                  <th className="pb-4 pl-4">Receipt ID</th>
                  <th className="pb-4">Date & Time</th>
                  <th className="pb-4">Cashier</th>
                  <th className="pb-4 text-right pr-4">Total Amount</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan="4" className="py-20 text-center animate-pulse font-black text-gray-400">LOADING...</td></tr>
                ) : filteredSales.length === 0 ? (
                  <tr><td colSpan="4" className="py-20 text-center italic text-gray-400 font-bold">No sales records found.</td></tr>
                ) : (
                  filteredSales.map((sale, index) => (
                    <tr key={index} onClick={() => setSelectedBill(sale)} className="border-b border-gray-50 hover:bg-teal-50/50 transition cursor-pointer">
                      <td className="py-5 pl-4 font-black text-gray-400 text-xs">#{sale.id}</td>
                      <td className="py-5 font-bold text-gray-700">{new Date(sale.saleDate).toLocaleString()}</td>
                      <td className="py-5 font-black text-gray-900 uppercase">{sale.cashierName}</td>
                      <td className="py-5 text-right pr-4 font-black text-teal-600 text-xl tracking-tighter">OMR {sale.totalAmount.toFixed(3)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* --- TAB 2: PRODUCT ANALYTICS --- */}
        {activeTab === 'products' && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
            <div className="lg:col-span-1 bg-gray-50 p-5 rounded-2xl border border-gray-100 h-fit max-h-[600px] flex flex-col">
               <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Select Products</h3>
               <input type="text" placeholder="Search..." value={productSearch} onChange={e => setProductSearch(e.target.value)} className="w-full p-3 text-sm rounded-xl mb-4 border border-gray-200 focus:outline-none focus:border-teal-500 font-bold" />
               <div className="flex gap-2 mb-4">
                  <button onClick={() => setSelectedProducts(allUniqueProducts)} className="flex-1 text-[10px] bg-gray-200 text-gray-700 py-2 rounded-lg font-black uppercase transition">All</button>
                  <button onClick={() => setSelectedProducts([])} className="flex-1 text-[10px] bg-red-100 text-red-600 py-2 rounded-lg font-black uppercase transition">Clear</button>
               </div>
               <div className="overflow-y-auto space-y-1 flex-grow">
                 {allUniqueProducts.filter(p => p.toLowerCase().includes(productSearch.toLowerCase())).map(product => (
                   <label key={product} className="flex items-center gap-3 cursor-pointer text-sm font-bold text-gray-700 hover:bg-white p-2 rounded-lg transition border border-transparent hover:border-gray-200">
                     <input type="checkbox" checked={selectedProducts.includes(product)} onChange={() => toggleProduct(product)} className="accent-teal-500 w-4 h-4" />
                     <span className="truncate">{product}</span>
                   </label>
                 ))}
               </div>
            </div>
            <div className="lg:col-span-3 bg-gray-900 rounded-2xl p-1 shadow-xl overflow-hidden">
              <table className="w-full text-left text-white">
                <thead className="bg-gray-800">
                  <tr className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                    <th className="py-4 pl-6 rounded-tl-xl">Product</th>
                    <th className="py-4 text-center">Qty</th>
                    <th className="py-4 pr-6 text-right rounded-tr-xl">Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                   {productReport.length === 0 ? (
                       <tr><td colSpan="3" className="py-16 text-center text-gray-500 font-bold italic">No data to display.</td></tr>
                   ) : productReport.map((item, idx) => (
                     <tr key={idx} className="hover:bg-gray-800/50 transition">
                       <td className="py-4 pl-6 font-bold uppercase tracking-tight">{item.name}</td>
                       <td className="py-4 text-center"><span className="bg-gray-800 px-3 py-1 rounded-full text-teal-400 font-black text-xs">{item.qty}</span></td>
                       <td className="py-4 pr-6 text-right font-black text-teal-300 text-lg">OMR {item.revenue.toFixed(3)}</td>
                     </tr>
                   ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* --- TAB 3: RETURN RECORDS --- */}
        {activeTab === 'returns' && (
           <div className="overflow-x-auto">
             <table className="w-full text-left">
               <thead>
                 <tr className="text-[10px] font-black text-gray-400 uppercase tracking-widest border-b-2 border-gray-50">
                   <th className="pb-4 pl-4">Return ID</th>
                   <th className="pb-4">Original Receipt</th>
                   <th className="pb-4">Date & Time</th>
                   <th className="pb-4">Returned Item</th>
                   <th className="pb-4 text-center">Qty</th>
                   <th className="pb-4 text-right pr-4">Refunded</th>
                 </tr>
               </thead>
               <tbody>
                 {loading ? (
                   <tr><td colSpan="6" className="py-20 text-center animate-pulse font-black text-gray-400">LOADING...</td></tr>
                 ) : filteredReturns.length === 0 ? (
                   <tr><td colSpan="6" className="py-20 text-center italic text-gray-400 font-bold">No return records found for this period.</td></tr>
                 ) : (
                   filteredReturns.map((ret, index) => {
                     const timeGroup = new Date(ret.returnDate || ret.ReturnDate).toISOString().substring(0, 16);
                     const returnId = returnIdMap[`${ret.SaleId || ret.saleId}-${timeGroup}`]; // USE GROUPED ID
                     const refundAmt = parseFloat(ret.RefundAmount || ret.refundAmount || ret.Price || 0);

                     return (
                       <tr key={index} className="border-b border-gray-50 hover:bg-rose-50/30 transition">
                         <td className="py-5 pl-4 font-black text-rose-500 text-sm">{returnId}</td>
                         <td className="py-5 font-bold text-gray-500 underline decoration-gray-200 underline-offset-4 cursor-pointer hover:text-gray-900">
                             #{ret.SaleId || ret.saleId || 'N/A'}
                         </td>
                         <td className="py-5 font-bold text-gray-700 text-sm">
                             {new Date(ret.returnDate || ret.ReturnDate).toLocaleString()}
                         </td>
                         <td className="py-5">
                             <p className="font-black text-gray-900 uppercase tracking-tight leading-tight">{getProductName(ret)}</p>
                             <p className="font-mono text-[10px] text-gray-400 mt-1">{ret.barcode || ret.Barcode}</p>
                         </td>
                         <td className="py-5 text-center font-black text-gray-800 text-lg">
                             {ret.ReturnedQty || ret.returnedQty || ret.Quantity || 1}
                         </td>
                         <td className="py-5 text-right pr-4 font-black text-rose-600 text-xl tracking-tighter">
                             OMR {refundAmt.toFixed(3)}
                         </td>
                       </tr>
                     );
                   })
                 )}
               </tbody>
             </table>
           </div>
        )}

      </div>

      {/* --- RECEIPT DETAILS MODAL --- */}
      {selectedBill && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4 backdrop-blur-sm">
          <div className="bg-white p-8 rounded-3xl shadow-2xl w-full max-w-md border border-gray-100 relative">
            <div className="flex justify-between items-start mb-6 border-b border-gray-100 pb-4">
              <div>
                <h2 className="text-3xl font-black text-gray-900 italic uppercase">Receipt <span className="text-teal-500">#{selectedBill.id}</span></h2>
                <p className="text-xs font-bold text-gray-400 mt-1 uppercase tracking-widest">{new Date(selectedBill.saleDate).toLocaleString()}</p>
              </div>
              <button onClick={() => setSelectedBill(null)} className="text-gray-400 hover:text-red-500 font-black text-xl transition">X</button>
            </div>
            <div className="bg-gray-900 text-white rounded-2xl p-5 shadow-inner mb-6">
              <h3 className="text-[10px] uppercase tracking-widest text-teal-400 font-black mb-4 border-b border-gray-700 pb-2">Line Items</h3>
              {selectedBill.items?.map((i, idx) => (
                <div key={idx} className="flex justify-between text-xs mb-3 border-b border-gray-800 pb-2 last:border-0">
                  <span className="font-bold text-gray-200 uppercase">{getProductName(i)}</span>
                  <span className="text-teal-400 font-black">{(i.Quantity || 1)} x OMR {parseFloat(i.Price || 0).toFixed(3)}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-between items-center text-lg font-black uppercase text-gray-900 pt-2 border-t border-gray-100">
               <span>Total:</span>
               <span className="text-teal-600">OMR {parseFloat(selectedBill.totalAmount || 0).toFixed(3)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}