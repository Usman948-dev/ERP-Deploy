import { useState, useEffect } from 'react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, Legend, BarChart, Bar
} from 'recharts';
import { API_URL } from '../config';

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('today'); // 'today', 'weekly', 'monthly', 'custom'
  
  // Custom Date States (Defaults to last 30 days)
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);

  const [stats, setStats] = useState({ 
    revenue: 0, orders: 0, purchases: 0, expenses: 0, 
    cogs: 0, inventoryValue: 0, grossProfit: 0, netProfit: 0, marginPercent: 0,
    aov: 0, returnRate: 0, stockOutCount: 0, apBalance: 0
  });
  const [salesTrend, setSalesTrend] = useState([]);
  const [expenseData, setExpenseData] = useState([]);
  const [topProducts, setTopProducts] = useState([]);
  const [lowStockItems, setLowStockItems] = useState([]);

  const fetchLowStock = async () => {
    try {
      const res = await fetch(`${API_URL}/products/low-stock`);
      if (res.ok) {
        const data = await res.json();
        setLowStockItems(data.map(item => ({
          barcode: item.Barcode ?? item.barcode,
          name: item.Name ?? item.name ?? 'Unknown',
          stock: Number(item.Stock ?? item.stock ?? 0),
          reorderPoint: Number(item.ReorderPoint ?? item.reorderPoint ?? 0)
        })));
      }
    } catch (err) {
      console.error("Low stock fetch error:", err);
    }
  };

  const fetchStats = async () => {
    try {
      setLoading(true);
      
      // Build the URL based on the range
      let url = `${API_URL}/sales/summary?range=${timeRange}`;
      if (timeRange === 'custom') {
        url += `&start=${startDate}&end=${endDate}`;
      }

      const res = await fetch(url);
      if (res.ok) {
        const rawData = await res.json();
        
        // NORMALIZER: Catch both Capitalized (C#) and lowercase (JS) variable names
        const t = rawData.totals || rawData.Totals || {};
        setStats({
            revenue: t.revenue ?? t.Revenue ?? 0,
            cogs: t.cogs ?? t.COGS ?? 0,
            marginPercent: t.marginPercent ?? t.MarginPercent ?? 0,
            netProfit: t.netProfit ?? t.NetProfit ?? 0,
            inventoryValue: t.inventoryValue ?? t.InventoryValue ?? 0,
            orders: t.orders ?? t.Orders ?? 0,
            aov: t.aov ?? t.AOV ?? 0,
            returnRate: t.returnRate ?? t.ReturnRate ?? 0,
            stockOutCount: t.stockOutCount ?? t.StockOutCount ?? 0,
            apBalance: t.apBalance ?? t.APBalance ?? 0
        });

        // Normalize Trend Data
        const rawTrend = rawData.trend || rawData.Trend || [];
        setSalesTrend(rawTrend.map(item => ({
            time: item.time || item.Time,
            sales: Number(item.sales ?? item.Sales ?? item.val ?? item.Val ?? 0)
        })));

        // Normalize Expense Pie Chart Data
        const rawExpenses = rawData.expensesBreakdown || rawData.ExpensesBreakdown || [];
        setExpenseData(rawExpenses.map(item => ({
            name: item.name || item.Name || item.category || item.Category || 'Unknown',
            value: Number(item.value ?? item.Value ?? item.val ?? item.Val ?? 0)
        })));

        // Normalize Top Products Data
        const rawTopProducts = rawData.topProducts || rawData.TopProducts || [];
        setTopProducts(rawTopProducts.map(item => ({
            name: item.name || item.Name || 'Unknown',
            revenue: Number(item.revenue ?? item.Revenue ?? 0),
            units: Number(item.units ?? item.Units ?? 0)
        })));

      }
    } catch (err) {
      console.error("Sync Error:", err);
    } finally {
      setLoading(false);
    }
  };

  // Auto-fetch when preset ranges change (Today, Weekly, Monthly)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional fetch-on-mount/filter-change
    fetchStats();
    // fetchStats is redefined every render; adding it to deps below would loop forever
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeRange]);

  // Low stock isn't scoped to the date-range filter, so it gets its own
  // mount-only effect rather than re-running every time timeRange changes.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional fetch-on-mount, see React docs 'Fetching data'
    fetchLowStock();
  }, []);

  const COLORS = ['#14b8a6', '#f59e0b', '#ef4444', '#6366f1'];

  return (
    <div className="p-8 bg-gray-50 min-h-screen font-sans">
      
      {/* FILTER BAR & HEADER */}
      <div className="mb-10 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6">
        <div>
          <h1 className="text-4xl font-black text-gray-900 tracking-tighter italic uppercase">
            B. SL <span className="text-teal-500">Analytics</span>
          </h1>
          <p className="text-gray-500 font-bold text-xs uppercase tracking-widest mt-1">
            Financial Intelligence Terminal — Live from SQL Server
          </p>
        </div>

        {/* --- CUSTOM ANALYTICS FILTERS --- */}
        <div className="flex flex-col sm:flex-row items-end gap-4">
          
          {/* CUSTOM DATE PICKERS (Only shows when 'custom' is selected) */}
          {timeRange === 'custom' && (
            <div className="flex items-center gap-2 bg-white p-2 rounded-2xl border border-gray-200 shadow-sm animate-fade-in">
              <input 
                type="date" 
                value={startDate} 
                onChange={(e) => setStartDate(e.target.value)}
                className="p-2 text-xs font-bold outline-none text-gray-600 bg-transparent rounded-xl cursor-pointer focus:ring-2 focus:ring-teal-500/20"
              />
              <span className="text-gray-300 font-black text-xs">-</span>
              <input 
                type="date" 
                value={endDate} 
                onChange={(e) => setEndDate(e.target.value)}
                className="p-2 text-xs font-bold outline-none text-gray-600 bg-transparent rounded-xl cursor-pointer focus:ring-2 focus:ring-teal-500/20"
              />
              <button 
                onClick={fetchStats} 
                className="bg-teal-500 text-slate-900 px-5 py-2 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-teal-400 transition shadow-md active:scale-95"
              >
                Apply
              </button>
            </div>
          )}

          {/* RANGE TOGGLES */}
          <div className="flex bg-white p-2 rounded-2xl border border-gray-200 shadow-sm gap-2">
            {['today', 'weekly', 'monthly', 'custom'].map((range) => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={`px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                  timeRange === range 
                  ? 'bg-gray-900 text-white shadow-lg' 
                  : 'text-gray-400 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                {range}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* --- LOW STOCK WARNING BANNER --- */}
      {lowStockItems.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-[2rem] p-6 mb-8 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-10 h-10 bg-red-500 rounded-full flex items-center justify-center text-white font-black text-lg">!</div>
            <div>
              <p className="text-red-700 font-black text-sm uppercase tracking-widest">
                {lowStockItems.length} Item{lowStockItems.length > 1 ? 's' : ''} Running Low
              </p>
              <p className="text-red-500 text-xs font-bold">Below their set reorder point</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 sm:ml-4">
            {lowStockItems.slice(0, 6).map(item => (
              <span 
                key={item.barcode} 
                title={`Reorder point: ${item.reorderPoint}`}
                className="bg-white border border-red-200 text-red-600 px-3 py-1.5 rounded-full text-[11px] font-black uppercase tracking-wide"
              >
                {item.name} — {item.stock} left
              </span>
            ))}
            {lowStockItems.length > 6 && (
              <span className="text-red-500 text-[11px] font-black self-center">
                +{lowStockItems.length - 6} more
              </span>
            )}
          </div>
        </div>
      )}

      {/* --- STAT CARDS WITH ADVANCED METRICS --- */}
      <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6 transition-opacity ${loading ? 'opacity-50' : 'opacity-100'}`}>
        <StatCard title="Revenue" value={stats.revenue} trend={`${stats.orders || 0} Orders`} color="text-teal-500" prefix="OMR " />
        <StatCard title="Cost of Goods (COGS)" value={stats.cogs} trend="Items Sold" color="text-orange-500" prefix="OMR " />
        <StatCard title="Gross Margin" value={stats.marginPercent} trend="Profit %" color="text-blue-500" prefix="" suffix="%" />
        
        <div className="bg-gray-900 p-6 rounded-[2rem] shadow-2xl relative overflow-hidden flex flex-col justify-center">
            <div className="absolute top-0 right-0 w-32 h-32 bg-teal-500/10 rounded-full blur-2xl -mr-10 -mt-10"></div>
            <p className="text-gray-500 font-black text-[10px] uppercase tracking-widest relative z-10">True Net Profit</p>
            <h2 className="text-3xl font-black text-white mt-1 relative z-10">
              OMR {(Number(stats.netProfit) || 0).toFixed(3)}
            </h2>
            <div className="mt-2 flex items-center gap-1 relative z-10">
                <span className="w-2 h-2 rounded-full bg-teal-500 animate-pulse"></span>
                <p className="text-[10px] font-black text-teal-500 uppercase">System Optimized</p>
            </div>
        </div>
      </div>

      {/* --- SECOND ROW: NEW KPIS --- */}
      <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10 transition-opacity ${loading ? 'opacity-50' : 'opacity-100'}`}>
        <StatCard 
          title="Avg Order Value" 
          value={stats.aov} 
          trend="Per Sale" 
          color="text-teal-600" 
          prefix="OMR " 
        />
        <StatCard 
          title="Return Rate" 
          value={stats.returnRate} 
          trend={Number(stats.returnRate) > 10 ? 'High' : 'Healthy'} 
          color={Number(stats.returnRate) > 10 ? 'text-red-500' : 'text-emerald-500'} 
          suffix="%" 
        />
        <StatCard 
          title="Stock-Out Items" 
          value={stats.stockOutCount} 
          trend="Live Snapshot" 
          color={Number(stats.stockOutCount) > 0 ? 'text-red-500' : 'text-emerald-500'} 
          suffix=" SKUs"
        />
        <StatCard 
          title="Accounts Payable" 
          value={stats.apBalance} 
          trend="Owed to Suppliers" 
          color="text-amber-600" 
          prefix="OMR " 
        />
      </div>

      {/* GRAPHS & INVENTORY SECTION */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Sales Performance Area Chart */}
        <div className="lg:col-span-2 bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm flex flex-col">
          <div className="flex justify-between items-center mb-8">
             <h3 className="text-gray-900 font-black uppercase text-sm tracking-widest flex items-center gap-2">
                <div className="w-2 h-2 bg-teal-500 rounded-full"></div>
                Sales Flow: {timeRange === 'custom' ? 'Custom Range' : timeRange}
             </h3>
          </div>
          <div className="flex-grow min-h-[350px]">
            <ResponsiveContainer width="100%" height={350}>
              <AreaChart data={salesTrend}>
                <defs>
                  <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#14b8a6" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#14b8a6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontWeight: 'bold'}} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8'}} />
                <Tooltip 
                   contentStyle={{ borderRadius: '20px', border: 'none', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', fontWeight: 'bold' }} 
                   itemStyle={{ color: '#14b8a6', fontWeight: '900' }}
                />
                <Area type="monotone" dataKey="sales" stroke="#14b8a6" strokeWidth={5} fill="url(#salesGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* SIDE COLUMN: INVENTORY VALUATION & EXPENSES */}
        <div className="flex flex-col gap-6">
            
          {/* LIVE INVENTORY VALUATION CARD */}
          <div className="bg-teal-50 p-8 rounded-[2.5rem] border border-teal-100 shadow-sm">
             <h3 className="text-[10px] font-black text-teal-600 uppercase tracking-widest mb-2 flex items-center gap-2">
                <div className="w-2 h-2 bg-teal-500 rounded-full animate-pulse"></div> Live Inventory Valuation
             </h3>
             <p className="text-4xl font-black text-teal-800 tracking-tighter">
                OMR {(Number(stats.inventoryValue) || 0).toFixed(3)}
             </p>
             <p className="text-[10px] font-bold text-teal-600/70 uppercase tracking-widest mt-2 leading-tight">
                Total landed cost of current stock
             </p>
          </div>

          {/* Expense Breakdown Pie Chart */}
          <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm flex-grow flex flex-col min-h-[300px]">
             <h3 className="text-gray-900 font-black uppercase text-sm tracking-widest mb-6 flex items-center gap-2">
                <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                Expense Categorization
             </h3>
             <div className="flex-grow relative min-h-[200px]">
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie data={expenseData} innerRadius="60%" outerRadius="85%" paddingAngle={5} dataKey="value" stroke="none">
                      {expenseData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', fontWeight: 'bold' }} />
                    <Legend iconType="circle" />
                  </PieChart>
                </ResponsiveContainer>
             </div>
          </div>
        </div>

      </div>

      {/* --- TOP 5 PRODUCTS BY REVENUE --- */}
      <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm mt-8">
        <h3 className="text-gray-900 font-black uppercase text-sm tracking-widest mb-6 flex items-center gap-2">
          <div className="w-2 h-2 bg-indigo-500 rounded-full"></div>
          Top 5 Products by Revenue
        </h3>
        {topProducts.length === 0 ? (
          <p className="text-gray-400 text-xs font-bold uppercase tracking-widest py-10 text-center">
            No sales in this range yet
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={topProducts} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
              <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8' }} />
              <YAxis 
                type="category" 
                dataKey="name" 
                axisLine={false} 
                tickLine={false} 
                width={140}
                tick={{ fill: '#334155', fontWeight: 'bold', fontSize: 12 }} 
              />
              <Tooltip 
                contentStyle={{ borderRadius: '20px', border: 'none', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', fontWeight: 'bold' }}
                formatter={(value, name) => name === 'revenue' ? [`OMR ${Number(value).toFixed(3)}`, 'Revenue'] : [value, 'Units Sold']}
              />
              <Bar dataKey="revenue" fill="#6366f1" radius={[0, 10, 10, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

    </div>
  );
}

// UPGRADED STAT CARD COMPONENT
function StatCard({ title, value, trend, color, prefix = '', suffix = '' }) {
  return (
    <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-gray-100 flex flex-col justify-center">
      <div className="flex justify-between items-start mb-2">
        <p className="text-gray-400 font-black text-[10px] uppercase tracking-widest">{title}</p>
        <span className={`text-[9px] font-black px-2 py-1 rounded-lg bg-gray-50 text-gray-500 uppercase tracking-widest`}>
          {trend}
        </span>
      </div>
      <h2 className={`text-4xl font-black tracking-tighter mt-1 ${color}`}>
        {prefix}{(Number(value) || 0).toFixed(suffix === '%' ? 1 : 3)}{suffix}
      </h2>
    </div>
  );
}