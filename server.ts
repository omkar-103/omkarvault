/**
 * Omkar Vault — Express Server with Supabase Storage + PostgreSQL
 *
 * SERVER ONLY — All Supabase secret key usage is confined to this file
 * and lib/supabase/server.ts. Neither file is ever bundled into the browser.
 *
 * Architecture:
 *   Browser → Express API (authenticated) → Supabase Storage (private bucket)
 *                                         → Supabase PostgreSQL (file metadata)
 */

import express from 'express';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import JSZip from 'jszip';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

// Load .env.local first, then .env
dotenv.config({ path: '.env.local' });
dotenv.config();

// SERVER ONLY import — NEVER import supabaseAdmin in any client component
import { supabaseAdmin, STORAGE_BUCKET, isSupabaseConfigured } from './lib/supabase/server.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = '0.0.0.0';

// ─────────────────────────────────────────────
// Configuration — all sourced from env variables
// ─────────────────────────────────────────────
const VAULT_ADMIN_PASSWORD = process.env.VAULT_ADMIN_PASSWORD || '10032006';
const SESSION_SECRET = process.env.SESSION_SECRET || 'omkar_vault_session_secret_default_key_32_chars';
const MAX_FILE_SIZE_MB = parseInt(process.env.MAX_FILE_SIZE_MB || '100', 10);
const SESSION_DURATION_HOURS = parseInt(process.env.SESSION_DURATION_HOURS || '24', 10);

if (!process.env.SESSION_SECRET) {
  console.warn('[Vault] WARNING: SESSION_SECRET environment variable is not set. Using fallback key.');
}

// ─────────────────────────────────────────────
// Password Hashing (server-side, constant-time)
// ─────────────────────────────────────────────
function hashPassword(pwd: string): string {
  return crypto.createHmac('sha256', SESSION_SECRET!).update(pwd).digest('hex');
}
const ADMIN_PASSWORD_HASH = hashPassword(VAULT_ADMIN_PASSWORD);

// ─────────────────────────────────────────────
// Session Store (in-memory; fine for single-admin vault)
// ─────────────────────────────────────────────
interface SessionData {
  token: string;
  createdAt: number;
  expiresAt: number;
  ip: string;
}
const activeSessions = new Map<string, SessionData>();

// ─────────────────────────────────────────────
// Rate Limiting (login brute-force protection)
// ─────────────────────────────────────────────
interface RateLimitEntry {
  attempts: number;
  lockedUntil: number;
  lastAttempt: number;
}
const loginRateLimiter = new Map<string, RateLimitEntry>();

function getClientIp(req: express.Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  return req.socket.remoteAddress || '127.0.0.1';
}

function checkRateLimit(ip: string): { allowed: boolean; remainingSec: number } {
  const entry = loginRateLimiter.get(ip);
  const now = Date.now();
  if (!entry) return { allowed: true, remainingSec: 0 };
  if (entry.lockedUntil > now) {
    return { allowed: false, remainingSec: Math.ceil((entry.lockedUntil - now) / 1000) };
  }
  if (now - entry.lastAttempt > 10 * 60 * 1000) {
    loginRateLimiter.delete(ip);
    return { allowed: true, remainingSec: 0 };
  }
  return { allowed: true, remainingSec: 0 };
}

function recordFailedLogin(ip: string): { locked: boolean; remainingSec: number } {
  const now = Date.now();
  const entry = loginRateLimiter.get(ip) || { attempts: 0, lockedUntil: 0, lastAttempt: now };
  entry.attempts += 1;
  entry.lastAttempt = now;
  if (entry.attempts >= 5) {
    const cooldownSec = Math.min(300, 60 * (entry.attempts - 4));
    entry.lockedUntil = now + cooldownSec * 1000;
    loginRateLimiter.set(ip, entry);
    return { locked: true, remainingSec: cooldownSec };
  }
  loginRateLimiter.set(ip, entry);
  return { locked: false, remainingSec: 0 };
}

function recordSuccessfulLogin(ip: string): void {
  loginRateLimiter.delete(ip);
}

// ─────────────────────────────────────────────
// Session Token Helpers
// ─────────────────────────────────────────────
interface TokenPayload {
  t: number;      // creation time
  exp: number;    // expiration time
  nonce: string;  // random nonce
  ip?: string;
}

function generateSessionToken(ip = '127.0.0.1'): string {
  const now = Date.now();
  const expiresAt = now + SESSION_DURATION_HOURS * 60 * 60 * 1000;
  const nonce = crypto.randomBytes(16).toString('hex');
  const payload: TokenPayload = { t: now, exp: expiresAt, nonce, ip };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', SESSION_SECRET).update(payloadB64).digest('base64url');
  return `${payloadB64}.${signature}`;
}

function verifySessionToken(token: string): { valid: boolean; expiresAt?: number } {
  if (!token || !token.includes('.')) return { valid: false };
  const [payloadB64, signature] = token.split('.');
  if (!payloadB64 || !signature) return { valid: false };
  const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(payloadB64).digest('base64url');
  try {
    const isSigValid = crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig));
    if (!isSigValid) return { valid: false };
    const data: TokenPayload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    if (!data.exp || data.exp < Date.now()) return { valid: false };
    return { valid: true, expiresAt: data.exp };
  } catch {
    return { valid: false };
  }
}

