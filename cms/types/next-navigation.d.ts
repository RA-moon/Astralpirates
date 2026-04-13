declare module 'next/navigation' {
  export function redirect(url: string): never;
  export function notFound(): never;
}
