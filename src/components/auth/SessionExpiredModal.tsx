import React from 'react';
import { Lock, LogIn } from 'lucide-react';

interface SessionExpiredModalProps {
  isOpen: boolean;
  onSignIn: () => void;
}

export const SessionExpiredModal: React.FC<SessionExpiredModalProps> = ({
  isOpen,
  onSignIn,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-sm p-6 shadow-2xl text-center space-y-4">
        <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center mx-auto">
          <Lock className="w-6 h-6" />
        </div>

        <div>
          <h3 className="text-base font-semibold text-zinc-100 font-sans">
            Your session has expired.
          </h3>
          <p className="text-xs text-zinc-400 mt-1">
            Please sign in again to continue accessing your private vault.
          </p>
        </div>

        <button
          onClick={onSignIn}
          className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-mono font-semibold bg-amber-500 hover:bg-amber-400 text-zinc-950 shadow-md transition-colors cursor-pointer"
        >
          <LogIn className="w-4 h-4" />
          <span>Sign In</span>
        </button>
      </div>
    </div>
  );
};
