import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import Image from 'next/image';
import type { LinkItemType } from 'fumadocs-ui/layouts/docs';

export const linkItems: LinkItemType[] = [];

export const logo = (
  <Image
    alt="天下同网"
    src="/txtw_logo.png"
    width={20}
    height={20}
    className="size-8"
    priority
    unoptimized
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