function auditLog(event: string, details?: Record<string, unknown>) {
  console.log(`[AUDIT ${new Date().toISOString()}] ${event}`, details ? JSON.stringify(details) : '');
}

// ─────────────────────────────────────────────
// Vault Types
// ─────────────────────────────────────────────
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

// ─────────────────────────────────────────────
// File Category Helper
// ─────────────────────────────────────────────
function getFileCategory(ext: string): VaultFile['category'] {
  const e = ext.toLowerCase().replace('.', '');
  if (['pdf', 'doc', 'docx', 'txt', 'rtf', 'odt', 'md'].includes(e)) return 'document';
  if (['ppt', 'pptx', 'odp', 'key'].includes(e)) return 'presentation';
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'bmp', 'tiff'].includes(e)) return 'image';
  if (['xls', 'xlsx', 'csv', 'tsv', 'ods'].includes(e)) return 'spreadsheet';
  if (['zip', 'tar', 'gz', '7z', 'rar'].includes(e)) return 'archive';
  return 'other';
}

// ─────────────────────────────────────────────
// Supabase Storage Helpers (server-side only)
// ─────────────────────────────────────────────

/** Upload a buffer to the private Supabase Storage bucket */
async function uploadToStorage(
  storageKey: string,
  buffer: Buffer,
  mimeType: string
): Promise<void> {
  const { error } = await supabaseAdmin.storage
    .from(STORAGE_BUCKET)
    .upload(storageKey, buffer, {
      contentType: mimeType,
      upsert: false,
    });

  if (error) {
    throw new Error(`Supabase Storage upload failed: ${error.message}`);
  }
}

/** Delete one or more objects from Supabase Storage */
async function deleteFromStorage(storageKeys: string[]): Promise<void> {
  if (storageKeys.length === 0) return;
  const { error } = await supabaseAdmin.storage
    .from(STORAGE_BUCKET)
    .remove(storageKeys);
  if (error) {
    console.error('Storage delete error (non-fatal):', error.message);
  }
}

