const RESERVED_PATHS = new Set([
  'home',
  'explore',
  'notifications',
  'messages',
  'i',
  'search',
  'settings',
  'compose',
  'login',
  'signup',
  'intent',
]);

export function normalizeHandle(handle: string | null | undefined) {
  return (handle ?? '').trim().replace(/^@+/, '').toLowerCase();
}

export function isValidHandle(handle: string | null | undefined) {
  const normalized = normalizeHandle(handle);
  return normalized.length > 0 && !RESERVED_PATHS.has(normalized);
}

export function extractHandleFromPathname(pathname: string) {
  const [pathWithoutQuery = ''] = pathname.split('?');
  const trimmedPath = pathWithoutQuery.replace(/^\/+/, '');
  if (!trimmedPath) {
    return null;
  }

  const [firstSegment = ''] = trimmedPath.split('/');
  return isValidHandle(firstSegment) ? normalizeHandle(firstSegment) : null;
}
