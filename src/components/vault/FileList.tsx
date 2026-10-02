import React, { useState, useMemo } from 'react';
import {
  Search,
  SlidersHorizontal,
  FileText,
  Presentation,
  Image as ImageIcon,
  FileSpreadsheet,
  Archive,
  File,
  Eye,
  Download,
  Trash2,
  Clock,
  ArrowUpDown,
  Layers,
  LayoutGrid,
  List as ListIcon,
} from 'lucide-react';
import { VaultFile, SortField, FileCategoryFilter } from '../../types/vault';
import { formatBytes, formatDate } from '../../lib/api';

interface FileListProps {
  files: VaultFile[];
  onViewFile: (file: VaultFile) => void;
  onDownloadFile: (file: VaultFile) => void;
  onRequestDelete: (file: VaultFile) => void;
}

export const FileList: React.FC<FileListProps> = ({
  files,
  onViewFile,
  onDownloadFile,
  onRequestDelete,
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<SortField>('recent');
  const [categoryFilter, setCategoryFilter] = useState<FileCategoryFilter>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  // Filter & Sort
  const filteredFiles = useMemo(() => {
    let result = [...files];

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter((f) => f.originalName.toLowerCase().includes(q));
    }

    // Category filter
    if (categoryFilter !== 'all') {
      result = result.filter((f) => f.category === categoryFilter);
    }

    // Sort
    result.sort((a, b) => {
      switch (sortBy) {
        case 'recent':
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case 'oldest':
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case 'name-asc':
          return a.originalName.localeCompare(b.originalName);
        case 'name-desc':
          return b.originalName.localeCompare(a.originalName);
        case 'largest':
          return b.sizeBytes - a.sizeBytes;
        case 'smallest':
          return a.sizeBytes - b.sizeBytes;
        case 'type':
          return a.extension.localeCompare(b.extension);
        default:
          return 0;
      }
    });

    return result;
  }, [files, searchQuery, categoryFilter, sortBy]);

  const getCategoryIcon = (category: VaultFile['category'], ext: string) => {
    switch (category) {
      case 'presentation':
        return <Presentation className="w-5 h-5 text-amber-400" />;
      case 'document':
        if (ext === 'pdf') {
          return <FileText className="w-5 h-5 text-red-400" />;
        }
        return <FileText className="w-5 h-5 text-blue-400" />;
      case 'image':
        return <ImageIcon className="w-5 h-5 text-emerald-400" />;
      case 'spreadsheet':
        return <FileSpreadsheet className="w-5 h-5 text-green-400" />;
      case 'archive':
        return <Archive className="w-5 h-5 text-purple-400" />;
      default:
        return <File className="w-5 h-5 text-zinc-400" />;
    }
  };

  const isPreviewSupported = (file: VaultFile) => {
    const ext = file.extension.toLowerCase();
    if (file.category === 'presentation') return true;
    if (ext === 'pdf' || ext === 'txt' || ext === 'md') return true;
    if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext)) return true;
    return false;
  };

  return (
    <div className="space-y-6">
      {/* Controls Bar: Search, Category Filters, Sort, View Toggle */}
      <div className="flex flex-col md:flex-row gap-4 justify-between items-stretch md:items-center">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search files by name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-10 pr-4 py-2 text-xs font-sans text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/60 transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500 hover:text-zinc-300 font-mono cursor-pointer"
            >
              clear
            </button>
          )}
        </div>

        {/* Action Controls: Category Segmented Filters & Sort */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Category Filter Pills (Functional Buttons) */}
          <div className="flex items-center gap-1 p-1 bg-zinc-900 border border-zinc-800 rounded-xl overflow-x-auto max-w-full">
            {(
              [
                { id: 'all', label: 'All' },
                { id: 'presentation', label: 'Presentations' },
                { id: 'document', label: 'Docs' },
                { id: 'image', label: 'Images' },
                { id: 'spreadsheet', label: 'Data' },
                { id: 'archive', label: 'Zips' },
              ] as const
            ).map((cat) => (
              <button
                key={cat.id}
                onClick={() => setCategoryFilter(cat.id)}
                className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                  categoryFilter === cat.id
                    ? 'bg-zinc-800 text-amber-400 font-semibold shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Sort Dropdown */}
          <div className="relative flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-zinc-300 font-mono">
            <ArrowUpDown className="w-3.5 h-3.5 text-zinc-500" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortField)}
              className="bg-transparent text-xs text-zinc-300 focus:outline-none cursor-pointer pr-2 font-mono"
            >
              <option value="recent" className="bg-zinc-900 text-zinc-200">Sort: Newest</option>
              <option value="oldest" className="bg-zinc-900 text-zinc-200">Sort: Oldest</option>
              <option value="name-asc" className="bg-zinc-900 text-zinc-200">Sort: Name (A-Z)</option>
              <option value="name-desc" className="bg-zinc-900 text-zinc-200">Sort: Name (Z-A)</option>
              <option value="largest" className="bg-zinc-900 text-zinc-200">Sort: Largest</option>
              <option value="smallest" className="bg-zinc-900 text-zinc-200">Sort: Smallest</option>
              <option value="type" className="bg-zinc-900 text-zinc-200">Sort: File Type</option>
            </select>
          </div>

          {/* Grid/Table Toggle */}
          <div className="hidden sm:flex items-center gap-1 p-1 bg-zinc-900 border border-zinc-800 rounded-xl">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                viewMode === 'grid' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
              }`}
              title="Grid view"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                viewMode === 'table' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
              }`}
              title="Table view"
            >
              <ListIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Results Count & Query Feedback */}
      <div className="flex items-center justify-between text-xs text-zinc-500 font-mono">
        <span>
          Showing <strong className="text-zinc-300 tabular-nums">{filteredFiles.length}</strong> of{' '}
          <strong className="text-zinc-300 tabular-nums">{files.length}</strong> files
        </span>
        {searchQuery && (
          <span>
            Filter: &ldquo;{searchQuery}&rdquo;
          </span>
        )}
      </div>

      {/* File View: Grid or Table */}
      {filteredFiles.length === 0 ? (
        <div className="p-12 text-center border border-zinc-800 rounded-2xl bg-zinc-900/20 text-zinc-500 text-xs font-mono">
          No files matched your search or category filter.
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredFiles.map((file) => {
            const canPreview = isPreviewSupported(file);

            return (
              <div
                key={file.id}
                className="group relative bg-zinc-900/60 hover:bg-zinc-900/90 border border-zinc-800/80 hover:border-zinc-700 rounded-2xl p-5 transition-all duration-200 flex flex-col justify-between"
              >
                <div>
                  {/* Card Top: Icon & Action Menu */}
                  <div className="flex items-start justify-between gap-3 mb-3.5">
                    <div className="w-10 h-10 rounded-xl bg-zinc-800/90 flex items-center justify-center shrink-0 border border-zinc-700/60">
                      {getCategoryIcon(file.category, file.extension)}
                    </div>
                    <div className="flex items-center gap-1 opacity-90 sm:opacity-75 sm:group-hover:opacity-100 transition-opacity">
                      {canPreview && (
                        <button
                          onClick={() => onViewFile(file)}
                          title="View / Present File"
                          className="p-1.5 rounded-lg text-zinc-400 hover:text-amber-400 hover:bg-zinc-800 transition-colors cursor-pointer"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => onDownloadFile(file)}
                        title="Download original file"
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => onRequestDelete(file)}
                        title="Delete file permanently"
                        className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-zinc-800 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Card Filename */}
                  <h4
                    onClick={() => (canPreview ? onViewFile(file) : onDownloadFile(file))}
                    title={file.originalName}
                    className="text-sm font-semibold text-zinc-100 font-sans truncate hover:text-amber-400 transition-colors cursor-pointer"
                  >
                    {file.originalName}
                  </h4>

                  {/* Zero-Pill Metadata Line */}
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-zinc-500 font-mono mt-2">
                    <span className="uppercase font-semibold text-zinc-400">
                      {file.extension}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums">{formatBytes(file.sizeBytes)}</span>
                    {file.presentationMeta && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-amber-400/90 font-medium">
                          {file.presentationMeta.slideCount} slides
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Card Bottom: Upload Date & Action Button */}
                <div className="mt-4 pt-3.5 border-t border-zinc-800/60 flex items-center justify-between text-[11px] text-zinc-500 font-mono">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3 text-zinc-600" />
                    {formatDate(file.createdAt)}
                  </span>
                  {canPreview && (
                    <button
                      onClick={() => onViewFile(file)}
                      className="text-xs text-amber-500 hover:text-amber-400 font-semibold transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      {file.category === 'presentation' ? 'Present' : 'View'} →
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Table View */
        <div className="overflow-x-auto border border-zinc-800/80 rounded-2xl bg-zinc-900/40">
          <table className="w-full text-left text-xs font-sans">
            <thead className="bg-zinc-900 border-b border-zinc-800/80 text-zinc-500 font-mono uppercase">
              <tr>
                <th className="py-3 px-4">File Name</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4">Size</th>
                <th className="py-3 px-4">Upload Date</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 font-mono">
              {filteredFiles.map((file) => {
                const canPreview = isPreviewSupported(file);

                return (
                  <tr
                    key={file.id}
                    className="hover:bg-zinc-900/60 transition-colors group"
                  >
                    <td className="py-3.5 px-4 font-sans font-medium text-zinc-200">
                      <div className="flex items-center gap-2.5 max-w-sm truncate">
                        {getCategoryIcon(file.category, file.extension)}
                        <span
                          onClick={() => (canPreview ? onViewFile(file) : onDownloadFile(file))}
                          className="truncate hover:text-amber-400 cursor-pointer"
                          title={file.originalName}
                        >
                          {file.originalName}
                        </span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-zinc-400 uppercase">
                      {file.extension}
                    </td>
                    <td className="py-3.5 px-4 text-zinc-400 tabular-nums">
                      {formatBytes(file.sizeBytes)}
                    </td>
                    <td className="py-3.5 px-4 text-zinc-500">
                      {formatDate(file.createdAt)}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="inline-flex items-center gap-2">
                        {canPreview && (
                          <button
                            onClick={() => onViewFile(file)}
                            className="px-2.5 py-1 text-xs font-medium text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 rounded-md transition-colors cursor-pointer"
                          >
                            {file.category === 'presentation' ? 'Present' : 'View'}
                          </button>
                        )}
                        <button
                          onClick={() => onDownloadFile(file)}
                          className="p-1 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
                          title="Download"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => onRequestDelete(file)}
                          className="p-1 text-zinc-500 hover:text-red-400 transition-colors cursor-pointer"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
