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

    const api = new sst.aws.ApiGatewayV2("TheAPI",{
      cors: {
        allowOrigins: ["*"],
        exposeHeaders: ['content-type']
      },
    })

    api.route('GET /{path+}', 'packages/api/trpc.handler', {})
    api.route('POST /{path+}', 'packages/api/trpc.handler', {})

    new sst.aws.StaticSite("Website", {
      environment: {
        VITE_API_URL: api.url
      },
      path:'website',
      build: {
        command: "pnpm run build",
        output: "dist"
      },
    })


  },
});
