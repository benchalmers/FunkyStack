/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "monorepo",
      removal: input?.stage === "production" ? "retain" : "remove",
      home: "aws",
      providers: { aws: "6.52.0" },
    };
  },
  async run() {

    const listTable = new sst.aws.Dynamo("ListTable", {
      fields: {
        id: 'string',
        name: 'string'
      },
      primaryIndex: {hashKey: 'id'},
      globalIndexes: {
        nameIndex: {hashKey: 'id', rangeKey: 'name'}
      },
      transform: {
        table: {
          billingMode: 'PAY_PER_REQUEST'
        }
      }
    })

    const authTable = new sst.aws.Dynamo("Auth", {
      fields: {
        username: 'string',
        userid: 'string'
      },
      primaryIndex: {hashKey: 'userid'},
      globalIndexes: {
        nameIndex: {hashKey: 'userid', rangeKey: 'username'}
      },
      transform: {
        table: {
          billingMode: 'PAY_PER_REQUEST'
        }
      }
    })

    const funkyDBTable = new sst.aws.Dynamo("FunkyDBTable", {
      fields: {
        FDBTenant: 'string',
        FDBTableEntry: 'string'
      },
      primaryIndex: {hashKey: 'FDBTenant', rangeKey: 'FDBTableEntry'},
      transform: {
        table: {
          billingMode: 'PAY_PER_REQUEST'
        }
      }
    })



    const userPool = new sst.aws.CognitoUserPool("TheUsers",{
      transform: {
        userPool: (args)=>{
          args.passwordPolicy = {
            minimumLength: 20,
            passwordHistorySize: 0,
            requireLowercase: false,
            requireNumbers: false,
            requireSymbols: false,
            requireUppercase: false, 
            temporaryPasswordValidityDays: 1,
          }
          args.schemas=[{
            attributeDataType: 'String',
            name: 'FAuthId',
            mutable: true,
            required: false
          }]
        },
      }
    })
    const zone = new sst.Secret('FUNKY_DOMAIN_ZONE')
    const domainName = new sst.Secret('FUNKY_DOMAIN_NAME')
    const api = new sst.aws.ApiGatewayV2("TheAPI", {
      cors: {
        allowOrigins: ["*"],
        exposeHeaders: ["content-type"],
      },
    });

    const smartAddr = new sst.Linkable("SmartAddr", {
      properties: {
        host: $dev? 'localhost' : domainName.value,
        hostPort: $dev? 'localhost:5173' : domainName.value,
        proto: $dev ? 'http' : 'https'
      }
    })

    api.route('GET /{path+}', { handler: 'packages/api/trpc.handler',
      link: [userPool, authTable, listTable, funkyDBTable, domainName, smartAddr]
    }, {});
    api.route('POST /{path+}', { handler: 'packages/api/trpc.handler',
      link: [userPool, authTable, listTable, funkyDBTable, domainName, smartAddr]
    }, {});

    const finalName = domainName.value.apply(
      (t)=>(($app.stage!=='production')
        ?`${$app.stage}.${t}`
        :t)
      )
      const authDomainFn = (t:string)=>`auth.${t}`

    console.log('DOMAIN',finalName)


    const GoogleClientId = new sst.Secret('GOOGLE_CLIENT_ID')
    const GoogleClientSecret = new sst.Secret('GOOGLE_CLIENT_SECRET')



    const provider = userPool.addIdentityProvider('Google', {
      type: "google",
      details: {
        client_id: GoogleClientId.value,
        client_secret: GoogleClientSecret.value,
        authorize_scopes: "email profile"
      },
      attributes: {
        username: 'sub'
      }
    })

    const client = userPool.addClient('Web', {
      providers: [provider.providerName],
      transform: { client: (args)=>{
        args.callbackUrls = ['http://localhost:5174/auth','http://localhost:5173/auth', finalName.apply(t=>`https://${t}/auth`)]
      } }
    })


    

    if (!$dev) {
      sst.aws.dns({zone: zone.value}).createAlias('AuthDomainRecord',{
        name: finalName.apply(authDomainFn), 
        aliasName: domainName.value, 
        aliasZone: zone.value},{})
    }


    const authDomain =  new aws.cognito.UserPoolDomain("authDomain", {
      userPoolId: userPool.id,
      domain: finalName.apply(t=>('fsauth-'+t.replaceAll('.','-')))
    },{replaceOnChanges:["*"], deleteBeforeReplace: true })

    // const authDomain = new aws.cognito.UserPoolDomain("authDomain", {
    //   userPoolId: userPool.id,
    //   domain: finalName.apply(t=>authDomainFn(t)),
    //   certificateArn: new aws.acm.Certificate("authCert", {
    //     domainName: finalName.apply(authDomainFn),
    //     validationMethod: 'DNS',
    //     validationOptions: [{domainName:finalName.apply(t=>authDomainFn(t)), validationDomain: finalName}]
    //   }).arn
    // })


   

    const cognitoEndpoint = authDomain.domain.apply(t=>(`https://${t}.auth.eu-west-2.amazoncognito.com`))

    const appUrl = finalName.apply(t=>(`${$dev?'http':'https'}://${t}`))
    const site = new sst.aws.StaticSite("Website", {
      environment: {
        VITE_API_URL: api.url,
        VITE_COGNITO_CLIENT: client.id,
        VITE_COGNITO_ENDPOINT: cognitoEndpoint,
        VITE_URL: appUrl,
        VITE_USER_POOL: userPool.id
      },
      domain: {
        name: finalName,
        dns: sst.aws.dns({
          zone: zone.value
        })
      },
      path:'website',
      build: {
        command: "pnpm run build",
        output: "dist"
      },
    })
   


    return {
      api: api.url,
      site: site.url,
      cognito: cognitoEndpoint,
      app: appUrl,
      userPool: userPool.id,
      host: $dev? 'localhost:5173' : domainName.value,

    }
    

  },
});
