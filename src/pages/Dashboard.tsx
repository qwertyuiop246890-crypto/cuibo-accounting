import { useState, useEffect, useMemo } from 'react';
import { collection, query, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { format, subDays, isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import { Calendar, Filter } from 'lucide-react';

export function Dashboard() {
  const [receipts, setReceipts] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [dateRange, setDateRange] = useState<'today' | '7days' | '30days' | 'all'>('30days');

  useEffect(() => {
    if (!auth.currentUser) return;

    const unsubReceipts = onSnapshot(collection(db, `users/${auth.currentUser.uid}/receipts`), (snap) => {
      setReceipts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const unsubAccounts = onSnapshot(collection(db, `users/${auth.currentUser.uid}/paymentAccounts`), (snap) => {
      setAccounts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => { unsubReceipts(); unsubAccounts(); };
  }, []);

  const filteredReceipts = useMemo(() => {
    const now = new Date();
    let start = new Date(0);
    
    if (dateRange === 'today') start = startOfDay(now);
    if (dateRange === '7days') start = subDays(startOfDay(now), 7);
    if (dateRange === '30days') start = subDays(startOfDay(now), 30);

    return receipts.filter(r => {
      const rDate = new Date(r.date);
      return isWithinInterval(rDate, { start, end: endOfDay(now) });
    });
  }, [receipts, dateRange]);

  const stats = useMemo(() => {
    let total = 0;
    let business = 0;
    let personal = 0;
    const paymentUsage: Record<string, number> = {};

    filteredReceipts.forEach(r => {
      total += r.totalAmount;
      if (r.category === 'Business') business += r.totalAmount;
      if (r.category === 'Personal') personal += r.totalAmount;

      const accName = accounts.find(a => a.id === r.paymentAccountId)?.name || 'Unknown';
      paymentUsage[accName] = (paymentUsage[accName] || 0) + r.totalAmount;
    });

    const paymentData = Object.entries(paymentUsage).map(([name, value]) => ({ name, value }));

    return { total, business, personal, paymentData };
  }, [filteredReceipts, accounts]);

  const COLORS = ['#AEC8DB', '#957E6B', '#D9C5B2', '#B8C5D6', '#E5D3C5', '#C4D7E0', '#A3B18A'];

  return (
    <div className="p-4 max-w-md mx-auto space-y-6 bg-background min-h-screen">
      <header className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-serif font-bold text-ink tracking-tight">報表與分析</h1>
        <div className="flex items-center gap-2 bg-card-white px-4 py-2 rounded-full shadow-sm border border-divider">
          <Calendar className="w-4 h-4 text-ink/40" />
          <select 
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value as any)}
            className="bg-transparent text-xs font-bold text-ink outline-none appearance-none cursor-pointer uppercase tracking-widest"
          >
            <option value="today">今日</option>
            <option value="7days">近 7 天</option>
            <option value="30days">近 30 天</option>
            <option value="all">全部時間</option>
          </select>
        </div>
      </header>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2 bg-primary-blue p-8 rounded-[40px] shadow-xl shadow-primary-blue/20 text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-12 -mt-12" />
          <p className="text-white/70 text-xs font-bold uppercase tracking-[0.2em] mb-2 relative z-10">期間總花費</p>
          <p className="text-5xl font-serif font-bold tracking-tight relative z-10">¥{stats.total.toLocaleString()}</p>
        </div>
        
        <div className="bg-card-white p-6 rounded-3xl shadow-sm border border-divider">
          <p className="text-ink/40 text-[10px] font-bold uppercase tracking-widest mb-2">進貨支出</p>
          <p className="text-2xl font-serif font-bold text-ink">¥{stats.business.toLocaleString()}</p>
        </div>
        
        <div className="bg-card-white p-6 rounded-3xl shadow-sm border border-divider">
          <p className="text-ink/40 text-[10px] font-bold uppercase tracking-widest mb-2">私人開銷</p>
          <p className="text-2xl font-serif font-bold text-ink">¥{stats.personal.toLocaleString()}</p>
        </div>
      </div>

      {/* Payment Usage Chart */}
      <div className="bg-card-white p-8 rounded-[40px] shadow-sm border border-divider">
        <h2 className="text-lg font-serif font-bold text-ink mb-8 flex items-center gap-2 uppercase tracking-widest">
          <Filter className="w-5 h-5 text-primary-blue" />
          支付工具佔比
        </h2>
        
        {stats.paymentData.length > 0 ? (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={stats.paymentData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {stats.paymentData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  formatter={(value: number) => `¥${value.toLocaleString()}`}
                  contentStyle={{ borderRadius: '20px', border: 'none', boxShadow: '0 4px 20px rgba(149, 126, 107, 0.1)', backgroundColor: '#FFFFFF' }}
                />
                <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: '10px', paddingTop: '20px' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-48 flex items-center justify-center text-ink/30 text-sm font-medium">
            該期間尚無支出紀錄
          </div>
        )}
      </div>
    </div>
  );
}
