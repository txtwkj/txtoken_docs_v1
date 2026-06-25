import { source } from '@/lib/source';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { baseOptions, linkItems } from '@/lib/layout.shared';
import { ComplianceNotice } from '@/components/compliance-notice';
import 'katex/dist/katex.min.css';

export default function Layout({ children }: { children: React.ReactNode }) {
  const base = baseOptions();

  return (
    <DocsLayout
      {...base}
      tabMode="top"
      tree={source.pageTree}
      links={linkItems.filter((item) => item.type === 'icon')}
      sidebar={{
        defaultOpenLevel: 0,
        tabs: {
          transform(option, node) {
            if (!node.icon) return option;

            return {
              ...option,
              icon: (
                <div className="max-md:bg-fd-primary/10 max-md:border-fd-primary/20 size-full rounded-lg max-md:border max-md:p-1.5 [&_svg]:size-full">
                  {node.icon}
                </div>
              ),
            };
          },
        },
      }}
    >
      <ComplianceNotice lang="zh" />
      {children}
    </DocsLayout>
  );
}
