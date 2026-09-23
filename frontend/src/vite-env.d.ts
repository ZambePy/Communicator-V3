/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CAREGIVER_PIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
