/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SERVER_URL?: string;
}

/** The git commit this client was built from ("dev" locally). */
declare const __BUILD_COMMIT__: string;

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
