import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, orderBy, onSnapshot, doc, getDoc, deleteDoc, updateDoc, increment } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { format } from 'date-fns';
import { Camera, Receipt as ReceiptIcon, CreditCard, Trash2, PieChart as PieChartIcon } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { Modal } from '../components/ui/Modal';

export function Home() {
  const [receipts, setReceipts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const navigate = useNavigate();

  // Modal State
  const [modalConfig, setModalConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: 'info' | 'success' | 'error' | 'confirm';
    onConfirm?: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    type: 'info'
  });

  useEffect(() => {
    if (!auth.currentUser) return;

    const q = query(
      collection(db, `users/${auth.currentUser.uid}/receipts`),
      orderBy('date', 'desc')
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const receiptsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      // Fetch payment account names
      const enrichedReceipts = await Promise.all(
        receiptsData.map(async (receipt: any) => {
          let paymentName = 'Unknown Payment';
          
          if (receipt.paymentAccountId) {
            const paymentDoc = await getDoc(doc(db, `users/${auth.currentUser!.uid}/paymentAccounts/${receipt.paymentAccountId}`));
            if (paymentDoc.exists()) {
              paymentName = paymentDoc.data().name;
            }
          }

          return { ...receipt, paymentName };
        })
      );

      setReceipts(enrichedReceipts);
      setLoading(false);
    }, (error) => {
      console.error('Error fetching receipts:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleDelete = async (e: React.MouseEvent, receipt: any) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!auth.currentUser) return;

    setModalConfig({
      isOpen: true,
      title: '確認刪除',
      message: '確定要刪除此單據嗎？此動作無法復原，且會自動回退帳戶餘額。',
      type: 'confirm',
      onConfirm: async () => {
        try {
          // Restore account balance
          const accountRef = doc(db, `users/${auth.currentUser!.uid}/paymentAccounts/${receipt.paymentAccountId}`);
          await updateDoc(accountRef, { balance: increment(receipt.totalAmount) });

          // Delete receipt
          await deleteDoc(doc(db, `users/${auth.currentUser!.uid}/receipts/${receipt.id}`));
          setModalConfig(prev => ({ ...prev, isOpen: false }));
        } catch (error) {
          console.error('Error deleting receipt:', error);
          setModalConfig({
            isOpen: true,
            title: '錯誤',
            message: '刪除失敗，請稍後再試。',
            type: 'error'
          });
        }
      }
    });
  };

  const filteredReceipts = selectedDate 
    ? receipts.filter(r => r.date.startsWith(selectedDate))
    : receipts;

  const personalStats = useMemo(() => {
    const personal = receipts.filter(r => r.category === 'Personal');
    const totals: Record<string, number> = {};
    
    personal.forEach(r => {
      const cat = r.subCategory || 'Other';
      totals[cat] = (totals[cat] || 0) + r.totalAmount;
    });

    return Object.entries(totals).map(([name, value]) => ({ name, value }));
  }, [receipts]);

  const COLORS = ['#AEC8DB', '#957E6B', '#D9C5B2', '#B8C5D6', '#E5D3C5', '#C4D7E0', '#A3B18A'];

  return (
    <div className="p-4 max-w-md mx-auto pb-24 bg-background min-h-screen">
      <header className="flex justify-between items-center mb-8">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl overflow-hidden shadow-md border-2 border-white">
            <img src="/logo.png" alt="Cui Bo Logo" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
          </div>
          <div>
            <h1 className="text-3xl font-serif font-bold text-ink tracking-tight">Cui Bo</h1>
            <p className="text-[10px] font-bold text-ink/40 uppercase tracking-[0.2em]">記帳軟體</p>
          </div>
        </div>
        <img 
          src={auth.currentUser?.photoURL || ''} 
          alt="Profile" 
          className="w-10 h-10 rounded-full border-2 border-card-white shadow-sm"
        />
      </header>

      <div className="mb-8">
        <button 
          onClick={() => navigate('/receipt/new')}
          className="w-full bg-primary-blue hover:opacity-90 text-white rounded-3xl p-6 flex flex-col items-center justify-center gap-3 shadow-lg shadow-ink/10 transition-all active:scale-95"
        >
          <div className="bg-white/20 p-4 rounded-2xl">
            <Camera className="w-8 h-8" />
          </div>
          <span className="text-lg font-bold tracking-wider">拍照新增單據</span>
        </button>
      </div>

      {/* Statistics Section */}
      {personalStats.length > 0 && (
        <div className="mb-8 bg-card-white p-6 rounded-3xl shadow-sm border border-divider">
          <h2 className="text-sm font-bold text-ink flex items-center gap-2 mb-4 uppercase tracking-widest">
            <PieChartIcon className="w-4 h-4 text-primary-blue" />
            私人開銷佔比
          </h2>
          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={personalStats}
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={60}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {personalStats.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  formatter={(value: number) => `¥${value.toLocaleString()}`}
                  contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 4px 20px rgba(149, 126, 107, 0.1)', backgroundColor: '#FFFFFF' }}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', paddingTop: '10px' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="space-y-4">
        <div className="flex justify-between items-center bg-card-white p-4 rounded-2xl border border-divider shadow-sm">
          <h2 className="text-sm font-bold text-ink flex items-center gap-2 uppercase tracking-widest">
            <ReceiptIcon className="w-4 h-4 text-primary-blue" />
            明細單據
          </h2>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-ink/50 uppercase tracking-tighter">篩選日期</span>
            <input 
              type="date" 
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="text-xs border-none bg-background rounded-lg p-1.5 px-2 outline-none focus:ring-2 focus:ring-primary-blue font-bold text-ink"
            />
          </div>
        </div>
        
        {loading ? (
          <div className="text-center py-8 text-ink/50 animate-pulse font-medium">載入中...</div>
        ) : filteredReceipts.length === 0 ? (
          <div className="text-center py-12 bg-card-white rounded-3xl border border-dashed border-divider">
            <ReceiptIcon className="w-12 h-12 text-ink/20 mx-auto mb-3" />
            <p className="text-ink font-medium">{selectedDate ? '此日期無單據紀錄' : '尚無單據紀錄'}</p>
            <p className="text-sm text-ink/50 mt-1">
              {selectedDate ? '請嘗試選擇其他日期' : '點擊上方按鈕開始記帳'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredReceipts.map((receipt) => (
              <Link 
                key={receipt.id} 
                to={`/receipt/${receipt.id}`}
                className="block bg-card-white p-4 rounded-3xl shadow-sm border border-divider hover:border-primary-blue/50 transition-all group relative active:scale-[0.98]"
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-4">
                    {receipt.photoUrl ? (
                      <img src={receipt.photoUrl} alt="Receipt" className="w-14 h-14 rounded-2xl object-cover shadow-sm" />
                    ) : (
                      <div className="w-14 h-14 rounded-2xl bg-background flex items-center justify-center">
                        <ReceiptIcon className="w-6 h-6 text-ink/30" />
                      </div>
                    )}
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <div className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          receipt.category === 'Business' 
                            ? 'bg-[#E5D3C5] text-[#957E6B]' 
                            : 'bg-[#C4D7E0] text-[#5A7D9A]'
                        }`}>
                          {receipt.category === 'Business' ? '進貨' : '私人'}
                        </div>
                        <span className="text-[10px] font-bold text-ink/40 uppercase tracking-widest">
                          {format(new Date(receipt.date), 'MM/dd HH:mm')}
                        </span>
                      </div>
                      <div className="flex flex-col gap-0.5 text-xs text-ink/70 font-medium">
                        <div className="flex items-center gap-1">
                          <CreditCard className="w-3 h-3 text-ink/30" />
                          <span className="truncate max-w-[120px]">{receipt.paymentName}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className="font-serif font-bold text-xl text-ink">
                      ¥{receipt.totalAmount.toLocaleString()}
                    </span>
                    <button 
                      onClick={(e) => handleDelete(e, receipt)}
                      className="p-2 text-ink/20 hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
      
      <Modal
        isOpen={modalConfig.isOpen}
        onClose={() => setModalConfig(prev => ({ ...prev, isOpen: false }))}
        onConfirm={modalConfig.onConfirm}
        title={modalConfig.title}
        message={modalConfig.message}
        type={modalConfig.type}
      />
    </div>
  );
}
