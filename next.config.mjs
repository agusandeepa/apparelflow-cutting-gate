/** @type {import('next').NextConfig} */
const nextConfig = {
  // PGlite (embedded Postgres) is only used for local dev / tests when DATABASE_URL is not set.
  serverExternalPackages: ["@electric-sql/pglite", "pg", "bcryptjs"],
  poweredByHeader: false,
};
export default nextConfig;
