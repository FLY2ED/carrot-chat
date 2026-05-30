// Contact-masking policy: discourage off-platform deals by redacting phone
// numbers / emails from messages. Pure function → trivially unit-testable, and
// shared by the worker so the rule is enforced server-side.

const PATTERNS: readonly RegExp[] = [
  /01[0-9][-.\s]?\d{3,4}[-.\s]?\d{4}/g, // KR mobile, e.g. 010-1234-5678
  /[\w.+-]+@[\w-]+\.[\w.-]+/g, // email
  /\d{2,4}[-.\s]\d{3,4}[-.\s]\d{4}/g, // generic phone with separators
];

export function maskContact(text: string): string {
  return PATTERNS.reduce((acc, re) => acc.replace(re, "[비공개]"), text);
}
