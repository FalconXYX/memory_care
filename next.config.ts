/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config: { resolve: { fallback: { fs: boolean; net: boolean; dns: boolean; child_process: boolean; tls: boolean; }; }; }, { isServer }: any) => {
    if (!isServer) {
      // Don't resolve 'fs' module on the client to prevent this error on build 
      config.resolve.fallback = {
        fs: false,
        net: false,
        dns: false,
        child_process: false,
        tls: false,
      };
    }

    return config;
  },
};

module.exports = nextConfig;