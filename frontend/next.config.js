/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['three', '@react-three/fiber', '@react-three/drei'],
  webpack: (config) => {
    config.externals = config.externals || []
    return config
  },
  // API proxy lives in app/backend/[...path]/route.ts (reliable streaming).
}

module.exports = nextConfig
