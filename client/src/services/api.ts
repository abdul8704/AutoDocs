import { AccessibleRepo, ImportedRepo, InstallationStatus } from '../types';

let currentAccessToken: string | null = null;
let refreshPromise: Promise<string | null> | null = null;

export const setAccessToken = (token: string | null) => {
  currentAccessToken = token;
};

export const getAccessToken = () => currentAccessToken;

export async function requestRefreshToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const res = await fetch('/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      if (!res.ok) {
        setAccessToken(null);
        return null;
      }
      const data = await res.json();
      if (data.success && data.data?.accessToken) {
        const newToken = data.data.accessToken;
        setAccessToken(newToken);
        return newToken;
      }
      setAccessToken(null);
      return null;
    } catch (err) {
      console.error('Error refreshing token:', err);
      setAccessToken(null);
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export async function apiFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (currentAccessToken) {
    headers.set('Authorization', `Bearer ${currentAccessToken}`);
  }
  if (!headers.has('Content-Type') && options.body && typeof options.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }

  let res = await fetch(endpoint, {
    ...options,
    headers,
    credentials: 'include',
  });

  // If 401 Unauthorized, try refreshing token once and retrying
  if (res.status === 401) {
    const newToken = await requestRefreshToken();
    if (newToken) {
      headers.set('Authorization', `Bearer ${newToken}`);
      res = await fetch(endpoint, {
        ...options,
        headers,
        credentials: 'include',
      });
    }
  }

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(errBody.message || `Request failed with status ${res.status}`);
  }

  return res.json();
}

// GitHub API Services
export async function fetchInstallationStatus(): Promise<InstallationStatus> {
  return apiFetch<InstallationStatus>('/api/github/installation-status');
}

export async function fetchAccessibleRepos(): Promise<{ success: boolean; repos: AccessibleRepo[] }> {
  return apiFetch<{ success: boolean; repos: AccessibleRepo[] }>('/api/github/accessible-repos');
}

export async function fetchImportedRepos(): Promise<{ success: boolean; repos: ImportedRepo[] }> {
  return apiFetch<{ success: boolean; repos: ImportedRepo[] }>('/api/github/imported-repos');
}

export async function importRepository(params: {
  githubRepoId: string;
  name: string;
  cloneUrl: string;
  installation_id: number;
}): Promise<{ success: boolean; importedRepo: ImportedRepo }> {
  return apiFetch<{ success: boolean; importedRepo: ImportedRepo }>('/api/github/import-repo', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function deleteImportedRepository(repoId: string): Promise<void> {
  return apiFetch<void>(`/api/github/repo/${repoId}`, {
    method: 'DELETE',
  });
}

export async function logoutUser(): Promise<void> {
  await fetch('/auth/logout', {
    method: 'POST',
    credentials: 'include',
  });
  setAccessToken(null);
}
