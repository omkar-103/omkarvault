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
    const data = await res.json();
    if (!res.ok) {
      return {
        success: false,
        error: data.error || 'Authentication failed',
        remainingSec: data.remainingSec,
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
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append('file', file);

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onProgress) {
        const percent = Math.round((e.loaded / e.total) * 100);
        onProgress(percent);
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const res = JSON.parse(xhr.responseText);
          resolve(res.file);
        } catch {
          reject(new Error('Invalid upload response'));
        }
      } else {
        try {
          const res = JSON.parse(xhr.responseText);
          reject(new Error(res.error || 'Upload failed'));
        } catch {
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      }
    });

    xhr.addEventListener('error', () => {
      reject(new Error('Network error during upload'));
    });

    const uploadUrl = cachedToken
      ? `/api/files/upload?token=${encodeURIComponent(cachedToken)}`
      : '/api/files/upload';

    xhr.open('POST', uploadUrl);
    if (cachedToken) {
      xhr.setRequestHeader('Authorization', `Bearer ${cachedToken}`);
    }
    xhr.withCredentials = true;
    xhr.send(formData);
  });
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
