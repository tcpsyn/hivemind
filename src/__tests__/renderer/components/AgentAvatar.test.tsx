import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import AgentAvatar from '../../../renderer/src/components/AgentAvatar'

describe('AgentAvatar', () => {
  it('renders an SVG element', () => {
    const { container } = render(<AgentAvatar avatar="robot-1" color="#FF6B6B" />)
    expect(container.querySelector('svg')).toBeInTheDocument()
  })

  it('renders with correct size', () => {
    const { container } = render(<AgentAvatar avatar="robot-1" color="#FF6B6B" size={32} />)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('width')).toBe('32')
    expect(svg.getAttribute('height')).toBe('32')
  })

  it('defaults to size 24', () => {
    const { container } = render(<AgentAvatar avatar="robot-1" color="#FF6B6B" />)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('width')).toBe('24')
    expect(svg.getAttribute('height')).toBe('24')
  })

  it('renders distinct SVGs for all 12 avatar types', () => {
    const avatars = [
      'robot-1', 'robot-2', 'robot-3', 'circuit', 'diamond', 'hexagon',
      'star', 'shield', 'bolt', 'gear', 'cube', 'prism'
    ]
    const svgContents = new Set<string>()

    avatars.forEach(avatar => {
      const { container } = render(<AgentAvatar avatar={avatar} color="#FF6B6B" />)
      const svg = container.querySelector('svg')!
      svgContents.add(svg.innerHTML)
    })

    expect(svgContents.size).toBe(12)
  })

  it('applies color to the SVG', () => {
    const { container } = render(<AgentAvatar avatar="robot-1" color="#4ECDC4" />)
    const svg = container.querySelector('svg')!
    expect(svg.style.color).toBeTruthy()
  })

  it('falls back to a default for unknown avatar', () => {
    const { container } = render(<AgentAvatar avatar="unknown" color="#FF6B6B" />)
    expect(container.querySelector('svg')).toBeInTheDocument()
  })
})
