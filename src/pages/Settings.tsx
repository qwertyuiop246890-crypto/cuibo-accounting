import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, doc, setDoc, deleteDoc, orderBy, updateDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';
import { Plus, Trash2, CreditCard, LogOut, ArrowUp, ArrowDown, Edit2, Check, X as CloseIcon } from 'lucide-react';
import { signOut } from 'firebase/auth';

export function Settings() {
  const [accounts, setAccounts] = useState<any[]>([]);
  
  const [newAccountName, setNewAccountName] = useState('');
  const [newAccountType, setNewAccountType] = useState('日幣現金');
  const [newAccountCurrency, setNewAccountCurrency] = useState('JPY');
  const [newAccountBalance, setNewAccountBalance] = useState('');

  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [editAccountData, setEditAccountData] = useState({ name: '', type: '', currency: '', balance: '' });

  const existingTypes = Array.from(new Set(accounts.map(a => a.type || '日幣現金')));
  const existingCurrencies = Array.from(new Set(accounts.map(a => a.currency || 'JPY')));

  useEffect(() => {
    if (!auth.currentUser) return;

    const accountsQ = query(collection(db, `users/${auth.currentUser.uid}/paymentAccounts`));
    const unsubAccounts = onSnapshot(accountsQ, (snapshot) => {
      const accountsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // Client-side sort to handle missing 'order' field in existing accounts
      const sortedAccounts = accountsData.sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0));
      setAccounts(sortedAccounts);
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
    const maxOrder = accounts.length > 0 ? Math.max(...accounts.map(a => a.order || 0)) : -1;
    
    try {
      await setDoc(accountRef, {
        name: newAccountName,
        type: newAccountType,
        balance: Number(newAccountBalance),
        currency: newAccountCurrency,
        order: maxOrder + 1,
        createdAt: new Date().toISOString()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${auth.currentUser.uid}/paymentAccounts`);
    }
    
    setNewAccountName('');
    setNewAccountBalance('');
  };

  const handleStartEdit = (account: any) => {
    setEditingAccountId(account.id);
    setEditAccountData({
      name: account.name,
      type: account.type,
      currency: account.currency,
      balance: account.balance.toString()
    });
  };

  const handleSaveEdit = async () => {
    if (!auth.currentUser || !editingAccountId) return;
    try {
      await updateDoc(doc(db, `users/${auth.currentUser.uid}/paymentAccounts/${editingAccountId}`), {
        name: editAccountData.name,
        type: editAccountData.type,
        currency: editAccountData.currency,
        balance: Number(editAccountData.balance)
      });
      setEditingAccountId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${auth.currentUser.uid}/paymentAccounts/${editingAccountId}`);
    }
  };

  const handleMoveAccount = async (index: number, direction: 'up' | 'down') => {
    if (!auth.currentUser) return;
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= accounts.length) return;

    const currentAccount = accounts[index];
    const targetAccount = accounts[targetIndex];

    try {
      const currentRef = doc(db, `users/${auth.currentUser.uid}/paymentAccounts/${currentAccount.id}`);
      const targetRef = doc(db, `users/${auth.currentUser.uid}/paymentAccounts/${targetAccount.id}`);

      // Swap orders
      const currentOrder = currentAccount.order ?? index;
      const targetOrder = targetAccount.order ?? targetIndex;

      await updateDoc(currentRef, { order: targetOrder });
      await updateDoc(targetRef, { order: currentOrder });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${auth.currentUser.uid}/paymentAccounts`);
    }
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
                {!existingTypes.includes('日幣現金') && <option value="日幣現金" />}
                {!existingTypes.includes('信用卡') && <option value="信用卡" />}
                {!existingTypes.includes('交通卡') && <option value="交通卡" />}
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
          {accounts.map((account, index) => (
            <div key={account.id} className="p-5 bg-background rounded-3xl border border-divider group transition-all hover:shadow-md">
              {editingAccountId === account.id ? (
                <div className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-[8px] font-bold text-ink/40 uppercase tracking-widest ml-2">帳戶名稱</label>
                    <input
                      type="text"
                      value={editAccountData.name}
                      onChange={e => setEditAccountData({...editAccountData, name: e.target.value})}
                      className="w-full p-3 bg-card-white border border-divider rounded-xl focus:ring-2 focus:ring-primary-blue/20 outline-none text-ink font-medium text-sm"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[8px] font-bold text-ink/40 uppercase tracking-widest ml-2">類型</label>
                      <input
                        list="account-types-edit"
                        value={editAccountData.type}
                        onChange={e => setEditAccountData({...editAccountData, type: e.target.value})}
                        className="w-full p-3 bg-card-white border border-divider rounded-xl focus:ring-2 focus:ring-primary-blue/20 outline-none text-ink font-medium text-sm"
                      />
                      <datalist id="account-types-edit">
                        {existingTypes.map(type => <option key={type} value={type} />)}
                      </datalist>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[8px] font-bold text-ink/40 uppercase tracking-widest ml-2">幣別</label>
                      <input
                        list="account-currencies-edit"
                        value={editAccountData.currency}
                        onChange={e => setEditAccountData({...editAccountData, currency: e.target.value})}
                        className="w-full p-3 bg-card-white border border-divider rounded-xl focus:ring-2 focus:ring-primary-blue/20 outline-none text-ink font-medium text-sm"
                      />
                      <datalist id="account-currencies-edit">
                        {existingCurrencies.map(curr => <option key={curr} value={curr} />)}
                      </datalist>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[8px] font-bold text-ink/40 uppercase tracking-widest ml-2">餘額</label>
                    <input
                      type="number"
                      value={editAccountData.balance}
                      onChange={e => setEditAccountData({...editAccountData, balance: e.target.value})}
                      className="w-full p-3 bg-card-white border border-divider rounded-xl focus:ring-2 focus:ring-primary-blue/20 outline-none text-ink font-medium text-sm"
                    />
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={handleSaveEdit}
                      className="flex-1 bg-primary-blue text-white font-bold py-2 rounded-xl flex items-center justify-center gap-1 text-xs"
                    >
                      <Check className="w-4 h-4" /> 儲存
                    </button>
                    <button
                      onClick={() => setEditingAccountId(null)}
                      className="flex-1 bg-divider text-ink/60 font-bold py-2 rounded-xl flex items-center justify-center gap-1 text-xs"
                    >
                      <CloseIcon className="w-4 h-4" /> 取消
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-4">
                    <div className="flex flex-col gap-1">
                      <button
                        onClick={() => handleMoveAccount(index, 'up')}
                        disabled={index === 0}
                        className="p-1 text-ink/20 hover:text-primary-blue disabled:opacity-0 transition-all"
                      >
                        <ArrowUp className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleMoveAccount(index, 'down')}
                        disabled={index === accounts.length - 1}
                        className="p-1 text-ink/20 hover:text-primary-blue disabled:opacity-0 transition-all"
                      >
                        <ArrowDown className="w-4 h-4" />
                      </button>
                    </div>
                    <div>
                      <p className="font-serif font-bold text-ink text-lg">{account.name}</p>
                      <div className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-widest text-ink/40 mt-1">
                        <span className="bg-divider px-2 py-0.5 rounded-full text-ink/60">{account.type}</span>
                        <span className="text-primary-blue">{account.currency || 'JPY'} {account.balance.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button 
                      onClick={() => handleStartEdit(account)} 
                      className="p-2 text-ink/20 hover:text-primary-blue hover:bg-primary-blue/5 rounded-xl transition-all"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => handleDeleteAccount(account.id)} 
                      className="p-2 text-ink/20 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
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
