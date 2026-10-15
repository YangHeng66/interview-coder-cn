/** Canonical form of an accelerator, used to detect two actions bound to the same keys */
export function normalizeShortcutKey(key: string, platform: NodeJS.Platform): string {
  return key
    .toLowerCase()
    .replace(/commandorcontrol/g, platform === 'darwin' ? 'command' : 'control')
    .replace(/ctrl/g, 'control')
    .split('+')
    .sort()
    .join('+')
}
