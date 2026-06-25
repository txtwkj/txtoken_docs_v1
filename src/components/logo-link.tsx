'use client';

import type { ReactNode, MouseEvent } from 'react';

interface LogoLinkProps {
  href: string;
  children: ReactNode;
  className?: string;
}

export function LogoLink({ href, children, className }: LogoLinkProps) {
  const handleClick = (e: MouseEvent<HTMLSpanElement>) => {
    e.preventDefault();
    e.stopPropagation();
    window.location.href = href;
  };

  return (
    <span
      role="link"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          window.location.href = href;
        }
      }}
      className={className}
      style={{ cursor: 'pointer' }}
    >
      {children}
    </span>
  );
}
