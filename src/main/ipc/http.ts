import { IPC } from '@shared/ipc';
import { idSchema, sendInputSchema } from '@shared/schemas';
import type { HttpClient } from '../http/client';
import { handle } from './handle';

export function registerHttpIpc(client: HttpClient): void {
  handle(IPC.httpSend, sendInputSchema, (input) => client.send(input));
  handle(IPC.httpCancel, idSchema, (sendId) => client.cancel(sendId));
  handle(IPC.httpRelease, idSchema, (tabId) => {
    client.release(tabId);
  });
}
