import { z } from "zod";
import {
  awsLambdaRequestHandler,
  CreateAWSLambdaContextOptions
} from "@trpc/server/adapters/aws-lambda";
import { APIGatewayProxyEventV2, Context as APIGWContext } from 'aws-lambda'
import { initTRPC } from "@trpc/server";
import * as jose from "jose"
import { Resource } from "sst";
import { AdminCreateUserCommand, AdminGetUserCommand, AdminGetUserCommandOutput, CognitoIdentityProviderClient, CreateUserImportJobCommand } from "@aws-sdk/client-cognito-identity-provider";
import { generateRegistrationOptions, verifyRegistrationResponse } from "@simplewebauthn/server";
import { urlToHttpOptions } from "url";
import { PublicKeyCredentialCreationOptionsJSON } from "@simplewebauthn/types";
import { inherits } from "util";
import {dbMakeId,  ddbDocClient, ListItem} from "./Db"
import { PutCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { Result, ResultAsync } from "neverthrow";

console.log('This is trpc world')

let keys:undefined|ReturnType<typeof jose.createRemoteJWKSet>=undefined

const createContext = async ({
    event,
    context
  }: CreateAWSLambdaContextOptions<APIGatewayProxyEventV2>) => {
    console.log("CTX", event)

    let auth:{authenticated:false}|{authenticated:true, user:string}={authenticated:false}
    let user
    if (event.headers['authorization']) {
      const [type,token]=event.headers['authorization'].split(' ',2)
      console.log(type, token)
      if (type==='Bearer') {
        if (!keys)
          keys = jose.createRemoteJWKSet(new URL(`https://cognito-idp.eu-west-2.amazonaws.com/${Resource.TheUsers.id}/.well-known/jwks.json`))
        try {
          console.log('try verify',token)
          const value = await jose.jwtVerify(token, keys)
          if (value.payload.sub)
            auth={authenticated: true, user: value.payload.sub}
        }
        catch (e){
          console.log('Verify failed', e)
        }

      }
    }

    return {
      auth: auth,
      event: event,
      context: context
    };
  }
type TRPCContext = Awaited<ReturnType<typeof createContext>>;


const t = initTRPC
  .context<TRPCContext>()
  .create();

const publicProcedure = t.procedure

export const router = t.router({
  greet: publicProcedure
    .input(z.object({ name: z.string() })).output(z.string())
    .query(({ input, ctx }) => {
        console.log('hello', ctx.auth)
      return `Hello ${input.name}!`;
    }),
  passKeyCreateUser : publicProcedure
    .input(z.object({userName: z.string(), origin: z.string().url(), rpid:z.string()}))
    .mutation(async ({input, ctx})=>{
      if (await passKeys.checkIfUserExists(input.userName)) {
        throw new FunkyAuthUserExists('User Exists')
      }
      const options = await passKeys.generateRegistrationOptions(input.userName, input.origin, input.rpid)
      await passKeys.createUser(input.userName, options)
      return options
    }),
    passKeyVerifyUser: publicProcedure
      .input(z.object({
        expectedUserName: z.string(), expectedOrigin: z.string().url(), expectedRPID:z.string(),
        response: z.object({
          id: z.string().base64(),
          rawId: z.string().base64(),
          response: z.object({
            clientDataJSON: z.string().base64(),
            attestationObject: z.string().base64(),
            authenticatiorData: z.string().base64().optional(),
            transports: z.array(z.enum([ 'ble', 'cable' , 'hybrid' , 'internal' , 'nfc' , 'smart-card' , 'usb'])).optional(),
            COSEAlgorithmIdentifier: z.number().optional(),
            publicKey: z.string().base64().optional()
          }),
          clientExtensionResults: z.object({
            appId: z.boolean().optional(),
            hmacCreateSecret: z.boolean().optional(),
            credProps: z.object({
              rk: z.boolean().optional()
            }).optional()
          }),
          type: z.literal('public-key')
        })
      }))
      .mutation(async ({input})=>{
        
        const user = await cognitoClient.send(new AdminGetUserCommand({
          Username: input.expectedUserName,
          UserPoolId: Resource.TheUsers.id
        }))

        const challenge=getUserAttribute(user, 'userChallenge')
        const j={...input, expectedChallenge: challenge}
        const verifyResponse = await verifyRegistrationResponse(j)
      })
  putListItem: publicProcedure
    .input(z.object({name: z.string(), value: z.string()}))
    .mutation(async ({input})=>{
      const id = dbMakeId()
      const res = await ResultAsync.combine([
        ListItem.put('DEMOBEN2', id, {name: input.name, value: input.value})
      ])
      if (res.isErr()) {
        throw res.error
      }
      console.log('SENT')
    }),
  getList: publicProcedure
  .query(async ()=>{
    const res = await ListItem.getAny('DEMOBEN2')
    if (res.isErr()) {
      throw res.error
    }
    return res.value
    
  })
  
});


export type Router = typeof router;



export const handler = async (event: APIGatewayProxyEventV2, ctx: APIGWContext) => {

    console.log("THIS IS A HANDLER")
console.log(event, ctx)
 let a 
try {
  console.log('requestHandler', router, createContext, event, ctx)
 a = await awsLambdaRequestHandler({
  router: router,
  createContext
})(event, ctx)
}
catch (e) {
  console.log('ERROR', e)
  throw(e)
}
  console.log('returned', a)
  return a
};