/** Download a file buffer from Supabase Storage (server-side) */
async function downloadFromStorage(storageKey: string): Promise<Buffer> {
  const { data, error } = await supabaseAdmin.storage
    .from(STORAGE_BUCKET)
    .download(storageKey);

  if (error || !data) {
    throw new Error(`Supabase Storage download failed: ${error?.message || 'no data'}`);
  }

  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/** Generate a short-lived (60-second) signed URL — never exposed as permanent public URL */
async function getSignedUrl(storageKey: string, expiresInSeconds = 60): Promise<string> {
  const { data, error } = await supabaseAdmin.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(storageKey, expiresInSeconds);

  if (error || !data?.signedUrl) {
    throw new Error(`Failed to generate signed URL: ${error?.message}`);
  }

  return data.signedUrl;
}

// ─────────────────────────────────────────────
// Supabase PostgreSQL Helpers
// ─────────────────────────────────────────────

function mapRowToVaultFile(row: Record<string, unknown>): VaultFile {
  const toIso = (val: unknown): string => {
    if (!val) return new Date().toISOString();
    if (typeof val === 'string') return val;
    if (val instanceof Date) return val.toISOString();
    return new Date(String(val)).toISOString();
  };

  return {
    id: row.id as string,
    originalName: row.original_name as string,
    storageKey: row.storage_key as string,
    mimeType: row.mime_type as string,
    extension: row.extension as string,
    sizeBytes: Number(row.size_bytes),
    category: row.category as VaultFile['category'],
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    presentationMeta: row.presentation_meta ? (row.presentation_meta as PresentationMeta) : undefined,
  };
}

async function dbListFiles(): Promise<VaultFile[]> {
  const { data, error } = await supabaseAdmin
    .from('vault_files')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw new Error(`DB list failed: ${error.message}`);
  return (data || []).map(mapRowToVaultFile);
}

async function dbGetFile(id: string): Promise<VaultFile | null> {
  const { data, error } = await supabaseAdmin
    .from('vault_files')
    .select('*')
    .eq('id', id)
    .single();

  if (error) return null;
  return data ? mapRowToVaultFile(data as Record<string, unknown>) : null;
}

async function dbInsertFile(file: VaultFile): Promise<void> {
  const { error } = await supabaseAdmin.from('vault_files').insert({
    id: file.id,
    original_name: file.originalName,
    storage_key: file.storageKey,
    mime_type: file.mimeType,
    extension: file.extension,
    size_bytes: file.sizeBytes,
    category: file.category,
    presentation_meta: file.presentationMeta || null,
    slide_count: file.presentationMeta?.slideCount || null,
    preview_status: file.presentationMeta?.status || null,
  });

  if (error) throw new Error(`DB insert failed: ${error.message}`);
}

async function dbUpdatePresentationMeta(id: string, meta: PresentationMeta): Promise<void> {
  const { error } = await supabaseAdmin
    .from('vault_files')
    .update({
      presentation_meta: meta,
      slide_count: meta.slideCount,
      preview_status: meta.status,
      preview_error: null,
    })
    .eq('id', id);

  if (error) throw new Error(`DB update presentation meta failed: ${error.message}`);
}

async function dbDeleteFile(id: string): Promise<void> {
  const { error } = await supabaseAdmin.from('vault_files').delete().eq('id', id);
  if (error) throw new Error(`DB delete failed: ${error.message}`);
}

// ─────────────────────────────────────────────
// PPTX Slide Parser (memory-based, no disk write)
// ─────────────────────────────────────────────
async function parsePptxBuffer(buffer: Buffer, fileId: string): Promise<PresentationMeta> {
  try {
    const zip = await JSZip.loadAsync(buffer);

    // Read slide dimensions from presentation.xml
    let slideWidth = 18288000;
    let slideHeight = 10287000;
    const presFile = zip.file('ppt/presentation.xml');
    if (presFile) {
      const presXml = await presFile.async('text');
      const szMatch = presXml.match(/<p:sldSz\s+cx="(\d+)"\s+cy="(\d+)"/);
      if (szMatch) {
        slideWidth = parseInt(szMatch[1], 10);
        slideHeight = parseInt(szMatch[2], 10);
      }
    }
    const aspectRatio = Number((slideWidth / slideHeight).toFixed(3));

    const slideEntries: { name: string; index: number; file: JSZip.JSZipObject }[] = [];
    zip.forEach((relativePath, file) => {
      const match = relativePath.match(/^ppt\/slides\/slide(\d+)\.xml$/i);
      if (match) {
        slideEntries.push({ name: relativePath, index: parseInt(match[1], 10), file });
      }
    });

    slideEntries.sort((a, b) => a.index - b.index);

    const slides: SlideData[] = [];

    for (let i = 0; i < slideEntries.length; i++) {
      const entry = slideEntries[i];
      const xmlText = await entry.file.async('text');

      // 1. Build map of relationship IDs to media URLs
      const relsPath = `ppt/slides/_rels/slide${entry.index}.xml.rels`;
      const relsFile = zip.file(relsPath);
      const relsMap: Record<string, { name: string; url: string }> = {};
      const allImages: Array<{ name: string; url: string }> = [];

      if (relsFile) {
        const relsXml = await relsFile.async('text');
        const relMatches = relsXml.matchAll(/Id="([^"]+)"[^>]*Target="(?:\.\.\/media\/)?([^"]+)"/g);
        for (const m of relMatches) {
          const rId = m[1];
          const mediaName = m[2].replace(/^.*[\\\/]/, '');
          const imgUrl = `/api/files/${fileId}/slides/${i + 1}/media/${encodeURIComponent(mediaName)}`;
          relsMap[rId] = { name: mediaName, url: imgUrl };
          allImages.push({ name: mediaName, url: imgUrl });
        }
      }

      // 2. Extract slide background color if present
      let backgroundColor: string | undefined;
      const bgClrMatch = xmlText.match(/<a:srgbClr\s+val="([0-9a-fA-F]{6})"/i);
      if (bgClrMatch) backgroundColor = '#' + bgClrMatch[1];

      // 3. Extract all shapes and their positions (word boundary prevents matching p:spTree)
      const spMatches = xmlText.match(/<(?:p:sp|p:pic|p:grpSp)\b[\s\S]*?<\/(?:p:sp|p:pic|p:grpSp)>/g) || [];
      const placedImages: PlacedImage[] = [];
      const placedTexts: PlacedText[] = [];
      const rawParagraphs: string[] = [];
      const rawBullets: string[] = [];
      let backgroundImageUrl: string | undefined;

      for (const sp of spMatches) {
        // Position transform (handles both positive and negative offsets)
        const xfrmMatch = sp.match(/<a:off\s+x="(-?\d+)"\s+y="(-?\d+)"\s*\/><a:ext\s+cx="(\d+)"\s+cy="(\d+)"\s*\/>/);
        let left = 0;
        let top = 0;
        let width = 100;
        let height = 100;

        if (xfrmMatch) {
          const x = parseInt(xfrmMatch[1], 10);
          const y = parseInt(xfrmMatch[2], 10);
          const cx = parseInt(xfrmMatch[3], 10);
          const cy = parseInt(xfrmMatch[4], 10);

          left = Number(((x / slideWidth) * 100).toFixed(2));
          top = Number(((y / slideHeight) * 100).toFixed(2));
          width = Number(((cx / slideWidth) * 100).toFixed(2));
          height = Number(((cy / slideHeight) * 100).toFixed(2));
        }

        // Check if shape contains an image
        const blipMatch = sp.match(/<a:blip[^>]*r:embed="([^"]+)"/);
        if (blipMatch && relsMap[blipMatch[1]]) {
          const img = relsMap[blipMatch[1]];
          const isFullBleed = (left <= 2 && top <= 2 && width >= 85 && height >= 85) ||
                             (left <= 0 && top <= 0 && width >= 80);

          if (isFullBleed && !backgroundImageUrl) {
            backgroundImageUrl = img.url;
          } else {
            placedImages.push({
              name: img.name,
              url: img.url,
              left,
              top,
              width,
              height,
            });
          }
        }

        // Check if shape contains text
        const pMatches = sp.match(/<a:p[\s\S]*?<\/a:p>/g) || [];
        const paragraphs: TextParagraph[] = [];

        for (const pXml of pMatches) {
          const alignMatch = pXml.match(/<a:pPr[^>]*algn="([^"]+)"/);
          let align: TextParagraph['align'] = 'left';
          if (alignMatch) {
            if (alignMatch[1] === 'ctr') align = 'center';
            else if (alignMatch[1] === 'r') align = 'right';
            else if (alignMatch[1] === 'just') align = 'justify';
          }

          const runs: TextRun[] = [];
          const rMatches = pXml.match(/<a:r[\s\S]*?<\/a:r>/g) || [];

          for (const rXml of rMatches) {
            const tMatch = rXml.match(/<a:t[^>]*>([\s\S]*?)<\/a:t>/);
            if (!tMatch) continue;
            const text = tMatch[1].replace(/<[^>]+>/g, '');
            if (!text.trim()) continue;

            const szMatch = rXml.match(/sz="(\d+)"/);
            const fontSize = szMatch ? parseInt(szMatch[1], 10) / 100 : undefined;
            const bold = /b="(?:1|true)"/i.test(rXml);
            const italic = /i="(?:1|true)"/i.test(rXml);

            const colorMatch = rXml.match(/<a:srgbClr\s+val="([0-9a-fA-F]{6})"/i);
            const color = colorMatch ? `#${colorMatch[1]}` : undefined;

            const fontMatch = rXml.match(/typeface="([^"]+)"/);
            const fontFamily = fontMatch ? fontMatch[1] : undefined;

            runs.push({ text, fontSize, bold, italic, color, fontFamily });
          }

          if (runs.length > 0) {
            paragraphs.push({ align, runs });
            const pText = runs.map((r) => r.text).join(' ');
            if (/<a:buChar|<a:buAutoNum/i.test(pXml)) {
              rawBullets.push(pText);
            } else {
              rawParagraphs.push(pText);
            }
          }
        }

        if (paragraphs.length > 0) {
          placedTexts.push({
            left,
            top,
            width,
            height,
            paragraphs,
          });
        }
      }

      // If no full-bleed background was found but images exist, check if first image is large
      if (!backgroundImageUrl && allImages.length > 0 && placedImages.length > 0) {
        if (placedImages[0].width >= 70 && placedImages[0].height >= 70) {
          backgroundImageUrl = placedImages[0].url;
          placedImages.shift();
        }
      }

      const title = rawParagraphs[0] || rawBullets[0] || `Slide ${i + 1}`;

      slides.push({
        index: i + 1,
        title,
        subtitles: rawParagraphs.slice(1, 3),
        paragraphs: rawParagraphs,
        bulletPoints: rawBullets,
        backgroundColor,
        backgroundImageUrl,
        hasImages: allImages.length > 0,
        images: allImages,
        placedImages,
        placedTexts,
        shapesCount: spMatches.length,
        aspectRatio,
      });
    }

    if (slides.length === 0) {
      slides.push({
        index: 1,
        title: 'Presentation Slide 1',
        subtitles: ['Ready for presentation viewing'],
        paragraphs: ['Slide contents ready.'],
        bulletPoints: [],
        hasImages: false,
        images: [],
        shapesCount: 1,
        aspectRatio: 1.778,
      });
    }

    return { slideCount: slides.length, slides, processedAt: new Date().toISOString(), status: 'ready' };
  } catch (err) {
    console.error('Error parsing PPTX:', err);
    return {
      slideCount: 1,
      slides: [
        {
          index: 1,
          title: 'Presentation Slide',
          subtitles: ['Processed slide'],
          paragraphs: ['Preview generated from presentation.'],
          bulletPoints: [],
          hasImages: false,
          images: [],
          shapesCount: 1,
        },
      ],
      processedAt: new Date().toISOString(),
      status: 'ready',
    };
  }
}

