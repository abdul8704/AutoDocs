import React from 'react';
import { InstallationStatus } from '../types';
import { useAuth } from '../context/AuthContext';
import { CheckCircle2, AlertTriangle, ExternalLink, RefreshCw, Layers } from 'lucide-react';

interface InstallationBannerProps {
  status: InstallationStatus | null;
  loading: boolean;
  onRefresh: () => void;
}

export const InstallationBanner: React.FC<InstallationBannerProps> = ({
  status,
  loading,
  onRefresh,
}) => {
  const { accessToken } = useAuth();

  const handleInstallRedirect = () => {
    const slug = status?.appSlug || 'aiautodocs';
    // State passes the access token so the backend setup callback identifies the user
    const installUrl = `https://github.com/apps/${slug}/installations/new?state=${encodeURIComponent(accessToken || '')}`;
    window.location.href = installUrl;
  };

  if (loading) {
    return (
      <div className="glass-panel" style={{ padding: '1.25rem 1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <RefreshCw size={20} className="animate-pulse-slow" style={{ color: 'var(--accent-primary)' }} />
        <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Verifying GitHub App Authorization Status...</span>
      </div>
    );
  }

  const isInstalled = status?.isInstalled;

  return (
    <div
      className="glass-panel"
      style={{
        padding: '1.5rem',
        borderLeft: isInstalled ? '4px solid var(--accent-emerald)' : '4px solid var(--accent-amber)',
        position: 'relative',
        overflow: 'hidden'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
          <div
            style={{
              padding: '0.6rem',
              borderRadius: 'var(--radius-sm)',
              background: isInstalled ? 'rgba(16, 185, 129, 0.12)' : 'rgba(245, 158, 11, 0.12)',
              color: isInstalled ? '#34d399' : '#fbbf24',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            {isInstalled ? <CheckCircle2 size={24} /> : <AlertTriangle size={24} />}
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.25rem' }}>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>
                {isInstalled ? 'GitHub App Connected' : 'GitHub App Installation Required'}
              </h2>
              {isInstalled ? (
                <span className="badge badge-success">Active Sync</span>
              ) : (
                <span className="badge badge-warning">Action Needed</span>
              )}
            </div>

            <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', maxWidth: '650px', lineHeight: 1.5 }}>
              {isInstalled
                ? `AutoDocs is authorized to access your GitHub repositories (Installation ID: ${status?.installationId}). You can manage repository permissions anytime on GitHub.`
                : 'To import your repositories and enable real-time documentation generation, authorize and install the AutoDocs GitHub App.'}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button
            className="btn btn-secondary"
            onClick={onRefresh}
            title="Refresh Installation Status"
            style={{ padding: '0.6rem' }}
          >
            <RefreshCw size={16} />
          </button>

          {!isInstalled ? (
            <button className="btn btn-primary" onClick={handleInstallRedirect}>
              <Layers size={16} />
              <span>Authorize & Install GitHub App</span>
              <ExternalLink size={14} />
            </button>
          ) : (
            <button className="btn btn-secondary" onClick={handleInstallRedirect} style={{ fontSize: '0.82rem' }}>
              <span>Configure App Permissions</span>
              <ExternalLink size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
