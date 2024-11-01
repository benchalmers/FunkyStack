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
import {FDbMakeId,  ddbDocClient, FBAuthUser, ListItem, AuthUser, UserName} from "./Db"
import { PutCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { Ok, Result, ResultAsync } from "neverthrow";

console.log('This is trpc world')


function throwIfErr<A,B,>(possible: Result<A,B>): Ok<A,B> {
  if (possible.isErr()) {
      throw possible.error
  }
  return possible
}

let keys:undefined|ReturnType<typeof jose.createRemoteJWKSet>=undefined

const createContext = async ({
    event,
    context
  }: CreateAWSLambdaContextOptions<APIGatewayProxyEventV2>) => {

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

const passKeySettings = {
  rpName: 'FunkyStack Example',
  rpId: Resource.SmartAddr.host,
  origin: `${Resource.SmartAddr.proto}://${Resource.SmartAddr.hostPort}`
}

const cognitoClient = new CognitoIdentityProviderClient({})

type PassKeySettings = {
  rpName: string,
  rpId: string,
  origin: string
}

const passKeyHandler = (settings: PassKeySettings)=>{
  return {
    checkIfUserExists: async (tenant:string, user:string)=>{
      console.log('CHECK IF USER EXISTS')
      
      const result = await FBAuthUser.getOne(tenant, user)
      if (result.isErr()) {
        console.log('NO USER FOUND')
        return false
      }

      return true

    },
    generateRegistrationOptions: async(userName: string)=>{
      return generateRegistrationOptions({
        rpName: settings.rpName,
        rpID: settings.rpId,
        userName: userName,
        attestationType: 'none',
        authenticatorSelection: {
          residentKey: 'preferred',
          userVerification: 'preferred',
          authenticatorAttachment: 'platform'
        }
      })
    },
    createUser: async (tenant:string, userName: string, options: PublicKeyCredentialCreationOptionsJSON)=>{
      const userId = FDbMakeId()
      console.log('CREATE USER')
      const putRes = throwIfErr(
        await ResultAsync.combine([

          ResultAsync.fromThrowable(()=>{
            return cognitoClient.send(new AdminCreateUserCommand({
              UserPoolId: Resource.TheUsers.id,
              Username: userName,
              TemporaryPassword: Buffer.from((crypto.getRandomValues(new Uint8Array(20)))).toString('hex'),
              ForceAliasCreation: false,
              MessageAction: 'SUPPRESS',
              DesiredDeliveryMediums: [],
              UserAttributes: [
                { 
                  Name: 'custom:FAuthId',
                  Value: userId
                }
              ]
                
              }))})(),

          FBAuthUser.put(tenant, userId, {
            userName: userName,
            challenge: options.challenge,
            challengeTimeout: Date.now()+(options.timeout??3600000),
            credentials: []
          })
        ])
      )
      
      console.log('CREATE USER RESULT',putRes.value)
      return options.challenge
    }
  }
}


export class FunkyAuthUserExists extends Error {}

export class FunkyUninitializedUser extends Error {}

const passKeys=passKeyHandler(passKeySettings)

const getUserAttribute = (user: AdminGetUserCommandOutput, attribute: string)=>{
  if (!(user.UserAttributes)) {
    throw new FunkyUninitializedUser('Uninitialized User - no attributes')
  }
  const att = user.UserAttributes.find(a=>(a.Name===attribute))
  if (!att || att.Value===undefined) {
    throw new FunkyUninitializedUser(`Uninitialized User - no ${attribute}`)
  }
  return att.Value
}

export const router = t.router({
  greet: publicProcedure
    .input(z.object({ name: z.string() })).output(z.string())
    .query(({ input, ctx }) => {
        console.log('hello', ctx.auth)
      return `Hello ${input.name}!`;
    }),
  passKeyCreateUser : publicProcedure
    .input(z.object({userName: z.string()}))
    .mutation(async ({input, ctx})=>{
      if (await passKeys.checkIfUserExists('DEFAULTTENANT',input.userName)) {
        throw new FunkyAuthUserExists('User Exists')
      }
      const options = await passKeys.generateRegistrationOptions(input.userName)
      console.log('Options',options)
      await passKeys.createUser('DEFAULTTENANT',input.userName, options)
      console.log('CreateUser done', options)
      return options
    }),
    passKeyVerifyUser: publicProcedure
      .input(z.object({
        expectedUserName: z.string(),
        response: z.object({
          id: z.string(),
          rawId: z.string(),
          response: z.object({
            clientDataJSON: z.string(),
            attestationObject: z.string(),
            authenticatiorData: z.string().optional(),
            transports: z.array(z.enum([ 'ble', 'cable' , 'hybrid' , 'internal' , 'nfc' , 'smart-card' , 'usb'])).optional(),
            COSEAlgorithmIdentifier: z.number().optional(),
            publicKey: z.string().optional()
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
        console.log('VERIFY USER', input.expectedUserName)
        const userName = await UserName.getOne( 'DEFAULTTENANT', input.expectedUserName)
        if (userName.isErr()) {
          console.log('Bad Username', userName)
          throw userName.error
        }
        const user = await FBAuthUser.getOne('DEFAULTTENANT', userName.value.userId)
        if (user.isErr()) {
          console.log('Bad UserId', user.error)
          throw user.error
        }
        if (user.value.challengeTimeout < Date.now()) {
          console.log('Bad Timout')
          throw new Error(`Timeout exceeded for challenge ${user.value.challengeTimeout} ${ Date.now()}`)
        }
        console.log('I have a user Id', user.value.FDBId)
        const j={...input, expectedRPID: passKeySettings.rpId, expectedOrigin: passKeySettings.origin, expectedChallenge: user.value.challenge}
        console.log('Reg Response', j)
        const verifyResponse = await verifyRegistrationResponse(j)
        if (!verifyResponse.verified) {
          throw new Error('Invalid response')
        }
        console.log('Updating user')
        const updateUser:AuthUser={...user.value,
          credentials: [...user.value.credentials, {
            id: verifyResponse.registrationInfo!.credentialID,
            publicKey: Array.from(verifyResponse.registrationInfo!.credentialPublicKey),
            counter: 0,
            transports: input.response.response.transports!
          }]
        }
        console.log('new details', user.value.FDBId, updateUser)
        FBAuthUser.put('DEFAULTTENANT', user.value.FDBId, updateUser)
      }),
  putListItem: publicProcedure
    .input(z.object({name: z.string(), value: z.string()}))
    .mutation(async ({input})=>{
      const id = FDbMakeId()
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
  let a 
  try {
    a = await awsLambdaRequestHandler({
      router: router,
      createContext
    })(event, ctx)
    console.log('HANDLER DONE')
  }
  catch (e) {
    console.log('ERROR', e)
    throw(e)
  }
  return a
};