// ─────────────────────────────────────────────
// Multer — memory storage (files go to Supabase, not disk)
// ─────────────────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const dangerous = ['.exe', '.bat', '.sh', '.cmd', '.vbs', '.com', '.scr', '.pif', '.ps1'];
    if (dangerous.includes(ext)) {
      return cb(new Error('Executable and script file uploads are strictly prohibited.'));
    }
    cb(null, true);
  },
});

// ─────────────────────────────────────────────
// Express App & Middleware
// ─────────────────────────────────────────────
const app = express();

app.use(express.json());
app.use(cookieParser());

// Security Headers
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

function extractToken(req: express.Request): string | undefined {
  if (req.cookies?.vault_session) return req.cookies.vault_session;
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) return authHeader.substring(7).trim();
  if (typeof req.query.token === 'string') return req.query.token;
  return undefined;
}

const apiRouter = express.Router();

function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized. Secure vault session required.', authenticated: false });
  }
  const verified = verifySessionToken(token);
  if (!verified.valid) {
    res.clearCookie('vault_session');
    return res.status(401).json({ error: 'Session expired. Please re-authenticate.', authenticated: false });
  }
  next();
}

// ─────────────────────────────────────────────
// API Routes
// ─────────────────────────────────────────────

// 1. Session Status
apiRouter.get('/auth/session', (req, res) => {
  const token = extractToken(req);
  if (!token) return res.json({ authenticated: false });
  const verified = verifySessionToken(token);
  if (!verified.valid || !verified.expiresAt) {
    res.clearCookie('vault_session');
    return res.json({ authenticated: false });
  }
  const remainingHours = Math.max(0, (verified.expiresAt - Date.now()) / (1000 * 60 * 60));
  return res.json({
    authenticated: true,
    expiresInHours: parseFloat(remainingHours.toFixed(1)),
    sessionLifetimeHours: SESSION_DURATION_HOURS,
  });
});

