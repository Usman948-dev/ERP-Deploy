import { useState, useEffect } from 'react';

// PASS THE USER PROP IN!
export default function Reports({ user }) {
  const [sales, setSales] = useState([]);
  const [returns, setReturns] = useState([]); 
  const [inventory, setInventory] = useState([]); 
  const [loading, setLoading] = useState(true);

  const [activeTab, setActiveTab] = useState('receipts'); 
  const [selectedBill, setSelectedBill] = useState(null);

  const today = new Date();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(today.getDate() - 30);
  const formatDate = (date) => {
      const d = new Date(date);
      let month = '' + (d.getMonth() + 1);
      let day = '' + d.getDate();
      const year = d.getFullYear();
      if (month.length < 2) month = '0' + month;
      if (day.length < 2) day = '0' + day;
      return [year, month, day].join('-');
  };

  const [startDate, setStartDate] = useState(formatDate(thirtyDaysAgo));
  const [endDate, setEndDate] = useState(formatDate(today));
  const [movementSearch, setMovementSearch] = useState('');

  const API_URL = 'http://157.173.96.166:5001/api';

  // --- BULLETPROOF ADMIN CHECK ---
  const activeRole = user?.Role || user?.role || user?.Name || user?.name || 
                     JSON.parse(localStorage.getItem('user') || '{}')?.Role || 
                     JSON.parse(localStorage.getItem('user') || '{}')?.Name || 
                     localStorage.getItem('role') || '';

  const isAdmin = activeRole.toLowerCase().includes('admin') || activeRole.toLowerCase().includes('project manager') || activeRole.toLowerCase().includes('manager');

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    try {
      const [salesRes, returnsRes, invRes] = await Promise.all([
        fetch(`${API_URL}/sales/history`),
        fetch(`${API_URL}/sales/returns`),
        fetch(`${API_URL}/products/all`)
      ]);

      if (salesRes.ok) setSales(await salesRes.json());
      if (returnsRes.ok) setReturns(await returnsRes.json());
      if (invRes.ok) setInventory(await invRes.json());
    } catch (err) {
      console.error("Failed to fetch history:", err);
    } finally {
      setLoading(false);
    }
  };

  // --- DELETE BILL LOGIC ---
  const handleDeleteBill = async (billId) => {
    if (!window.confirm(`CRITICAL WARNING: Are you sure you want to PERMANENTLY delete Bill #${billId}? This will wipe it from all reports and analytics.`)) return;
    
    try {
      const res = await fetch(`${API_URL}/sales/${billId}`, { method: 'DELETE' });
      if (res.ok) {
        alert(`Bill #${billId} has been completely deleted.`);
        setSelectedBill(null);
        fetchHistory(); // Refresh the data automatically
      } else {
        const errText = await res.text();
        alert(`Failed to delete bill: ${errText}`);
      }
    } catch (err) {
      alert("Network error while trying to delete.");
    }
  };

  const getProductName = (item) => {
    const name = item.productName || item.ProductName || item.name || item.Name;
    const code = item.barcode || item.Barcode || item.code || item.Code;
    if (name && name !== 'Unknown Product' && name !== 'Unknown') return name;
    return code || 'Unknown Item';
  };
  
  // --- PERFECTED TIMESTAMP FILTERING ---
  const startTimestamp = new Date(startDate).setHours(0, 0, 0, 0);
  const endTimestamp = new Date(endDate).setHours(23, 59, 59, 999);

  const dateFilteredSales = sales.filter(s => {
    if (!s.saleDate) return false;
    const saleTime = new Date(s.saleDate).getTime();
    return saleTime >= startTimestamp && saleTime <= endTimestamp;
  });

  const dateFilteredReturns = returns.filter(r => {
    if (!r.returnDate && !r.ReturnDate) return false;
    const retTime = new Date(r.returnDate || r.ReturnDate).getTime();
    return retTime >= startTimestamp && retTime <= endTimestamp;
  });

  const productMovementReport = inventory
    .filter(p => {
        const type = (p.Type || p.type || p.InventoryType || "").toLowerCase();
        return !type.includes("raw material") && !type.includes("raw_material");
    })
    .map(prod => {
        const originalBc = prod.barcode || prod.Barcode || prod.code || prod.Code || "N/A";
        const searchBc = String(originalBc).trim().toLowerCase();
        const prodName = String(prod.Name || prod.name || prod.ProductName || "").trim().toLowerCase();
        
        let itemSaleAmount = 0;
        let totalSoldQty = 0;
        
        dateFilteredSales.forEach(sale => {
            (sale.items || sale.Items || []).forEach(item => {
                const itemBc = String(item.barcode || item.Barcode || item.code || item.Code || "").trim().toLowerCase();
                const itemName = String(item.productName || item.ProductName || item.name || "").trim().toLowerCase();
                
                const isMatch = (itemBc === searchBc && searchBc !== "n/a" && searchBc !== "") || 
                                (itemName === prodName && prodName !== "");

                if (isMatch) {
                    const qty = Number(item.quantity ?? item.Quantity ?? item.qty ?? item.Qty ?? 0);
                    const price = Number(item.price ?? item.Price ?? 0);
                    itemSaleAmount += (qty * price);
                    totalSoldQty += qty;
                }
            });
        });

        let itemReturnAmount = 0;
        let itemReturnQty = 0;
        dateFilteredReturns.forEach(ret => {
            const retBc = String(ret.barcode || ret.Barcode || "").trim().toLowerCase();
            const retName = String(ret.productName || ret.ProductName || "").trim().toLowerCase();
            const isMatch = (retBc === searchBc && searchBc !== "n/a" && searchBc !== "") || 
                            (retName === prodName && prodName !== "");

            if (isMatch) {
                itemReturnAmount += Number(ret.refundAmount || ret.RefundAmount || 0);
                itemReturnQty += Number(ret.returnedQty || ret.ReturnedQty || 0);
            }
        });

        const netQty = totalSoldQty - itemReturnQty;
        const totalCostAmount = netQty * Number(prod.Cost || prod.cost || 0);
        const currentStock = Number(prod.StockQty ?? prod.stockQty ?? prod.Stock ?? prod.stock ?? prod.Qty ?? prod.qty ?? 0);

        return {
            code: originalBc,
            name: prod.Name || prod.name || prod.ProductName || "Unknown Item",
            category: prod.Type || prod.type || "Uncategorized", 
            subCategory: prod.Category || prod.category || "General", 
            soldQty: totalSoldQty,
            saleAmount: itemSaleAmount,
            returnQty: itemReturnQty,
            returnAmount: itemReturnAmount,
            costAmount: totalCostAmount,
            stock: currentStock
        };
    })
    .filter(row => row.soldQty > 0 || row.returnQty > 0 || row.stock !== 0); 

  const finalMovementReport = productMovementReport.filter(row => {
      if (!movementSearch) return true;
      const search = movementSearch.toLowerCase();
      return (
          row.code.toLowerCase().includes(search) ||
          row.name.toLowerCase().includes(search) ||
          row.category.toLowerCase().includes(search) ||
          row.subCategory.toLowerCase().includes(search)
      );
  });

  // --- NEW FINANCIAL DASHBOARD METRICS ---
  
  // Total number of bills processed
  const totalSalesCount = dateFilteredSales.length;
  
  // Gross Revenue includes ALL sales (even ones that were later refunded)
  const grossRevenue = dateFilteredSales.reduce((sum, s) => {
      return sum + Number(s.totalAmount || s.TotalAmount || 0);
  }, 0);

  // Total amount of money given back to customers
  const totalRefunds = dateFilteredReturns.reduce((sum, r) => {
      return sum + Number(r.refundAmount || r.RefundAmount || 0);
  }, 0);

  // The actual money staying in your drawer
  const netRevenue = grossRevenue - totalRefunds;


  let cashTotal = 0;
  let cardTotal = 0;

  dateFilteredSales.forEach(s => {
      // Don't sum up returned bills in the cash/card breakdown
      if (s.isReturned || s.IsReturned) return;
      
      const paymentType = String(s.paymentMethod || s.PaymentMethod || 'Cash').toLowerCase();
      const totalAmt = Number(s.totalAmount || s.TotalAmount || 0);
      
      if (paymentType === 'multiple') {
          cashTotal += Number(s.cashAmount || s.CashAmount || 0);
          cardTotal += Number(s.cardAmount || s.CardAmount || 0);
      } else if (paymentType === 'card') {
          cardTotal += totalAmt;
      } else {
          cashTotal += totalAmt;
      }
  });

  const returnIdMap = {};
  let returnCounter = 1;
  dateFilteredReturns.forEach(ret => {
      const sId = ret.SaleId || ret.saleId;
      const timeGroup = new Date(ret.returnDate || ret.ReturnDate).toISOString().substring(0, 19); 
      const groupKey = `${sId}-${timeGroup}`;
      if (!returnIdMap[groupKey]) {
          returnIdMap[groupKey] = `RE${String(returnCounter).padStart(2, '0')}`;
          returnCounter++;
      }
  });

  const exportToExcel = () => {
      if (activeTab === 'movement') {
          if (finalMovementReport.length === 0) return alert("No data to export!");
          let csvContent = "PRODUCT MOVEMENT REPORT\n";
          csvContent += `Period: ${startDate} to ${endDate}\n\n`;
          csvContent += "CODE,ITEM DESCRIPTION,CATEGORY,SUB-CATEGORY,QTY SOLD,SALE AMT,QTY RETURNED,RETURN AMT,COST AMT,STOCK\n";
          finalMovementReport.forEach(row => {
              csvContent += `"${row.code}","${row.name}","${row.category}","${row.subCategory}",${row.soldQty},${row.saleAmount.toFixed(3)},${row.returnQty},${row.returnAmount.toFixed(3)},${row.costAmount.toFixed(3)},${row.stock}\n`;
          });
          downloadCSV(csvContent, `Product_Movement_${startDate}_to_${endDate}.csv`);
      } 
      else if (activeTab === 'receipts') {
          if (dateFilteredSales.length === 0) return alert("No sales data to export!");
          let csvContent = "BILL REPORT\n";
          csvContent += `Period: ${startDate} to ${endDate}\n\n`;
          csvContent += "BILL ID,DATE,CASHIER,CONTACT,PAYMENT TYPE,CASH PAID,CARD PAID,STATUS,ITEM NAME,QTY,UNIT RATE,SUBTOTAL\n";

          dateFilteredSales.forEach(sale => {
              const dateStr = new Date(sale.saleDate).toLocaleString().replace(/,/g, "");
              const contact = sale.customerPhone || sale.CustomerPhone || "N/A";
              const payment = String(sale.paymentMethod || sale.PaymentMethod || "Cash");
              const pType = payment.toLowerCase();
              const isReturned = sale.isReturned || sale.IsReturned ? "REFUNDED" : "COMPLETED";
              
              let cCash = 0; let cCard = 0;
              const totalA = Number(sale.totalAmount || sale.TotalAmount || 0);

              if (pType === 'multiple') {
                  cCash = Number(sale.cashAmount || sale.CashAmount || 0);
                  cCard = Number(sale.cardAmount || sale.CardAmount || 0);
              } else if (pType === 'card') {
                  cCard = totalA;
              } else {
                  cCash = totalA;
              }

              let cashStr = cCash > 0 ? cCash.toFixed(3) : "";
              let cardStr = cCard > 0 ? cCard.toFixed(3) : "";
              
              if (pType === 'multiple' && cCash === 0 && cCard === 0) {
                  cashStr = `${totalA.toFixed(3)} (Total)`;
                  cardStr = "";
              }

              csvContent += `BILL #${sale.id},${dateStr},${sale.cashierName},${contact},${payment},${cashStr},${cardStr},${isReturned},,,,\n`;
              
              if (sale.items && sale.items.length > 0) {
                  sale.items.forEach(item => {
                  const name = getProductName(item).replace(/,/g, ""); 
                  const qty = Number(item.quantity ?? item.Quantity ?? item.qty ?? item.Qty ?? 1);
                  const rate = (Number(item.price ?? item.Price ?? 0)).toFixed(3);
                  const sub = (qty * rate).toFixed(3);
                  csvContent += `,,,,,,,,${name},${qty},${rate},${sub}\n`;
                  });
              }
              csvContent += `,,,,,,,,,,,TOTAL: OMR ${totalA.toFixed(3)}\n\n`;
          });
          downloadCSV(csvContent, `Sales_Report_${startDate}_to_${endDate}.csv`);
      }
      else if (activeTab === 'returns') {
          if (dateFilteredReturns.length === 0) return alert("No return data to export!");
          let csvContent = "RETURNS REPORT\n";
          csvContent += `Period: ${startDate} to ${endDate}\n\n`;
          csvContent += "RETURN ID,RECEIPT REF,DATE,ITEM NAME,BARCODE,QTY RETURNED,REFUND AMOUNT\n";

          dateFilteredReturns.forEach((ret) => {
              const timeGroup = new Date(ret.returnDate || ret.ReturnDate).toISOString().substring(0, 19);
              const groupKey = `${ret.SaleId || ret.saleId}-${timeGroup}`;
              const returnId = returnIdMap[groupKey]; 
              const dateStr = new Date(ret.returnDate || ret.ReturnDate).toLocaleString().replace(/,/g, "");
              const itemName = getProductName(ret).replace(/,/g, "");
              const barcode = ret.barcode || ret.Barcode || 'N/A';
              const qty = ret.ReturnedQty || ret.returnedQty || 1;
              const refund = Number(ret.RefundAmount || ret.refundAmount || 0).toFixed(3);
              csvContent += `${returnId},#${ret.SaleId || ret.saleId || 'N/A'},${dateStr},${itemName},${barcode},${qty},OMR ${refund}\n`;
          });
          downloadCSV(csvContent, `Returns_Report_${startDate}_to_${endDate}.csv`);
      }
  };

  const downloadCSV = (content, filename) => {
      const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  return (
    <div className="p-8 font-sans bg-slate-50 min-h-screen">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tighter italic uppercase">
            REPORTS <span className="text-teal-500">& ANALYTICS</span>
          </h1>
        </div>
        <button onClick={exportToExcel} className="bg-slate-900 text-white px-6 py-4 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-teal-600 transition shadow-xl">
          📥 Export Current Tab
        </button>
      </div>

      <div className="bg-white p-8 rounded-[2rem] shadow-xl border border-slate-200">
        
        <div className="flex gap-4 mb-8 border-b border-slate-100 pb-4 overflow-x-auto">
          <button onClick={() => setActiveTab('receipts')} className={`whitespace-nowrap font-black uppercase tracking-widest text-xs px-6 py-3 rounded-xl transition ${activeTab === 'receipts' ? 'bg-slate-900 text-white shadow-lg' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>Receipts</button>
          <button onClick={() => setActiveTab('movement')} className={`whitespace-nowrap font-black uppercase tracking-widest text-xs px-6 py-3 rounded-xl transition ${activeTab === 'movement' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>Product Movement (FG)</button>
          <button onClick={() => setActiveTab('returns')} className={`whitespace-nowrap font-black uppercase tracking-widest text-xs px-6 py-3 rounded-xl transition ${activeTab === 'returns' ? 'bg-rose-500 text-white shadow-lg' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>Returns</button>
        </div>

        {/* --- METRICS DASHBOARD BOARD --- */}
        <div className="flex flex-col xl:flex-row gap-6 mb-8 p-6 bg-slate-50 rounded-2xl border border-slate-200">
          
          {/* Date Pickers */}
          <div className="flex gap-4 shrink-0 items-center">
            <div className="flex flex-col space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Start Date</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="p-4 rounded-xl border border-slate-200 outline-none font-bold text-slate-700 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition h-14" />
            </div>
            <div className="flex flex-col space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">End Date</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="p-4 rounded-xl border border-slate-200 outline-none font-bold text-slate-700 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition h-14" />
            </div>
          </div>
          
          {/* Dashboard Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 w-full">
             <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-center">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Sales (Bills)</span>
                <span className="text-2xl font-black text-slate-700 tracking-tighter">{totalSalesCount}</span>
             </div>
             <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-center">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Gross Revenue</span>
                <span className="text-2xl font-black text-indigo-600 tracking-tighter">OMR {grossRevenue.toFixed(3)}</span>
             </div>
             <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-center">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Refunds</span>
                <span className="text-2xl font-black text-rose-500 tracking-tighter">OMR {totalRefunds.toFixed(3)}</span>
             </div>
             <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-center">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Net Revenue</span>
                <span className="text-2xl font-black text-emerald-500 tracking-tighter">OMR {netRevenue.toFixed(3)}</span>
             </div>
          </div>

        </div>

        {activeTab === 'movement' && (
          <div className="space-y-4">
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 flex items-center shadow-sm">
               <span className="text-slate-400 pr-3 font-bold">🔍</span>
               <input 
                 type="text" 
                 placeholder="Search by Code, Name, or Sub-Category..." 
                 className="w-full bg-transparent outline-none font-bold text-sm text-slate-700"
                 value={movementSearch}
                 onChange={e => setMovementSearch(e.target.value)}
               />
               {movementSearch && (
                 <button onClick={() => setMovementSearch('')} className="text-xs text-slate-400 hover:text-rose-500 font-bold ml-2 transition">CLEAR</button>
               )}
            </div>

            <div className="overflow-x-auto rounded-2xl border border-slate-200 shadow-sm">
              <table className="w-full text-left bg-slate-900 text-white">
                <thead>
                  <tr className="text-[10px] font-black text-slate-500 uppercase tracking-widest bg-slate-800">
                    <th className="py-4 pl-6">Code</th>
                    <th className="py-4">Item Description</th>
                    <th className="py-4">Sub-Category</th>
                    <th className="py-4 text-center">Qty Sold</th>
                    <th className="py-4 text-right">Sale Amt</th>
                    <th className="py-4 text-center">Qty Ret</th>
                    <th className="py-4 text-right">Return Amt</th>
                    <th className="py-4 text-right">Cost Amt</th>
                    <th className="py-4 pr-6 text-center">Stock</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {loading ? (
                    <tr><td colSpan="9" className="py-16 text-center text-slate-500 font-black animate-pulse uppercase tracking-widest">Loading Inventory...</td></tr>
                  ) : finalMovementReport.length === 0 ? (
                    <tr><td colSpan="9" className="py-16 text-center text-slate-500 font-bold italic">No items found matching your filters.</td></tr>
                  ) : (
                    finalMovementReport.map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-800/50 transition">
                        <td className="py-4 pl-6 font-mono text-xs text-slate-500">{row.code}</td>
                        <td className="py-4 font-black text-xs uppercase text-slate-200">{row.name}</td>
                        <td className="py-4">
                            <span className="bg-amber-900/30 text-amber-400 text-[9px] px-2 py-1 rounded font-black uppercase border border-amber-500/20">{row.subCategory}</span>
                        </td>
                        <td className="py-4 text-center font-black text-emerald-400">{row.soldQty}</td>
                        <td className="py-4 text-right font-black text-emerald-400 text-sm">OMR {row.saleAmount.toFixed(3)}</td>
                        <td className="py-4 text-center font-black text-rose-400">{row.returnQty}</td>
                        <td className="py-4 text-right font-black text-rose-400 text-sm">OMR {row.returnAmount.toFixed(3)}</td>
                        <td className="py-4 text-right font-black text-slate-400 text-sm">OMR {row.costAmount.toFixed(3)}</td>
                        <td className="py-4 pr-6 text-center">
                            <span className={`font-black px-3 py-1 rounded-full text-xs ${row.stock > 0 ? 'text-white bg-slate-800' : 'text-rose-500 bg-rose-500/10'}`}>
                                {row.stock}
                            </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'receipts' && (
            <div className="overflow-x-auto rounded-2xl border border-slate-200">
                <table className="w-full text-left">
                    <thead className="bg-slate-50 border-b border-slate-200">
                        <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                            <th className="py-4 pl-6">ID</th>
                            <th className="py-4">Date</th>
                            <th className="py-4">Cashier</th>
                            <th className="py-4">Contact</th>
                            <th className="py-4">Method</th>
                            <th className="py-4 text-right">
                                <div className="mb-1 text-emerald-600">CASH</div>
                                <div className="text-[10px] text-emerald-400">OMR {cashTotal.toFixed(3)}</div>
                            </th>
                            <th className="py-4 text-right pr-6">
                                <div className="mb-1 text-blue-600">CARD</div>
                                <div className="text-[10px] text-blue-400">OMR {cardTotal.toFixed(3)}</div>
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {dateFilteredSales.map((s, i) => {
                            const paymentType = String(s.paymentMethod || s.PaymentMethod || 'Cash').toLowerCase();
                            const totalAmount = Number(s.totalAmount || s.TotalAmount || 0);
                            const isReturned = s.isReturned || s.IsReturned; // Check returned status
                            
                            let rowCash = 0; let rowCard = 0;

                            if (paymentType === 'multiple') {
                                rowCash = Number(s.cashAmount || s.CashAmount || 0);
                                rowCard = Number(s.cardAmount || s.CardAmount || 0);
                            } else if (paymentType === 'card') {
                                rowCard = totalAmount;
                            } else {
                                rowCash = totalAmount;
                            }

                            // CLEAN FALLBACK DISPLAY FOR OLD BILLS
                            let displayCash = <span className="text-slate-300">-</span>;
                            let displayCard = <span className="text-slate-300">-</span>;

                            if (paymentType === 'multiple') {
                                if (rowCash > 0 || rowCard > 0) {
                                    displayCash = rowCash > 0 ? `OMR ${rowCash.toFixed(3)}` : <span className="text-slate-300">-</span>;
                                    displayCard = rowCard > 0 ? `OMR ${rowCard.toFixed(3)}` : <span className="text-slate-300">-</span>;
                                } else {
                                    displayCash = <span className="text-slate-500 font-bold italic">OMR {totalAmount.toFixed(3)} (Total)</span>;
                                    displayCard = <span className="text-slate-300">-</span>;
                                }
                            } else if (paymentType === 'card') {
                                displayCard = `OMR ${rowCard.toFixed(3)}`;
                            } else {
                                displayCash = `OMR ${rowCash.toFixed(3)}`;
                            }

                            return (
                                <tr key={i} onClick={() => setSelectedBill(s)} className={`cursor-pointer transition ${isReturned ? 'bg-rose-50 hover:bg-rose-100' : 'hover:bg-slate-50'}`}>
                                    <td className="py-4 pl-6 font-black text-slate-400 text-xs">
                                        #{s.id}
                                        {isReturned && <span className="ml-2 bg-rose-500 text-white text-[9px] px-2 py-0.5 rounded uppercase tracking-wider">Refunded</span>}
                                    </td>
                                    <td className="py-4 text-slate-600 font-bold text-xs">{new Date(s.saleDate).toLocaleString()}</td>
                                    <td className="py-4 font-black uppercase text-slate-800 text-xs">{s.cashierName}</td>
                                    <td className="py-4 text-slate-500 font-bold text-xs">{s.customerPhone || s.CustomerPhone || 'N/A'}</td>
                                    <td className={`py-4 font-bold text-xs uppercase ${isReturned ? 'text-slate-400 line-through' : 'text-slate-600'}`}>{s.paymentMethod || s.PaymentMethod || 'Cash'}</td>
                                    <td className={`py-4 text-right font-black ${isReturned ? 'text-slate-400 line-through' : 'text-emerald-500'}`}>{displayCash}</td>
                                    <td className={`py-4 text-right pr-6 font-black ${isReturned ? 'text-slate-400 line-through' : 'text-blue-500'}`}>{displayCard}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        )}

        {activeTab === 'returns' && (
            <div className="overflow-x-auto rounded-2xl border border-slate-200">
                <table className="w-full text-left">
                    <thead className="bg-slate-50 border-b border-slate-200">
                        <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                            <th className="py-4 pl-6">Receipt</th>
                            <th className="py-4">Date</th>
                            <th className="py-4">Product</th>
                            <th className="py-4 text-center">Qty</th>
                            <th className="py-4 text-right pr-6">Refunded</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {dateFilteredReturns.map((r, i) => (
                            <tr key={i}>
                                <td className="py-4 pl-6 font-black text-slate-400 text-xs">#{r.saleId}</td>
                                <td className="py-4 text-slate-600 font-bold text-xs">{new Date(r.returnDate || r.ReturnDate).toLocaleString()}</td>
                                <td className="py-4 font-black uppercase text-slate-800 text-xs">{r.productName}</td>
                                <td className="py-4 text-center font-black text-slate-600">{r.returnedQty}</td>
                                <td className="py-4 text-right pr-6 font-black text-rose-600">OMR {Number(r.refundAmount || r.RefundAmount || 0).toFixed(3)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        )}
      </div>

      {selectedBill && (
        <div className="fixed inset-0 bg-slate-900/70 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white p-8 rounded-[2rem] shadow-2xl w-full max-w-md relative">
            <div className="flex justify-between items-center mb-6 border-b pb-4">
              <h2 className="text-2xl font-black italic uppercase">Bill <span className="text-indigo-600">#{selectedBill.id}</span></h2>
              <button onClick={() => setSelectedBill(null)} className="text-slate-400 hover:text-rose-500 font-black">CLOSE</button>
            </div>
            
            <div className="mb-4 text-xs font-bold text-slate-500 flex justify-between">
                <div>
                  <p>Cashier: <span className="text-slate-800 uppercase">{selectedBill.cashierName}</span></p>
                  <p>Contact: <span className="text-slate-800">{selectedBill.customerPhone || selectedBill.CustomerPhone || 'N/A'}</span></p>
                </div>
                <div className="text-right">
                  <p>Payment: <span className="text-slate-800 uppercase">{selectedBill.paymentMethod || selectedBill.PaymentMethod || 'Cash'}</span></p>
                </div>
            </div>

            <div className="bg-slate-900 text-white rounded-2xl p-5 mb-6">
              {selectedBill.items?.map((i, idx) => {
                const qty = Number(i.quantity ?? i.Quantity ?? i.qty ?? i.Qty ?? 1);
                const price = Number(i.price ?? i.Price ?? 0);
                return (
                  <div key={idx} className="flex justify-between text-xs mb-3 border-b border-slate-800 pb-2 last:border-0">
                    <span className="font-bold text-slate-400 uppercase">{i.productName || i.ProductName}</span>
                    <span className="text-teal-400 font-black">{qty} x OMR {price.toFixed(3)}</span>
                  </div>
                );
              })}
            </div>
            
            <div className="flex justify-between items-center text-xl font-black uppercase text-slate-900 mt-4">
               <span>Total:</span>
               <span className={`text-2xl ${selectedBill.isReturned || selectedBill.IsReturned ? 'text-rose-500 line-through' : 'text-indigo-600'}`}>
                 OMR {Number(selectedBill.totalAmount || selectedBill.TotalAmount || 0).toFixed(3)}
               </span>
            </div>
            {(selectedBill.isReturned || selectedBill.IsReturned) && (
                <div className="text-right text-rose-500 font-black text-xs uppercase tracking-widest mt-1">This bill was fully refunded</div>
            )}

            {/* ONLY ADMINS WILL SEE THIS BUTTON */}
            {isAdmin && (
               <button 
                 onClick={() => handleDeleteBill(selectedBill.id)}
                 className="w-full mt-6 bg-rose-500 hover:bg-rose-600 text-white font-black py-4 rounded-xl uppercase tracking-widest text-xs transition shadow-lg"
               >
                 ⚠️ Permanently Delete Bill
               </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}