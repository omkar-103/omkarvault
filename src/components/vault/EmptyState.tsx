import React from 'react';
import { ShieldAlert, Upload, Sparkles } from 'lucide-react';

interface EmptyStateProps {
  onOpenUpload: () => void;
  onSeedSamples: () => void;
  isSeeding?: boolean;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  onOpenUpload,
  onSeedSamples,
  isSeeding = false,
}) => {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center border border-dashed border-zinc-800 rounded-2xl bg-zinc-900/30 my-8">
      <div className="w-14 h-14 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-500 mb-4 shadow-inner">
        <ShieldAlert className="w-7 h-7" strokeWidth={1.5} />
      </div>

      <h3 className="text-lg font-semibold text-zinc-200 font-sans">
        Your vault is empty.
      </h3>
      <p className="text-sm text-zinc-500 max-w-sm mt-1 mb-6 font-sans">
        Upload your first file to get started, or generate verified starter files to test presentation & document viewers.
      </p>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          onClick={onOpenUpload}
          className="flex items-center gap-2 px-4 py-2.5 text-xs font-mono font-semibold rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 shadow-lg shadow-amber-500/10 transition-all cursor-pointer"
        >
          <Upload className="w-4 h-4" />
          <span>Upload File</span>
        </button>

        <button
          onClick={onSeedSamples}
          disabled={isSeeding}
          className="flex items-center gap-2 px-4 py-2.5 text-xs font-mono font-semibold rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700/80 transition-all cursor-pointer disabled:opacity-50"
        >
          <Sparkles className="w-4 h-4 text-amber-400" />
          <span>{isSeeding ? 'Generating Sample Files...' : 'Create Starter Files (PDF & PPTX)'}</span>
        </button>
      </div>
    </div>
  );
};
