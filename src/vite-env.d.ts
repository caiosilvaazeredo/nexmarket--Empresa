/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ROOT_ADMIN_EMAIL?: string;
  readonly VITE_PAYMENTS_PROVIDER?: string;
  readonly VITE_PAYMENTS_PUBLIC_KEY?: string;
  readonly VITE_PAYMENTS_API_URL?: string;
  readonly VITE_BACKGROUND_CHECK_API_URL?: string;
  readonly VITE_MAP_TILES_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module '*.json' {
  const value: any;
  export default value;
}
