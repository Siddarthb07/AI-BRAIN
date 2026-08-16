/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['three', '@react-three/fiber', '@react-three/drei'],
  webpack: (config, { isServer }) => {
    config.externals = config.externals || []
    // Docker Desktop + Windows port relay can exceed the default chunk fetch window
    // while Next is still compiling a heavy R3F bundle (BrainGraph / three).
    if (!isServer) {
      config.output = config.output || {}
      config.output.chunkLoadTimeout = 300000
    }
    return config
  },
  // API proxy lives in app/backend/[...path]/route.ts (reliable streaming).
}

module.exports = nextConfig