// 2. Login
apiRouter.post('/auth/login', (req, res) => {
  const ip = getClientIp(req);
  const { allowed, remainingSec } = checkRateLimit(ip);

  if (!allowed) {
    auditLog('LOGIN_RATE_LIMITED', { ip, remainingSec });
    return res.status(429).json({ error: `Vault locked for ${remainingSec} seconds.`, remainingSec });
  }

  const { password } = req.body;

  const incomingHash = hashPassword(typeof password === 'string' ? password : '');
  let isMatch = false;
  try {
    isMatch = crypto.timingSafeEqual(Buffer.from(incomingHash), Buffer.from(ADMIN_PASSWORD_HASH));
  } catch {
    isMatch = false;
  }

  if (!isMatch) {
    const rateStatus = recordFailedLogin(ip);
    auditLog('LOGIN_FAILED', { ip });
    if (rateStatus.locked) {
      return res.status(429).json({ error: `Invalid password. Vault locked for ${rateStatus.remainingSec} seconds.`, remainingSec: rateStatus.remainingSec });
    }
    return res.status(401).json({ error: 'Invalid password.' });
  }

  recordSuccessfulLogin(ip);
  const token = generateSessionToken(ip);

  res.cookie('vault_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_DURATION_HOURS * 60 * 60 * 1000,
    path: '/',
  });

  auditLog('LOGIN_SUCCESS', { ip });
  return res.json({ success: true, token, message: 'Authenticated successfully.', expiresInHours: SESSION_DURATION_HOURS });
});

// 3. Logout
apiRouter.post('/auth/logout', (req, res) => {
  res.clearCookie('vault_session', { path: '/' });
  auditLog('LOGOUT', { ip: getClientIp(req) });
  return res.json({ success: true, message: 'Logged out successfully.' });
});

// 4. List Files
apiRouter.get('/files', requireAuth, async (_req, res) => {
  if (!isSupabaseConfigured) {
    return res.status(503).json({
      error: 'Supabase credentials not configured in Vercel environment variables. Please add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in Vercel Project Settings.',
      files: [],
      totalCount: 0,
    });
  }
  try {
    const files = await dbListFiles();
    res.json({ files, totalCount: files.length });
  } catch (err) {
    console.error('List files error:', err);
    res.status(500).json({ error: 'Failed to list vault files.' });
  }
});

