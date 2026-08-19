import React, { useState } from 'react';
import { ImportedRepo } from '../types';
import { BookOpen, Trash2, Calendar, GitCommit, ExternalLink } from 'lucide-react';

interface ImportedRepoListProps {
  importedRepos: ImportedRepo[];
  loading: boolean;
  onDelete: (repoId: string) => Promise<void>;
}

export const ImportedRepoList: React.FC<ImportedRepoListProps> = ({
  importedRepos,
  loading,
  onDelete,
}) => {
  const [deletingIds, setDeletingIds] = useState<Record<string, boolean>>({});

  const handleDelete = async (repoId: string) => {
    if (!window.confirm('Are you sure you want to remove this repository from AutoDocs?')) return;
    setDeletingIds((prev) => ({ ...prev, [repoId]: true }));
    try {
      await onDelete(repoId);
    } finally {
      setDeletingIds((prev) => ({ ...prev, [repoId]: false }));
    }
  };

  if (loading) {
    return (
      <div className="glass-panel" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
        <div className="animate-pulse-slow">Loading imported repositories...</div>
      </div>
    );
  }

  if (importedRepos.length === 0) {
    return (
      <div className="glass-panel" style={{ padding: '2.5rem', textAlign: 'center' }}>
        <BookOpen size={36} style={{ color: 'var(--text-dim)', marginBottom: '0.75rem' }} />
        <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.35rem' }}>No Imported Repositories</h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>
          Select a repository from your allowed repos list above and click "Import Repo" to get started.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <BookOpen size={20} style={{ color: 'var(--accent-emerald)' }} />
          <span>Active AutoDocs Repositories</span>
          <span className="badge badge-success" style={{ textTransform: 'none' }}>
            {importedRepos.length} imported
          </span>
        </h2>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
        {importedRepos.map((repo) => {
          const isDeleting = deletingIds[repo.id];

          return (
            <div
              key={repo.id}
              className="glass-panel"
              style={{
                padding: '1.25rem 1.5rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '1rem'
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 700 }}>
                    {repo.name}
                  </h3>
                  <a
                    href={repo.cloneUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}
                  >
                    <ExternalLink size={14} />
                  </a>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <GitCommit size={14} style={{ color: 'var(--accent-cyan)' }} />
                    <span>Last commit: {repo.lastProcessedCommit || 'Pending sync...'}</span>
                  </span>

                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <Calendar size={14} />
                    <span>Imported: {new Date(repo.createdAt).toLocaleDateString()}</span>
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <button
                  className="btn btn-danger"
                  disabled={isDeleting}
                  onClick={() => handleDelete(repo.id)}
                  style={{ padding: '0.45rem 0.85rem', fontSize: '0.8rem' }}
                >
                  <Trash2 size={14} />
                  <span>{isDeleting ? 'Removing...' : 'Remove'}</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
