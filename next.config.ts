import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The dev-mode build indicator badge sits bottom-left and overlaps
  // in-app controls (e.g. the entry form's Delete button) on phone
  // viewports, which matter for this app's primary one-handed use case.
  devIndicators: false,
};

export default nextConfig;
