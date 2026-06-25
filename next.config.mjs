import { createMDX } from 'fumadocs-mdx/next';

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  poweredByHeader: false,
  // GitHub Pages static export.
  output: 'export',
  // Project page: https://<user>.github.io/<repo>/
  // For a user-site (repo renamed to <user>.github.io), set
  // GITHUB_PAGES_BASE_PATH='' in the workflow env to override.
  basePath: process.env.GITHUB_PAGES_BASE_PATH || '/txtoken_docs_v1',
  assetPrefix: process.env.GITHUB_PAGES_BASE_PATH || '/txtoken_docs_v1',
  trailingSlash: true,
  images: {
    // Static export requires unoptimized images.
    unoptimized: true,
  },
  // NOTE: 'headers' and 'rewrites' are not supported with output: 'export'.
  // - Charset headers are redundant (static HTML already has charset meta).
  // - LLM-friendly rewrites (/:lang/docs/*.mdx -> /:lang/llms.mdx/*) require
  //   a runtime and do not work on GitHub Pages. If you re-enable them,
  //   you must also remove output: 'export' (e.g. switch to Vercel).
};

export default withMDX(config);
