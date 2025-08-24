
import type { Config } from 'tailwindcss'
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',   // 👈 ここを広げる
  ],
  theme: { extend: {} },
  plugins: [],
}