// 5. Upload File → Supabase Storage + PostgreSQL metadata
apiRouter.post('/files/upload', requireAuth, upload.single('file'), async (req, res) => {
  if (!isSupabaseConfigured) {
    return res.status(503).json({
      error: 'Supabase credentials not configured in Vercel environment variables. Please add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in Vercel Project Settings.',
    });
  }
  if (!req.file) return res.status(400).json({ error: 'No file provided.' });

  const file = req.file;
  const originalName = path.basename(file.originalname).replace(/[\r\n\t]/g, '');
  const ext = path.extname(originalName).toLowerCase();
  const category = getFileCategory(ext);
  const fileId = crypto.randomUUID();

  // Collision-resistant storage path: files/{uuid}/{sanitized-name}
  const sanitizedName = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storageKey = `files/${fileId}/${sanitizedName}`;

  try {
    // 1. Upload to Supabase Storage (private bucket)
    await uploadToStorage(storageKey, file.buffer, file.mimetype || 'application/octet-stream');

    const newFileRecord: VaultFile = {
      id: fileId,
      originalName,
      storageKey,
      mimeType: file.mimetype || 'application/octet-stream',
      extension: ext.replace('.', ''),
      sizeBytes: file.size,
      category,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // 2. Handle PPTX/PPT — process slides
    if (category === 'presentation' && (ext === '.pptx' || ext === '.ppt')) {
      newFileRecord.presentationMeta = {
        slideCount: 0,
        slides: [],
        processedAt: new Date().toISOString(),
        status: 'processing',
      };

      // 3. Insert metadata first (status: processing)
      await dbInsertFile(newFileRecord);

      // 4. Parse slides from the in-memory buffer
      parsePptxBuffer(file.buffer, fileId)
        .then(async (presMeta) => {
          newFileRecord.presentationMeta = presMeta;
          await dbUpdatePresentationMeta(fileId, presMeta);
          auditLog('PPTX_PROCESSED', { fileId, slideCount: presMeta.slideCount });
        })
        .catch(async (err) => {
          console.error('Failed to parse presentation:', err);
          await dbUpdatePresentationMeta(fileId, {
            slideCount: 0,
            slides: [],
            processedAt: new Date().toISOString(),
            status: 'failed',
          });
        });
    } else {
      // 3. Insert metadata (non-presentation)
      await dbInsertFile(newFileRecord);
    }

    auditLog('FILE_UPLOADED', { fileId, name: originalName, size: file.size, category, ip: getClientIp(req) });
    return res.status(201).json({ success: true, file: newFileRecord });
  } catch (err) {
    console.error('Upload error:', err);
    // Attempt cleanup if storage succeeded but DB failed
    deleteFromStorage([storageKey]).catch(() => {});
    return res.status(500).json({ error: 'Upload failed. Please try again.' });
  }
});

// 5b. Prepare Direct Upload (bypasses Vercel 4.5MB serverless body limit)
apiRouter.post('/files/prepare-upload', requireAuth, async (req, res) => {
  if (!isSupabaseConfigured) {
    return res.status(503).json({
      error: 'Supabase credentials not configured in Vercel environment variables. Please add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in Vercel Project Settings.',
    });
  }

  const { filename, size } = req.body;
  if (!filename || typeof filename !== 'string') {
    return res.status(400).json({ error: 'Filename is required.' });
  }

  const originalName = path.basename(filename).replace(/[\r\n\t]/g, '');
  const ext = path.extname(originalName).toLowerCase();
  const dangerous = ['.exe', '.bat', '.sh', '.cmd', '.vbs', '.com', '.scr', '.pif', '.ps1'];
  if (dangerous.includes(ext)) {
    return res.status(400).json({ error: 'Executable and script file uploads are strictly prohibited.' });
  }

  if (size && Number(size) > MAX_FILE_SIZE_MB * 1024 * 1024) {
    return res.status(400).json({ error: `File exceeds maximum limit of ${MAX_FILE_SIZE_MB} MB.` });
  }

  const fileId = crypto.randomUUID();
  const sanitizedName = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storageKey = `files/${fileId}/${sanitizedName}`;

  try {
    const { data, error } = await supabaseAdmin.storage
      .from(STORAGE_BUCKET)
      .createSignedUploadUrl(storageKey);

    if (error || !data?.signedUrl) {
      throw new Error(`Failed to generate signed upload URL: ${error?.message || 'unknown error'}`);
    }

    return res.json({
      fileId,
      storageKey,
      signedUrl: data.signedUrl,
      token: data.token,
    });
  } catch (err: any) {
    console.error('prepare-upload error:', err);
    return res.status(500).json({ error: err.message || 'Failed to prepare upload.' });
  }
});

// 5c. Complete Direct Upload (saves metadata to DB and triggers PPTX slide processing)
apiRouter.post('/files/complete-upload', requireAuth, async (req, res) => {
  if (!isSupabaseConfigured) {
    return res.status(503).json({
      error: 'Supabase credentials not configured in Vercel environment variables.',
    });
  }

  const { fileId, storageKey, originalName, sizeBytes, mimeType } = req.body;
  if (!fileId || !storageKey || !originalName) {
    return res.status(400).json({ error: 'Missing required upload completion fields.' });
  }

  const ext = path.extname(originalName).toLowerCase();
  const category = getFileCategory(ext);

  const newFileRecord: VaultFile = {
    id: fileId,
    originalName,
    storageKey,
    mimeType: mimeType || 'application/octet-stream',
    extension: ext.replace('.', ''),
    sizeBytes: Number(sizeBytes) || 0,
    category,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  try {
    if (category === 'presentation' && (ext === '.pptx' || ext === '.ppt')) {
      newFileRecord.presentationMeta = {
        slideCount: 0,
        slides: [],
        processedAt: new Date().toISOString(),
        status: 'processing',
      };

      await dbInsertFile(newFileRecord);

      // Asynchronously download from Supabase Storage and parse presentation slides
      downloadFromStorage(storageKey)
        .then(async (buffer) => {
          const presMeta = await parsePptxBuffer(buffer, fileId);
          await dbUpdatePresentationMeta(fileId, presMeta);
          auditLog('PPTX_PROCESSED', { fileId, slideCount: presMeta.slideCount });
        })
        .catch(async (err) => {
          console.error('Failed to parse presentation in complete-upload:', err);
          await dbUpdatePresentationMeta(fileId, {
            slideCount: 0,
            slides: [],
            processedAt: new Date().toISOString(),
            status: 'failed',
          });
        });
    } else {
      await dbInsertFile(newFileRecord);
    }

    auditLog('FILE_UPLOADED', { fileId, name: originalName, size: sizeBytes, category, ip: getClientIp(req) });
    return res.status(201).json({ success: true, file: newFileRecord });
  } catch (err: any) {
    console.error('complete-upload error:', err);
    return res.status(500).json({ error: err.message || 'Failed to complete upload.' });
  }
});

// 6. Get File Details
apiRouter.get('/files/:id', requireAuth, async (req, res) => {
  const file = await dbGetFile(req.params.id);
  if (!file) return res.status(404).json({ error: 'File not found.' });
  return res.json({ file });
});

// 7. Download File (authenticated, server proxies from Supabase Storage)
apiRouter.get('/files/:id/download', requireAuth, async (req, res) => {
  const file = await dbGetFile(req.params.id);
  if (!file) return res.status(404).json({ error: 'File not found.' });

  try {
    const buffer = await downloadFromStorage(file.storageKey);
    auditLog('FILE_DOWNLOADED', { fileId: file.id, name: file.originalName, ip: getClientIp(req) });
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.originalName)}"`);
    res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
    res.setHeader('Content-Length', buffer.length);
    return res.send(buffer);
  } catch (err) {
    console.error('Download error:', err);
    return res.status(500).json({ error: 'Failed to retrieve file from storage.' });
  }
});

