import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import type { z } from 'zod';
import { assertTrustedSender } from '../security';

/** Registers an IPC handler that checks the sender frame and validates input with zod. */
export function handle<S extends z.ZodType, R>(
  channel: string,
  schema: S,
  fn: (input: z.infer<S>, event: IpcMainInvokeEvent) => R | Promise<R>,
): void {
  ipcMain.handle(channel, async (event, raw: unknown) => {
    assertTrustedSender(event);
    const input = schema.parse(raw);
    return fn(input, event);
  });
}
