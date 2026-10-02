import { author, authorLinks } from '../lib/author';

export function AuthorLinks({ className = 'author-block' }: { className?: string }) {
  return (
    <div className={className}>
      <p>
        Curated by <strong>{author.fullName}</strong>
      </p>
      <nav className="author-links" aria-label={`${author.shortName}'s links`}>
        {authorLinks.map(([icon, title, href]) => {
          const email = icon === 'email';
          return (
            <a
              key={icon}
              className="icon-button"
              href={href}
              title={title}
              aria-label={`${title}${email ? '' : ' (opens in a new tab)'}`}
              target={email ? undefined : '_blank'}
              rel={email ? undefined : 'noopener noreferrer'}
            >
              <svg width="20" height="20" aria-hidden="true" focusable="false">
                <use href={`/icons/author-links.svg#${icon}`} />
              </svg>
            </a>
          );
        })}
      </nav>
    </div>
  );
}
