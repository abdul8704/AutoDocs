import React, { useState } from 'react';
import { AccessibleRepo, ImportedRepo } from '../types';
import { GitBranch, Lock, Globe, Download, Check, Search, FolderGit2, AlertCircle } from 'lucide-react';

interface RepoListProps {
  repos: AccessibleRepo[];
  importedRepos: ImportedRepo[];
  loading: boolean;
  onImport: (repo: AccessibleRepo) => Promise<void>;
  isAppInstalled: boolean;
}

export const RepoList: React.FC<RepoListProps> = ({
  repos,
  importedRepos,
  loading,
  onImport,
  isAppInstalled,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [importingIds, setImportingIds] = useState<Record<string, boolean>>({});

  const importedRepoIds = new Set(importedRepos.map((r) => r.githubRepoId));

  const filteredRepos = repos.filter((repo) =>
    repo.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleImport = async (repo: AccessibleRepo) => {
    setImportingIds((prev) => ({ ...prev, [repo.githubRepoId]: true }));
    try {
      await onImport(repo);
    } finally {
      setImportingIds((prev) => ({ ...prev, [repo.githubRepoId]: false }));
    }
  };

  if (!isAppInstalled) {
    return (
      <div className="glass-panel" style={{ padding: '3rem 2rem', textAlign: 'center' }}>
        <div style={{ color: 'var(--accent-amber)', marginBottom: '1rem', display: 'flex', justifyContent: 'center' }}>
          <AlertCircle size={42} />
        </div>
        <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '0.5rem' }}>
          GitHub App Not Authorized Yet
        </h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', maxWidth: '500px', margin: '0 auto' }}>
          Please install and authorize the GitHub App using the banner above to allow AutoDocs to list and import your repositories.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Header & Search */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <FolderGit2 size={20} style={{ color: 'var(--accent-cyan)' }} />
            <span>Allowed GitHub Repositories</span>
            <span className="badge badge-neutral" style={{ textTransform: 'none' }}>
              {repos.length} available
            </span>
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.2rem' }}>
            Repositories authorized for AutoDocs by your GitHub App installation.
          </p>
        </div>

        <div style={{ position: 'relative', minWidth: '260px' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="text"
            className="input-field"
            placeholder="Filter repositories..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ paddingLeft: '2.2rem' }}
          />
        </div>
      </div>

      {/* Repo Grid */}
      {loading ? (
        <div className="glass-panel" style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          <div className="animate-pulse-slow">Loading accessible repositories from GitHub...</div>
        </div>
      ) : filteredRepos.length === 0 ? (
        <div className="glass-panel" style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          {searchTerm ? `No repositories matching "${searchTerm}"` : 'No accessible repositories found in this GitHub App installation.'}
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: '1.25rem'
        }}>
          {filteredRepos.map((repo) => {
            const isImported = importedRepoIds.has(repo.githubRepoId);
            const isImporting = importingIds[repo.githubRepoId];

            return (
              <div key={repo.githubRepoId} className="glass-card-interactive" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '1rem' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <span className={`badge ${repo.isPrivate ? 'badge-warning' : 'badge-neutral'}`} style={{ gap: '0.3rem' }}>
                      {repo.isPrivate ? <Lock size={12} /> : <Globe size={12} />}
                      <span>{repo.isPrivate ? 'Private' : 'Public'}</span>
                    </span>

                    <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <GitBranch size={12} />
                      <span>{repo.defaultBranch || 'main'}</span>
                    </span>
                  </div>

                  <h3 style={{ fontSize: '1rem', fontWeight: 700, wordBreak: 'break-word', color: 'var(--text-main)' }}>
                    {repo.name}
                  </h3>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem' }}>
                  <a
                    href={repo.cloneUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textDecoration: 'none' }}
                  >
                    View on GitHub ↗
                  </a>

                  {isImported ? (
                    <button className="btn btn-secondary" disabled style={{ padding: '0.45rem 0.85rem', fontSize: '0.8rem', color: 'var(--accent-emerald)', borderColor: 'rgba(16, 185, 129, 0.3)' }}>
                      <Check size={14} />
                      <span>Imported</span>
                    </button>
                  ) : (
                    <button
                      className="btn btn-primary"
                      disabled={isImporting}
                      onClick={() => handleImport(repo)}
                      style={{ padding: '0.45rem 0.85rem', fontSize: '0.8rem' }}
                    >
                      {isImporting ? (
                        <span>Importing...</span>
                      ) : (
                        <>
                          <Download size={14} />
                          <span>Import Repo</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
