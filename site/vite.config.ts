import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    open: true,
    // Escuta em todas as interfaces, e não só em localhost, para que o
    // site possa ser aberto de outro aparelho na mesma rede — o celular,
    // ou a máquina de quem está assistindo à demonstração.
    host: true,
  },
})
