import { describe, it, expect } from 'vitest'
import { detectLanguage } from '../../shared/languages'

describe('detectLanguage', () => {
  it('detects TypeScript', () => {
    expect(detectLanguage('App.tsx')).toBe('typescript')
    expect(detectLanguage('index.ts')).toBe('typescript')
  })

  it('detects JavaScript', () => {
    expect(detectLanguage('script.js')).toBe('javascript')
    expect(detectLanguage('component.jsx')).toBe('javascript')
  })

  it('detects CSS variants', () => {
    expect(detectLanguage('style.css')).toBe('css')
    expect(detectLanguage('style.scss')).toBe('scss')
  })

  it('detects JSON', () => {
    expect(detectLanguage('package.json')).toBe('json')
  })

  it('detects Markdown', () => {
    expect(detectLanguage('README.md')).toBe('markdown')
  })

  it('detects YAML', () => {
    expect(detectLanguage('config.yml')).toBe('yaml')
    expect(detectLanguage('config.yaml')).toBe('yaml')
  })

  it('detects Python', () => {
    expect(detectLanguage('main.py')).toBe('python')
  })

  it('returns plaintext for unknown extensions', () => {
    expect(detectLanguage('file.xyz')).toBe('plaintext')
    expect(detectLanguage('Makefile')).toBe('plaintext')
  })

  it('handles paths with directories', () => {
    expect(detectLanguage('/project/src/App.tsx')).toBe('typescript')
    expect(detectLanguage('src/utils/helper.go')).toBe('go')
  })

  it('handles case insensitivity', () => {
    expect(detectLanguage('README.MD')).toBe('markdown')
    expect(detectLanguage('style.CSS')).toBe('css')
  })
})
