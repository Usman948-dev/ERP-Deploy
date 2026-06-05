import { useState, useEffect, useRef } from 'react';
import html2canvas from 'html2canvas';

export default function POS({ user }) {
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [isSaved, setIsSaved] = useState(false);
  const [vatEnabled, setVatEnabled] = useState(false);
  const [vatRate, setVatRate] = useState(5);
  const [billDiscount, setBillDiscount] = useState('');

  // --- OMAN TIME HELPER ---
  const getOmanTime = () => {
    const d = new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Muscat"}));
    const pad = (n) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const [customDate, setCustomDate] = useState(getOmanTime());

  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [cashAmount, setCashAmount] = useState('');
  const [cardAmount, setCardAmount] = useState('');
  const [billNumber, setBillNumber] = useState(null);

  const [receiptData, setReceiptData] = useState(null);

  const [showReturnModal, setShowReturnModal] = useState(false);
  const [searchBillId, setSearchBillId] = useState('');
  const [returnBillData, setReturnBillData] = useState(null);
  const [returnPaymentMethod, setReturnPaymentMethod] = useState('Cash');
  const [returnCashAmount, setReturnCashAmount] = useState('');
  const [returnCardAmount, setReturnCardAmount] = useState('');
  const [returnError, setReturnError] = useState('');

  const [returnSelection, setReturnSelection] = useState({});
  const [refundTotal, setRefundTotal] = useState(0);
  const [discountRatio, setDiscountRatio] = useState(1);

  const receiptRef = useRef(null);

  const SHOP_NAME = "Oud Bin Shaikh";
  const SHOP_CONTACT = "+968 93552843";
  const CURRENCY = "OMR";
  const API_URL = 'http://157.173.96.166:5001/api';

  useEffect(() => {
    const fetchInventory = async () => {
      try {
        const res = await fetch(`${API_URL}/products/all`);
        if (res.ok) {
          const data = await res.json();
          const normalizedData = data.map(p => ({
            ...p,
            id: p.id || p.Id || p.ProductID || p.barcode,
            price: parseFloat(p.price || p.Price || 0),
            uom: p.UOM ?? p.uom ?? p.Unit ?? p.unit ?? 'Pcs',
            stock: Number(p.StockQty ?? p.stockQty ?? p.Stock ?? p.stock ?? p.Qty ?? p.qty ?? 0)
          }));
          setProducts(normalizedData);
        }
      } catch (err) { console.error("Fetch Error:", err); }
    };
    fetchInventory();
  }, [showReturnModal]);

  const sellableProducts = products.filter(p => {
    const name = (p.name || "").toLowerCase();
    const code = (p.barcode || p.code || "").toLowerCase();
    const search = searchTerm.toLowerCase();
    const type = (p.Type || p.type || p.InventoryType || "").toLowerCase();
    const isRawMaterial = type.includes("raw material") || type.includes("raw_material");
    return (name.includes(search) || code.includes(search)) && !isRawMaterial;
  });

  const handleBarcodeScan = (e) => {
    if (e.key === 'Enter' && searchTerm.trim() !== '') {
      const scannedCode = searchTerm.trim().toLowerCase();
      const exactMatch = sellableProducts.find(p => (p.barcode || p.code || "").toLowerCase() === scannedCode);
      if (exactMatch) {
        addToCart(exactMatch);
      } else {
        alert("Barcode not found in inventory!");
        setSearchTerm('');
      }
    }
  };

  const addToCart = (p) => {
    setIsSaved(false);
    const exists = cart.find(item => String(item.id) === String(p.id));
    const currentQty = exists ? (parseInt(exists.qty) || 0) : 0;
    if (currentQty + 1 > p.stock) {
      alert(`Item not available! Only ${p.stock} units of ${p.name || 'this item'} in stock.`);
      setSearchTerm('');
      return;
    }
    setCart(prev => {
      if (exists) return prev.map(item => String(item.id) === String(p.id) ? { ...item, qty: currentQty + 1 } : item);
      return [...prev, { ...p, qty: 1, discount: '' }];
    });
    setSearchTerm('');
  };

  const updateItemQty = (id, value) => {
    const product = products.find(p => String(p.id) === String(id));
    const val = parseInt(value) || 0;
    if (product && val > product.stock) {
      alert(`Item not available! Only ${product.stock} units in stock.`);
      return;
    }
    setCart(cart.map(item => String(item.id) === String(id) ? { ...item, qty: val } : item));
  };

  const adjustQty = (id, amount) => {
    const product = products.find(p => String(p.id) === String(id));
    const itemInCart = cart.find(item => String(item.id) === String(id));
    const currentQty = itemInCart ? (parseInt(itemInCart.qty) || 0) : 0;
    const newQty = currentQty + amount;
    if (product && newQty > product.stock) {
      alert(`Item not available! Only ${product.stock} units in stock.`);
      return;
    }
    setCart(cart.map(item => {
      if (String(item.id) === String(id)) {
        return { ...item, qty: newQty > 0 ? newQty : 1 };
      }
      return item;
    }));
  };

  const updateItemDiscount = (id, value) => setCart(cart.map(item => String(item.id) === String(id) ? { ...item, discount: value } : item));
  const removeItem = (id) => setCart(cart.filter(item => String(item.id) !== String(id)));

  // --- NEW FINANCIAL LOGIC: PRE & POST DISCOUNT ---
  const grossSubtotal = cart.reduce((sum, i) => sum + (parseFloat(i.price) * (parseInt(i.qty) || 0)), 0);
  const totalItemDiscounts = cart.reduce((sum, i) => sum + parseFloat(i.discount || 0), 0);
  const totalDiscount = totalItemDiscounts + parseFloat(billDiscount || 0);
  const vatAmount = vatEnabled ? ((grossSubtotal - totalDiscount) * (parseFloat(vatRate || 0) / 100)) : 0;
  const finalTotal = grossSubtotal - totalDiscount + vatAmount;

  const multiplePaidTotal = parseFloat(cashAmount || 0) + parseFloat(cardAmount || 0);
  const multipleDifference = finalTotal - multiplePaidTotal;

  const handleCompleteSale = async () => {
    if (paymentMethod === 'Multiple' && Math.abs(multipleDifference) > 0.01) {
      return alert(`Payment mismatch! You are short by ${CURRENCY} ${multipleDifference.toFixed(3)}. Please adjust Cash/Card amounts.`);
    }
    const finalCash = paymentMethod === 'Cash' ? finalTotal : paymentMethod === 'Multiple' ? parseFloat(cashAmount || 0) : 0;
    const finalCard = paymentMethod === 'Card' ? finalTotal : paymentMethod === 'Multiple' ? parseFloat(cardAmount || 0) : 0;

    const payload = {
      CashierName: user?.Name || "Cashier",
      CustomerPhone: customerPhone || null,
      SaleDate: customDate,
      TotalAmount: finalTotal,
      PaymentMethod: paymentMethod,
      CashAmount: finalCash,
      CardAmount: finalCard,
      Items: cart.map(item => ({
        Barcode: String(item.id), Quantity: parseInt(item.qty) || 0, Price: parseFloat(item.price), Discount: parseFloat(item.discount || 0)
      }))
    };

    try {
      const res = await fetch(`${API_URL}/sales/add`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (res.ok) {
        const data = await res.json();
        setBillNumber(data.saleId || data.SaleId || data.id || "Error");
        
        // Save the precise calculations for the receipt
        setReceiptData({
          cart: [...cart], grossSubtotal, totalDiscount, vatEnabled, vatRate, vatAmount, finalTotal, paymentMethod, customerPhone,
          receiptDate: customDate 
        });
        
        setCart([]);
        setIsSaved(true);
      } else { alert(`Failed to save to database: ${await res.text()}`); }
    } catch (err) { alert("Network Error: Could not connect to the database."); }
  };

  const handleDesktopWhatsAppApp = async () => {
    if (!customerPhone) return alert("Please enter the customer's WhatsApp number to share the receipt.");
    if (!receiptRef.current) return;
    try {
      const canvas = await html2canvas(receiptRef.current, { scale: 2, backgroundColor: '#ffffff' });
      canvas.toBlob(async (blob) => {
        try {
          const item = new ClipboardItem({ "image/png": blob });
          await navigator.clipboard.write([item]);
          const cleanPhone = customerPhone.replace(/[^0-9]/g, '');
          window.open(`https://api.whatsapp.com/send?phone=${cleanPhone}`, '_blank');
        } catch (clipboardError) { alert("Failed to copy image to clipboard. Check browser permissions."); }
      }, 'image/png');
    } catch (error) { alert("Failed to capture receipt image."); }
  };

  const handleSearchBill = async () => {
    setReturnError('');
    setReturnBillData(null);
    setReturnSelection({});
    setRefundTotal(0);
    if (!searchBillId) return;
    try {
      const res = await fetch(`${API_URL}/sales/${searchBillId}`);
      if (res.ok) {
        const data = await res.json();
        const isReturned = data.isReturned || data.IsReturned;
        if (isReturned) {
          setReturnError('This bill has already been fully returned/refunded.');
        } else {
          const initialSelection = {};
          (data.items || data.Items || []).forEach(item => {
            const bc = item.Barcode || item.barcode;
            initialSelection[bc] = 0;
          });
          setReturnSelection(initialSelection);
          setReturnBillData(data);
          setReturnPaymentMethod(data.originalPaymentMethod || data.OriginalPaymentMethod || 'Cash');
        }
      } else {
        setReturnError('Bill not found. Please check the number.');
      }
    } catch (err) { setReturnError('Network Error.'); }
  };

  useEffect(() => {
    if (!returnBillData) return;
    let originalSubtotal = 0;
    (returnBillData.items || returnBillData.Items || []).forEach(item => {
      const price = Number(item.Price || item.price || 0);
      const maxQty = Number(item.Qty || item.qty || 0);
      originalSubtotal += (maxQty * price);
    });
    const actualBillTotal = Number(returnBillData.totalAmount || returnBillData.TotalAmount || 0);
    const ratio = originalSubtotal > 0 ? (actualBillTotal / originalSubtotal) : 1;
    setDiscountRatio(ratio);
    let rawReturnTotal = 0;
    (returnBillData.items || returnBillData.Items || []).forEach(item => {
      const bc = item.Barcode || item.barcode;
      const price = Number(item.Price || item.price || 0);
      const qtyToReturn = returnSelection[bc] || 0;
      rawReturnTotal += (qtyToReturn * price);
    });
    setRefundTotal(rawReturnTotal * ratio);
  }, [returnSelection, returnBillData]);

  const handleReturnQtyChange = (barcode, delta, maxQty) => {
    setReturnSelection(prev => {
      const current = prev[barcode] || 0;
      let next = current + delta;
      if (next < 0) next = 0;
      if (next > maxQty) next = maxQty;
      return { ...prev, [barcode]: next };
    });
  };

  const selectAllReturns = () => {
    const all = {};
    (returnBillData.items || returnBillData.Items || []).forEach(item => {
      all[item.Barcode || item.barcode] = Number(item.Qty || item.qty || 0);
    });
    setReturnSelection(all);
  };

  const handleProcessReturn = async () => {
    const returnItemsPayload = Object.keys(returnSelection)
      .filter(b => returnSelection[b] > 0)
      .map(b => ({ Barcode: b, ReturnQty: returnSelection[b] }));
    if (returnItemsPayload.length === 0) return alert("Please select at least one item to return.");
    const returnMultDiff = refundTotal - (parseFloat(returnCashAmount || 0) + parseFloat(returnCardAmount || 0));
    if (returnPaymentMethod === 'Multiple' && Math.abs(returnMultDiff) > 0.01) {
      return alert(`Refund mismatch! Total refund must equal ${CURRENCY} ${refundTotal.toFixed(3)}`);
    }
    const payload = {
      SaleId: returnBillData.saleId || returnBillData.SaleId,
      RefundMethod: returnPaymentMethod,
      CashRefundAmount: returnPaymentMethod === 'Cash' ? refundTotal : returnPaymentMethod === 'Multiple' ? parseFloat(returnCashAmount || 0) : 0,
      CardRefundAmount: returnPaymentMethod === 'Card' ? refundTotal : returnPaymentMethod === 'Multiple' ? parseFloat(returnCardAmount || 0) : 0,
      TotalRefundAmount: refundTotal,
      CashierName: user?.Name || "Cashier",
      ReturnItems: returnItemsPayload
    };
    try {
      const res = await fetch(`${API_URL}/sales/return`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      });
      if (res.ok) {
        alert("✅ Partial/Full Return processed successfully! Items have been restocked.");
        setShowReturnModal(false);
        setReturnBillData(null);
        setSearchBillId('');
      } else { alert(`Failed to process return: ${await res.text()}`); }
    } catch (err) { alert("Network Error."); }
  };

  const returnItemsArray = returnBillData ? (returnBillData.items || returnBillData.Items || []) : [];

  return (
    <div className="p-4 w-full max-w-[1600px] mx-auto font-sans bg-slate-900 min-h-screen text-slate-100 relative overflow-x-hidden">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .thermal-receipt, .thermal-receipt * { visibility: visible; }
          .thermal-receipt { position: absolute !important; left: 0 !important; top: 0 !important; width: 80mm !important; padding: 5mm !important; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
        }
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        input[type="datetime-local"]::-webkit-calendar-picker-indicator { filter: invert(1); }
      `}</style>

      {/* --- PARTIAL RETURN MODAL --- */}
      {showReturnModal && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-slate-800 rounded-2xl w-full max-w-2xl overflow-hidden border border-slate-600 shadow-2xl flex flex-col max-h-[90vh]">
            <div className="p-4 bg-slate-900 flex justify-between items-center border-b border-slate-700">
              <h2 className="text-lg font-black uppercase tracking-widest text-white">Process Partial / Full Return</h2>
              <button onClick={() => setShowReturnModal(false)} className="text-slate-400 hover:text-red-400 font-bold text-xl">&times;</button>
            </div>
            <div className="p-6 flex-grow overflow-y-auto">
              <div className="flex gap-2 mb-6">
                <input type="number" placeholder="Scan or Type Bill Number..." className="flex-grow p-4 bg-slate-900 text-white rounded-xl border border-slate-700 focus:border-amber-500 outline-none font-bold" value={searchBillId} onChange={e => setSearchBillId(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearchBill()} />
                <button onClick={handleSearchBill} className="bg-amber-500 text-slate-900 px-6 font-black uppercase rounded-xl hover:bg-amber-400">Search</button>
              </div>
              {returnError && <div className="bg-red-500/20 text-red-400 p-4 rounded-xl border border-red-500/50 mb-4 font-bold text-center">{returnError}</div>}
              {returnBillData && (
                <div className="space-y-6">
                  <div className="bg-slate-900 p-4 rounded-xl border border-slate-700">
                    <div className="flex justify-between items-center mb-3 border-b border-slate-700 pb-2">
                      <h3 className="text-amber-400 font-black">Select Items to Return (Bill #{returnBillData.saleId || returnBillData.SaleId})</h3>
                      <button onClick={selectAllReturns} className="text-[10px] text-white bg-slate-700 px-3 py-1 rounded hover:bg-slate-600 uppercase font-bold tracking-widest">Return Whole Bill</button>
                    </div>
                    <div className="space-y-2">
                      {returnItemsArray.map((item, idx) => {
                        const bc = item.Barcode || item.barcode;
                        const maxQty = Number(item.Qty || item.qty || 0);
                        const name = item.Name || item.name || item.ProductName || item.productName || 'Unknown Item';
                        const price = Number(item.Price || item.price || 0);
                        const currentReturnQty = returnSelection[bc] || 0;
                        const discountedPrice = price * discountRatio;
                        if (maxQty === 0) return null;
                        return (
                          <div key={idx} className="flex justify-between items-center text-sm font-bold text-slate-300 bg-slate-800 p-3 rounded-lg border border-slate-700">
                            <div className="flex-grow pr-4">
                              <div className="uppercase">{name}</div>
                              <div className="text-[10px] text-slate-500 mt-1">
                                Purchased: {maxQty} | Price: {CURRENCY} {discountedPrice.toFixed(3)}
                                {Math.abs(discountRatio - 1) > 0.001 && <span className="text-amber-500 ml-1 italic">(Adjusted for Bill Discount/VAT)</span>}
                              </div>
                            </div>
                            <div className="flex items-center gap-4">
                              <div className="flex items-center justify-center bg-slate-900 rounded border border-slate-600 overflow-hidden shadow-inner">
                                <button onClick={() => handleReturnQtyChange(bc, -1, maxQty)} className="px-3 py-1.5 hover:bg-slate-700 text-slate-400 font-bold">-</button>
                                <span className="w-8 text-center text-white font-black">{currentReturnQty}</span>
                                <button onClick={() => handleReturnQtyChange(bc, 1, maxQty)} className="px-3 py-1.5 hover:bg-slate-700 text-slate-400 font-bold">+</button>
                              </div>
                              <span className="w-16 text-right text-red-400 font-black">{CURRENCY} {(currentReturnQty * discountedPrice).toFixed(3)}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-4 pt-4 border-t border-slate-700 flex justify-between items-center text-xl font-black text-white bg-red-500/10 p-4 rounded-lg border border-red-500/30">
                      <span>Total Refund Value:</span>
                      <span className="text-red-400">{CURRENCY} {refundTotal.toFixed(3)}</span>
                    </div>
                  </div>
                  <div className="bg-slate-800 p-4 rounded-xl border border-slate-600">
                    <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-3">Select Refund Method</p>
                    <div className="grid grid-cols-3 gap-2 mb-3">
                      {['Cash', 'Card', 'Multiple'].map(method => (
                        <button key={method} onClick={() => setReturnPaymentMethod(method)} className={`py-3 rounded-lg text-xs font-black uppercase tracking-widest transition ${returnPaymentMethod === method ? 'bg-red-500 text-white shadow-md' : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-700'}`}>
                          {method}
                        </button>
                      ))}
                    </div>
                    {returnPaymentMethod === 'Multiple' && (
                      <div className="p-3 bg-slate-900 rounded-lg border border-slate-700 space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-bold text-slate-400 uppercase">Cash Refund</span>
                          <input type="number" placeholder="0.000" className="w-32 bg-slate-800 text-white text-sm p-2 rounded border border-slate-600 text-right font-bold" value={returnCashAmount} onChange={(e) => setReturnCashAmount(e.target.value)} />
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-bold text-slate-400 uppercase">Card Refund</span>
                          <input type="number" placeholder="0.000" className="w-32 bg-slate-800 text-white text-sm p-2 rounded border border-slate-600 text-right font-bold" value={returnCardAmount} onChange={(e) => setReturnCardAmount(e.target.value)} />
                        </div>
                      </div>
                    )}
                  </div>
                  <button onClick={handleProcessReturn} disabled={refundTotal === 0} className="w-full bg-red-500 hover:bg-red-400 text-white font-black py-4 rounded-xl uppercase tracking-widest transition shadow-lg disabled:opacity-50 disabled:cursor-not-allowed">
                    Confirm Return & Restock ({CURRENCY} {refundTotal.toFixed(3)})
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* --- STRICTLY CONSTRAINED HEIGHT FOR NO PAGE SCROLLING --- */}
      <div className="print:hidden flex flex-col lg:flex-row gap-4 h-[calc(100vh-2rem)]">

        {/* --- LEFT: PRODUCTS (Made narrow: 5/12 width) --- */}
        <div className="w-full lg:w-5/12 flex flex-col bg-slate-800 rounded-2xl border border-slate-700 shadow-2xl overflow-hidden h-full">
          <div className="p-4 bg-slate-900/60 border-b border-slate-700 flex justify-between items-center shrink-0">
            <h1 className="text-lg font-black uppercase italic">Oud Bin <span className="text-amber-400">Shaikh</span></h1>
            <button
              onClick={() => { setSearchBillId(''); setReturnBillData(null); setShowReturnModal(true); }}
              className="text-[9px] bg-slate-700 px-3 py-1 rounded hover:bg-red-500/20 hover:text-red-400 text-slate-300 border border-slate-600 uppercase font-bold transition"
            >
              Process Return
            </button>
          </div>
          <div className="p-3 shrink-0">
            <input
              type="text"
              placeholder="Search perfumes or scan barcode..."
              className="w-full p-3 bg-slate-700 text-white rounded-xl border border-slate-600 outline-none focus:ring-2 focus:ring-amber-500 text-sm font-bold"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={handleBarcodeScan}
              autoFocus
            />
          </div>
          <div className="flex-grow overflow-y-auto p-3 grid grid-cols-2 lg:grid-cols-3 gap-2 content-start">
            {sellableProducts.map(p => (
              <button
                key={p.id}
                onClick={() => addToCart(p)}
                className="bg-slate-700 hover:bg-slate-600 p-3 rounded-lg text-left border border-slate-600 hover:border-amber-500 transition active:scale-95 h-20 flex flex-col justify-between"
              >
                <p className="text-slate-100 font-bold text-[9px] uppercase leading-tight line-clamp-2">{p.name}</p>
                <p className="text-amber-400 font-black text-sm">{CURRENCY} {parseFloat(p.price).toFixed(3)}</p>
              </button>
            ))}
          </div>
        </div>

        {/* --- RIGHT: BILLING PANEL (Made wide: 7/12 width) --- */}
        <div className="flex-grow w-full lg:w-7/12 flex flex-col bg-slate-800 rounded-2xl border border-slate-700 shadow-2xl overflow-hidden h-full">

          {/* Sticky Header */}
          <div className="p-4 bg-slate-950 border-b border-slate-700 shrink-0">
            <h3 className="text-white font-black uppercase tracking-widest text-xs">
              {isSaved
                ? <span className="text-green-400">Bill #{billNumber} Saved</span>
                : `Active Bill | ${cart.length} Items`}
            </h3>
          </div>

          {/* SCROLLING CART AREA */}
          <div className="flex-grow overflow-y-auto p-2">
            
            {/* Mobile: card layout */}
            <div className="md:hidden space-y-2">
              {cart.map(item => {
                const gross = parseFloat(item.price) * (parseInt(item.qty) || 0);
                const net = gross - parseFloat(item.discount || 0);
                return (
                  <div key={item.id} className="bg-slate-700/40 p-2 rounded-lg border border-slate-600 relative">
                    {!isSaved && (
                      <button onClick={() => removeItem(item.id)} className="absolute top-1 right-1 text-red-400 text-xs bg-slate-800 rounded-full w-5 h-5 flex items-center justify-center hover:bg-red-500 hover:text-white">X</button>
                    )}
                    <p className="text-[10px] font-bold text-white uppercase pr-6 mb-1 leading-tight">{item.name}</p>
                    <div className="flex justify-between items-center">
                      <div className="flex items-center bg-slate-900 rounded border border-slate-600 overflow-hidden">
                        <button onClick={() => adjustQty(item.id, -1)} className="px-2 py-0.5 text-slate-400 hover:text-white hover:bg-slate-700 text-xs font-bold">-</button>
                        <input type="number" className="w-7 bg-transparent text-white text-[10px] text-center outline-none font-black" value={item.qty} onChange={(e) => updateItemQty(item.id, e.target.value)} disabled={isSaved} />
                        <button onClick={() => adjustQty(item.id, 1)} className="px-2 py-0.5 text-slate-400 hover:text-white hover:bg-slate-700 text-xs font-bold">+</button>
                      </div>
                      <div className="text-right">
                        {parseFloat(item.discount || 0) > 0 && <p className="text-[9px] text-slate-500 line-through">{gross.toFixed(3)}</p>}
                        <p className="text-xs font-black text-amber-400">{CURRENCY} {net.toFixed(3)}</p>
                      </div>
                    </div>
                    <div className="mt-1 flex items-center justify-between">
                      <span className="text-[9px] uppercase font-bold text-slate-500">Disc:</span>
                      <input type="number" placeholder="0" className="w-16 bg-slate-900 text-white text-[10px] py-0.5 px-1 rounded border border-slate-600 text-right outline-none font-bold" value={item.discount} onChange={(e) => updateItemDiscount(item.id, e.target.value)} disabled={isSaved} />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop: compact table */}
            <div className="hidden md:block">
              <table className="w-full text-left text-[11px]">
                <thead className="text-slate-500 uppercase tracking-widest border-b border-slate-700">
                  <tr>
                    <th className="pb-2 font-black">Product</th>
                    <th className="pb-2 text-center font-black">Qty</th>
                    <th className="pb-2 text-right font-black">Rate</th>
                    <th className="pb-2 text-right font-black">Total</th>
                    {!isSaved && <th className="pb-2 text-center font-black">Del</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50">
                  {cart.map(item => {
                    const gross = parseFloat(item.price) * (parseInt(item.qty) || 0);
                    const net = gross - parseFloat(item.discount || 0);
                    return (
                      <tr key={item.id} className="text-white font-bold hover:bg-slate-700/20 transition">
                        <td className="py-2 pr-1 truncate max-w-[150px]" title={item.name}>{item.name}</td>
                        <td className="py-2 px-1">
                          <div className="flex items-center justify-center bg-slate-900 rounded border border-slate-600 w-min mx-auto overflow-hidden">
                            <button onClick={() => adjustQty(item.id, -1)} className="px-2 text-slate-400 hover:text-white hover:bg-slate-700 font-bold">-</button>
                            <input type="number" className="w-8 bg-transparent text-center text-white outline-none font-black" value={item.qty} onChange={(e) => updateItemQty(item.id, e.target.value)} disabled={isSaved} />
                            <button onClick={() => adjustQty(item.id, 1)} className="px-2 text-slate-400 hover:text-white hover:bg-slate-700 font-bold">+</button>
                          </div>
                        </td>
                        <td className="py-2 px-1 text-right text-slate-300">{parseFloat(item.price).toFixed(3)}</td>
                        <td className="py-2 px-1 text-right">
                          {parseFloat(item.discount || 0) > 0 && <div className="text-[9px] text-slate-500 line-through">{gross.toFixed(3)}</div>}
                          <div className="text-amber-400 font-black">{net.toFixed(3)}</div>
                        </td>
                        {!isSaved && (
                          <td className="py-2 pl-1 text-center">
                            <button onClick={() => removeItem(item.id)} className="bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white w-5 h-5 rounded flex items-center justify-center font-black text-[10px] transition mx-auto">X</button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!isSaved && cart.length > 0 && (
                <div className="mt-2 pt-2 border-t border-slate-700/50 space-y-1">
                  <p className="text-[9px] text-slate-500 uppercase font-black tracking-widest mb-2">Item Discounts ({CURRENCY})</p>
                  <div className="grid grid-cols-2 gap-2">
                    {cart.map(item => (
                      <div key={item.id} className="flex items-center justify-between gap-2 bg-slate-900/50 p-1.5 rounded border border-slate-700">
                        <span className="text-[10px] text-slate-400 truncate w-full">{item.name}</span>
                        <input
                          type="number"
                          placeholder="0.000"
                          className="w-16 bg-slate-900 text-white text-[10px] py-1 px-1 rounded border border-slate-600 text-right outline-none font-bold placeholder:text-slate-600"
                          value={item.discount}
                          onChange={(e) => updateItemDiscount(item.id, e.target.value)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* STICKY BOTTOM TOTALS & CONTROLS */}
          <div className="p-4 bg-slate-950 border-t border-slate-700 shrink-0 space-y-3">
            
            {/* NEW MATH DISPLAY (Gross -> Discount -> Final) */}
            <div className="space-y-1 text-[11px] font-black uppercase tracking-wider text-slate-400">
              <div className="flex justify-between">
                <span>Subtotal:</span><span className="text-slate-200">{grossSubtotal.toFixed(3)}</span>
              </div>
              {totalDiscount > 0 && (
                <div className="flex justify-between">
                  <span>Discount:</span><span className="text-red-400">-{totalDiscount.toFixed(3)}</span>
                </div>
              )}
              {vatEnabled && (
                <div className="flex justify-between">
                  <span>VAT ({vatRate}%):</span><span className="text-slate-200">{vatAmount.toFixed(3)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-black text-amber-400 pt-2 border-t border-slate-800 mt-2">
                <span>TOTAL OMR:</span><span className="text-2xl tracking-tighter">{finalTotal.toFixed(3)}</span>
              </div>
            </div>

            {!isSaved && (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex items-center justify-between bg-slate-800 px-2 py-1.5 rounded-lg border border-slate-700">
                    <span className="text-[9px] font-black uppercase text-slate-500">Bill Disc</span>
                    <input type="number" placeholder="0" className="w-14 bg-transparent text-white text-[10px] outline-none text-right font-bold placeholder:text-slate-600" value={billDiscount} onChange={(e) => setBillDiscount(e.target.value)} />
                  </div>
                  <div className="flex items-center gap-2 bg-slate-800 px-2 py-1.5 rounded-lg border border-slate-700 cursor-pointer" onClick={() => setVatEnabled(!vatEnabled)}>
                    <input type="checkbox" checked={vatEnabled} readOnly className="accent-amber-500" />
                    <span className="text-[9px] font-black uppercase text-slate-400">VAT {vatRate}%</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 bg-slate-800 px-3 py-2 rounded-lg border border-slate-700">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest shrink-0">Sale Date</span>
                  <input
                    type="datetime-local"
                    className="flex-grow bg-slate-900 text-white text-[10px] px-2 py-1 rounded border border-slate-600 outline-none focus:border-amber-500 font-bold [color-scheme:dark]"
                    value={customDate}
                    onChange={(e) => setCustomDate(e.target.value)}
                  />
                </div>

                <div className="flex items-center gap-2 bg-slate-800 px-3 py-2 rounded-lg border border-slate-700">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest shrink-0">Cust #</span>
                  <input
                    type="tel"
                    placeholder="Optional (+968...)"
                    className="flex-grow bg-slate-900 text-white text-[10px] px-2 py-1 rounded border border-slate-600 outline-none focus:border-amber-500 font-bold placeholder:text-slate-600"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                  />
                </div>

                <div className="bg-slate-800 p-2 rounded-lg border border-slate-700">
                  <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest mb-1.5">Payment Method</p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {['Cash', 'Card', 'Multiple'].map(method => (
                      <button
                        key={method}
                        onClick={() => setPaymentMethod(method)}
                        className={`py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition ${paymentMethod === method ? 'bg-amber-500 text-slate-950 shadow-md' : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-700'}`}
                      >
                        {method}
                      </button>
                    ))}
                  </div>
                  {paymentMethod === 'Multiple' && (
                    <div className="mt-2 p-2 bg-slate-900 rounded-lg border border-slate-700 space-y-1.5">
                      <div className="flex justify-between items-center">
                        <span className="text-[9px] font-bold text-slate-400 uppercase">Cash Paid</span>
                        <input type="number" placeholder="0.000" className="w-20 bg-slate-800 text-white text-[10px] p-1 rounded border border-slate-600 text-right font-bold" value={cashAmount} onChange={(e) => setCashAmount(e.target.value)} />
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[9px] font-bold text-slate-400 uppercase">Card Paid</span>
                        <input type="number" placeholder="0.000" className="w-20 bg-slate-800 text-white text-[10px] p-1 rounded border border-slate-600 text-right font-bold" value={cardAmount} onChange={(e) => setCardAmount(e.target.value)} />
                      </div>
                      <div className="pt-1 mt-1 border-t border-slate-700 flex justify-between items-center">
                        <span className="text-[9px] font-black uppercase text-slate-500">Remaining</span>
                        <span className={`text-[10px] font-black ${Math.abs(multipleDifference) < 0.01 ? 'text-green-400' : 'text-red-400'}`}>
                          {CURRENCY} {multipleDifference.toFixed(3)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {!isSaved ? (
              <button
                onClick={handleCompleteSale}
                disabled={cart.length === 0}
                className="w-full bg-amber-500 text-slate-950 font-black py-4 rounded-xl text-xs uppercase tracking-widest shadow-xl hover:bg-amber-400 transition active:scale-95 disabled:opacity-50"
              >
                Complete Sale
              </button>
            ) : (
              <div className="space-y-2 bg-slate-800 p-3 rounded-xl border border-green-500/50">
                <div className="text-center pb-2 border-b border-slate-700">
                  <p className="text-green-400 font-black uppercase tracking-widest text-[9px]">Sale Successfully Saved</p>
                  <p className="text-white font-black text-lg mt-0.5">Bill No: #{billNumber || 'PENDING...'}</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={handleDesktopWhatsAppApp} className="bg-green-600 text-white font-black py-2 rounded-lg text-[9px] uppercase hover:bg-green-500 shadow">WhatsApp App</button>
                  <button onClick={() => window.print()} className="bg-white text-black font-black py-2 rounded-lg text-[9px] uppercase hover:bg-gray-200 shadow">Print Receipt</button>
                </div>
                <button
                  onClick={() => {
                    setCart([]);
                    setIsSaved(false);
                    setCustomerPhone('');
                    setBillDiscount('');
                    setCashAmount('');
                    setCardAmount('');
                    setPaymentMethod('Cash');
                    setBillNumber(null);
                    setReceiptData(null);
                    setCustomDate(getOmanTime()); // RESET TO OMAN TIME
                  }}
                  className="w-full text-amber-400 text-[9px] font-black uppercase text-center mt-1 hover:text-amber-300"
                >
                  Start Next Customer →
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* --- REFORMATTED THERMAL RECEIPT --- */}
      <div
        ref={receiptRef}
        className="absolute top-[-10000px] left-[-10000px] print:static print:left-0 print:top-0 thermal-receipt"
        style={{ width: '80mm', padding: '5mm', background: 'white', color: 'black', fontFamily: 'monospace', fontSize: '13px' }}
      >
        <div style={{ textAlign: 'center', marginBottom: '10px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 'bold', margin: '0' }}>{SHOP_NAME}</h2>
          <p style={{ fontSize: '11px', margin: '0' }}>Tel: {SHOP_CONTACT}</p>
          <p style={{ fontSize: '11px', margin: '0' }}>
             {new Date(receiptData ? receiptData.receiptDate : customDate).toLocaleString('en-US', { hour12: true, year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
          </p>
          <p style={{ fontSize: '16px', fontWeight: 'bold', margin: '8px 0', padding: '4px 0', borderTop: '1px dashed black', borderBottom: '1px dashed black' }}>
            Bill No: #{billNumber || 'PENDING...'}
          </p>
        </div>

        {/* PRINT ITEMS PRE-DISCOUNT */}
        {(receiptData ? receiptData.cart : cart).map(i => {
          const itemGrossTotal = (parseFloat(i.price) * (parseInt(i.qty) || 0)).toFixed(3);
          return (
            <div key={i.id} style={{ marginBottom: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: 'bold' }}>
                <span>{i.name} ({i.uom})</span><span>{itemGrossTotal}</span>
              </div>
              <div style={{ fontSize: '11px', color: '#333' }}>Qty: {i.qty || 0} x {parseFloat(i.price).toFixed(3)}</div>
            </div>
          );
        })}

        <div style={{ borderBottom: '1px dashed black', margin: '8px 0' }}></div>
        
        {/* TOTALS SECTION */}
        <div style={{ fontSize: '13px', fontWeight: 'bold' }}>
          {((receiptData ? receiptData.totalDiscount : totalDiscount) > 0) && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span>Discount:</span>
              <span>-{parseFloat(receiptData ? receiptData.totalDiscount : totalDiscount).toFixed(3)}</span>
            </div>
          )}
          {(receiptData ? receiptData.vatEnabled : vatEnabled) && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span>VAT ({(receiptData ? receiptData.vatRate : vatRate)}%):</span>
              <span>{(receiptData ? receiptData.vatAmount : vatAmount).toFixed(3)}</span>
            </div>
          )}
          
          {/* GRAND TOTAL */}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '16px', marginTop: '8px', borderTop: '2px solid black', paddingTop: '8px' }}>
            <span>TOTAL OMR:</span>
            <span>{(receiptData ? receiptData.finalTotal : finalTotal).toFixed(3)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginTop: '8px' }}>
            <span>Payment:</span>
            <span>{receiptData ? receiptData.paymentMethod : paymentMethod}</span>
          </div>
        </div>

        <div style={{ textAlign: 'center', marginTop: '25px', fontSize: '11px', fontWeight: 'bold' }}>
          Thank you for visiting Oud Bin Shaikh!
        </div>
        <div style={{ marginTop: '15px', fontSize: '10px', textAlign: 'justify', borderTop: '1px dashed black', paddingTop: '8px' }}>
          <strong>Returns or Exchange Policy:</strong> Returns are accepted on sealed and unopened products within 14 days of delivery. Opened products cannot be returned unless they are deemed defective.<br /><br />
          <strong>Complaints & Damaged Goods:</strong> Damages or discrepancies must be reported within 7 days of receipt.
        </div>
      </div>
    </div>
  );
}