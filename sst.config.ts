/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "monorepo",
      removal: input?.stage === "production" ? "retain" : "remove",
      home: "aws",
    };
  },
  async run() {
    new sst.aws.StaticSite("Website", {
      path:'website',
      build: {
        command: "pnpm run build",
        output: "dist"
      }
    })


  },
});
