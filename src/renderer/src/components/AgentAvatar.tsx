interface AgentAvatarProps {
  avatar: string
  color: string
  size?: number
}

const avatarPaths: Record<string, string> = {
  'robot-1':
    'M7 4h10v2h2v8h-2v2H7v-2H5V6h2V4zm3 4v2h1V8h-1zm4 0v2h1V8h-1zm-4 5h5v-1H10v1z',
  'robot-2':
    'M8 3h8v2h1v3h2v4h-2v3h-1v2H8v-2H7v-3H5V8h2V5h1V3zm3 5v3h1V8h-1zm4 0v3h1V8h-1z',
  'robot-3':
    'M6 5h12v2h1v6h-1v2h-2v2H8v-2H6v-2H5V7h1V5zm4 4v2h1V9h-1zm4 0v2h1V9h-1zm-5 4h6v1H9v-1z',
  circuit:
    'M9 3v3H7v2H5v4h2v2h2v3h6v-3h2v-2h2V8h-2V6h-2V3H9zm3 5a2 2 0 110 4 2 2 0 010-4z',
  diamond:
    'M12 2l5 5v6l-5 5-5-5V7l5-5zm0 3l-3 3v4l3 3 3-3V8l-3-3z',
  hexagon:
    'M12 2l7 4v8l-7 4-7-4V6l7-4zm0 2.5L7 7.25v5.5L12 15.5l5-2.75v-5.5L12 4.5z',
  star:
    'M12 2l2.9 5.8L21 9l-4.5 4.4L17.8 20 12 16.9 6.2 20l1.3-6.6L3 9l6.1-1.2L12 2z',
  shield:
    'M12 2l7 3v5c0 4.5-3 8.6-7 10-4-1.4-7-5.5-7-10V5l7-3zm0 2.4L7 6.5v3.5c0 3.5 2.3 6.7 5 7.9 2.7-1.2 5-4.4 5-7.9V6.5L12 4.4z',
  bolt:
    'M13 2L6 13h5v7l7-11h-5V2z',
  gear:
    'M12 8a4 4 0 100 8 4 4 0 000-8zm-1-5.9V5a7 7 0 00-3.2 1.3l-1.4-1.4-1.4 1.4 1.4 1.4A7 7 0 005 11H2.1v2H5a7 7 0 001.3 3.2l-1.4 1.4 1.4 1.4 1.4-1.4A7 7 0 0011 19v2.9h2V19a7 7 0 003.2-1.3l1.4 1.4 1.4-1.4-1.4-1.4A7 7 0 0019 13h2.9v-2H19a7 7 0 00-1.3-3.2l1.4-1.4-1.4-1.4-1.4 1.4A7 7 0 0013 5V2.1h-2z',
  cube:
    'M12 2L3 7v10l9 5 9-5V7l-9-5zm0 2.3l6 3.3v1.8L12 13 6 9.4V7.6l6-3.3zM5 10.5l6 3.3v5.8l-6-3.3v-5.8zm14 0v5.8l-6 3.3v-5.8l6-3.3z',
  prism:
    'M12 2L3 20h18L12 2zm0 4l6 12H6l6-12z'
}

export default function AgentAvatar({ avatar, color, size = 24 }: AgentAvatarProps) {
  const path = avatarPaths[avatar] || avatarPaths['robot-1']

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      style={{ color, flexShrink: 0 }}
      data-testid="agent-avatar"
    >
      <rect
        width="24"
        height="24"
        rx="4"
        fill={color}
        opacity="0.15"
      />
      <path d={path} fill="currentColor" />
    </svg>
  )
}
