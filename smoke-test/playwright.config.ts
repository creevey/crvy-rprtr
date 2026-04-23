import { defineConfig } from '@playwright/test'

export default defineConfig({
  reporter: [['@crvy/rprtr']],
  use: {
    baseURL: 'http://localhost:3000',
  },
})
