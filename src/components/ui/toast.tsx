"use client";
import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { X, CheckCircle2, AlertCircle, Info } from "lucide-react";

type Toast = { id: string; title: string; description?: string; variant: "success" | "error" | "info" };
const Ctx = createContext<{ toast: (t: Omit<Toast,"id">) => void } | null>(null);

export function useToast() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useToast outside provider");
  return c;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toast = useCallback((t: Omit<Toast,"id">) => {
    const id = Math.random().toString(36).slice(2);
    setToasts(s => [...s, { ...t, id }]);
    setTimeout(() => setToasts(s => s.filter(x => x.id !== id)), 4000);
  }, []);
  return (
    <Ctx.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-[360px] max-w-[calc(100vw-2rem)]">
        {toasts.map(t => (
          <div key={t.id} className={`flex gap-3 p-3.5 rounded-xl border shadow-xl backdrop-blur-xl animate-in slide-in-from-bottom-2 ${t.variant==="success"?"bg-zinc-900 border-white/10 text-white":t.variant==="error"?"bg-red-950 border-red-900/50 text-white":"bg-zinc-900 border-white/10 text-white"}`}>
            <span className="mt-0.5 shrink-0">{t.variant==="success"?<CheckCircle2 className="w-4 h-4 text-emerald-400"/>:t.variant==="error"?<AlertCircle className="w-4 h-4 text-red-400"/>:<Info className="w-4 h-4 text-blue-400"/>}</span>
            <div className="flex-1 min-w-0"><div className="text-sm font-medium leading-none">{t.title}</div>{t.description && <div className="text-xs text-zinc-400 mt-1 leading-relaxed">{t.description}</div>}</div>
            <button onClick={()=>setToasts(s=>s.filter(x=>x.id!==t.id))} className="shrink-0 text-zinc-500 hover:text-white"><X className="w-3.5 h-3.5"/></button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
