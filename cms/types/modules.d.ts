declare module 'sanitize-html' {
  type SanitizeOptions = Record<string, unknown>;
  const sanitizeHtml: (dirty: string, options?: SanitizeOptions) => string;
  export default sanitizeHtml;
}

declare module 'libsodium-wrappers' {
  const sodium: any;
  export const ready: Promise<void>;
  export default sodium;
}
