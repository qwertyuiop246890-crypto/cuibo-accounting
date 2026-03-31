import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, doc, setDoc, updateDoc, increment } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';
import { ArrowRightLeft, ArrowDown, ArrowUp } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function Transfer() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [amount, setAmount] = useState('');
  const [fromAccount, setFromAccount] = useState('');
  const [toAccount, setToAccount] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!auth.currentUser) return;

    const q = query(collection(db, `users/${auth.currentUser.uid}/paymentAccounts`));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setAccounts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `users/${auth.currentUser?.uid}/paymentAccounts`);
    });

    return () => unsubscribe();
  }, []);

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser || !amount || !fromAccount || !toAccount || fromAccount === toAccount) return;

    setLoading(true);
    try {
      const transferAmount = Number(amount);
      const transferRef = doc(collection(db, `users/${auth.currentUser.uid}/transfers`));
      
      const fromAcc = accounts.find(a => a.id === fromAccount);
      const toAcc = accounts.find(a => a.id === toAccount);

      // Create transfer record
      try {
        await setDoc(transferRef, {
          date: new Date().toISOString(),
          amount: transferAmount,
          fromAccountId: fromAccount,
          toAccountId: toAccount,
          currency: fromAcc?.currency || 'JPY',
          notes: notes,
          createdAt: new Date().toISOString()
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `users/${auth.currentUser.uid}/transfers`);
      }

      // Update balances
      const fromRef = doc(db, `users/${auth.currentUser.uid}/paymentAccounts/${fromAccount}`);
      const toRef = doc(db, `users/${auth.currentUser.uid}/paymentAccounts/${toAccount}`);

      try {
        await updateDoc(fromRef, { balance: increment(-transferAmount) });
        await updateDoc(toRef, { balance: increment(transferAmount) });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `users/${auth.currentUser.uid}/paymentAccounts`);
      }

      navigate('/');
    } catch (error) {
      console.error("Error transferring funds:", error);
      alert("轉帳失敗，請重試");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 max-w-md mx-auto bg-background min-h-screen">
      <header className="mb-8">
        <h1 className="text-2xl font-serif font-bold text-ink flex items-center gap-2 tracking-tight">
          <ArrowRightLeft className="w-6 h-6 text-primary-blue" />
          內部資金轉移
        </h1>
        <p className="text-[10px] font-bold text-ink/40 uppercase tracking-widest mt-2 ml-8">例如：信用卡儲值 Suica 交通卡</p>
      </header>

      <form onSubmit={handleTransfer} className="space-y-6">
        <div className="bg-card-white p-8 rounded-[40px] shadow-sm border border-divider space-y-8">
          
          {/* Amount */}
          <div className="space-y-2">
            <label className="block text-[10px] font-bold text-ink/40 uppercase tracking-widest ml-4">轉帳金額 ({accounts.find(a => a.id === fromAccount)?.currency || '¥'})</label>
            <div className="relative">
              <span className="absolute left-6 top-1/2 -translate-y-1/2 text-ink/20 font-serif text-2xl">{accounts.find(a => a.id === fromAccount)?.currency || '¥'}</span>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full pl-16 pr-6 py-6 bg-background border border-divider rounded-[24px] text-4xl font-serif font-bold text-ink focus:ring-4 focus:ring-primary-blue/10 outline-none transition-all"
                placeholder="0"
                required
              />
            </div>
          </div>

          {/* From Account */}
          <div className="space-y-2">
            <label className="block text-[10px] font-bold text-ink/40 uppercase tracking-widest ml-4 flex items-center gap-1">
              <ArrowUp className="w-3 h-3 text-red-400" /> 轉出帳戶
            </label>
            <div className="relative">
              <select
                value={fromAccount}
                onChange={(e) => setFromAccount(e.target.value)}
                className="w-full p-5 bg-background border border-divider rounded-[24px] focus:ring-4 focus:ring-primary-blue/10 outline-none appearance-none text-ink font-bold tracking-tight"
                required
              >
                <option value="" disabled>選擇轉出帳戶</option>
                {accounts.map(acc => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} ({acc.currency} {acc.balance.toLocaleString()})
                  </option>
                ))}
              </select>
              <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-ink/20">
                <ArrowDown className="w-4 h-4" />
              </div>
            </div>
          </div>

          {/* To Account */}
          <div className="space-y-2">
            <label className="block text-[10px] font-bold text-ink/40 uppercase tracking-widest ml-4 flex items-center gap-1">
              <ArrowDown className="w-3 h-3 text-green-400" /> 轉入帳戶
            </label>
            <div className="relative">
              <select
                value={toAccount}
                onChange={(e) => setToAccount(e.target.value)}
                className="w-full p-5 bg-background border border-divider rounded-[24px] focus:ring-4 focus:ring-primary-blue/10 outline-none appearance-none text-ink font-bold tracking-tight"
                required
              >
                <option value="" disabled>選擇轉入帳戶</option>
                {accounts.map(acc => (
                  <option key={acc.id} value={acc.id} disabled={acc.id === fromAccount}>
                    {acc.name} ({acc.currency} {acc.balance.toLocaleString()})
                  </option>
                ))}
              </select>
              <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-ink/20">
                <ArrowDown className="w-4 h-4" />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <label className="block text-[10px] font-bold text-ink/40 uppercase tracking-widest ml-4">備註 (選填)</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full p-5 bg-background border border-divider rounded-[24px] focus:ring-4 focus:ring-primary-blue/10 outline-none text-ink font-medium"
              placeholder="例如：儲值西瓜卡"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading || !amount || !fromAccount || !toAccount || fromAccount === toAccount}
          className="w-full bg-primary-blue text-white font-bold text-lg p-6 rounded-[24px] shadow-xl shadow-primary-blue/20 hover:bg-primary-blue/90 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-[0.2em] text-sm"
        >
          {loading ? '處理中...' : '確認轉帳'}
        </button>
      </form>
    </div>
  );
}
