import type { SimpleRestApi } from '@shared/api';

declare global {
  interface Window {
    api: SimpleRestApi;
  }
}

export {};
