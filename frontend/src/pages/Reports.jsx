import { useState, useEffect } from 'react';

export default function Reports() {
  const [sales, setSales] = useState([]);
  const [returns, setReturns] = useState([]); 
  const [inventory, setInventory] = useState([]); 
  const [loading, setLoading] = useState(true);

  // --- TAB STATE ---
  const [activeTab, setActiveTab] = useState('receipts'); 

  // --- MODAL STATE ---
  const [selectedBill, setSelectedBill] = useState(null);

  // --- DATE FILTERS ---
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

  // --- SEARCH STATES ---
  const [movementSearch, setMovementSearch] = useState('');

  const API_URL = 'http://157.173.96.166:5001/api';

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

  const getProductName = (item) => {
    const name = item.productName || item.ProductName || item.name || item.Name;
    const code = item.barcode || item.Barcode || item.code || item.Code;
    if (name && name !== 'Unknown Product' && name !== 'Unknown') return name;
    return code || 'Unknown Item';
  };

  // --- BULLETPROOF DATA PROCESSING LOGIC ---
  
  // Date Filtering (Using string matching to avoid timezone bugs)
  const dateFilteredSales = sales.filter(s => {
    if (!s.saleDate) return false;
    const saleDateStr = s.saleDate.split('T')[0]; 
    return saleDateStr >= startDate && saleDateStr <= endDate;
  });

  const dateFilteredReturns = returns.filter(r => {
    if (!r.returnDate && !r.ReturnDate) return false;
    const retDateStr = (r.returnDate || r.ReturnDate).split('T')[0];
    return retDateStr >= startDate && retDateStr <= endDate;
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
                
                // BULLETPROOF MATCH: Checks Barcode OR Product Name
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

  // --- REVENUE TOTALS CALCULATIONS (UPDATED FOR CASH/CARD SPLIT) ---
  const periodTotalRevenue = dateFilteredSales.reduce((sum, s) => sum + Number(s.totalAmount || 0), 0);

  let cashTotal = 0;
  let cardTotal = 0;

  dateFilteredSales.forEach(s => {
      const paymentType = String(s.paymentMethod || s.PaymentMethod || 'Cash').toLowerCase();
      const totalAmt = Number(s.totalAmount || s.TotalAmount || 0);
      
      if (paymentType === 'multiple') {
          // Add the split amounts saved from POS
          cashTotal += Number(s.cashAmount || s.CashAmount || 0);
          cardTotal += Number(s.cardAmount || s.CardAmount || 0);
      } else if (paymentType === 'card') {
          cardTotal += totalAmt;
      } else {
          // Defaults to Cash
          cashTotal += totalAmt;
      }
  });

  const totalRefunded = dateFilteredReturns.reduce((sum, ret) => {
      return sum + Number(ret.RefundAmount || ret.refundAmount || 0);
  }, 0);

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

  // --- EXCEL EXPORT LOGIC ---
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
          // Added CASH PAID and CARD PAID columns
          csvContent += "BILL ID,DATE,CASHIER,CONTACT,PAYMENT TYPE,CASH PAID,CARD PAID,ITEM NAME,QTY,UNIT RATE,SUBTOTAL\n";

          dateFilteredSales.forEach(sale => {
              const dateStr = new Date(sale.saleDate).toLocaleString().replace(/,/g, "");
              const contact = sale.customerPhone || sale.CustomerPhone || "N/A";
              const payment = String(sale.paymentMethod || sale.PaymentMethod || "Cash");
              const pType = payment.toLowerCase();
              
              let cCash = 0;
              let cCard = 0;
              const totalA = Number(sale.totalAmount || sale.TotalAmount || 0);

              if (pType === 'multiple') {
                  cCash = Number(sale.cashAmount || sale.CashAmount || 0);
                  cCard = Number(sale.cardAmount || sale.CardAmount || 0);
              } else if (pType === 'card') {
                  cCard = totalA;
              } else {
                  cCash = totalA;
              }

              csvContent += `BILL #${sale.id},${dateStr},${sale.cashierName},${contact},${payment},${cCash.toFixed(3)},${cCard.toFixed(3)},,,,\n`;
              
              if (sale.items && sale.items.length > 0) {
                  sale.items.forEach(item => {
                  const name = getProductName(item).replace(/,/g, ""); 
                  const qty = Number(item.quantity ?? item.Quantity ?? item.qty ?? item.Qty ?? 1);
                  const rate = (Number(item.price ?? item.Price ?? 0)).toFixed(3);
                  const sub = (qty * rate).toFixed(3);
                  csvContent += `,,,,,,,${name},${qty},${rate},${sub}\n`;
                  });
              }
              csvContent += `,,,,,,,,,,TOTAL: OMR ${totalA.toFixed(3)}\n\n`;
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
        
        {/* --- TABS --- */}
        <div className="flex gap-4 mb-8 border-b border-slate-100 pb-4 overflow-x-auto">
          <button onClick={() => setActiveTab('receipts')} className={`whitespace-nowrap font-black uppercase tracking-widest text-xs px-6 py-3 rounded-xl transition ${activeTab === 'receipts' ? 'bg-slate-900 text-white shadow-lg' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>Receipts</button>
          <button onClick={() => setActiveTab('movement')} className={`whitespace-nowrap font-black uppercase tracking-widest text-xs px-6 py-3 rounded-xl transition ${activeTab === 'movement' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>Product Movement (FG)</button>
          <button onClick={() => setActiveTab('returns')} className={`whitespace-nowrap font-black uppercase tracking-widest text-xs px-6 py-3 rounded-xl transition ${activeTab === 'returns' ? 'bg-rose-500 text-white shadow-lg' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>Returns</button>
        </div>

        {/* --- FILTERS --- */}
        <div className="flex flex-col md:flex-row flex-wrap gap-6 mb-8 p-6 bg-slate-50 rounded-2xl border border-slate-200 items-end">
          <div className="flex flex-col space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Start Date</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="p-4 rounded-xl border border-slate-200 outline-none font-bold text-slate-700 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition" />
          </div>
          <div className="flex flex-col space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">End Date</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="p-4 rounded-xl border border-slate-200 outline-none font-bold text-slate-700 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition" />
          </div>
          <div className="md:ml-auto bg-white px-8 py-4 rounded-2xl border border-slate-200 flex flex-col items-end shadow-sm">
             <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Gross Period Revenue</span>
             <span className="text-2xl font-black text-indigo-600 tracking-tighter">OMR {periodTotalRevenue.toFixed(3)}</span>
          </div>
        </div>

        {/* --- TAB: PRODUCT MOVEMENT --- */}
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

        {/* --- TAB: RECEIPTS --- */}
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
                            {/* NEW SEPARATED COLUMNS */}
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
                            
                            let rowCash = 0;
                            let rowCard = 0;

                            if (paymentType === 'multiple') {
                                rowCash = Number(s.cashAmount || s.CashAmount || 0);
                                rowCard = Number(s.cardAmount || s.CardAmount || 0);
                            } else if (paymentType === 'card') {
                                rowCard = totalAmount;
                            } else {
                                rowCash = totalAmount;
                            }

                            return (
                                <tr key={i} onClick={() => setSelectedBill(s)} className="hover:bg-slate-50 cursor-pointer transition">
                                    <td className="py-4 pl-6 font-black text-slate-400 text-xs">#{s.id}</td>
                                    <td className="py-4 text-slate-600 font-bold text-xs">{new Date(s.saleDate).toLocaleString()}</td>
                                    <td className="py-4 font-black uppercase text-slate-800 text-xs">{s.cashierName}</td>
                                    <td className="py-4 text-slate-500 font-bold text-xs">{s.customerPhone || s.CustomerPhone || 'N/A'}</td>
                                    <td className="py-4 text-slate-600 font-bold text-xs uppercase">{s.paymentMethod || s.PaymentMethod || 'Cash'}</td>
                                    
                                    {/* CONDITIONAL RENDER FOR AMOUNTS */}
                                    <td className="py-4 text-right font-black text-emerald-500">
                                        {rowCash > 0 ? `OMR ${rowCash.toFixed(3)}` : <span className="text-slate-300">-</span>}
                                    </td>
                                    <td className="py-4 text-right pr-6 font-black text-blue-500">
                                        {rowCard > 0 ? `OMR ${rowCard.toFixed(3)}` : <span className="text-slate-300">-</span>}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        )}

        {/* --- TAB: RETURNS --- */}
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

      {/* --- RECEIPT MODAL --- */}
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
            <div className="flex justify-between items-center text-xl font-black uppercase text-slate-900">
               <span>Total:</span>
               <span className="text-indigo-600 text-2xl">OMR {Number(selectedBill.totalAmount || 0).toFixed(3)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}