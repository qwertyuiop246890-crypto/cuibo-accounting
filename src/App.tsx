import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import { auth } from './firebase';
import { Home } from './pages/Home';
import { Dashboard } from './pages/Dashboard';
import { Settings } from './pages/Settings';
import { ReceiptDetail } from './pages/ReceiptDetail';
import { Transfer } from './pages/Transfer';
import { Layout } from './components/Layout';
import { Loader2 } from 'lucide-react';

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary-blue" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
        <div className="max-w-md w-full bg-card-white p-12 rounded-[40px] shadow-2xl shadow-ink/5 text-center border border-divider">
          <div className="w-32 h-32 rounded-[32px] overflow-hidden shadow-lg border-4 border-white mx-auto mb-8">
            <img src="/logo.png" alt="Cui Bo Logo" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
          </div>
          <h1 className="text-4xl font-serif font-bold text-ink mb-2">Cui Bo</h1>
          <p className="text-ink/50 mb-10 font-medium tracking-wide uppercase tracking-[0.2em] text-xs">記帳軟體</p>
          <button
            onClick={() => signInWithPopup(auth, new GoogleAuthProvider())}
            className="w-full bg-primary-blue text-white rounded-2xl py-4 px-6 font-bold hover:opacity-90 transition-all shadow-lg shadow-primary-blue/20 active:scale-95 uppercase tracking-widest text-sm"
          >
            使用 Google 登入
          </button>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="settings" element={<Settings />} />
          <Route path="receipt/:id" element={<ReceiptDetail />} />
          <Route path="transfer" element={<Transfer />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
