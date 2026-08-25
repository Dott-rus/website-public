export function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function assertText(value, label, max = 500) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} must be a non-empty string`);
  }
  if (Array.from(value).length > max) {
    throw new Error(`${label} must not exceed ${max} characters`);
  }
}

export function assertHref(value, label) {
  if (value === undefined) return;
  assertText(value, label, 500);
  if (!value.startsWith('/') && !/^https:\/\//i.test(value)) {
    throw new Error(`${label} must be a root-relative path or HTTPS URL`);
  }
}
