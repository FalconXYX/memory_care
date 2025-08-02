/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config: any, { isServer }: any) => {
    if (!isServer) {
      // Don't resolve 'fs' module on the client to prevent this error on build 
      config.resolve.fallback = {
        fs: false,
        net: false,
        dns: false,
        child_process: false,
        tls: false,
        crypto: false,
        stream: false,
        buffer: false,
        util: false,
        url: false,
        querystring: false,
      };
    }

    // Add externals for server-side only packages to prevent bundling issues
    if (isServer) {
      config.externals = config.externals || [];
      config.externals.push('@google/genai');
    }

    return config;
  },
  // Enable experimental features for better serverless compatibility
  experimental: {
    serverComponentsExternalPackages: ['@google/genai'],
  },
};

module.exports = nextConfig;