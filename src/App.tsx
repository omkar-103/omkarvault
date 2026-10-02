/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { VaultFile } from './types/vault';
import { checkSession, logout, fetchFiles, uploadFile, deleteFile, seedStarterSamples, getFileDownloadUrl } from './lib/api';
import { LoginView } from './components/auth/LoginView';
import { VaultHeader } from './components/vault/VaultHeader';
import { FileList } from './components/vault/FileList';
import { EmptyState } from './components/vault/EmptyState';
import { FileUploader } from './components/vault/FileUploader';
import { DeleteModal } from './components/vault/DeleteModal';
import { PDFPresentationModal } from './components/preview/PDFPresentationModal';
import { PresentationViewerModal } from './components/preview/PresentationViewerModal';
import { ImageViewerModal } from './components/preview/ImageViewerModal';
import { GenericFileModal } from './components/preview/GenericFileModal';
import { SessionExpiredModal } from './components/auth/SessionExpiredModal';
import { Shield, CheckCircle2, AlertCircle } from 'lucide-react';

export default function App() {
  const [isCheckingSession, setIsCheckingSession] = useState<boolean>(true);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [sessionRemainingHours, setSessionRemainingHours] = useState<number | undefined>(undefined);
  const [isSessionExpiredOpen, setIsSessionExpiredOpen] = useState<boolean>(false);

  const [files, setFiles] = useState<VaultFile[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState<boolean>(false);
  const [isUploaderOpen, setIsUploaderOpen] = useState<boolean>(false);

  // Active Modals
  const [viewingFile, setViewingFile] = useState<VaultFile | null>(null);
  const [deletingFile, setDeletingFile] = useState<VaultFile | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [isSeeding, setIsSeeding] = useState<boolean>(false);

  // Toast notifications
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 3500);
  }, []);

  // Fetch files from server
  const loadFiles = useCallback(async () => {
    setIsLoadingFiles(true);
    try {
      const data = await fetchFiles();
      setFiles(data.files || []);
    } catch (err: unknown) {
      if (err instanceof Error && err.message === 'UNAUTHORIZED') {
        setIsAuthenticated(false);
        setIsSessionExpiredOpen(true);
      } else {
        showToast('Failed to load vault files', 'error');
      }
    } finally {
      setIsLoadingFiles(false);
    }
  }, [showToast]);

  // Initial Session Verification
  const verifySession = useCallback(async () => {
    setIsCheckingSession(true);
    const session = await checkSession();
    if (session.authenticated) {
      setIsAuthenticated(true);
      setSessionRemainingHours(session.expiresInHours);
      await loadFiles();
    } else {
      setIsAuthenticated(false);
    }
    setIsCheckingSession(false);
  }, [loadFiles]);

  useEffect(() => {
    verifySession();
  }, [verifySession]);

  // Handle Logout
  const handleLogout = async () => {
    await logout();
    setIsAuthenticated(false);
    setFiles([]);
    setViewingFile(null);
    showToast('Vault secured. Session closed.', 'info');
  };

  // Handle Upload
  const handleUpload = async (file: File, onProgress: (pct: number) => void) => {
    try {
      const uploadedFile = await uploadFile(file, onProgress);
      setFiles((prev) => [uploadedFile, ...prev.filter((f) => f.id !== uploadedFile.id)]);
      showToast(`${file.name} saved to vault.`, 'success');
      return uploadedFile;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      showToast(msg, 'error');
      throw err;
    }
  };

  // Handle Seed Starter Demo Files
  const handleSeedSamples = async () => {
    setIsSeeding(true);
    try {
      const count = await seedStarterSamples();
      showToast(`Added ${count} starter files (PDF & PPTX Presentation).`, 'success');
      await loadFiles();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to seed starter samples';
      showToast(msg, 'error');
    } finally {
      setIsSeeding(false);
    }
  };

  // Handle Delete Confirmation
  const handleConfirmDelete = async () => {
    if (!deletingFile) return;
    setIsDeleting(true);
    try {
      await deleteFile(deletingFile.id);
      setFiles((prev) => prev.filter((f) => f.id !== deletingFile.id));
      showToast(`${deletingFile.originalName} permanently deleted.`, 'info');
      setDeletingFile(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Delete failed';
      showToast(msg, 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  // Handle Direct Download
  const handleDownloadFile = (file: VaultFile) => {
    const link = document.createElement('a');
    link.href = getFileDownloadUrl(file.id);
    link.setAttribute('download', file.originalName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(`Downloading ${file.originalName}...`, 'info');
  };

  // Loading Session Skeleton
  if (isCheckingSession) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-zinc-800 text-amber-500 flex items-center justify-center shadow-lg">
            <Shield className="w-6 h-6 animate-pulse" />
          </div>
          <span className="text-xs font-mono text-zinc-500 tracking-wider">
            VERIFYING ENCRYPTED SESSION...
          </span>
        </div>
      </div>
    );
  }

  // If Not Authenticated -> Show 6-character Login View
  if (!isAuthenticated) {
    return (
      <>
        <LoginView
          onSuccess={() => {
            setIsAuthenticated(true);
            loadFiles();
          }}
        />
        <SessionExpiredModal
          isOpen={isSessionExpiredOpen}
          onSignIn={() => {
            setIsSessionExpiredOpen(false);
          }}
        />
      </>
    );
  }

  // Authenticated Private Vault Dashboard
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col selection:bg-amber-500/20 selection:text-amber-200">
      {/* Vault Top Bar */}
      <VaultHeader
        onOpenUpload={() => setIsUploaderOpen(true)}
        onLogout={handleLogout}
        onSeedStarterSamples={handleSeedSamples}
        isSeeding={isSeeding}
        fileCount={files.length}
        sessionRemainingHours={sessionRemainingHours}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {isLoadingFiles && files.length === 0 ? (
          <div className="py-20 flex flex-col items-center justify-center space-y-3">
            <span className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs font-mono text-zinc-500">Decrypting file directory...</p>
          </div>
        ) : files.length === 0 ? (
          <EmptyState
            onOpenUpload={() => setIsUploaderOpen(true)}
            onSeedSamples={handleSeedSamples}
            isSeeding={isSeeding}
          />
        ) : (
          <FileList
            files={files}
            onViewFile={(file) => setViewingFile(file)}
            onDownloadFile={handleDownloadFile}
            onRequestDelete={(file) => setDeletingFile(file)}
          />
        )}
      </main>

      {/* Modals */}

      {/* 1. Upload Modal */}
      <FileUploader
        isOpen={isUploaderOpen}
        onClose={() => setIsUploaderOpen(false)}
        onUpload={handleUpload}
        maxSizeMb={100}
      />

      {/* 2. Delete Confirmation Modal */}
      <DeleteModal
        file={deletingFile}
        isOpen={!!deletingFile}
        isDeleting={isDeleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeletingFile(null)}
      />

      {/* 3. Presentation Viewer Modal (PPT/PPTX) */}
      {viewingFile && viewingFile.category === 'presentation' && viewingFile.extension !== 'pdf' && (
        <PresentationViewerModal
          file={viewingFile}
          isOpen={true}
          onClose={() => setViewingFile(null)}
          onDownload={() => handleDownloadFile(viewingFile)}
        />
      )}

      {/* 4. PDF Presentation Modal (each page = slide, neo-brutalism viewer) */}
      {viewingFile && viewingFile.extension === 'pdf' && (
        <PDFPresentationModal
          file={viewingFile}
          isOpen={true}
          onClose={() => setViewingFile(null)}
          onDownload={() => handleDownloadFile(viewingFile)}
        />
      )}

      {/* 5. Image Viewer Modal */}
      {viewingFile &&
        viewingFile.category === 'image' &&
        ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(viewingFile.extension) && (
          <ImageViewerModal
            file={viewingFile}
            isOpen={true}
            onClose={() => setViewingFile(null)}
            onDownload={() => handleDownloadFile(viewingFile)}
          />
        )}

      {/* 6. Generic File Modal (For other formats) */}
      {viewingFile &&
        viewingFile.category !== 'presentation' &&
        viewingFile.extension !== 'pdf' &&
        viewingFile.category !== 'image' && (
          <GenericFileModal
            file={viewingFile}
            isOpen={true}
            onClose={() => setViewingFile(null)}
            onDownload={() => handleDownloadFile(viewingFile)}
          />
        )}

      {/* 7. Session Expired Modal */}
      <SessionExpiredModal
        isOpen={isSessionExpiredOpen}
        onSignIn={() => {
          setIsSessionExpiredOpen(false);
          setIsAuthenticated(false);
        }}
      />

      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl text-xs font-mono animate-in slide-in-from-bottom duration-200">
          {toast.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
          )}
          <span className="text-zinc-200">{toast.message}</span>
        </div>
      )}
    </div>
  );
}
