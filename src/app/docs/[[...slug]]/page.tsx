import { source } from '@/lib/source';
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
} from 'fumadocs-ui/page';
import { notFound } from 'next/navigation';
import { getMDXComponents } from '@/mdx-components';
import type { Metadata } from 'next';
import { LLMCopyButton, ViewOptions } from '@/components/page-actions';

// GitHub repository info for source links
const owner = 'QuantumNous';
const repo = 'txtoken-docs-v1';
const branch = 'main';

const ALLOWED_EXACT = new Set(['api/index']);
const ALLOWED_PREFIXES = ['api/ai-model/'];

function isAllowed(path: string): boolean {
  // path examples: 'api/index.mdx', 'api/ai-model/chat/openai/foo.mdx'
  const noExt = path.replace(/\.mdx$/, '');
  if (ALLOWED_EXACT.has(noExt)) return true;
  for (const prefix of ALLOWED_PREFIXES) {
    if (noExt === prefix.replace(/\/$/, '') || noExt.startsWith(prefix)) return true;
  }
  return false;
}

export default async function Page(props: {
  params: Promise<{ slug?: string[] }>;
}) {
  const { slug } = await props.params;
  const slugs = slug ?? [];
  const page = source.getPage(slugs);
  if (!page) notFound();
  if (!isAllowed(page.path)) notFound();

  const MDX = page.data.body as any;
  const lastModified = page.data.lastModified;

  return (
    <DocsPage
      toc={page.data.toc}
      full={page.data.full}
      lastUpdate={lastModified ? new Date(lastModified) : undefined}
      tableOfContent={{
        style: 'clerk',
        enabled: !page.data.full,
      }}
    >
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription className="mb-2">
        {page.data.description}
      </DocsDescription>
      <div className="mb-6 flex flex-row flex-wrap items-center gap-2 border-b pb-6">
        <LLMCopyButton markdownUrl="" lang="zh" />
        <ViewOptions
          markdownUrl=""
          githubUrl={`https://github.com/${owner}/${repo}/blob/${branch}/content/docs/${page.path}`}
          lang="zh"
        />
      </div>
      <DocsBody>
        <MDX
          components={getMDXComponents({ /* HYPOTHESIS_TEST: createRelativeLink disabled */ })}
        />
      </DocsBody>
    </DocsPage>
  );
}

export async function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata(props: {
  params: Promise<{ slug?: string[] }>;
}): Promise<Metadata> {
  const { slug } = await props.params;
  const slugs = slug ?? [];
  const page = source.getPage(slugs);
  if (!page) return {};
  if (!isAllowed(page.path)) return {};
  return {
    title: page.data.title,
    description: page.data.description,
  };
}
