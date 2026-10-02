import React, { useState, useRef } from 'react';
import { Upload, X, FileText, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import { formatBytes } from '../../lib/api';

interface FileUploaderProps {
  isOpen: boolean;
  onClose: () => void;
  onUpload: (file: File, onProgress: (pct: number) => void) => Promise<unknown>;
  maxSizeMb?: number;
}

interface UploadQueueItem {
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'processing' | 'done' | 'error';
  errorMessage?: string;
}

export const FileUploader: React.FC<FileUploaderProps> = ({
  isOpen,
  onClose,
  onUpload,
  maxSizeMb = 100,
}) => {
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [queue, setQueue] = useState<UploadQueueItem[]>([]);
  const [isProcessingQueue, setIsProcessingQueue] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const processFiles = async (files: FileList | File[]) => {
    const validFiles: UploadQueueItem[] = [];
    const maxSizeBytes = maxSizeMb * 1024 * 1024;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.size > maxSizeBytes) {
        validFiles.push({
          file,
          progress: 0,
          status: 'error',
          errorMessage: `File exceeds ${maxSizeMb} MB limit`,
        });
      } else {
        validFiles.push({
          file,
          progress: 0,
          status: 'pending',
        });
      }
    }

    setQueue((prev) => [...prev, ...validFiles]);
    setIsProcessingQueue(true);

    for (const item of validFiles) {
      if (item.status === 'error') continue;

      try {
        // Update item status to uploading
        setQueue((prev) =>
          prev.map((q) => (q.file === item.file ? { ...q, status: 'uploading' } : q))
        );

        await onUpload(item.file, (pct) => {
          setQueue((prev) =>
            prev.map((q) => (q.file === item.file ? { ...q, progress: pct } : q))
          );
        });

        // Set to done
        setQueue((prev) =>
          prev.map((q) => (q.file === item.file ? { ...q, progress: 100, status: 'done' } : q))
        );
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : 'Upload failed';
        setQueue((prev) =>
          prev.map((q) =>
            q.file === item.file ? { ...q, status: 'error', errorMessage: errorMsg } : q
          )
        );
      }
    }

    setIsProcessingQueue(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files);
    }
  };

  const allDone = queue.length > 0 && queue.every((q) => q.status === 'done' || q.status === 'error');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800/80">
          <div>
            <h2 className="text-base font-semibold text-zinc-100 font-sans">Upload Files to Vault</h2>
            <p className="text-xs text-zinc-500 font-mono mt-0.5">
              Securely stored with private unique identifiers
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={isProcessingQueue}
            className="text-zinc-500 hover:text-zinc-300 transition-colors p-1.5 rounded-lg hover:bg-zinc-800 cursor-pointer disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 overflow-y-auto">
          {/* Dropzone */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-150 flex flex-col items-center justify-center gap-3 ${
              isDragging
                ? 'border-amber-500 bg-amber-500/10 scale-[0.99]'
                : 'border-zinc-800 hover:border-zinc-700 bg-zinc-950/40 hover:bg-zinc-950/60'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleFileInputChange}
            />
            <div className="w-12 h-12 rounded-xl bg-zinc-800/80 flex items-center justify-center text-amber-500">
              <Upload className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-200">
                Click to browse or drop files here
              </p>
              <p className="text-xs text-zinc-500 mt-1 font-mono">
                PDF, PPTX, DOCX, XLSX, Images, ZIP · Up to {maxSizeMb} MB
              </p>
            </div>
          </div>

          {/* Upload Queue List */}
          {queue.length > 0 && (
            <div className="space-y-2.5 pt-2">
              <span className="text-xs font-mono text-zinc-400">
                UPLOAD QUEUE ({queue.filter((q) => q.status === 'done').length}/{queue.length})
              </span>
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {queue.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-zinc-950/60 border border-zinc-800/80 rounded-xl space-y-2"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 min-w-0 pr-2">
                        <FileText className="w-4 h-4 text-zinc-400 shrink-0" />
                        <span className="font-medium text-zinc-200 truncate">
                          {item.file.name}
                        </span>
                        <span className="text-zinc-500 font-mono shrink-0">
                          {formatBytes(item.file.size)}
                        </span>
                      </div>
                      <div className="shrink-0 font-mono">
                        {item.status === 'uploading' && (
                          <span className="text-amber-400 flex items-center gap-1">
                            <Loader2 className="w-3 h-3 animate-spin" /> {item.progress}%
                          </span>
                        )}
                        {item.status === 'done' && (
                          <span className="text-emerald-400 flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Uploaded
                          </span>
                        )}
                        {item.status === 'error' && (
                          <span className="text-red-400 flex items-center gap-1">
                            <AlertTriangle className="w-3.5 h-3.5" /> Failed
                          </span>
                        )}
                        {item.status === 'pending' && (
                          <span className="text-zinc-500">Waiting...</span>
                        )}
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                      <div
                        className={`h-full transition-all duration-200 ${
                          item.status === 'error'
                            ? 'bg-red-500'
                            : item.status === 'done'
                            ? 'bg-emerald-500'
                            : 'bg-amber-500'
                        }`}
                        style={{ width: `${item.status === 'done' ? 100 : item.progress}%` }}
                      />
                    </div>

                    {item.errorMessage && (
                      <p className="text-[11px] text-red-400 font-mono">{item.errorMessage}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-zinc-950/50 border-t border-zinc-800/80 flex items-center justify-between">
          <span className="text-xs text-zinc-500 font-mono">
            {allDone ? 'All uploads completed' : isProcessingQueue ? 'Encrypting & storing payload...' : 'Ready'}
          </span>
          <div className="flex items-center gap-2">
            {allDone && (
              <button
                onClick={() => setQueue([])}
                className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
              >
                Clear Completed
              </button>
            )}
            <button
              onClick={onClose}
              disabled={isProcessingQueue}
              className="px-4 py-2 text-xs font-semibold font-mono rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-100 transition-colors cursor-pointer disabled:opacity-50"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
