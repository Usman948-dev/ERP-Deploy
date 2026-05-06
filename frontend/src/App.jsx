import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, Navigate, useLocation } from 'react-router-dom';

import Login from './pages/login';
import Dashboard from './pages/Dashboard';
import POS from './pages/POS';
import Inventory from './pages/inventory';
import Warehouse from './pages/Warehouse'; // <-- NEW WAREHOUSE IMPORT
import StockTransfers from './pages/transfers';
import Production from './pages/production';
import Expenses from './pages/expenses';
import Reports from './pages/Reports';
import Suppliers from './pages/suppliers';
import Purchases from './pages/purchases';
import AccountsPayable from './pages/accountspayable';
import BarcodeGen from './pages/BarcodeGen';

function MainLayout({ user, setUser, children }) {
  const location = useLocation();
  
  const isAdmin = user === 'Admin' || user?.Role === 'Admin' || user?.Name === 'Admin';
  const isManager = user?.Role === 'Manager';
  const canManageFinance = isAdmin || isManager;
  
  // --- IRONCLAD CASHIER CHECK ---
  const isCashier = user === 'Cashier' || user?.Role === 'Cashier' || user?.Name === 'Cashier';
  
  const userName = typeof user === 'string' ? user : (user?.Name || 'Staff');
  const isActive = (path) => location.pathname === path ? "bg-teal-500 text-white shadow-lg" : "text-gray-400 hover:text-white hover:bg-gray-800";

  return (
    <div className="flex h-screen bg-gray-50 font-sans">
      <div className="w-64 bg-[#111827] text-white flex flex-col justify-between shadow-2xl z-20 overflow-y-auto hidden-scrollbar">
        <div>
          <div className="p-8 border-b border-gray-800 text-center sticky top-0 bg-[#111827] z-10">
            <h2 className="text-3xl font-black tracking-tighter italic text-white">B. Sl <span className="text-teal-400">ERP</span></h2>
          </div>

          <div className="p-4 flex flex-col gap-2">
            
            {/* HIDE DASHBOARD FROM CASHIER */}
            {!isCashier && (
              <Link to="/dashboard" className={`p-4 rounded-2xl font-bold transition-all flex items-center gap-3 ${isActive('/dashboard')}`}>📊 Dashboard</Link>
            )}

            <Link to="/pos" className={`p-4 rounded-2xl font-bold transition-all flex items-center gap-3 ${isActive('/pos')}`}>🛒 Point of Sale</Link>
            <Link to="/inventory" className={`p-4 rounded-2xl font-bold transition-all flex items-center gap-3 ${isActive('/inventory')}`}>📦 Inventory</Link>
            
            {/* --- NEW WAREHOUSE LINK --- */}
            <Link to="/warehouse" className={`p-4 rounded-2xl font-bold transition-all flex items-center gap-3 ${isActive('/warehouse')}`}>🏢 Warehouse</Link>
            
            <Link to="/barcodegen" className={`p-4 rounded-2xl font-bold transition-all flex items-center gap-3 ${isActive('/barcodegen')}`}>🏷️ Barcode Gen</Link>
            <Link to="/transfers" className={`p-4 rounded-2xl font-bold transition-all flex items-center gap-3 ${isActive('/transfers')}`}>🔄 Stock Transfers</Link>
            
            <div className="mt-6 mb-2 px-4 text-xs font-black text-gray-500 uppercase tracking-widest">Management Controls</div>
            
            {canManageFinance && (
              <>
                <Link to="/suppliers" className={`p-4 rounded-2xl font-bold transition-all flex items-center gap-3 ${isActive('/suppliers')}`}>🤝 Suppliers</Link>
                <Link to="/purchases" className={`p-4 rounded-2xl font-bold transition-all flex items-center gap-3 ${isActive('/purchases')}`}>📥 Purchases</Link>
                <Link to="/accountspayable" className={`p-4 rounded-2xl font-bold transition-all flex items-center gap-3 ${isActive('/accountspayable')}`}>💳 Accounts Payable</Link>
              </>
            )}

            {/* HIDE PRODUCTION FROM CASHIER */}
            {!isCashier && (
              <Link to="/production" className={`p-4 rounded-2xl font-bold transition-all flex items-center gap-3 ${isActive('/production')}`}>🏭 Production</Link>
            )}

            <Link to="/reports" className={`p-4 rounded-2xl font-bold transition-all flex items-center gap-3 ${isActive('/reports')}`}>📈 Sales Reports</Link>

            {isAdmin && (
              <Link to="/expenses" className={`p-4 rounded-2xl font-bold transition-all flex items-center gap-3 ${isActive('/expenses')}`}>💸 Expenses</Link>
            )}
          </div>
        </div>

        <div className="p-4 border-t border-gray-800 text-center sticky bottom-0 bg-[#111827] z-10">
            <button onClick={() => setUser(null)} className="w-full bg-red-500/10 text-red-400 p-3 rounded-xl font-bold hover:bg-red-500 hover:text-white transition text-sm">LOGOUT</button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(null);

  if (!user) return <Login setUser={setUser} />;

  // --- ROUTING LOGIC: Determine where the user lands when they log in ---
  const isCashier = user === 'Cashier' || user?.Role === 'Cashier' || user?.Name === 'Cashier';
  
  // If Cashier, default to POS. If anyone else, default to Dashboard.
  const defaultRoute = isCashier ? "/pos" : "/dashboard";

  return (
    <Router>
      <MainLayout user={user} setUser={setUser}>
        <Routes>
          <Route path="/" element={<Navigate to={defaultRoute} replace />} />
          
          {/* Prevent Cashier from manually typing /dashboard in the URL */}
          <Route path="/dashboard" element={!isCashier ? <Dashboard user={user} /> : <Navigate to="/pos" replace />} />
          
          <Route path="/pos" element={<POS user={user} />} />
          <Route path="/inventory" element={<Inventory user={user} />} />
          
          {/* --- NEW WAREHOUSE ROUTE --- */}
          <Route path="/warehouse" element={<Warehouse user={user} />} />
          
          <Route path="/barcodegen" element={<BarcodeGen user={user} />} />
          <Route path="/transfers" element={<StockTransfers user={user} />} />
          <Route path="/production" element={<Production user={user} />} />
          <Route path="/suppliers" element={<Suppliers user={user} />} />
          <Route path="/purchases" element={<Purchases user={user} />} />
          <Route path="/accountspayable" element={<AccountsPayable user={user} />} />
          <Route path="/expenses" element={<Expenses user={user} />} />
          <Route path="/reports" element={<Reports user={user} />} />
          <Route path="*" element={<Navigate to={defaultRoute} replace />} />
        </Routes>
      </MainLayout>
    </Router>
  );
}