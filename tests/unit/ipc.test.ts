import { describe, expect, it } from 'vitest';
import { MENU_ACTIONS } from '@shared/ipc';

describe('menu actions', () => {
  it('are unique', () => {
    expect(new Set(MENU_ACTIONS).size).toBe(MENU_ACTIONS.length);
  });
});
