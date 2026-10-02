export interface PlacedImage {
  name: string;
  url: string;
  left: number;
  top: number;
  width: number;
  height: number;
  isBackground?: boolean;
}

export interface TextRun {
  text: string;
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  color?: string;
  fontFamily?: string;
}

export interface TextParagraph {
  align: 'left' | 'center' | 'right' | 'justify';
  runs: TextRun[];
}

export interface PlacedText {
  left: number;
  top: number;
  width: number;
  height: number;
  paragraphs: TextParagraph[];
}

export interface SlideData {
  index: number;
  title: string;
  subtitles: string[];
  paragraphs: string[];
  bulletPoints: string[];
  backgroundColor?: string;
  backgroundImageUrl?: string;
  hasImages: boolean;
  images: Array<{ name: string; url: string }>;
  placedImages?: PlacedImage[];
  placedTexts?: PlacedText[];
  shapesCount: number;
  aspectRatio?: number;
}

export interface PresentationMeta {
  slideCount: number;
  slides: SlideData[];
  processedAt: string;
  status: 'ready' | 'processing' | 'failed';
}

export interface VaultFile {
  id: string;
  originalName: string;
  storageKey: string;
  mimeType: string;
  extension: string;
  sizeBytes: number;
  category: 'document' | 'presentation' | 'image' | 'spreadsheet' | 'archive' | 'other';
  createdAt: string;
  updatedAt: string;
  presentationMeta?: PresentationMeta;
}

export interface SessionInfo {
  authenticated: boolean;
  expiresInHours?: number;
  sessionLifetimeHours?: number;
}

export type SortField = 'recent' | 'oldest' | 'name-asc' | 'name-desc' | 'largest' | 'smallest' | 'type';
export type FileCategoryFilter = 'all' | 'presentation' | 'document' | 'image' | 'spreadsheet' | 'archive';

export interface AnnotationStroke {
  id: string;
  type: 'pen' | 'highlighter';
  color: string;
  width: number;
  points: Array<{ x: number; y: number }>;
}
