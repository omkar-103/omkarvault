import { VaultFile, SessionInfo, PresentationMeta } from '../types/vault';

let cachedToken: string | null = null;
try {
  cachedToken = sessionStorage.getItem('vault_auth_token');
} catch {}

export function setAuthToken(token: string | null) {
  cachedToken = token;
  try {
    if (token) {
      sessionStorage.setItem('vault_auth_token', token);
    } else {
      sessionStorage.removeItem('vault_auth_token');
    }
  } catch {}
}

export function getAuthToken(): string | null {
  return cachedToken;
}

export function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (cachedToken) {
    headers['Authorization'] = `Bearer ${cachedToken}`;
  }
  return headers;
}

export function getFileRawUrl(id: string): string {
  if (cachedToken) {
    return `/api/files/${id}/raw?token=${encodeURIComponent(cachedToken)}`;
  }
  return `/api/files/${id}/raw`;
}

export function getFileDownloadUrl(id: string): string {
  if (cachedToken) {
    return `/api/files/${id}/download?token=${encodeURIComponent(cachedToken)}`;
  }
  return `/api/files/${id}/download`;
}

export async function checkSession(): Promise<SessionInfo> {
  try {
    const res = await fetch('/api/auth/session', {
      headers: getAuthHeaders(),
      credentials: 'same-origin',
    });
    if (!res.ok) return { authenticated: false };
    const data = await res.json();
    return data;
  } catch {
    return { authenticated: false };
  }
}

export async function login(password: string): Promise<{ success: boolean; error?: string; remainingSec?: number }> {
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ password }),
    });

    const contentType = res.headers.get('content-type') || '';
    let data: any = {};
    if (contentType.includes('application/json')) {
      try {
        data = await res.json();
      } catch {
        data = {};
      }
    } else {
      const text = await res.text();
      data = { error: text || `HTTP ${res.status}` };
    }

    if (!res.ok) {
      let errorMsg = 'Authentication failed';
      if (typeof data.error === 'string') {
        errorMsg = data.error;
      } else if (data.error && typeof data.error === 'object') {
        errorMsg = data.error.message || data.error.code || JSON.stringify(data.error);
      } else if (typeof data.message === 'string') {
        errorMsg = data.message;
      } else if (res.status === 404) {
        errorMsg = 'Vault API not found (404). Ensure Vercel serverless functions are deployed.';
      }

      return {
        success: false,
        error: errorMsg,
        remainingSec: typeof data.remainingSec === 'number' ? data.remainingSec : undefined,
      };
    }
    if (data.token) {
      setAuthToken(data.token);
    }
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Network error during authentication';
    return { success: false, error: message };
  }
}

export async function logout(): Promise<boolean> {
  try {
    const res = await fetch('/api/auth/logout', {
      method: 'POST',
      headers: getAuthHeaders(),
      credentials: 'same-origin',
    });
    setAuthToken(null);
    return res.ok;
  } catch {
    setAuthToken(null);
    return false;
  }
}

export async function fetchFiles(): Promise<{ files: VaultFile[]; totalCount: number }> {
  const res = await fetch('/api/files', {
    headers: getAuthHeaders(),
    credentials: 'same-origin',
  });
  if (!res.ok) {
    if (res.status === 401) {
      throw new Error('UNAUTHORIZED');
    }
    throw new Error('Failed to fetch files');
  }
  return await res.json();
}

export async function uploadFile(
  file: File,
  onProgress?: (percent: number) => void
): Promise<VaultFile> {
  // Step 1: Request signed upload URL from server (bypasses Vercel 4.5MB limit)
  const prepareUrl = cachedToken
    ? `/api/files/prepare-upload?token=${encodeURIComponent(cachedToken)}`
    : '/api/files/prepare-upload';

  const prepareRes = await fetch(prepareUrl, {
    method: 'POST',
    headers: {
      ...getAuthHeaders(),
      'Content-Type': 'application/json',
    },
    credentials: 'same-origin',
    body: JSON.stringify({
      filename: file.name,
      size: file.size,
      mimeType: file.type || 'application/octet-stream',
    }),
  });

  if (!prepareRes.ok) {
    if (prepareRes.status === 401) throw new Error('UNAUTHORIZED');
    let errText = 'Failed to initiate upload';
    try {
      const errJson = await prepareRes.json();
      errText = errJson.error || errText;
    } catch {}
    throw new Error(errText);
  }

  const { fileId, storageKey, signedUrl } = await prepareRes.json();

  // Step 2: Upload directly to Supabase Storage signed URL with real-time progress
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', signedUrl);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onProgress) {
        const percent = Math.round((e.loaded / e.total) * 100);
        onProgress(percent);
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Storage direct upload failed with status ${xhr.status}`));
      }
    });

    xhr.addEventListener('error', () => {
      reject(new Error('Network error during file upload'));
    });

    xhr.addEventListener('abort', () => {
      reject(new Error('Upload aborted'));
    });

    xhr.send(file);
  });

  // Step 3: Complete upload and store metadata in PostgreSQL
  const completeUrl = cachedToken
    ? `/api/files/complete-upload?token=${encodeURIComponent(cachedToken)}`
    : '/api/files/complete-upload';

  const completeRes = await fetch(completeUrl, {
    method: 'POST',
    headers: {
      ...getAuthHeaders(),
      'Content-Type': 'application/json',
    },
    credentials: 'same-origin',
    body: JSON.stringify({
      fileId,
      storageKey,
      originalName: file.name,
      sizeBytes: file.size,
      mimeType: file.type || 'application/octet-stream',
    }),
  });

  if (!completeRes.ok) {
    if (completeRes.status === 401) throw new Error('UNAUTHORIZED');
    let errText = 'Failed to finalize file metadata';
    try {
      const errJson = await completeRes.json();
      errText = errJson.error || errText;
    } catch {}
    throw new Error(errText);
  }

  const completeData = await completeRes.json();
  return completeData.file;
}

export async function deleteFile(id: string): Promise<boolean> {
  const res = await fetch(`/api/files/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
    credentials: 'same-origin',
  });
  if (!res.ok) {
    if (res.status === 401) throw new Error('UNAUTHORIZED');
    throw new Error('Failed to delete file');
  }
  return true;
}

export async function fetchPresentation(id: string): Promise<PresentationMeta> {
  const res = await fetch(`/api/files/${id}/presentation`, {
    headers: getAuthHeaders(),
    credentials: 'same-origin',
  });
  if (!res.ok) {
    if (res.status === 401) throw new Error('UNAUTHORIZED');
    throw new Error('Failed to load presentation slides');
  }
  const data = await res.json();
  return data.presentation;
}

export async function seedStarterSamples(): Promise<number> {
  const res = await fetch('/api/files/seed-samples', {
    method: 'POST',
    headers: getAuthHeaders(),
    credentials: 'same-origin',
  });
  if (!res.ok) throw new Error('Failed to seed starter samples');
  const data = await res.json();
  return data.count || 2;
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function formatDate(isoString: string): string {
  try {
    const d = new Date(isoString);
    return d.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoString;
  }
}
