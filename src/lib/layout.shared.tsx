import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import type { LinkItemType } from 'fumadocs-ui/layouts/docs';

export const linkItems: LinkItemType[] = [];

export const logo = (
  // Plain <img> avoids next/image basePath quirks in static export.
  // eslint-disable-next-line @next/next/no-img-element
  <img
    src="/txtoken_docs_v1/txtw_logo.png"
    alt="天下同网"
    width={32}
    height={32}
    className="size-8 rounded"
  />
);

export function baseOptions(): BaseLayoutProps {
  return {
    themeSwitch: { enabled: false },
    nav: {
      url: 'https://www.txtoken.cn/',
      title: (
        <span className="inline-flex items-center gap-2">
          {logo}
          <span className="font-medium in-[header]:text-[15px] [.uwu_&]:hidden">
            天下同网
          </span>
        </span>
      ),
    },
  };
}
