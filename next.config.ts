import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the dev-mode build indicator from overlapping the viewer on
  // phone viewports, which matter for this app's primary use case.
  devIndicators: false,
};

export default nextConfig;
