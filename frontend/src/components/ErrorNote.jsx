import React from 'react';
import Icon from './Icon.jsx';

// Renders an API error the way the contract intends: what went wrong + what to do next.
export default function ErrorNote({ error, onRetry, children, compact = false }) {
  if (!error) return null;
  return (
    <div className={`errnote ${compact ? 'compact' : ''}`} role="alert">
      <div className="errnote-head">
        <Icon name="alert" size={15} />
        <code>
          {error.status ? `${error.status} · ` : ''}
          {error.code}
        </code>
      </div>
      <p className="errnote-msg">{error.message}</p>
      {error.hint && (
        <p className="errnote-hint">
          <b>Next step</b> {error.hint}
        </p>
      )}
      {children}
      {onRetry && (
        <button type="button" className="btn ghost sm" onClick={onRetry}>
          <Icon name="refresh" size={14} /> Try again
        </button>
      )}
    </div>
  );
}
