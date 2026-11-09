import { ReactElement, ReactNode } from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { StoreApi } from 'zustand';

interface WrapperProps {
  // ⚠️ `children` 必须是 **ReactNode**（React 19 的 JSXElementConstructor 要求）
  //   ⇒ ⇒ 写 `ReactElement` ⇒ ⇒ TS2769 ⇒ ⇒ 放宽到 ReactNode。
  children: ReactNode;
}

function Wrapper({ children }: WrapperProps) {
  return <BrowserRouter>{children}</BrowserRouter>;
}

interface RenderWithStoreOptions<T extends StoreApi<unknown>> extends Omit<RenderOptions, 'wrapper'> {
  store?: T;
}

function renderWithStore<T extends StoreApi<unknown>>(
  ui: ReactElement,
  options: RenderWithStoreOptions<T> = {}
) {
  return render(ui, { wrapper: Wrapper, ...options });
}

export * from '@testing-library/react';
export { renderWithStore as render };
export type { RenderWithStoreOptions };