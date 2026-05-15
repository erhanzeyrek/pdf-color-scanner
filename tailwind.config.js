/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './src/**/*.{js,ts,jsx,tsx,html}',
  ],
  theme: {
    extend: {
      colors: {
        toolbar: {
          bg: '#f9f9fa',
          border: '#e0e0e0',
          text: '#3c3c3c',
          icon: '#5f5f5f',
          hover: '#e8e8e8',
          active: '#d0d0d0',
        },
        viewer: {
          bg: '#525659',
          page: '#ffffff',
          shadow: 'rgba(0,0,0,0.4)',
        },
        panel: {
          bg: '#ffffff',
          header: '#f9f9fa',
          border: '#e0e0e0',
          text: '#3c3c3c',
          muted: '#888888',
          accent: '#0061D3',
          hover: '#f0f4ff',
        },
      },
      boxShadow: {
        page: '0 2px 12px rgba(0,0,0,0.35)',
        toolbar: '0 1px 3px rgba(0,0,0,0.12)',
      },
    },
  },
  plugins: [],
};
