/// <reference types="vitest" />
/// <reference types="vitest/globals" />

declare module '*.test' {
  const content: { [key: string]: unknown };
  export default content;
}
