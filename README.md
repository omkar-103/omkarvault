# Omkar Vault — Private File Vault with Supabase

A production-ready, security-hardened private file vault for a single administrator. Files are stored in **private Supabase Storage** with metadata in **Supabase PostgreSQL**. No files are stored on the local filesystem in production.

## Architecture

```
User (browser)
    ↓
Vault UI (React + Vite)
    ↓
Authenticated Express server (server.ts)
    ↓ ↓
Supabase Storage          Supabase PostgreSQL
(private bucket)          (vault_files table)
```

**Security guarantees:**
- `SUPABASE_SECRET_KEY` is **never** exposed to the browser — it only exists in `server.ts` and `lib/supabase/server.ts`
- The Supabase Storage bucket is **private** — all access is proxied through the authenticated server
- Unauthenticated users cannot list, download, preview, upload, or delete files

---

## Key Features

1. **Server-Side Authentication**
   - Single-administrator passkey (configurable via `VAULT_ADMIN_PASSWORD`)
   - Constant-time hash verification (`crypto.timingSafeEqual`) preventing timing attacks
   - Brute-force rate limiting with progressive cooldowns
   - HttpOnly, SameSite=Lax signed session cookies (24-hour expiration)
   - No public signup, user profiles, or password reset

2. **Supabase Private Storage**
   - All files uploaded to `omkarvault` private bucket
   - Storage path: `files/{uuid}/{sanitized-filename}`
   - Files proxied through authenticated server endpoints
   - Short-lived signed URLs (never exposed as permanent public URLs)

3. **Supabase PostgreSQL Metadata**
   - `vault_files` table stores all file metadata
   - No binary data stored in the database
   - Sorting, searching, and filtering via database queries

4. **Presentation Viewer (PPT / PPTX)**
   - Native browser slide rendering
   - Full slide navigation, thumbnail drawer, keyboard shortcuts
   - Laser pointer, pen, highlighter, eraser tools
   - Auto-play slideshow, fullscreen mode

5. **In-App PDF Viewer**
   - High-fidelity streaming viewer with zoom controls
   - Keyboard shortcuts: PageUp/PageDown, Home, End, +, -, Esc

6. **Multi-Format File Management**
   - Supported: PDF, DOC, DOCX, PPT, PPTX, PNG, JPG, JPEG, WEBP, GIF, XLS, XLSX, CSV, ZIP
   - Drag-and-drop uploader with real-time progress
   - Search and sorting: Newest, Oldest, Name A-Z, Name Z-A, Largest, Smallest, Type

---

## Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project (free tier works)
- Supabase Storage bucket named `omkarvault` (private)

---

## Supabase Setup

### 1. Create the Storage Bucket

In your Supabase dashboard → Storage:
1. Create a new bucket named `omkarvault`
2. Set it to **Private** (not public)
3. No Storage policies are needed — the server-side service role key bypasses RLS

### 2. Create the Database Table

In your Supabase dashboard → SQL Editor, run:

```sql
-- contents of supabase/migrations/001_vault_files.sql
```

Or run the migration file directly:
```bash
# Copy the SQL from supabase/migrations/001_vault_files.sql and paste into Supabase SQL Editor
```

### 3. Get Your Credentials

In your Supabase dashboard → Settings → API:
- **Project URL**: `https://YOUR_PROJECT_REF.supabase.co`
- **Publishable (anon) key**: starts with `eyJ...`
- **Secret (service role) key**: starts with `eyJ...` — **KEEP THIS SERVER-SIDE ONLY**

---

## Local Development

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Copy the example file and fill in your real values:

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_anon_key
SUPABASE_SECRET_KEY=your_service_role_key   # SERVER ONLY — never expose to browser

DATABASE_URL=postgresql://postgres.YOUR_PROJECT_REF:YOUR_DB_PASSWORD@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres

VAULT_ADMIN_PASSWORD=10032006
SESSION_SECRET=your_random_32_char_secret

STORAGE_BUCKET=omkarvault
MAX_FILE_SIZE_MB=100
SESSION_DURATION_HOURS=24
```

### 3. Run the Development Server

```bash
npm run dev
```

The server starts at `http://localhost:3000`.

### 4. Login

Default password: `10032006` (change via `VAULT_ADMIN_PASSWORD`)

---

## Production Deployment (Vercel / Railway / Fly.io)

Set the following environment variables in your deployment platform:

| Variable | Description | Secret? |
|----------|-------------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | No |
| `SUPABASE_URL` | Supabase project URL | No |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Anon/publishable key | No |
| `SUPABASE_SECRET_KEY` | Service role key | **YES — server only** |
| `DATABASE_URL` | PostgreSQL connection string | **YES** |
| `VAULT_ADMIN_PASSWORD` | Admin password | **YES** |
| `SESSION_SECRET` | Token signing secret (32+ chars) | **YES** |
| `STORAGE_BUCKET` | `omkarvault` | No |
| `MAX_FILE_SIZE_MB` | Max upload size | No |
| `SESSION_DURATION_HOURS` | Session lifetime | No |

> **IMPORTANT**: `SUPABASE_SECRET_KEY` must NEVER be set as a `NEXT_PUBLIC_` variable or exposed to the browser in any way.

### Build for Production

```bash
npm run build
npm run start
```

---

## Security Notes

- **Single Administrator**: Strictly single-tenant. No multi-user tables or public signups.
- **Private Storage**: All file access goes through the authenticated server. The Supabase bucket has 0 public policies.
- **Secret Key Isolation**: `SUPABASE_SECRET_KEY` only appears in `server.ts` and `lib/supabase/server.ts`. It is never bundled into the React frontend.
- **No Permanent Public URLs**: Download and preview endpoints proxy files through the authenticated server. No signed URLs are shared with the browser.
- **Rate Limiting**: 5 failed login attempts triggers a lockout with progressive cooldowns.
- **Constant-Time Comparison**: Password verification uses `crypto.timingSafeEqual` to prevent timing attacks.

---

## Tech Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS v4, Lucide Icons, Motion
- **Backend**: Node.js, Express, Multer (memory storage), cookie-parser, JSZip
- **Database**: Supabase PostgreSQL
- **Storage**: Supabase Storage (private bucket)
- **SDK**: `@supabase/supabase-js`
- **Dev**: Vite + tsx

---

## File Structure

```
├── server.ts                  # Express server (Supabase integration)
├── lib/
│   └── supabase/
│       └── server.ts          # SERVER ONLY — Supabase admin client
├── supabase/
│   └── migrations/
│       └── 001_vault_files.sql # Database schema
├── src/
│   ├── App.tsx                # React app
│   ├── components/            # UI components
│   ├── lib/api.ts             # Frontend API calls (no secret keys)
│   └── types/vault.ts         # Shared TypeScript types
├── .env.example               # Safe template (commit this)
├── .env.local                 # Your real secrets (NEVER commit)
└── .gitignore                 # Excludes all secret files
```
