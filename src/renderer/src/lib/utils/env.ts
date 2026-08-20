export const isMac = navigator.userAgent.includes('Mac')

/** Alt on macOS, CommandOrControl (i.e. Ctrl) on Windows/Linux */
export const platformAlt = isMac ? 'Alt' : 'CommandOrControl'
