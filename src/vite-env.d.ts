// Type declarations for Vite's ?url suffix import
declare module '*?url' {
  const src: string;
  export default src;
}

// Type declaration for pdf.worker.mjs
declare module 'pdfjs-dist/build/pdf.worker.mjs' {
  const workerSrc: string;
  export default workerSrc;
}
