import { author, authorLinks } from '../lib/author';

export function AuthorLinks({ className = 'author-block' }: { className?: string }) {
  return (
    <div className={className}>
      <p>
        Curated by <strong>{author.fullName}</strong>
      </p>
      <nav className="author-links button-row" aria-label="Author links">
        {authorLinks.map(([icon, title, href]) => (
          <a
            key={icon}
            className="icon-button"
            href={href}
            title={title}
            aria-label={title}
            target={icon === 'email' ? undefined : '_blank'}
            rel="noopener noreferrer"
          >
            <svg width="20" height="20" aria-hidden="true" focusable="false">
              <use href={`/icons/author-links.svg#${icon}`} />
            </svg>
          </a>
        ))}
      </nav>
    </div>
  );
}
