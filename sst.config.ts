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

    const site = new sst.aws.StaticSite("Website", {
      environment: {
        VITE_API_URL: api.url
      },
      path:'website',
      build: {
        command: "pnpm run build",
        output: "dist"
      },
    })

    const GoogleClientId = new sst.Secret('GOOGLE_CLIENT_ID')
    const GoogleClientSecret = new sst.Secret('GOOGLE_CLIENT_SECRET')

    const userPool = new sst.aws.CognitoUserPool("TheUsers")
    userPool.addIdentityProvider('Google', {
      type: "google",
      details: {
        client_id: GoogleClientId.value,
        client_secret: GoogleClientSecret.value,
        authorize_scopes: "sub"
      },
      attributes: {
        username: 'sub'
      }
    })
  },
});
