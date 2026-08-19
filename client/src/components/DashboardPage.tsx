import React, { useEffect, useState } from 'react';
import { InstallationBanner } from './InstallationBanner';
import { RepoList } from './RepoList';
import { ImportedRepoList } from './ImportedRepoList';
import { AccessibleRepo, ImportedRepo, InstallationStatus } from '../types';
import {
  fetchAccessibleRepos,
  fetchImportedRepos,
  fetchInstallationStatus,
  importRepository,
  deleteImportedRepository,
} from '../services/api';
import { FolderGit2, BookOpen, CheckCircle2, AlertCircle } from 'lucide-react';

export const DashboardPage: React.FC = () => {
  const [installStatus, setInstallStatus] = useState<InstallationStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState<boolean>(true);

  const [accessibleRepos, setAccessibleRepos] = useState<AccessibleRepo[]>([]);
  const [reposLoading, setReposLoading] = useState<boolean>(false);

  const [importedRepos, setImportedRepos] = useState<ImportedRepo[]>([]);
  const [importedLoading, setImportedLoading] = useState<boolean>(false);

  const [activeTab, setActiveTab] = useState<'allowed' | 'imported'>('allowed');
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Check URL query parameters (e.g., ?github_connected=1 or ?github_error=...)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('github_connected') === '1') {
      setNotification({
        type: 'success',
        message: 'GitHub App successfully connected and authorized!',
      });
      // Clean query params from URL without reload
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (params.get('github_error')) {
      setNotification({
        type: 'error',
        message: `GitHub Setup failed: ${params.get('github_error')}`,
      });
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const loadInstallationStatus = async () => {
    setStatusLoading(true);
    try {
      const res = await fetchInstallationStatus();
      setInstallStatus(res);
      return res.isInstalled;
    } catch (err: any) {
      console.error('Failed to load installation status:', err);
      setInstallStatus({ isInstalled: false, installationId: null });
      return false;
    } finally {
      setStatusLoading(false);
    }
  };

  const loadAccessibleRepos = async () => {
    setReposLoading(true);
    try {
      const res = await fetchAccessibleRepos();
      if (res.success) {
        setAccessibleRepos(res.repos);
      }
    } catch (err: any) {
      console.error('Failed to load accessible repos:', err);
    } finally {
      setReposLoading(false);
    }
  };

  const loadImportedRepos = async () => {
    setImportedLoading(true);
    try {
      const res = await fetchImportedRepos();
      if (res.success) {
        setImportedRepos(res.repos);
      }
    } catch (err: any) {
      console.error('Failed to load imported repos:', err);
    } finally {
      setImportedLoading(false);
    }
  };

  const initData = async () => {
    const isInstalled = await loadInstallationStatus();
    loadImportedRepos();
    if (isInstalled) {
      loadAccessibleRepos();
    }
  };

  useEffect(() => {
    initData();
  }, []);

  const handleImportRepo = async (repo: AccessibleRepo) => {
    if (!installStatus?.installationId) {
      setNotification({ type: 'error', message: 'GitHub App installation ID missing.' });
      return;
    }

    try {
      const res = await importRepository({
        githubRepoId: repo.githubRepoId,
        name: repo.name,
        cloneUrl: repo.cloneUrl,
        installation_id: installStatus.installationId,
      });

      if (res.success) {
        setNotification({
          type: 'success',
          message: `Successfully imported "${repo.name}" into AutoDocs!`,
        });
        await loadImportedRepos();
      }
    } catch (err: any) {
      setNotification({
        type: 'error',
        message: err.message || `Failed to import "${repo.name}".`,
      });
    }
  };

  const handleDeleteRepo = async (repoId: string) => {
    try {
      await deleteImportedRepository(repoId);
      setNotification({
        type: 'success',
        message: 'Repository removed successfully.',
      });
      await loadImportedRepos();
    } catch (err: any) {
      setNotification({
        type: 'error',
        message: err.message || 'Failed to remove repository.',
      });
    }
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '2rem auto', padding: '0 1.5rem', display: 'flex', flexDirection: 'column', gap: '2rem' }} className="animate-fade-in">
      
      {/* Toast Notification */}
      {notification && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '1rem 1.25rem',
            borderRadius: 'var(--radius-md)',
            background: notification.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
            border: notification.type === 'success' ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',
            color: notification.type === 'success' ? '#34d399' : '#f87171',
            fontSize: '0.9rem'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            {notification.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
            <span>{notification.message}</span>
          </div>
          <button
            onClick={() => setNotification(null)}
            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '1.1rem', padding: '0 0.5rem' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Hero Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: 800, letterSpacing: '-0.02em', background: 'linear-gradient(90deg, #fff 0%, #a5b4fc 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Developer Dashboard
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', marginTop: '0.25rem' }}>
            Manage GitHub App authorizations, view accessible repositories, and trigger automated documentation generation.
          </p>
        </div>
      </div>

      {/* GitHub App Installation Banner */}
      <InstallationBanner
        status={installStatus}
        loading={statusLoading}
        onRefresh={loadInstallationStatus}
      />

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.75rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
        <button
          className={`btn ${activeTab === 'allowed' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('allowed')}
          style={{ borderRadius: 'var(--radius-sm)' }}
        >
          <FolderGit2 size={16} />
          <span>Allowed Repositories</span>
          <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>({accessibleRepos.length})</span>
        </button>

        <button
          className={`btn ${activeTab === 'imported' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('imported')}
          style={{ borderRadius: 'var(--radius-sm)' }}
        >
          <BookOpen size={16} />
          <span>Imported Repositories</span>
          <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>({importedRepos.length})</span>
        </button>
      </div>

      {/* Content Body */}
      {activeTab === 'allowed' ? (
        <RepoList
          repos={accessibleRepos}
          importedRepos={importedRepos}
          loading={reposLoading}
          onImport={handleImportRepo}
          isAppInstalled={Boolean(installStatus?.isInstalled)}
        />
      ) : (
        <ImportedRepoList
          importedRepos={importedRepos}
          loading={importedLoading}
          onDelete={handleDeleteRepo}
        />
      )}
    </div>
  );
};
