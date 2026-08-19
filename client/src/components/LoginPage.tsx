import React from 'react';
import { useAuth } from '../context/AuthContext';
import { Github, ArrowRight, Shield, Zap, GitPullRequest, Lock } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const { loginWithGithub } = useAuth();

  // Check URL params for errors
  const urlParams = new URLSearchParams(window.location.search);
  const authError = urlParams.get('error');

  return (
    <div style={{
      maxWidth: '1100px',
      margin: '4rem auto',
      padding: '0 1.5rem',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '3rem'
    }} className="animate-fade-in">
      
      {authError && (
        <div style={{
          width: '100%',
          maxWidth: '550px',
          background: 'rgba(239, 68, 68, 0.12)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          color: '#f87171',
          padding: '1rem 1.25rem',
          borderRadius: 'var(--radius-md)',
          fontSize: '0.9rem',
          textAlign: 'center'
        }}>
          ⚠️ Authentication Error: {decodeURIComponent(authError)}. Please try logging in again.
        </div>
      )}

      {/* Hero Header */}
      <div style={{ textAlign: 'center', maxWidth: '720px' }}>
        <div className="badge badge-purple" style={{ marginBottom: '1.25rem', padding: '0.4rem 0.9rem' }}>
          <Zap size={14} />
          <span>Automated Documentation Pipeline</span>
        </div>
        <h1 style={{
          fontSize: '3rem',
          fontWeight: 800,
          lineHeight: 1.15,
          marginBottom: '1rem',
          background: 'linear-gradient(135deg, #ffffff 0%, #a5b4fc 50%, #6366f1 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent'
        }}>
          AI Documentation Engine for GitHub Repositories
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem', lineHeight: 1.6 }}>
          Log in with GitHub to authorize the AutoDocs App, sync allowed repositories, and generate dynamic code documentation automatically on every commit.
        </p>
      </div>

      {/* Main Login Card */}
      <div className="glass-panel" style={{
        width: '100%',
        maxWidth: '480px',
        padding: '2.5rem',
        textAlign: 'center',
        position: 'relative',
        overflow: 'hidden'
      }}>
        <div style={{
          position: 'absolute',
          top: '-60px',
          right: '-60px',
          width: '150px',
          height: '150px',
          background: 'var(--accent-primary)',
          filter: 'blur(70px)',
          opacity: 0.25,
          borderRadius: '50%'
        }} />

        <div style={{
          width: '56px',
          height: '56px',
          borderRadius: '16px',
          background: 'rgba(255, 255, 255, 0.05)',
          border: '1px solid var(--border-color)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 1.5rem auto'
        }}>
          <Github size={30} color="#fff" />
        </div>

        <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>
          Welcome to AutoDocs
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '2rem' }}>
          Sign in via GitHub OAuth to secure your session with refresh tokens and access your repos.
        </p>

        <button
          className="btn btn-github"
          onClick={loginWithGithub}
          style={{ width: '100%', padding: '0.85rem', fontSize: '1rem', marginBottom: '1.5rem' }}
        >
          <Github size={20} />
          <span>Continue with GitHub</span>
          <ArrowRight size={18} style={{ marginLeft: 'auto' }} />
        </button>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.5rem',
          fontSize: '0.8rem',
          color: 'var(--text-dim)',
          borderTop: '1px solid var(--border-color)',
          paddingTop: '1.25rem'
        }}>
          <Lock size={13} />
          <span>Secure HttpOnly Cookie Authentication</span>
        </div>
      </div>

      {/* Feature Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: '1.5rem',
        width: '100%'
      }}>
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <div style={{ color: 'var(--accent-cyan)', marginBottom: '0.75rem' }}>
            <Shield size={24} />
          </div>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '0.35rem' }}>
            OAuth 2.0 Security
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', lineHeight: 1.5 }}>
            Refresh tokens are stored safely in httpOnly cookies, providing seamless access token renewal.
          </p>
        </div>

        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <div style={{ color: 'var(--accent-secondary)', marginBottom: '0.75rem' }}>
            <GitPullRequest size={24} />
          </div>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '0.35rem' }}>
            GitHub App Integration
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', lineHeight: 1.5 }}>
            Granular access control allowing you to choose exactly which repositories AutoDocs can access.
          </p>
        </div>

        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <div style={{ color: 'var(--accent-emerald)', marginBottom: '0.75rem' }}>
            <Zap size={24} />
          </div>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '0.35rem' }}>
            Automated Repo Imports
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', lineHeight: 1.5 }}>
            One-click repository importing triggers immediate documentation generation and webhook listening.
          </p>
        </div>
      </div>
    </div>
  );
};
