import { Outlet, NavLink } from 'react-router-dom';
import { Home, PieChart, Settings, PlusCircle, ArrowRightLeft } from 'lucide-react';
import { cn } from '../lib/utils';

export function Layout() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <main className="flex-1 pb-20">
        <Outlet />
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-card-white border-t border-divider px-6 py-3 pb-safe shadow-[0_-4px_20px_rgba(149,126,107,0.05)]">
        <div className="max-w-md mx-auto flex justify-between items-center">
          <NavLink
            to="/"
            className={({ isActive }) =>
              cn("flex flex-col items-center gap-1 text-[10px] font-bold uppercase tracking-widest transition-colors", isActive ? "text-primary-blue" : "text-ink/40")
            }
          >
            <Home className="w-6 h-6" />
            <span>首頁</span>
          </NavLink>
          
          <NavLink
            to="/dashboard"
            className={({ isActive }) =>
              cn("flex flex-col items-center gap-1 text-[10px] font-bold uppercase tracking-widest transition-colors", isActive ? "text-primary-blue" : "text-ink/40")
            }
          >
            <PieChart className="w-6 h-6" />
            <span>報表</span>
          </NavLink>

          <NavLink
            to="/receipt/new"
            className="flex flex-col items-center gap-1 text-[10px] font-bold uppercase tracking-widest -mt-10"
          >
            <div className="bg-primary-blue text-white p-4 rounded-[24px] shadow-xl shadow-primary-blue/30 active:scale-90 transition-all">
              <PlusCircle className="w-8 h-8" />
            </div>
            <span className="text-ink/40 mt-1">記帳</span>
          </NavLink>

          <NavLink
            to="/transfer"
            className={({ isActive }) =>
              cn("flex flex-col items-center gap-1 text-[10px] font-bold uppercase tracking-widest transition-colors", isActive ? "text-primary-blue" : "text-ink/40")
            }
          >
            <ArrowRightLeft className="w-6 h-6" />
            <span>轉帳</span>
          </NavLink>

          <NavLink
            to="/settings"
            className={({ isActive }) =>
              cn("flex flex-col items-center gap-1 text-[10px] font-bold uppercase tracking-widest transition-colors", isActive ? "text-primary-blue" : "text-ink/40")
            }
          >
            <Settings className="w-6 h-6" />
            <span>設定</span>
          </NavLink>
        </div>
      </nav>
    </div>
  );
}
