import { render, RenderOptions } from '@testing-library/react';
import { ReactElement, ReactNode } from 'react';
import { BrowserRouter } from 'react-router-dom';

interface WrapperProps {
  // ⚠️ `children` 必须是 **ReactNode** —— React 19 的 `JSXElementConstructor`
  //   要求 `children: ReactNode`（必填）⇒ ⇒ 写 `ReactElement` ⇒ ⇒ 参数逆变
  //   ⇒ ⇒ TS2769 ⇒ ⇒ 放宽到 ReactNode（**产品代码零改动**）。
  children: ReactNode;
}

function Wrapper({ children }: WrapperProps) {
  return <BrowserRouter>{children}</BrowserRouter>;
}

function customRender(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) {
  return render(ui, { wrapper: Wrapper, ...options });
}

export * from '@testing-library/react';
export { customRender as render };