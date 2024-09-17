import { z } from "zod";
import {
  awsLambdaRequestHandler,
  CreateAWSLambdaContextOptions
} from "@trpc/server/adapters/aws-lambda";
import { APIGatewayProxyEventV2, Context as APIGWContext } from 'aws-lambda'
import { initTRPC } from "@trpc/server";


console.log('This is trpc world')

function createContext({
    event,
    context
  }: CreateAWSLambdaContextOptions<APIGatewayProxyEventV2>) {
    console.log("CTX", event)
    return {
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
    .query(({ input }) => {
        console.log('hello')
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