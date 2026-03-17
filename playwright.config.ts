import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 60000,
  expect: {
    timeout: 10000
  },
  retries: 1,
  workers: 1,
  use: {
    trace: 'on-first-retry'
  },
  projects: [
    {
      name: 'electron',
      testMatch: '**/*.spec.ts'
    }
  ]
})
