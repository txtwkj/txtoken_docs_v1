import type { Viewport, Metadata } from 'next';
import { Provider } from '@/components/provider';
import './global.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://www.newapi.ai'),
  title: {
    default: '天下同网 - AI 基座',
    template: '%s | 天下同网',
  },
  description:
    '承载所有 AI 应用，管理你的数字资产，连接未来的统一基础设施平台。快速部署，轻松扩展。',
  other: {
    charset: 'utf-8',
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0A0A0A' },
    { media: '(prefers-color-scheme: light)', color: '#fff' },
  ],
  width: 'device-width',
  initialScale: 1,
};

const zhTranslations = {
  search: '搜索文档',
  searchNoResult: '没有结果',
  toc: '目录',
  lastUpdate: '最后更新于',
  chooseTheme: '选择主题',
  nextPage: '下一页',
  previousPage: '上一页',
  tocNoHeadings: '目录为空',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html suppressHydrationWarning lang="zh">
      <head>
        <meta charSet="utf-8" />
      </head>
      <body>
        <Provider locale={{ locale: 'zh', translations: zhTranslations }}>
          {children}
        </Provider>
      </body>
    </html>
  );
}
