import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, setDoc, collection, onSnapshot, query, deleteDoc, updateDoc, increment, orderBy } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';
import { Camera, Save, Plus, Trash2, ArrowLeft, Image as ImageIcon, Sparkles, X, ClipboardPaste } from 'lucide-react';
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
        const MAX_WIDTH = 800;
        const MAX_HEIGHT = 800;
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
        resolve(canvas.toDataURL('image/jpeg', 0.5));
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
    category: '進貨',
    subCategory: '飲食',
    currency: 'JPY',
    notes: '',
    photoUrl: '',
    photoUrls: [] as string[],
    storeName: ''
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
    const unsubAccounts = onSnapshot(
      collection(db, `users/${auth.currentUser.uid}/paymentAccounts`), 
      (snap) => {
        const accountsData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        const sortedAccounts = accountsData.sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0));
        setAccounts(sortedAccounts);
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, `users/${auth.currentUser?.uid}/paymentAccounts`);
      }
    );

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
          date: data.date ? data.date.slice(0, 16) : '',
          totalAmount: data.totalAmount || 0,
          paymentAccountId: data.paymentAccountId || '',
          category: data.category || '進貨',
          subCategory: data.subCategory || '飲食',
          currency: data.currency || 'JPY',
          notes: data.notes || '',
          photoUrl: data.photoUrl || '',
          photoUrls: data.photoUrls || [],
          storeName: data.storeName || '',
          totalDiscount: data.totalDiscount || 0,
          totalTaxRefund: data.totalTaxRefund || 0
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

  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      if (uploading || !auth.currentUser) return;
      
      const items = e.clipboardData?.items;
      if (!items) return;

      const imageFiles: File[] = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile();
          if (file) imageFiles.push(file);
        }
      }

      if (imageFiles.length > 0) {
        // Create a synthetic event object to reuse handleFileChange logic
        const syntheticEvent = {
          target: { files: imageFiles }
        } as unknown as React.ChangeEvent<HTMLInputElement>;
        
        await handleFileChange(syntheticEvent);
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [uploading, auth.currentUser, receipt]); // Dependencies for handlePaste

  const handlePasteFromClipboard = async () => {
    if (uploading || !auth.currentUser) return;
    
    try {
      const clipboardItems = await navigator.clipboard.read();
      const imageFiles: File[] = [];
      for (const clipboardItem of clipboardItems) {
        for (const type of clipboardItem.types) {
          if (type.startsWith('image/')) {
            const blob = await clipboardItem.getType(type);
            const file = new File([blob], "pasted-image.png", { type });
            imageFiles.push(file);
          }
        }
      }
      
      if (imageFiles.length > 0) {
        const syntheticEvent = {
          target: { files: imageFiles }
        } as unknown as React.ChangeEvent<HTMLInputElement>;
        await handleFileChange(syntheticEvent);
      } else {
        setModalConfig({
          isOpen: true,
          title: '剪貼簿無圖片',
          message: '您的剪貼簿中沒有圖片，請先複製圖片後再試。',
          type: 'error'
        });
      }
    } catch (err) {
      console.error("Failed to read clipboard contents: ", err);
      setModalConfig({
        isOpen: true,
        title: '無法讀取剪貼簿',
        message: '請允許瀏覽器讀取剪貼簿權限，或直接使用鍵盤 Ctrl+V / Cmd+V 貼上。',
        type: 'error'
      });
    }
  };

  // Auto-calculate total from items if any exist
  useEffect(() => {
    if (items.length > 0 || pendingAiItems.length > 0) {
      const savedTotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      const pendingTotal = pendingAiItems.reduce((sum, item) => sum + ((item.price || 0) * (item.quantity || 1)), 0);
      setReceipt(prev => ({ ...prev, totalAmount: savedTotal + pendingTotal }));
    }
  }, [items, pendingAiItems]);

  const currencySymbol = receipt.currency || 'JPY';

  const handleSaveReceipt = async () => {
    if (!auth.currentUser || !receipt.paymentAccountId || !receipt.date) return;
    setLoading(true);

    try {
      const receiptId = isNew ? doc(collection(db, `users/${auth.currentUser.uid}/receipts`)).id : id!;
      const receiptRef = doc(db, `users/${auth.currentUser.uid}/receipts/${receiptId}`);
      
      const receiptData = {
        ...receipt,
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
        navigate('/', { replace: true });
      } else {
        navigate('/', { replace: true });
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
    const files = Array.from(e.target.files || []);
    if (files.length === 0 || !auth.currentUser) return;

    setUploading(true);
    setUploadProgress(10);
    setUploadStatus(`壓縮 ${files.length} 張照片中...`);

    try {
      const compressedDataUrls = await Promise.all(files.map((file: File) => compressImage(file)));
      
      setReceipt(prev => ({ 
        ...prev, 
        photoUrl: compressedDataUrls[0], // Keep first for backward compatibility
        photoUrls: compressedDataUrls 
      }));
      
      setUploadProgress(30);
      setUploadStatus('AI 辨識中...');

      const parts: any[] = compressedDataUrls.map(dataUrl => {
        const base64Data = dataUrl.split(',')[1];
        const mimeType = dataUrl.split(';')[0].split(':')[1];
        return {
          inlineData: {
            data: base64Data,
            mimeType: mimeType
          }
        };
      });

      const prompt = `
        [角色任務]：你是一名精準的財務數據分析專家，專精於從多國語言的收據照片中萃取結構化資料。
        [背景資訊]：使用者上傳了一張或多張收據照片（可能為長收據的拼接）。需要將這些圖像轉換為精確的 JSON 財務數據，以供記帳系統使用。
        [具體指令]：
        1. 提取商店名稱 (storeName)、日期 (date, 格式 YYYY-MM-DDTHH:mm) 與 總金額 (totalAmount)。
        2. 提取所有購買項目 (items)。必須「同時保留」原始名稱與翻譯：將收據上的原文完全照抄填入 (name)，並將其精確翻譯為繁體中文填入 (translatedName)。兩者皆須提供，單價填入 (price)，數量填入 (quantity)。
        3. 獨立列出稅金：若收據包含稅金 (如 VAT, GST, 消費稅)，必須將其作為獨立的 item 列出。
        4. 獨立列出折扣：若包含折扣 (如 値引, discount, coupon)，必須將其作為獨立的 item 列出，且單價必須為「負數」(例如 -660)。
        5. 統計總額：計算總折扣金額 (totalDiscount) 與 總退稅/免稅金額 (totalTaxRefund)，兩者皆須為「正數」，若無則填 0。
        [約束條件與內部事實查核]：
        - 【證據優先】：僅依據圖片中『確切已知』的文字與數字輸出，嚴禁使用『可能、應該、或許』等模糊推測或編造。
        - 【允許留白】：若對某個欄位（如日期、商店名稱）的辨識信心水準低於 90%，或圖片中缺乏該資訊，請直接留空 (空字串或省略)，絕對不要硬猜。
        - 確保所有 items 的金額加總（包含負數折扣與正數稅金）完全等於 totalAmount。
        - 輸出必須是符合 Schema 的純 JSON 格式，且翻譯必須使用繁體中文。
      `;

      parts.push({ text: prompt });

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: { parts },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              storeName: { type: Type.STRING, description: "Name of the store/shop" },
              date: { type: Type.STRING },
              totalAmount: { type: Type.NUMBER },
              totalDiscount: { type: Type.NUMBER, description: "Total discount amount (positive number). 0 if none." },
              totalTaxRefund: { type: Type.NUMBER, description: "Total tax refund or tax free amount (positive number). 0 if none." },
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
        photoUrl: compressedDataUrls[0],
        photoUrls: compressedDataUrls,
        storeName: result.storeName || receipt.storeName,
        totalAmount: result.totalAmount || receipt.totalAmount,
        date: result.date ? result.date.slice(0, 16) : receipt.date,
        totalDiscount: result.totalDiscount || 0,
        totalTaxRefund: result.totalTaxRefund || 0
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
          multiple
          ref={fileInputRef} 
          onChange={handleFileChange} 
          className="hidden" 
        />

        {/* Hidden File Input for Gallery */}
        <input 
          type="file" 
          accept="image/*" 
          multiple
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
          <div className="grid grid-cols-3 gap-3">
            <button 
              onClick={!uploading ? handlePhotoUpload : undefined}
              disabled={uploading}
              className={`w-full h-32 bg-card-white rounded-3xl border border-divider flex flex-col items-center justify-center overflow-hidden relative group shadow-sm transition-all ${!uploading ? 'cursor-pointer hover:shadow-md hover:border-primary-blue/30 active:scale-95' : 'opacity-50'}`}
            >
              <div className="bg-background p-3 rounded-2xl mb-2 group-hover:bg-primary-blue/10 transition-colors">
                <Camera className="w-6 h-6 text-primary-blue" />
              </div>
              <span className="text-xs font-bold text-ink">拍照</span>
            </button>
            <button 
              onClick={!uploading ? handleGalleryUpload : undefined}
              disabled={uploading}
              className={`w-full h-32 bg-card-white rounded-3xl border border-divider flex flex-col items-center justify-center overflow-hidden relative group shadow-sm transition-all ${!uploading ? 'cursor-pointer hover:shadow-md hover:border-primary-blue/30 active:scale-95' : 'opacity-50'}`}
            >
              <div className="bg-background p-3 rounded-2xl mb-2 group-hover:bg-primary-blue/10 transition-colors">
                <ImageIcon className="w-6 h-6 text-primary-blue" />
              </div>
              <span className="text-xs font-bold text-ink">相簿</span>
            </button>
            <button 
              onClick={!uploading ? handlePasteFromClipboard : undefined}
              disabled={uploading}
              className={`w-full h-32 bg-card-white rounded-3xl border border-divider flex flex-col items-center justify-center overflow-hidden relative group shadow-sm transition-all ${!uploading ? 'cursor-pointer hover:shadow-md hover:border-primary-blue/30 active:scale-95' : 'opacity-50'}`}
            >
              <div className="bg-background p-3 rounded-2xl mb-2 group-hover:bg-primary-blue/10 transition-colors">
                <ClipboardPaste className="w-6 h-6 text-primary-blue" />
              </div>
              <span className="text-xs font-bold text-ink">貼上</span>
            </button>
          </div>
          
          {!uploading && (
            <div className="text-center text-[10px] font-bold text-ink/40 uppercase tracking-widest mt-2">
              💡 提示：您也可以直接在此頁面貼上 (Ctrl+V / Cmd+V) 截圖或複製的圖片
            </div>
          )}

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

          {receipt.photoUrls && receipt.photoUrls.length > 0 && !uploading && (
            <div className="flex gap-4 overflow-x-auto pb-2 snap-x">
              {receipt.photoUrls.map((url, idx) => (
                <div 
                  key={idx}
                  className="min-w-[80%] h-48 bg-background rounded-3xl border-2 border-dashed border-divider flex-shrink-0 flex flex-col items-center justify-center overflow-hidden relative group cursor-pointer snap-center"
                  onClick={() => setShowFullImage(true)} // Note: currently just shows the first image in full screen, could be improved to show a specific one
                >
                  <img src={url} alt={`Receipt ${idx + 1}`} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  <div className="absolute inset-0 bg-ink/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Sparkles className="w-8 h-8 text-white" />
                    <span className="text-white font-bold ml-2">點擊放大</span>
                  </div>
                  <div className="absolute top-2 right-2 bg-black/50 text-white text-xs px-2 py-1 rounded-full font-bold">
                    {idx + 1} / {receipt.photoUrls.length}
                  </div>
                </div>
              ))}
            </div>
          )}
          {receipt.photoUrl && (!receipt.photoUrls || receipt.photoUrls.length === 0) && !uploading && (
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
          <h2 className="text-lg font-serif font-bold text-ink">基本資訊</h2>
          
          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-ink/40 mb-1.5 uppercase tracking-widest">商店名稱</label>
              <input
                type="text"
                placeholder="例如：7-11, 餐廳名稱"
                value={receipt.storeName || ''}
                onChange={e => setReceipt({...receipt, storeName: e.target.value})}
                className="w-full p-4 bg-background border border-divider rounded-2xl focus:ring-2 focus:ring-primary-blue outline-none font-bold text-ink text-sm"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-ink/40 mb-1.5 uppercase tracking-widest">日期時間</label>
              <input
                type="datetime-local"
                value={receipt.date}
                onChange={e => setReceipt({...receipt, date: e.target.value})}
                className="w-full p-4 bg-background border border-divider rounded-2xl focus:ring-2 focus:ring-primary-blue outline-none font-bold text-ink text-xs"
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-1">
                <label className="block text-[10px] font-bold text-ink/40 mb-1.5 uppercase tracking-widest">幣別</label>
                <select
                  value={receipt.currency || 'JPY'}
                  onChange={e => setReceipt({...receipt, currency: e.target.value})}
                  disabled={items.length > 0 || pendingAiItems.length > 0}
                  className="w-full p-4 bg-background border border-divider rounded-2xl focus:ring-2 focus:ring-primary-blue outline-none font-bold text-ink appearance-none disabled:opacity-50"
                >
                  <option value="JPY">JPY</option>
                  <option value="TWD">TWD</option>
                  <option value="KRW">KRW</option>
                  <option value="USD">USD</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-[10px] font-bold text-ink/40 mb-1.5 uppercase tracking-widest">總金額</label>
                <input
                  type="number"
                  value={receipt.totalAmount}
                  onChange={e => setReceipt({...receipt, totalAmount: Number(e.target.value)})}
                  disabled={items.length > 0 || pendingAiItems.length > 0}
                  className="w-full p-4 bg-background border border-divider rounded-2xl focus:ring-2 focus:ring-primary-blue outline-none disabled:opacity-50 font-serif font-bold text-ink text-lg"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-ink/40 mb-1.5 uppercase tracking-widest">總折扣 (選填)</label>
                <input
                  type="number"
                  value={receipt.totalDiscount || ''}
                  onChange={e => setReceipt({...receipt, totalDiscount: Number(e.target.value)})}
                  className="w-full p-4 bg-background border border-divider rounded-2xl focus:ring-2 focus:ring-primary-blue outline-none font-serif font-bold text-green-600 text-sm"
                  placeholder="0"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-ink/40 mb-1.5 uppercase tracking-widest">總退稅 (選填)</label>
                <input
                  type="number"
                  value={receipt.totalTaxRefund || ''}
                  onChange={e => setReceipt({...receipt, totalTaxRefund: Number(e.target.value)})}
                  className="w-full p-4 bg-background border border-divider rounded-2xl focus:ring-2 focus:ring-primary-blue outline-none font-serif font-bold text-blue-600 text-sm"
                  placeholder="0"
                />
              </div>
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
                <option value="進貨">進貨</option>
                <option value="私人">私人</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-ink/40 mb-1.5 uppercase tracking-widest">子類別</label>
              <input
                list="sub-categories"
                value={receipt.subCategory}
                onChange={e => setReceipt({...receipt, subCategory: e.target.value})}
                className="w-full p-4 bg-background border border-divider rounded-2xl focus:ring-2 focus:ring-primary-blue outline-none font-bold text-ink"
                placeholder="輸入或選擇類別"
              />
              <datalist id="sub-categories">
                {(receipt.category === 'Personal' || receipt.category === '私人') 
                  ? ['飲食', '服飾', '居住', '交通', '教育', '娛樂', '其他'].map(cat => <option key={cat} value={cat} />)
                  : ['商品成本', '交通', '住宿', '餐飲', '雜支', '其他'].map(cat => <option key={cat} value={cat} />)
                }
              </datalist>
            </div>
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