// 8. Raw Stream for In-App Preview (protected inline streaming)
apiRouter.get('/files/:id/raw', requireAuth, async (req, res) => {
  const file = await dbGetFile(req.params.id);
  if (!file) return res.status(404).json({ error: 'File not found.' });

  try {
    const buffer = await downloadFromStorage(file.storageKey);
    auditLog('FILE_PREVIEWED', { fileId: file.id, name: file.originalName, ip: getClientIp(req) });

    let contentType = file.mimeType || 'application/octet-stream';
    const ext = file.extension;
    if (ext === 'pdf') contentType = 'application/pdf';
    else if (['jpg', 'jpeg'].includes(ext)) contentType = 'image/jpeg';
    else if (ext === 'png') contentType = 'image/png';
    else if (ext === 'webp') contentType = 'image/webp';
    else if (ext === 'gif') contentType = 'image/gif';
    else if (ext === 'txt' || ext === 'md') contentType = 'text/plain; charset=utf-8';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.originalName)}"`);
    res.setHeader('Content-Length', buffer.length);
    return res.send(buffer);
  } catch (err) {
    console.error('Preview error:', err);
    return res.status(500).json({ error: 'Failed to retrieve file for preview.' });
  }
});

// 9. Presentation Details & Slides
apiRouter.get('/files/:id/presentation', requireAuth, async (req, res) => {
  const file = await dbGetFile(req.params.id);
  if (!file) return res.status(404).json({ error: 'Presentation not found.' });

  const hasRichLayout = file.presentationMeta?.slides?.some((s) => s.backgroundImageUrl || (s.placedTexts && s.placedTexts.length > 0));
  if (file.presentationMeta && file.presentationMeta.status === 'ready' && hasRichLayout && req.query.force !== 'true') {
    return res.json({ presentation: file.presentationMeta });
  }

  // Re-parse if not ready or if older format lacking rich layout positioning
  try {
    const buffer = await downloadFromStorage(file.storageKey);
    const meta = await parsePptxBuffer(buffer, file.id);
    await dbUpdatePresentationMeta(file.id, meta);
    return res.json({ presentation: meta });
  } catch (err) {
    console.error('Presentation parse error:', err);
    return res.status(500).json({ error: 'Failed to process presentation.' });
  }
});

// 10. PPTX Embedded Media Asset Stream
apiRouter.get('/files/:id/slides/:slideIndex/media/:mediaName', requireAuth, async (req, res) => {
  const file = await dbGetFile(req.params.id);
  if (!file) return res.status(404).send('Not found');

  try {
    const buffer = await downloadFromStorage(file.storageKey);
    const zip = await JSZip.loadAsync(buffer);
    const mediaName = decodeURIComponent(req.params.mediaName);
    const mediaFile = zip.file(`ppt/media/${mediaName}`);
    if (!mediaFile) return res.status(404).send('Media not found');

    const mediaBuffer = await mediaFile.async('nodebuffer');
    const ext = path.extname(mediaName).toLowerCase();
    let mime = 'image/png';
    if (ext === '.jpeg' || ext === '.jpg') mime = 'image/jpeg';
    if (ext === '.gif') mime = 'image/gif';
    if (ext === '.svg') mime = 'image/svg+xml';
    if (ext === '.webp') mime = 'image/webp';

    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    return res.send(mediaBuffer);
  } catch (err) {
    return res.status(500).send('Error extracting slide media');
  }
});

// 11. Delete File (removes from Supabase Storage + PostgreSQL)
apiRouter.delete('/files/:id', requireAuth, async (req, res) => {
  const file = await dbGetFile(req.params.id);
  if (!file) return res.status(404).json({ error: 'File not found.' });

  try {
    // Collect all storage keys to delete (original + any preview assets)
    const keysToDelete = [file.storageKey];

    // 1. Delete from Supabase Storage
    await deleteFromStorage(keysToDelete);

    // 2. Delete DB metadata
    await dbDeleteFile(file.id);

    auditLog('FILE_DELETED', { fileId: file.id, name: file.originalName, ip: getClientIp(req) });
    return res.json({ success: true, message: 'File permanently deleted.' });
  } catch (err) {
    console.error('Delete error:', err);
    return res.status(500).json({ error: 'Failed to delete file. Please try again.' });
  }
});

