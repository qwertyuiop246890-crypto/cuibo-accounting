import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, setDoc, collection, onSnapshot, query, deleteDoc, updateDoc, increment } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';
import { Camera, Save, Plus, Trash2, ArrowLeft, Image as ImageIcon, Sparkles, X } from 'lucide-react';
import { format } from 'date-fns';
import { GoogleGenAI, Type } from '@google/genai';
import { Modal } from '../components/ui/Modal';
import { motion, AnimatePresence } from 'motion/react';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const compressImage = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 1024;
        const MAX_HEIGHT = 1024;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.6));
      };
      img.onerror = (error) => reject(error);
    };
    reader.onerror = (error) => reject(error);
  });
};

export function ReceiptDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = id === 'new';

  const [accounts, setAccounts] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [pendingAiItems, setPendingAiItems] = useState<any[]>([]);
  
  const [receipt, setReceipt] = useState({
    date: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
    totalAmount: 0,
    paymentAccountId: '',
    category: 'Business',
    subCategory: 'Food',
    currency: 'JPY',
    notes: '',
    photoUrl: ''
  });

  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editItemData, setEditItemData] = useState({ name: '', translatedName: '', price: '', quantity: '' });
  const [newItem, setNewItem] = useState({ name: '', translatedName: '', price: '', quantity: '1', notes: '' });
  const [showFullImage, setShowFullImage] = useState(false);
  const [originalTotalAmount, setOriginalTotalAmount] = useState(0);
  const [originalAccountId, setOriginalAccountId] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

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

    // Fetch Accounts
    const unsubAccounts = onSnapshot(collection(db, `users/${auth.currentUser.uid}/paymentAccounts`), (snap) => {
      setAccounts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `users/${auth.currentUser?.uid}/paymentAccounts`);
    });

    return () => { unsubAccounts(); };
  }, []);

  useEffect(() => {
    if (isNew || !auth.currentUser || !id) return;

    const fetchReceipt = async () => {
      const docRef = doc(db, `users/${auth.currentUser!.uid}/receipts/${id}`);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        setReceipt({
          date: data.date.slice(0, 16),
          totalAmount: data.totalAmount,
          paymentAccountId: data.paymentAccountId,
          category: data.category,
          subCategory: data.subCategory || 'Food',
          currency: data.currency || 'JPY',
          notes: data.notes || '',
          photoUrl: data.photoUrl || ''
        });
        setOriginalTotalAmount(data.totalAmount);
        setOriginalAccountId(data.paymentAccountId);
      }
    };

    const unsubItems = onSnapshot(collection(db, `users/${auth.currentUser.uid}/receipts/${id}/items`), (snap) => {
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `users/${auth.currentUser?.uid}/receipts/${id}/items`);
    });

    fetchReceipt();
    return () => unsubItems();
  }, [id, isNew]);

  // Auto-calculate total from items if any exist
  useEffect(() => {
    if (items.length > 0 || pendingAiItems.length > 0) {
      const savedTotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      const pendingTotal = pendingAiItems.reduce((sum, item) => sum + ((item.price || 0) * (item.quantity || 1)), 0);
      setReceipt(prev => ({ ...prev, totalAmount: savedTotal + pendingTotal }));
    }
  }, [items, pendingAiItems]);

  const selectedAccount = useMemo(() => {
    return accounts.find(a => a.id === receipt.paymentAccountId);
  }, [accounts, receipt.paymentAccountId]);

  const currencySymbol = selectedAccount?.currency || receipt.currency || 'JPY';

  const handleSaveReceipt = async () => {
    if (!auth.currentUser || !receipt.paymentAccountId || !receipt.date) return;
    setLoading(true);

    try {
      const receiptId = isNew ? doc(collection(db, `users/${auth.currentUser.uid}/receipts`)).id : id!;
      const receiptRef = doc(db, `users/${auth.currentUser.uid}/receipts/${receiptId}`);
      
      const selectedAccount = accounts.find(a => a.id === receipt.paymentAccountId);
      const receiptData = {
        ...receipt,
        currency: selectedAccount?.currency || 'JPY',
        date: new Date(receipt.date).toISOString(),
        totalAmount: Number(receipt.totalAmount),
        createdAt: isNew ? new Date().toISOString() : ((await getDoc(receiptRef)).data()?.createdAt || new Date().toISOString())
      };

      try {
        await setDoc(receiptRef, receiptData, { merge: true });
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `users/${auth.currentUser.uid}/receipts/${receiptId}`);
      }

      // Save pending items
      if (pendingAiItems.length > 0) {
        for (const item of pendingAiItems) {
          const itemRef = doc(collection(db, `users/${auth.currentUser.uid}/receipts/${receiptId}/items`));
          try {
            await setDoc(itemRef, {
              name: item.name || 'Unknown Item',
              translatedName: item.translatedName || '',
              price: Number(item.price) || 0,
              quantity: Number(item.quantity) || 1,
              notes: item.notes || '',
              createdAt: new Date().toISOString()
            });
          } catch (error) {
            handleFirestoreError(error, OperationType.WRITE, `users/${auth.currentUser.uid}/receipts/${receiptId}/items`);
          }
        }
        setPendingAiItems([]);
      }

      // Update account balance
      if (isNew) {
        const accountRef = doc(db, `users/${auth.currentUser.uid}/paymentAccounts/${receipt.paymentAccountId}`);
        try {
          await updateDoc(accountRef, { balance: increment(-Number(receipt.totalAmount)) });
        } catch (error) {
          handleFirestoreError(error, OperationType.UPDATE, `users/${auth.currentUser.uid}/paymentAccounts/${receipt.paymentAccountId}`);
        }
      } else {
        // Handle changes in existing receipt
        const diff = Number(receipt.totalAmount) - originalTotalAmount;
        
        if (receipt.paymentAccountId === originalAccountId) {
          // Same account, just update the difference
          if (diff !== 0) {
            const accountRef = doc(db, `users/${auth.currentUser.uid}/paymentAccounts/${receipt.paymentAccountId}`);
            try {
              await updateDoc(accountRef, { balance: increment(-diff) });
            } catch (error) {
              handleFirestoreError(error, OperationType.UPDATE, `users/${auth.currentUser.uid}/paymentAccounts/${receipt.paymentAccountId}`);
            }
          }
        } else {
          // Account changed: restore old, deduct from new
          const oldAccountRef = doc(db, `users/${auth.currentUser.uid}/paymentAccounts/${originalAccountId}`);
          const newAccountRef = doc(db, `users/${auth.currentUser.uid}/paymentAccounts/${receipt.paymentAccountId}`);
          
          try {
            await updateDoc(oldAccountRef, { balance: increment(originalTotalAmount) });
            await updateDoc(newAccountRef, { balance: increment(-Number(receipt.totalAmount)) });
          } catch (error) {
            handleFirestoreError(error, OperationType.UPDATE, `users/${auth.currentUser.uid}/paymentAccounts`);
          }
        }
        setOriginalTotalAmount(Number(receipt.totalAmount));
        setOriginalAccountId(receipt.paymentAccountId);
      }

      if (isNew) {
        navigate(`/receipt/${receiptId}`, { replace: true });
      } else {
        setModalConfig({
          isOpen: true,
          title: '儲存成功',
          message: '單據資訊已更新。',
          type: 'success'
        });
      }
    } catch (error) {
      console.error("Error saving receipt:", error);
      setModalConfig({
        isOpen: true,
        title: '儲存失敗',
        message: '發生錯誤，請稍後再試。',
        type: 'error'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser || !id) return;

    if (isNew) {
      setPendingAiItems(prev => [...prev, {
        name: newItem.name,
        translatedName: newItem.translatedName,
        price: Number(newItem.price),
        quantity: Number(newItem.quantity),
        notes: newItem.notes
      }]);
      setNewItem({ name: '', translatedName: '', price: '', quantity: '1', notes: '' });
      return;
    }

    const itemRef = doc(collection(db, `users/${auth.currentUser.uid}/receipts/${id}/items`));
    try {
      await setDoc(itemRef, {
        name: newItem.name,
        translatedName: newItem.translatedName,
        price: Number(newItem.price),
        quantity: Number(newItem.quantity),
        notes: newItem.notes,
        createdAt: new Date().toISOString()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${auth.currentUser.uid}/receipts/${id}/items`);
    }

    setNewItem({ name: '', translatedName: '', price: '', quantity: '1', notes: '' });
  };

  const handleUpdateItem = async (itemId: string) => {
    if (!auth.currentUser || !id) return;
    const itemRef = doc(db, `users/${auth.currentUser.uid}/receipts/${id}/items/${itemId}`);
    try {
      await updateDoc(itemRef, {
        name: editItemData.name,
        translatedName: editItemData.translatedName,
        price: Number(editItemData.price),
        quantity: Number(editItemData.quantity)
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${auth.currentUser.uid}/receipts/${id}/items/${itemId}`);
    }
    setEditingItemId(null);
  };

  const startEditing = (item: any) => {
    setEditingItemId(item.id);
    setEditItemData({
      name: item.name,
      translatedName: item.translatedName || '',
      price: item.price.toString(),
      quantity: item.quantity.toString()
    });
  };

  const handleDeleteItem = async (itemId: string) => {
    if (!auth.currentUser || !id) return;
    setModalConfig({
      isOpen: true,
      title: '確認刪除',
      message: '確定要刪除此項目嗎？',
      type: 'confirm',
      onConfirm: async () => {
        const itemRef = doc(db, `users/${auth.currentUser!.uid}/receipts/${id}/items/${itemId}`);
        try {
          await deleteDoc(itemRef);
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, `users/${auth.currentUser?.uid}/receipts/${id}/items/${itemId}`);
        }
      }
    });
  };

  const handlePhotoUpload = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleGalleryUpload = () => {
    if (galleryInputRef.current) {
      galleryInputRef.current.click();
    }
  };

  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState('');

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !auth.currentUser) return;

    setUploading(true);
    setUploadProgress(10);
    setUploadStatus('壓縮照片中...');

    try {
      const compressedDataUrl = await compressImage(file);
      setReceipt(prev => ({ ...prev, photoUrl: compressedDataUrl }));
      
      setUploadProgress(30);
      setUploadStatus('AI 辨識中...');

      const base64Data = compressedDataUrl.split(',')[1];
      const mimeType = compressedDataUrl.split(';')[0].split(':')[1];

      const prompt = `
        Analyze this receipt. Extract the date (YYYY-MM-DDTHH:mm format), total amount, and a list of items.
        For each item, extract the original name (name) and translate it to Traditional Chinese (translatedName).
        If you cannot find a date, omit it. If you cannot find items, return an empty array.
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: {
          parts: [
            {
              inlineData: {
                data: base64Data,
                mimeType: mimeType
              }
            },
            {
              text: prompt
            }
          ]
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              date: { type: Type.STRING },
              totalAmount: { type: Type.NUMBER },
              items: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING, description: "Original name from receipt" },
                    translatedName: { type: Type.STRING, description: "Traditional Chinese translation" },
                    price: { type: Type.NUMBER },
                    quantity: { type: Type.NUMBER }
                  }
                }
              }
            }
          }
        }
      });

      setUploadProgress(90);
      setUploadStatus('處理資料中...');

      const result = JSON.parse(response.text || '{}');
      
      const newReceiptData = {
        ...receipt,
        photoUrl: compressedDataUrl,
        totalAmount: result.totalAmount || receipt.totalAmount,
        date: result.date ? result.date.slice(0, 16) : receipt.date,
      };

      setReceipt(newReceiptData);

      if (result.items && result.items.length > 0) {
        const newItems = result.items.map((item: any) => ({
          name: item.name || 'Unknown Item',
          translatedName: item.translatedName || '',
          price: Number(item.price) || 0,
          quantity: Number(item.quantity) || 1,
          notes: 'AI 自動辨識'
        }));
        setPendingAiItems(prev => [...prev, ...newItems]);
      }
      
      setModalConfig({
        isOpen: true,
        title: '辨識完成',
        message: 'AI 已成功辨識單據資訊！請確認明細後點擊「儲存單據」。',
        type: 'success'
      });

    } catch (error) {
      console.error("Error processing receipt:", error);
      setModalConfig({
        isOpen: true,
        title: '辨識失敗',
        message: '照片處理或 AI 辨識發生錯誤，請重試。',
        type: 'error'
      });
    } finally {
      setUploading(false);
      setUploadProgress(0);
      setUploadStatus('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (galleryInputRef.current) galleryInputRef.current.value = '';
    }
  };

  return (
    <div className="p-4 max-w-md mx-auto pb-24 bg-background min-h-screen">
      <header className="flex items-center gap-4 mb-6">
        <button onClick={() => navigate(-1)} className="p-2 bg-card-white rounded-full shadow-sm border border-divider">
          <ArrowLeft className="w-5 h-5 text-ink" />
        </button>
        <h1 className="text-2xl font-serif font-bold text-ink">{isNew ? '新增單據' : '單據詳情'}</h1>
      </header>

      <div className="space-y-6">
        {/* Hidden File Input for Camera */}
        <input 
          type="file" 
          accept="image/*" 
          capture="environment"
          ref={fileInputRef} 
          onChange={handleFileChange} 
          className="hidden" 
        />

        {/* Hidden File Input for Gallery */}
        <input 
          type="file" 
          accept="image/*" 
          ref={galleryInputRef} 
          onChange={handleFileChange} 
          className="hidden" 
        />

        {isNew && (
          <div className="bg-card-white text-ink text-sm p-6 rounded-3xl border border-divider flex items-start gap-4 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-primary-blue/5 rounded-full -mr-8 -mt-8" />
            <div className="bg-primary-blue p-2.5 rounded-2xl shadow-sm shadow-primary-blue/20 relative z-10">
              <Sparkles className="w-5 h-5 text-white shrink-0" />
            </div>
            <div className="flex-1 relative z-10">
              <p className="font-serif font-bold text-ink text-lg mb-1">AI 智慧辨識</p>
              <p className="text-ink/70 leading-relaxed font-medium">
                請先上傳單據照片，AI 將自動為您解析明細，最後確認支付方式即可快速完成記帳。
              </p>
            </div>
          </div>
        )}

        {/* Photo Section */}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <button 
              onClick={!uploading ? handlePhotoUpload : undefined}
              disabled={uploading}
              className={`w-full h-36 bg-card-white rounded-3xl border border-divider flex flex-col items-center justify-center overflow-hidden relative group shadow-sm transition-all ${!uploading ? 'cursor-pointer hover:shadow-md hover:border-primary-blue/30 active:scale-95' : 'opacity-50'}`}
            >
              <div className="bg-background p-4 rounded-2xl mb-3 group-hover:bg-primary-blue/10 transition-colors">
                <Camera className="w-8 h-8 text-primary-blue" />
              </div>
              <span className="text-sm font-bold text-ink">拍照</span>
            </button>
            <button 
              onClick={!uploading ? handleGalleryUpload : undefined}
              disabled={uploading}
              className={`w-full h-36 bg-card-white rounded-3xl border border-divider flex flex-col items-center justify-center overflow-hidden relative group shadow-sm transition-all ${!uploading ? 'cursor-pointer hover:shadow-md hover:border-primary-blue/30 active:scale-95' : 'opacity-50'}`}
            >
              <div className="bg-background p-4 rounded-2xl mb-3 group-hover:bg-primary-blue/10 transition-colors">
                <ImageIcon className="w-8 h-8 text-primary-blue" />
              </div>
              <span className="text-sm font-bold text-ink">從相簿選擇</span>
            </button>
          </div>

          {uploading && (
            <div className="w-full h-48 bg-background rounded-3xl border-2 border-dashed border-divider flex flex-col items-center justify-center overflow-hidden relative">
              <div className="flex flex-col items-center justify-center w-full h-full bg-ink/80 text-white z-10 absolute inset-0 px-6">
                <div className="w-16 h-16 border-4 border-white/20 border-t-white rounded-full animate-spin mb-4"></div>
                <span className="font-bold text-sm mb-2 tracking-widest">{uploadStatus || '處理中...'}</span>
                <div className="w-full max-w-[200px] bg-white/20 rounded-full h-2 overflow-hidden">
                  <div 
                    className="bg-primary-blue h-full transition-all duration-300 ease-out" 
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          {receipt.photoUrl && !uploading && (
            <div 
              className="w-full h-48 bg-background rounded-3xl border-2 border-dashed border-divider flex flex-col items-center justify-center overflow-hidden relative group cursor-pointer"
              onClick={() => setShowFullImage(true)}
            >
              <img src={receipt.photoUrl} alt="Receipt" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              <div className="absolute inset-0 bg-ink/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <Sparkles className="w-8 h-8 text-white" />
                <span className="text-white font-bold ml-2">點擊放大</span>
              </div>
            </div>
          )}
        </div>

        {/* Full Screen Image Modal */}
        <AnimatePresence>
          {showFullImage && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4"
              onClick={() => setShowFullImage(false)}
            >
              <motion.img 
                initial={{ scale: 0.9 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0.9 }}
                src={receipt.photoUrl} 
                className="max-w-full max-h-full object-contain rounded-xl"
                alt="Full Receipt"
              />
              <button className="absolute top-6 right-6 text-white p-2 bg-white/10 rounded-full">
                <X className="w-6 h-6" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Items Section */}
        <div className="bg-card-white p-6 rounded-3xl shadow-sm border border-divider space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-serif font-bold text-ink">單據明細</h2>
            <span className="text-[10px] font-bold text-ink/30 uppercase tracking-widest">Items</span>
          </div>
          
          <div className="space-y-3">
            {items.map(item => (
              <div key={item.id} className="p-4 bg-background rounded-2xl border border-divider">
                {editingItemId === item.id ? (
                  <div className="space-y-3">
                    <input
                      type="text"
                      value={editItemData.name}
                      onChange={e => setEditItemData({...editItemData, name: e.target.value})}
                      className="w-full p-2 bg-white border border-divider rounded-xl outline-none text-ink font-bold"
                      placeholder="原文名稱"
                    />
                    <input
                      type="text"
                      value={editItemData.translatedName}
                      onChange={e => setEditItemData({...editItemData, translatedName: e.target.value})}
                      className="w-full p-2 bg-white border border-divider rounded-xl outline-none text-ink/60 text-xs"
                      placeholder="中文翻譯"
                    />
                    <div className="flex gap-2">
                      <input
                        type="number"
                        value={editItemData.price}
                        onChange={e => setEditItemData({...editItemData, price: e.target.value})}
                        className="flex-1 p-2 bg-white border border-divider rounded-xl outline-none text-ink font-bold"
                        placeholder="單價"
                      />
                      <input
                        type="number"
                        value={editItemData.quantity}
                        onChange={e => setEditItemData({...editItemData, quantity: e.target.value})}
                        className="w-20 p-2 bg-white border border-divider rounded-xl outline-none text-ink font-bold text-center"
                        placeholder="數量"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => handleUpdateItem(item.id)}
                        className="flex-1 bg-primary-blue text-white font-bold py-2 rounded-xl text-xs"
                      >
                        儲存
                      </button>
                      <button 
                        onClick={() => setEditingItemId(null)}
                        className="flex-1 bg-ink/10 text-ink font-bold py-2 rounded-xl text-xs"
                      >
                        取消
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-between items-center">
                    <div className="cursor-pointer flex-1" onClick={() => startEditing(item)}>
                      <p className="font-bold text-ink">{item.name}</p>
                      {item.translatedName && (
                        <p className="text-[10px] font-bold text-ink/40 mb-1">{item.translatedName}</p>
                      )}
                      <p className="text-[10px] font-bold text-ink/50 uppercase tracking-wider">{currencySymbol} {item.price} x {item.quantity}</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="font-serif font-bold text-ink">{currencySymbol} {(item.price * item.quantity).toLocaleString()}</span>
                      <button onClick={() => handleDeleteItem(item.id)} className="text-red-400 p-1 hover:bg-red-50 rounded-lg transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {pendingAiItems.map((item, idx) => (
              <div key={`pending-${idx}`} className="flex justify-between items-center p-4 bg-primary-blue/5 rounded-2xl border border-primary-blue/20">
                <div>
                  <p className="font-bold text-ink flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-primary-blue" />
                    {item.name}
                  </p>
                  {item.translatedName && (
                    <p className="text-[10px] font-bold text-ink/40 mb-1 ml-4">{item.translatedName}</p>
                  )}
                  <p className="text-[10px] font-bold text-primary-blue/70 uppercase tracking-wider">{currencySymbol} {item.price} x {item.quantity} (待儲存)</p>
                </div>
                <div className="flex items-center gap-4">
                  <span className="font-serif font-bold text-ink">{currencySymbol} {((item.price * item.quantity) || 0).toLocaleString()}</span>
                  <button onClick={() => setPendingAiItems(prev => prev.filter((_, i) => i !== idx))} className="text-red-400 p-1 hover:bg-red-50 rounded-lg transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <form onSubmit={handleAddItem} className="pt-6 border-t border-divider space-y-4">
            <div className="space-y-2">
              <input
                type="text"
                placeholder="品名 (原文)"
                value={newItem.name}
                onChange={e => setNewItem({...newItem, name: e.target.value})}
                className="w-full p-4 bg-background border border-divider rounded-2xl focus:ring-2 focus:ring-primary-blue outline-none font-bold text-ink placeholder:text-ink/30"
                required
              />
              <input
                type="text"
                placeholder="中文翻譯 (選填)"
                value={newItem.translatedName}
                onChange={e => setNewItem({...newItem, translatedName: e.target.value})}
                className="w-full p-3 bg-background border border-divider rounded-2xl focus:ring-2 focus:ring-primary-blue outline-none text-sm text-ink/60 placeholder:text-ink/20"
              />
            </div>
            <div className="flex gap-4">
              <input
                type="number"
                placeholder={`單價 (${currencySymbol})`}
                value={newItem.price}
                onChange={e => setNewItem({...newItem, price: e.target.value})}
                className="flex-1 p-4 bg-background border border-divider rounded-2xl focus:ring-2 focus:ring-primary-blue outline-none font-bold text-ink placeholder:text-ink/30"
                required
              />
              <input
                type="number"
                placeholder="數量"
                value={newItem.quantity}
                onChange={e => setNewItem({...newItem, quantity: e.target.value})}
                className="w-24 p-4 bg-background border border-divider rounded-2xl focus:ring-2 focus:ring-primary-blue outline-none font-bold text-ink placeholder:text-ink/30 text-center"
                required
                min="1"
              />
            </div>
            <button type="submit" className="w-full bg-ink text-white font-bold p-4 rounded-2xl hover:opacity-90 flex items-center justify-center gap-2 transition-all active:scale-95">
              <Plus className="w-5 h-5" />
              新增明細
            </button>
          </form>
        </div>

        {/* Basic Info Form (Payment Section) */}
        <div className="bg-card-white p-6 rounded-3xl shadow-sm border border-divider space-y-6">
          <h2 className="text-lg font-serif font-bold text-ink">支付與類別</h2>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-ink/40 mb-1.5 uppercase tracking-widest">日期時間</label>
              <input
                type="datetime-local"
                value={receipt.date}
                onChange={e => setReceipt({...receipt, date: e.target.value})}
                className="w-full p-4 bg-background border border-divider rounded-2xl focus:ring-2 focus:ring-primary-blue outline-none font-bold text-ink text-xs"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-ink/40 mb-1.5 uppercase tracking-widest">總金額 ({currencySymbol})</label>
              <input
                type="number"
                value={receipt.totalAmount}
                onChange={e => setReceipt({...receipt, totalAmount: Number(e.target.value)})}
                disabled={items.length > 0 || pendingAiItems.length > 0}
                className="w-full p-4 bg-background border border-divider rounded-2xl focus:ring-2 focus:ring-primary-blue outline-none disabled:opacity-50 font-serif font-bold text-ink text-lg"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-ink/40 mb-1.5 uppercase tracking-widest">支付方式 <span className="text-red-400">*</span></label>
            <select
              value={receipt.paymentAccountId}
              onChange={e => setReceipt({...receipt, paymentAccountId: e.target.value})}
              className="w-full p-4 bg-background border border-divider rounded-2xl focus:ring-2 focus:ring-primary-blue outline-none font-bold text-ink appearance-none"
            >
              <option value="">選擇支付帳戶</option>
              {accounts.map(a => (
                <option key={a.id} value={a.id}>{a.name} ({a.currency} {a.balance.toLocaleString()})</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-ink/40 mb-1.5 uppercase tracking-widest">支出類別</label>
              <select
                value={receipt.category}
                onChange={e => setReceipt({...receipt, category: e.target.value})}
                className="w-full p-4 bg-background border border-divider rounded-2xl focus:ring-2 focus:ring-primary-blue outline-none font-bold text-ink appearance-none"
              >
                <option value="Business">進貨 (Business)</option>
                <option value="Personal">私人 (Personal)</option>
              </select>
            </div>
            {receipt.category === 'Personal' && (
              <div>
                <label className="block text-[10px] font-bold text-ink/40 mb-1.5 uppercase tracking-widest">子類別</label>
                <input
                  list="personal-categories"
                  value={receipt.subCategory}
                  onChange={e => setReceipt({...receipt, subCategory: e.target.value})}
                  className="w-full p-4 bg-background border border-divider rounded-2xl focus:ring-2 focus:ring-primary-blue outline-none font-bold text-ink"
                  placeholder="輸入或選擇類別"
                />
                <datalist id="personal-categories">
                  {['Food', 'Clothing', 'Housing', 'Transport', 'Education', 'Entertainment', 'Other'].map(cat => (
                    <option key={cat} value={cat} />
                  ))}
                </datalist>
              </div>
            )}
          </div>

          <button
            onClick={handleSaveReceipt}
            disabled={loading || !receipt.paymentAccountId}
            className="w-full bg-primary-blue text-white font-bold p-5 rounded-3xl shadow-lg shadow-primary-blue/20 hover:opacity-90 transition-all flex items-center justify-center gap-2 disabled:opacity-50 active:scale-95"
          >
            <Save className="w-5 h-5" />
            {isNew ? '確認並儲存單據' : '儲存單據變更'}
          </button>
        </div>
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
