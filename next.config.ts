import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();

// `output` only applies at build time and Next.js 16 forbids middleware with
// `output: "export"` — including in dev. Setting it in dev disables next-intl's
// proxy.ts middleware, which fallback-redirects every `/{locale}/{tool}` to
// `/{defaultLocale}`. So we omit it in dev and only switch modes for builds.
//
// Docker: standalone (supports API routes /api/deepl, /api/nvidia)
// Static deployment: export (default — uses the remote EdgeOne proxy)
const isDev = process.env.NODE_ENV === "development";
const isDocker = process.env.DOCKER_BUILD === "true";
// Tauri injects TAURI_ENV_* into the beforeBuildCommand. The Tauri webview's
// asset server does NOT append ".html" to extensionless paths, so the default
// static export (where `/en` lives at `en.html` and `en/` holds only RSC data)
// would 404/white-screen. trailingSlash makes export emit `en/index.html`, which
// Tauri resolves via directory-index. Scoped to Tauri builds only so the web
// (EdgeOne) URL structure — and its SEO canonicals — stay unchanged.
const isTauri = Boolean(process.env.TAURI_ENV_PLATFORM);

const nextConfig: NextConfig = {
  ...(isDev ? {} : { output: isDocker ? "standalone" : "export" }),
  ...(isTauri ? { trailingSlash: true } : {}),
  images: {
    unoptimized: true,
  },
  reactCompiler: true,
  experimental: {
    optimizePackageImports: ["antd", "@ant-design/icons", "jsonpath-plus", "compromise"],
  },
};

export default withNextIntl(nextConfig);
