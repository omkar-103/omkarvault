import React from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { VaultFile } from '../../types/vault';

interface DeleteModalProps {
  file: VaultFile | null;
  isOpen: boolean;
  isDeleting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const DeleteModal: React.FC<DeleteModalProps> = ({
  file,
  isOpen,
  isDeleting,
  onConfirm,
  onCancel,
}) => {
  if (!isOpen || !file) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-5">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-red-950/40 border border-red-500/20 text-red-400 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-zinc-100">
              Delete {file.originalName}?
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              This file will be permanently removed from vault storage.
            </p>
          </div>
        </div>

        <div className="bg-zinc-950/60 border border-zinc-800/80 rounded-xl p-3 text-xs font-mono text-zinc-400 space-y-1">
          <div className="flex justify-between">
            <span className="text-zinc-500">TYPE:</span>
            <span>{file.extension.toUpperCase()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500">STORAGE KEY:</span>
            <span className="truncate max-w-[200px]">{file.storageKey}</span>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isDeleting}
            className="px-4 py-2 text-xs font-mono font-medium rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-mono font-semibold rounded-lg bg-red-600 hover:bg-red-500 text-white transition-colors cursor-pointer disabled:opacity-50 shadow-sm"
          >
            {isDeleting ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Deleting...
              </>
            ) : (
              <>
                <Trash2 className="w-3.5 h-3.5" />
                Delete Permanently
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
