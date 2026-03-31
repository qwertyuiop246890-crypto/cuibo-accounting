import React, { Component, useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { doc, getDoc, setDoc, getDocFromServer } from 'firebase/firestore';
import { auth, db } from './firebase';
import { Home } from './pages/Home';
import { Dashboard } from './pages/Dashboard';
import { Settings } from './pages/Settings';
import { ReceiptDetail } from './pages/ReceiptDetail';
import { Transfer } from './pages/Transfer';
import { Layout } from './components/Layout';
import { Loader2, AlertCircle } from 'lucide-react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: any;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = { hasError: false, error: null };
  public props: ErrorBoundaryProps;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.props = props;
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      let errorMessage = "發生了錯誤，請稍後再試。";
      try {
        const parsed = JSON.parse(this.state.error.message);
        if (parsed.error) errorMessage = `權限錯誤: ${parsed.operationType} ${parsed.path || ''}`;
      } catch (e) {}

      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
          <div className="max-w-md w-full bg-card-white p-8 rounded-[40px] shadow-xl border border-divider text-center">
            <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-2xl font-serif font-bold text-ink mb-4">糟糕！出錯了</h2>
            <p className="text-ink/60 mb-8">{errorMessage}</p>
            <button
              onClick={() => window.location.reload()}
              className="bg-primary-blue text-white px-8 py-3 rounded-2xl font-bold hover:opacity-90 transition-all"
            >
              重新整理
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const testConnection = async () => {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    };
    testConnection();
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        // Ensure user document exists
        const userDocRef = doc(db, 'users', currentUser.uid);
        const userDoc = await getDoc(userDocRef);
        if (!userDoc.exists()) {
          await setDoc(userDocRef, {
            email: currentUser.email,
            displayName: currentUser.displayName,
            photoURL: currentUser.photoURL,
            role: 'client',
            createdAt: new Date().toISOString()
          });
        }
      }
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
    <ErrorBoundary>
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
    </ErrorBoundary>
  );
}
