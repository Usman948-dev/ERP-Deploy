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

  // --- PAYMENT STATES ---
  const [paymentMethod, setPaymentMethod] = useState('Cash'); 
  const [cashAmount, setCashAmount] = useState('');
  const [cardAmount, setCardAmount] = useState('');
  const [billNumber, setBillNumber] = useState(null);

  const [receiptData, setReceiptData] = useState(null);

  // --- PARTIAL RETURN MODULE STATES ---
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [searchBillId, setSearchBillId] = useState('');
  const [returnBillData, setReturnBillData] = useState(null);
  const [returnPaymentMethod, setReturnPaymentMethod] = useState('Cash');
  const [returnCashAmount, setReturnCashAmount] = useState('');
  const [returnCardAmount, setReturnCardAmount] = useState('');
  const [returnError, setReturnError] = useState('');
  
  // Tracks how many of each item is being returned { barcode: qty }
  const [returnSelection, setReturnSelection] = useState({});
  const [refundTotal, setRefundTotal] = useState(0);
  const [discountRatio, setDiscountRatio] = useState(1); // NEW: Tracks proportional bill discounts!

  const receiptRef = useRef(null);

  const SHOP_NAME = "Oud Bin Sheikh";
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

  const subtotal = cart.reduce((sum, i) => sum + (parseFloat(i.price) * (parseInt(i.qty) || 0)) - parseFloat(i.discount || 0), 0);
  const vatAmount = vatEnabled ? (subtotal * (parseFloat(vatRate || 0) / 100)) : 0;
  const finalTotal = subtotal - parseFloat(billDiscount || 0) + vatAmount;

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
        
        setReceiptData({
          cart: [...cart], subtotal, vatEnabled, vatRate, vatAmount, billDiscount, finalTotal, paymentMethod, customerPhone
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

  // --- NEW: CALCULATE PROPORTIONAL RATIO FOR ACCURATE REFUNDS ---
  useEffect(() => {
    if (!returnBillData) return;

    // 1. Calculate the raw original sum of items before bill discounts
    let originalSubtotal = 0;
    (returnBillData.items || returnBillData.Items || []).forEach(item => {
       const price = Number(item.Price || item.price || 0);
       const maxQty = Number(item.Qty || item.qty || 0);
       originalSubtotal += (maxQty * price);
    });

    // 2. Grab the final paid total (from DB)
    const actualBillTotal = Number(returnBillData.totalAmount || returnBillData.TotalAmount || 0);
    
    // 3. Find the ratio (Actual Paid / Raw Price)
    const ratio = originalSubtotal > 0 ? (actualBillTotal / originalSubtotal) : 1;
    setDiscountRatio(ratio);

    // 4. Calculate the current refund based on selection * proportional ratio
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
          input[type=number]::-webkit-inner-spin-button, input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
      `}</style>

      {/* --- PARTIAL RETURN MODAL OVERLAY --- */}
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
                        
                        // Apply the proportional discount ratio
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

      {/* --- MAIN POS UI --- */}
      <div className="print:hidden flex flex-col lg:flex-row gap-4 min-h-[calc(100vh-80px)]">
        
        {/* --- PRODUCTS SECTION --- */}
        <div className="w-full lg:w-1/2 flex flex-col bg-slate-800 rounded-2xl border border-slate-700/50 overflow-hidden shadow-2xl h-[50vh] lg:h-auto">
          <div className="p-4 bg-slate-900/60 border-b border-slate-700/50 flex justify-between items-center">
            <h1 className="text-xl font-black text-slate-50 tracking-tighter uppercase italic">Oud Bin <span className='text-amber-400'>Sheikh</span></h1>
            <button onClick={() => {setSearchBillId(''); setReturnBillData(null); setShowReturnModal(true);}} className="text-[10px] bg-slate-800 hover:bg-red-500/20 text-slate-300 hover:text-red-400 border border-slate-600 font-black uppercase px-4 py-2 rounded-lg transition">
              Process Return
            </button>
          </div>
          <div className="p-4 bg-slate-900/40 border-b border-slate-700/50">
            <input type="text" placeholder="Search perfumes or scan barcode..." className="w-full p-4 bg-slate-700 text-white rounded-xl border border-slate-600 outline-none focus:ring-2 focus:ring-amber-500 font-bold" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} onKeyDown={handleBarcodeScan} autoFocus />
          </div>
          <div className="p-4 overflow-y-auto grid grid-cols-2 md:grid-cols-3 gap-3 content-start">
            {sellableProducts.map(p => (
              <button key={p.id} onClick={() => addToCart(p)} className="bg-slate-700 hover:bg-slate-600 p-4 rounded-xl text-left border border-slate-600 hover:border-amber-500 transition active:scale-95 h-28 flex flex-col justify-between">
                <p className="text-slate-100 font-bold text-[10px] uppercase leading-tight line-clamp-3">{p.name}</p>
                <p className="text-amber-400 font-black text-lg">{CURRENCY} {parseFloat(p.price).toFixed(3)}</p>
              </button>
            ))}
          </div>
        </div>

        {/* --- CART SECTION --- */}
        <div className="w-full lg:w-1/2 flex flex-col bg-slate-800 rounded-2xl border border-slate-700/50 overflow-hidden shadow-2xl h-auto">
          <div className="p-4 bg-slate-900/60 border-b border-slate-700/50 flex justify-between items-center shrink-0">
            <h3 className="text-white font-black uppercase tracking-widest italic text-xs">
              {isSaved ? <span className="text-green-400">Bill #{billNumber} Saved</span> : `Active Bill | ${cart.length} Items`}
            </h3>
            {!isSaved && <button onClick={() => setCart([])} className="text-slate-500 font-bold hover:text-amber-400 text-xs">CLEAR ALL</button>}
          </div>

          <div className="flex-grow overflow-y-auto p-2 md:p-4">
            {/* MOBILE LAYOUT: CARD STYLE */}
            <div className="md:hidden space-y-3">
              {cart.map(item => (
                <div key={item.id} className="bg-slate-700/40 p-3 rounded-xl border border-slate-600 relative">
                  {!isSaved && (
                    <button onClick={() => removeItem(item.id)} className="absolute top-2 right-2 text-red-400 font-black text-sm bg-slate-800 rounded-full w-6 h-6 flex items-center justify-center hover:bg-red-500 hover:text-white transition">X</button>
                  )}
                  <p className="text-xs font-bold text-white uppercase pr-8 mb-2 leading-tight">{item.name}</p>
                  
                  <div className="flex justify-between items-center mt-3">
                    <div className="flex items-center bg-slate-900 rounded border border-slate-600 w-min overflow-hidden">
                      <button onClick={() => adjustQty(item.id, -1)} className="px-3 py-1 text-slate-400 hover:text-white hover:bg-slate-700 font-bold">-</button>
                      <input type="number" className="w-8 bg-transparent text-white text-xs py-1 text-center outline-none font-black" value={item.qty} onChange={(e) => updateItemQty(item.id, e.target.value)} disabled={isSaved} />
                      <button onClick={() => adjustQty(item.id, 1)} className="px-3 py-1 text-slate-400 hover:text-white hover:bg-slate-700 font-bold">+</button>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-slate-400 uppercase">{item.uom} | @ {parseFloat(item.price).toFixed(3)}</p>
                      <p className="text-sm font-black text-amber-400 mt-1">
                         {CURRENCY} {((parseFloat(item.price) * (parseInt(item.qty) || 0)) - parseFloat(item.discount || 0)).toFixed(3)}
                      </p>
                    </div>
                  </div>
                  
                  <div className="mt-3 border-t border-slate-600/50 pt-3 flex items-center justify-between">
                    <span className="text-[10px] uppercase font-bold text-slate-400">Discount ({CURRENCY}):</span>
                    <input type="number" placeholder="0" className="w-20 bg-slate-900 text-white text-xs py-1 px-2 rounded border border-slate-600 text-right outline-none font-bold" value={item.discount} onChange={(e) => updateItemDiscount(item.id, e.target.value)} disabled={isSaved} />
                  </div>
                </div>
              ))}
            </div>

            {/* DESKTOP LAYOUT: TABLE STYLE */}
            <div className="hidden md:block">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-700">
                    <th className="pb-3 w-1/3">Product</th>
                    <th className="pb-3 text-center">Qty</th>
                    <th className="pb-3 text-center">Unit</th>
                    <th className="pb-3 text-right">Rate</th>
                    <th className="pb-3 text-center">Disc</th>
                    <th className="pb-3 text-right">Total</th>
                    <th className="pb-3 text-center">Del</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50">
                  {cart.map(item => (
                    <tr key={item.id} className="hover:bg-slate-700/20 transition">
                      <td className="py-3 pr-2 text-[10px] font-bold text-white uppercase leading-tight max-w-[120px] truncate" title={item.name}>{item.name}</td>
                      <td className="py-3 px-1">
                        <div className="flex items-center justify-center bg-slate-900 rounded border border-slate-600 w-min mx-auto overflow-hidden">
                          <button onClick={() => adjustQty(item.id, -1)} className="px-2 text-slate-400 hover:text-white hover:bg-slate-700 font-bold">-</button>
                          <input type="number" className="w-8 bg-transparent text-white text-[11px] py-1 text-center outline-none font-black" value={item.qty} onChange={(e) => updateItemQty(item.id, e.target.value)} disabled={isSaved} />
                          <button onClick={() => adjustQty(item.id, 1)} className="px-2 text-slate-400 hover:text-white hover:bg-slate-700 font-bold">+</button>
                        </div>
                      </td>
                      <td className="py-3 px-1 text-center text-[9px] font-black text-slate-400 uppercase">{item.uom}</td>
                      <td className="py-3 px-1 text-right text-[11px] font-bold text-slate-300">{parseFloat(item.price).toFixed(3)}</td>
                      <td className="py-3 px-1 text-center">
                        <input type="number" placeholder="0" className="w-12 bg-slate-900 text-white text-[11px] py-1 px-1 rounded border border-slate-600 text-center outline-none font-bold placeholder:text-slate-600" value={item.discount} onChange={(e) => updateItemDiscount(item.id, e.target.value)} disabled={isSaved} />
                      </td>
                      <td className="py-3 px-1 text-right text-[11px] font-black text-amber-400">
                        {((parseFloat(item.price) * (parseInt(item.qty) || 0)) - parseFloat(item.discount || 0)).toFixed(3)}
                      </td>
                      <td className="py-3 pl-2 text-center">
                        {!isSaved && <button onClick={() => removeItem(item.id)} className="bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white w-6 h-6 rounded flex items-center justify-center font-black text-xs transition">X</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="p-4 bg-slate-900/80 border-t border-slate-700/50 space-y-4 shrink-0 mt-auto">
            <div className="flex flex-col p-4 bg-slate-950 rounded-xl border border-amber-500/30 shadow-inner">
              <div className="flex justify-between items-baseline mb-2">
                 <span className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Payable Total ({CURRENCY})</span>
                 <span className="text-3xl md:text-4xl font-black text-amber-400 tracking-tighter">{finalTotal.toFixed(3)}</span>
              </div>
              <div className="grid grid-cols-2 gap-3 mt-2 pt-3 border-t border-slate-800">
                 <div className="flex items-center justify-between bg-slate-900 px-3 py-2 rounded-lg border border-slate-700">
                    <span className="text-[9px] font-black uppercase text-slate-500">Bill Disc</span>
                    <input type="number" placeholder="0" className="w-16 md:w-20 bg-transparent text-white text-[11px] outline-none text-right font-bold placeholder:text-slate-600" value={billDiscount} onChange={(e) => setBillDiscount(e.target.value)} disabled={isSaved} />
                 </div>
                 <div className="flex items-center gap-2 bg-slate-900 px-3 py-2 rounded-lg border border-slate-700 cursor-pointer" onClick={() => !isSaved && setVatEnabled(!vatEnabled)}>
                    <input type="checkbox" checked={vatEnabled} readOnly className="accent-amber-500" disabled={isSaved} />
                    <span className="text-[9px] font-black uppercase text-slate-400">VAT {vatRate}%</span>
                 </div>
              </div>
            </div>

            {!isSaved && (
              <div className="space-y-4">
                <div className="bg-slate-800 p-3 rounded-xl border border-slate-700 flex items-center gap-3">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest w-20 md:w-24">Customer #</span>
                  <input 
                    type="tel" 
                    placeholder="Optional (+968...)" 
                    className="flex-grow bg-slate-900 text-white text-sm p-2 rounded-lg border border-slate-600 outline-none focus:border-amber-500 font-bold placeholder:text-slate-500 w-full" 
                    value={customerPhone} 
                    onChange={(e) => setCustomerPhone(e.target.value)} 
                  />
                </div>

                <div className="bg-slate-800 p-3 rounded-xl border border-slate-700">
                  <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest mb-2">Payment Method</p>
                  <div className="grid grid-cols-3 gap-2">
                    {['Cash', 'Card', 'Multiple'].map(method => (
                      <button key={method} onClick={() => setPaymentMethod(method)} className={`py-2 rounded-lg text-[10px] md:text-xs font-black uppercase tracking-widest transition ${paymentMethod === method ? 'bg-amber-500 text-slate-950 shadow-md' : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-700'}`}>
                        {method}
                      </button>
                    ))}
                  </div>
                  {paymentMethod === 'Multiple' && (
                    <div className="mt-3 p-3 bg-slate-900 rounded-lg border border-slate-700 space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Cash Paid</span>
                        <input type="number" placeholder="0.000" className="w-24 bg-slate-800 text-white text-xs p-1 rounded border border-slate-600 text-right font-bold" value={cashAmount} onChange={(e) => setCashAmount(e.target.value)} />
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Card Paid</span>
                        <input type="number" placeholder="0.000" className="w-24 bg-slate-800 text-white text-xs p-1 rounded border border-slate-600 text-right font-bold" value={cardAmount} onChange={(e) => setCardAmount(e.target.value)} />
                      </div>
                      <div className="pt-2 mt-2 border-t border-slate-700 flex justify-between items-center">
                        <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">Remaining</span>
                        <span className={`text-xs font-black ${Math.abs(multipleDifference) < 0.01 ? 'text-green-400' : 'text-red-400'}`}>
                          {CURRENCY} {multipleDifference.toFixed(3)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {!isSaved ? (
              <button onClick={handleCompleteSale} disabled={cart.length === 0} className="w-full bg-amber-500 text-slate-950 font-black py-4 rounded-xl text-xs uppercase tracking-widest shadow-xl hover:bg-amber-400 transition active:scale-95 disabled:opacity-50">
                Complete Sale
              </button>
            ) : (
              <div className="space-y-3 bg-slate-800 p-4 rounded-xl border border-green-500/50 shadow-inner">
                <div className="text-center pb-3 border-b border-slate-700 mb-3">
                  <p className="text-green-400 font-black uppercase tracking-widest text-[10px]">Sale Successfully Saved</p>
                  <p className="text-white font-black text-xl mt-1">Bill No: #{billNumber || 'PENDING...'}</p>
                </div>
                
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={handleDesktopWhatsAppApp} className="bg-green-600 text-white font-black py-3 rounded-xl text-[10px] uppercase hover:bg-green-500 shadow-lg">WhatsApp App</button>
                  <button onClick={() => window.print()} className="bg-white text-black font-black py-3 rounded-xl text-[10px] uppercase hover:bg-gray-200 shadow-lg">Print Receipt</button>
                </div>
                <button onClick={() => {setCart([]); setIsSaved(false); setCustomerPhone(''); setBillDiscount(''); setCashAmount(''); setCardAmount(''); setPaymentMethod('Cash'); setBillNumber(null); setReceiptData(null);}} className="w-full text-amber-400 text-[10px] font-black uppercase text-center mt-2 hover:text-amber-300">Start Next Customer →</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* --- HIDDEN THERMAL RECEIPT --- */}
      <div ref={receiptRef} className="absolute top-[-10000px] left-[-10000px] print:static print:left-0 print:top-0 thermal-receipt" style={{ width: '80mm', padding: '5mm', background: 'white', color: 'black', fontFamily: 'monospace', fontSize: '12px' }}>
        <div style={{ textAlign: 'center', marginBottom: '10px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 'bold', margin: '0' }}>{SHOP_NAME}</h2>
            <p style={{ fontSize: '10px', margin: '0' }}>Tel: {SHOP_CONTACT}</p>
            <p style={{ fontSize: '10px', margin: '0' }}>{new Date().toLocaleString()}</p>
            <p style={{ fontSize: '14px', fontWeight: 'bold', margin: '5px 0', padding: '2px 0', borderTop: '1px dashed black', borderBottom: '1px dashed black' }}>Bill No: #{billNumber || 'PENDING...'}</p>
        </div>
        
        {(receiptData ? receiptData.cart : cart).map(i => {
          const itemTotal = ((parseFloat(i.price) * (parseInt(i.qty) || 0)) - parseFloat(i.discount || 0)).toFixed(3);
          return (
            <div key={i.id} style={{ marginBottom: '5px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: 'bold' }}>
                <span>{i.name} ({i.uom})</span><span>{itemTotal}</span>
              </div>
              <div style={{ fontSize: '10px' }}>Qty: {i.qty || 0} x {parseFloat(i.price).toFixed(3)}</div>
            </div>
          );
        })}
        
        <div style={{ borderBottom: '1px dashed black', margin: '5px 0' }}></div>
        <div style={{ fontSize: '11px', fontWeight: 'bold' }}>
          {(receiptData ? receiptData.billDiscount : billDiscount) && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Discount:</span> <span>-{parseFloat(receiptData ? receiptData.billDiscount : billDiscount).toFixed(3)}</span></div>}
          {(receiptData ? receiptData.vatEnabled : vatEnabled) && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>VAT ({(receiptData ? receiptData.vatRate : vatRate)}%):</span> <span>{(receiptData ? receiptData.vatAmount : vatAmount).toFixed(3)}</span></div>}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginTop: '5px', borderTop: '1px solid black', paddingTop: '5px' }}>
            <span>TOTAL {CURRENCY}:</span> <span>{(receiptData ? receiptData.finalTotal : finalTotal).toFixed(3)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', marginTop: '5px' }}>
            <span>Payment:</span> <span>{receiptData ? receiptData.paymentMethod : paymentMethod}</span>
          </div>
        </div>
        <div style={{ textAlign: 'center', marginTop: '20px', fontSize: '10px', fontWeight: 'bold' }}>Thank you for visiting Oud Bin Sheikh!</div>
        
        <div style={{ marginTop: '10px', fontSize: '9px', textAlign: 'justify', borderTop: '1px dashed black', paddingTop: '5px' }}>
          <strong>Returns or Exchange Policy:</strong> Returns are accepted on sealed and unopened products within 14 days of delivery. Opened products cannot be returned unless they are deemed defective.<br/><br/>
          <strong>Complaints & Damaged Goods:</strong> Damages or discrepancies must be reported within 7 days of receipt.
        </div>
      </div>
    </div>
  );
}