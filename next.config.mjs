/** @type {import('next').NextConfig} */
const nextConfig = {
  // jsdom ships CJS bits that should stay external to the server bundle
  // rather than being processed by webpack. (`node:sqlite` is a built-in
  // Node module and doesn't need this — webpack already treats `node:`
  // imports as external.) This key lives under `experimental` on Next 14;
  // it moves to the top level in Next 15.
  experimental: {
    serverComponentsExternalPackages: ["jsdom", "nodemailer"],
    // Enables src/instrumentation.ts's register() hook, which starts the
    // hourly job-discovery scan timer on server boot. Unneeded (and removed)
    // in Next 15+, where instrumentation.ts is picked up automatically.
    // Note: instrumentation.ts itself must stay free of jsdom/node:sqlite/etc
    // imports (even transitively) — Next also bundles it for the edge
    // runtime, whose webpack pass can't handle "node:" scheme imports at
    // all. It calls the scan API route over HTTP instead; see that file.
    instrumentationHook: true,
  },
};

export default nextConfig;
