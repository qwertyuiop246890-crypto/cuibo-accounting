import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';
import { Plus, Trash2, CreditCard, LogOut } from 'lucide-react';
import { signOut } from 'firebase/auth';

export function Settings() {
  const [accounts, setAccounts] = useState<any[]>([]);
  
  const [newAccountName, setNewAccountName] = useState('');
  const [newAccountType, setNewAccountType] = useState('JPY Cash');
  const [newAccountCurrency, setNewAccountCurrency] = useState('JPY');
  const [newAccountBalance, setNewAccountBalance] = useState('');

  const existingTypes = Array.from(new Set(accounts.map(a => a.type || 'JPY Cash')));
  const existingCurrencies = Array.from(new Set(accounts.map(a => a.currency || 'JPY')));

  useEffect(() => {
    if (!auth.currentUser) return;

    const accountsQ = query(collection(db, `users/${auth.currentUser.uid}/paymentAccounts`));
    const unsubAccounts = onSnapshot(accountsQ, (snapshot) => {
      setAccounts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `users/${auth.currentUser?.uid}/paymentAccounts`);
    });

    return () => {
      unsubAccounts();
    };
  }, []);

  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAccountName.trim() || !newAccountBalance || !auth.currentUser) return;
    
    const accountRef = doc(collection(db, `users/${auth.currentUser.uid}/paymentAccounts`));
    try {
      await setDoc(accountRef, {
        name: newAccountName,
        type: newAccountType,
        balance: Number(newAccountBalance),
        currency: newAccountCurrency,
        createdAt: new Date().toISOString()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${auth.currentUser.uid}/paymentAccounts`);
    }
    
    setNewAccountName('');
    setNewAccountBalance('');
  };

  const handleDeleteAccount = async (id: string) => {
    if (!auth.currentUser) return;
    try {
      await deleteDoc(doc(db, `users/${auth.currentUser.uid}/paymentAccounts/${id}`));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `users/${auth.currentUser.uid}/paymentAccounts/${id}`);
    }
  };

  return (
    <div className="p-4 max-w-md mx-auto space-y-8 bg-background min-h-screen">
      <header className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-serif font-bold text-ink tracking-tight">設定</h1>
        <button 
          onClick={() => signOut(auth)}
          className="p-3 text-red-500 bg-card-white border border-divider rounded-2xl shadow-sm hover:bg-red-50 transition-colors"
        >
          <LogOut className="w-5 h-5" />
        </button>
      </header>

      {/* Payment Accounts Section */}
      <section className="bg-card-white p-8 rounded-[40px] shadow-sm border border-divider">
        <h2 className="text-lg font-serif font-bold text-ink flex items-center gap-2 mb-8 uppercase tracking-widest">
          <CreditCard className="w-5 h-5 text-primary-blue" />
          支付帳戶管理
        </h2>
        
        <form onSubmit={handleAddAccount} className="space-y-4 mb-8">
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-ink/40 uppercase tracking-widest ml-4">帳戶名稱</label>
            <input
              type="text"
              placeholder="如: 老闆A銀行卡"
              value={newAccountName}
              onChange={(e) => setNewAccountName(e.target.value)}
              className="w-full p-4 bg-background border border-divider rounded-2xl focus:ring-2 focus:ring-primary-blue/20 outline-none text-ink font-medium"
              required
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-ink/40 uppercase tracking-widest ml-4">類型</label>
              <input
                list="account-types"
                value={newAccountType}
                onChange={(e) => setNewAccountType(e.target.value)}
                placeholder="選擇或輸入類型"
                className="w-full p-4 bg-background border border-divider rounded-2xl focus:ring-2 focus:ring-primary-blue/20 outline-none text-ink font-medium"
              />
              <datalist id="account-types">
                {existingTypes.map(type => (
                  <option key={type} value={type} />
                ))}
                {!existingTypes.includes('JPY Cash') && <option value="JPY Cash" />}
                {!existingTypes.includes('Credit Card') && <option value="Credit Card" />}
                {!existingTypes.includes('IC Card') && <option value="IC Card" />}
              </datalist>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-ink/40 uppercase tracking-widest ml-4">幣別</label>
              <input
                list="account-currencies"
                value={newAccountCurrency}
                onChange={(e) => setNewAccountCurrency(e.target.value)}
                placeholder="如: JPY, TWD"
                className="w-full p-4 bg-background border border-divider rounded-2xl focus:ring-2 focus:ring-primary-blue/20 outline-none text-ink font-medium"
              />
              <datalist id="account-currencies">
                {existingCurrencies.map(curr => (
                  <option key={curr} value={curr} />
                ))}
                {!existingCurrencies.includes('JPY') && <option value="JPY" />}
                {!existingCurrencies.includes('TWD') && <option value="TWD" />}
                {!existingCurrencies.includes('USD') && <option value="USD" />}
              </datalist>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-ink/40 uppercase tracking-widest ml-4">初始餘額</label>
            <input
              type="number"
              placeholder="0"
              value={newAccountBalance}
              onChange={(e) => setNewAccountBalance(e.target.value)}
              className="w-full p-4 bg-background border border-divider rounded-2xl focus:ring-2 focus:ring-primary-blue/20 outline-none text-ink font-medium"
              required
            />
          </div>
          
          <button type="submit" className="w-full bg-primary-blue text-white font-bold p-4 rounded-2xl shadow-lg shadow-primary-blue/20 hover:bg-primary-blue/90 flex items-center justify-center gap-2 transition-all active:scale-95 uppercase tracking-widest text-xs">
            <Plus className="w-5 h-5" />
            新增帳戶
          </button>
        </form>

        <div className="space-y-4">
          <p className="text-[10px] font-bold text-ink/40 uppercase tracking-widest ml-4 mb-2">現有帳戶</p>
          {accounts.map(account => (
            <div key={account.id} className="flex justify-between items-center p-5 bg-background rounded-3xl border border-divider group transition-all hover:shadow-md">
              <div>
                <p className="font-serif font-bold text-ink text-lg">{account.name}</p>
                <div className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-widest text-ink/40 mt-1">
                  <span className="bg-divider px-2 py-0.5 rounded-full text-ink/60">{account.type}</span>
                  <span className="text-primary-blue">{account.currency || 'JPY'} {account.balance.toLocaleString()}</span>
                </div>
              </div>
              <button 
                onClick={() => handleDeleteAccount(account.id)} 
                className="p-3 text-ink/20 hover:text-red-500 hover:bg-red-50 rounded-2xl transition-all"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
          ))}
          {accounts.length === 0 && (
            <div className="text-center py-8 text-ink/30 text-sm font-medium">
              尚未設定支付帳戶
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
