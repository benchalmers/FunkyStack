import { z } from "zod";
import {
  awsLambdaRequestHandler,
  CreateAWSLambdaContextOptions
} from "@trpc/server/adapters/aws-lambda";
import { APIGatewayProxyEventV2, Context as APIGWContext } from 'aws-lambda'
import { initTRPC } from "@trpc/server";
import * as jose from "jose"
import { Resource } from "sst";


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