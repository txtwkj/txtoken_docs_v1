'use client';

import Link from 'next/link';

// Compliance notice message (currently disabled).
// To re-enable, replace the `return null` below with the original JSX
// and use the `COMPLIANCE_NOTICE_ZH` string as the body text.
export const COMPLIANCE_NOTICE_ZH =
  '合规提示：本项目仅用于合法授权的 API 网关、内部管理和私有化部署场景。请遵守上游服务条款、平台规则、监管要求和内容安全要求。';

export function ComplianceNotice({ lang }: { lang: string }) {
  if (lang !== 'zh') return null;
  return null;
}