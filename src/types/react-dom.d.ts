// Minimal ambient declaration for `react-dom` so TypeScript sees
// `createPortal` without needing the full `@types/react-dom` package.
// The project only depends on `@types/react` (React 19's own types)
// and we only need `createPortal` — used by the Vouchers tabs to
// teleport their filter/+ controls into a slot rendered above the
// pill strip. If we ever need more from react-dom (e.g. createRoot
// directly), swap this for `npm i -D @types/react-dom`.

declare module "react-dom" {
  import * as React from "react";
  export function createPortal(
    children: React.ReactNode,
    container: Element | DocumentFragment,
    key?: string | null,
  ): React.ReactPortal;
}
