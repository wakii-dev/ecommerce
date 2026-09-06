// Ambient types cho remote modules — @module-federation/vite không sinh type
// declarations; khai báo tối thiểu để `tsc --noEmit` xanh. Shape thật do
// remote expose (apps/_skeleton-remote/src).
declare module 'skeleton/Page' {
  const Page: import('react').ComponentType;
  export default Page;
}

declare module 'skeleton/HeaderWidget' {
  const HeaderWidget: import('react').ComponentType;
  export default HeaderWidget;
}
