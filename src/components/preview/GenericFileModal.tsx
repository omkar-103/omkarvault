import React from 'react';
import { X, Download, FileQuestion, Calendar, HardDrive, Shield } from 'lucide-react';
import { VaultFile } from '../../types/vault';
import { formatBytes, formatDate } from '../../lib/api';

interface GenericFileModalProps {
  file: VaultFile | null;
  isOpen: boolean;
  onClose: () => void;
  onDownload: () => void;
}

export const GenericFileModal: React.FC<GenericFileModalProps> = ({
  file,
  isOpen,
  onClose,
  onDownload,
}) => {
  if (!isOpen || !file) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-400 flex items-center justify-center">
              <FileQuestion className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-zinc-100 font-sans">
                File Details
              </h3>
              <p className="text-xs text-zinc-500 font-mono">
                Preview unavailable in browser
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300 p-1.5 rounded-lg hover:bg-zinc-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Filename & Status */}
        <div className="bg-zinc-950/60 border border-zinc-800/80 rounded-xl p-4 space-y-3">
          <div>
            <span className="text-[10px] text-zinc-500 uppercase font-mono tracking-wider block">
              Original Filename
            </span>
            <p className="text-sm font-medium text-zinc-200 break-all font-sans mt-0.5">
              {file.originalName}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-zinc-800/60 text-xs font-mono">
            <div>
              <span className="text-zinc-500 block text-[10px]">FILE SIZE</span>
              <span className="text-zinc-300 tabular-nums">{formatBytes(file.sizeBytes)}</span>
            </div>
            <div>
              <span className="text-zinc-500 block text-[10px]">FORMAT</span>
              <span className="text-zinc-300 uppercase">{file.extension}</span>
            </div>
          </div>

          <div className="pt-2 border-t border-zinc-800/60 text-xs font-mono space-y-1">
            <div className="flex items-center justify-between text-zinc-400">
              <span className="text-zinc-500 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" /> Uploaded
              </span>
              <span>{formatDate(file.createdAt)}</span>
            </div>
            <div className="flex items-center justify-between text-zinc-400">
              <span className="text-zinc-500 flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5" /> Storage
              </span>
              <span>Private Vault Encrypted</span>
            </div>
          </div>
        </div>

        {/* Notice & Download Button */}
        <div className="space-y-3">
          <p className="text-xs text-zinc-400 text-center font-sans">
            This file format requires downloading to open in your system&apos;s native application.
          </p>

          <button
            onClick={onDownload}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-mono font-semibold bg-amber-500 hover:bg-amber-400 text-zinc-950 shadow-md transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Download File</span>
          </button>
        </div>
      </div>
    </div>
  );
};
