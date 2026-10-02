import React from 'react';
import { Shield, Upload, LogOut, Sparkles } from 'lucide-react';

interface VaultHeaderProps {
  onOpenUpload: () => void;
  onLogout: () => void;
  onSeedStarterSamples: () => void;
  isSeeding?: boolean;
  fileCount: number;
  sessionRemainingHours?: number;
}

export const VaultHeader: React.FC<VaultHeaderProps> = ({
  onOpenUpload,
  onLogout,
  onSeedStarterSamples,
  isSeeding = false,
  fileCount,
  sessionRemainingHours,
}) => {
  return (
    <header className="sticky top-0 z-30 bg-zinc-950/90 backdrop-blur-md border-b border-zinc-800/80 px-4 sm:px-6 lg:px-8 py-3.5 transition-all">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        {/* Zone 1: Single text element wordmark */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-amber-500 shadow-sm shrink-0">
            <Shield className="w-4 h-4" strokeWidth={2} />
          </div>
          <span className="text-base font-bold tracking-tight text-zinc-100 font-sans whitespace-nowrap">
            AEGIS VAULT
          </span>
          <span className="hidden sm:inline-block text-xs text-zinc-500 font-mono">
            · Private
          </span>
        </div>

        {/* Zone 2: Informational / Contextual navigation */}
        <div className="hidden md:flex items-center gap-3 text-xs text-zinc-400 font-mono">
          <span>{fileCount} {fileCount === 1 ? 'file' : 'files'} stored</span>
          {sessionRemainingHours !== undefined && (
            <>
              <span aria-hidden="true" className="text-zinc-600">·</span>
              <span>Session: <strong className="text-zinc-300 font-semibold tabular-nums">{sessionRemainingHours}h</strong> active</span>
            </>
          )}
        </div>

        {/* Zone 3: 1-2 primary actions */}
        <div className="flex items-center gap-2.5">
          {fileCount === 0 && (
            <button
              onClick={onSeedStarterSamples}
              disabled={isSeeding}
              title="Add sample PDF & PPTX presentation files"
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-lg transition-colors cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{isSeeding ? 'Generating...' : 'Seed Sample Files'}</span>
            </button>
          )}

          <button
            onClick={onOpenUpload}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold font-mono tracking-wide text-zinc-950 bg-amber-500 hover:bg-amber-400 rounded-lg shadow-sm transition-colors cursor-pointer whitespace-nowrap"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Upload</span>
          </button>

          <button
            onClick={onLogout}
            title="Terminate private session"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 border border-zinc-800 rounded-lg transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Lock Vault</span>
          </button>
        </div>
      </div>
    </header>
  );
};