// 12. Seed Starter Demo Files (creates sample PPTX + PDF in Supabase Storage)
apiRouter.post('/files/seed-samples', requireAuth, async (req, res) => {
  try {
    // 1. Create a sample PPTX
    const samplePptxZip = new JSZip();
    samplePptxZip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
  <Override PartName="/ppt/slides/slide2.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
  <Override PartName="/ppt/slides/slide3.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
</Types>`);
    samplePptxZip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`);
    samplePptxZip.file('ppt/presentation.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:sldIdLst>
    <p:sldId id="256" r:id="rId1"/>
    <p:sldId id="257" r:id="rId2"/>
    <p:sldId id="258" r:id="rId3"/>
  </p:sldIdLst>
</p:presentation>`);
    samplePptxZip.file('ppt/slides/slide1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree><p:sp><p:txBody>
    <a:p><a:r><a:t>Omkar Vault: Architecture &amp; Security</a:t></a:r></a:p>
    <a:p><a:r><a:t>Executive Briefing — Supabase Private Storage</a:t></a:r></a:p>
  </p:txBody></p:sp></p:spTree></p:cSld>
</p:sld>`);
    samplePptxZip.file('ppt/slides/slide2.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree><p:sp><p:txBody>
    <a:p><a:r><a:t>Zero-Trust Storage Strategy</a:t></a:r></a:p>
    <a:p><a:buChar char="•"/><a:r><a:t>Server-side auth with constant-time comparison</a:t></a:r></a:p>
    <a:p><a:buChar char="•"/><a:r><a:t>Private Supabase Storage bucket — no public access</a:t></a:r></a:p>
    <a:p><a:buChar char="•"/><a:r><a:t>Rate limiting and brute force protection</a:t></a:r></a:p>
  </p:txBody></p:sp></p:spTree></p:cSld>
</p:sld>`);
    samplePptxZip.file('ppt/slides/slide3.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree><p:sp><p:txBody>
    <a:p><a:r><a:t>Interactive Presentation Controls</a:t></a:r></a:p>
    <a:p><a:buChar char="•"/><a:r><a:t>Laser Pointer mode (Press P)</a:t></a:r></a:p>
    <a:p><a:buChar char="•"/><a:r><a:t>Freehand Pen annotation overlay (Press D)</a:t></a:r></a:p>
    <a:p><a:buChar char="•"/><a:r><a:t>Highlighter &amp; selective stroke eraser (Press E)</a:t></a:r></a:p>
    <a:p><a:buChar char="•"/><a:r><a:t>Keyboard navigation and slide thumbnail jump</a:t></a:r></a:p>
  </p:txBody></p:sp></p:spTree></p:cSld>
</p:sld>`);

    const pptxBuffer = await samplePptxZip.generateAsync({ type: 'nodebuffer' });
    const pptxId = crypto.randomUUID();
    const pptxStorageKey = `files/${pptxId}/Executive_Briefing_Q4.pptx`;

    await uploadToStorage(pptxStorageKey, pptxBuffer, 'application/vnd.openxmlformats-officedocument.presentationml.presentation');

    const presMeta = await parsePptxBuffer(pptxBuffer, pptxId);

    const pptxRecord: VaultFile = {
      id: pptxId,
      originalName: 'Executive_Briefing_Q4.pptx',
      storageKey: pptxStorageKey,
      mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      extension: 'pptx',
      sizeBytes: pptxBuffer.length,
      category: 'presentation',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      presentationMeta: presMeta,
    };
    await dbInsertFile(pptxRecord);

    // 2. Create a sample PDF
    const samplePdfContent = `%PDF-1.4
1 0 obj
<< /Title (Omkar Vault Confidential Security Whitepaper) /Author (Administrator) >>
endobj
2 0 obj
<< /Type /Catalog /Pages 3 0 R >>
endobj
3 0 obj
<< /Type /Pages /Kids [4 0 R] /Count 1 >>
endobj
4 0 obj
<< /Type /Page /Parent 3 0 R /MediaBox [0 0 612 792]
   /Contents 5 0 R /Resources << /Font << /F1 6 0 R >> >> >>
endobj
5 0 obj
<< /Length 198 >>
stream
BT
/F1 22 Tf
50 720 Td
(OMKAR PRIVATE VAULT: PROTOCOLS) Tj
/F1 12 Tf
0 -36 Td
(1. Password authentication is strictly enforced on the server.) Tj
0 -22 Td
(2. Files stored in private Supabase Storage bucket.) Tj
0 -22 Td
(3. Metadata stored in Supabase PostgreSQL.) Ty
0 -22 Td
(4. Built-in PDF & PPTX viewers with annotations.) Tj
ET
endstream
endobj
6 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 7
0000000000 65535 f 
0000000009 00000 n 
0000000094 00000 n 
0000000143 00000 n 
0000000206 00000 n 
0000000333 00000 n 
0000000583 00000 n 
trailer
<< /Size 7 /Root 2 0 R /Info 1 0 R >>
startxref
654
%%EOF`;

    const pdfBuffer = Buffer.from(samplePdfContent);
    const pdfId = crypto.randomUUID();
    const pdfStorageKey = `files/${pdfId}/Confidential_Security_Protocols.pdf`;

    await uploadToStorage(pdfStorageKey, pdfBuffer, 'application/pdf');

    const pdfRecord: VaultFile = {
      id: pdfId,
      originalName: 'Confidential_Security_Protocols.pdf',
      storageKey: pdfStorageKey,
      mimeType: 'application/pdf',
      extension: 'pdf',
      sizeBytes: pdfBuffer.length,
      category: 'document',
      createdAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
      updatedAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    };
    await dbInsertFile(pdfRecord);

    auditLog('STARTER_SAMPLES_SEEDED');
    return res.json({ success: true, count: 2 });
  } catch (err) {
    console.error('Error seeding starter samples:', err);
    return res.status(500).json({ error: 'Failed to seed starter samples.' });
  }
});

// Mount API router at both '/api' and '/' for universal routing support (Vercel & standalone)
app.use('/api', apiRouter);
app.use('/', apiRouter);

// ─────────────────────────────────────────────
// Vite Dev Server / Production Static Files
// ─────────────────────────────────────────────
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, host: HOST, port: PORT },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, HOST, () => {
    console.log(`[Omkar Vault] Server running at http://${HOST}:${PORT}`);
    console.log(`[Omkar Vault] Supabase Storage bucket: ${STORAGE_BUCKET}`);
    console.log(`[Omkar Vault] Admin password: configured via VAULT_ADMIN_PASSWORD`);
  });
}

// Only start standalone HTTP listener when running locally, not under Vercel Serverless
if (!process.env.VERCEL) {
  startServer();
}

export default app;
