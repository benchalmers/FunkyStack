# FunkyStack 
## An opinionated serverless stack boilerplate

FunkyStack is not ready for... anything... yet

Use at your own risk.

Don't look at the source code... it's still exploratory

### The idea

For bootstapping businesses based around web apps, serverless
provides the cheapest, and most scalable solution.

We pick tools we trust and use them across web and server (and
possibly even native and beyond) to create the easiest stack
of tools to get going with.

Where the tools we want don't exist in quite the form we want,
we write the simplest possible libraries to do the job,
explicitly with FunkyStack tools in mind.

While the components we use might not be opinionated, this
stack is.  There ought to be 'One Way To Do It' as much
as possible.  That simplifies what we are aiming for.  The
intent is that at some point (but not too soon) you outgrow
FunkyStack

### Where we are
Not even pre-alpha

At present FunkyStack is being built from lessons learned on
previous programming projects.  But in building FunkyStack
we are also learning new lessons.  This means that
everything is subject to change.

### It is currently based on

* AWS
  * Cloudfront
  * S3
  * Lambda
  * API Gateway
  * DynamoDB
  * Cognito

* Pnpm
* Typescript
* Vite
* PlayWright

* SSTv3

* React
* Tailwind
* Zustand
* Immer
* shadcn/ui
* Neverthrow
* tRPC
* Tanstack Query
* Zod

(with many more things to come)


Current development is by Ben Chalmers, and it is not considered ready for production use.

### Principles
* We're not going down the Server Component path - people might want to swap out to a non-node server one day
* Testing should be e2e where possible
* The website should be distributed via a CDN
* The backend should be serverless
* AWS is the cloud of choice (for now)
* Keep it as cheap as possible if no-one is using it
* (Future) Make it as easy as possible to move away from FunkyStack where needed when needed
* Where possible new functional components should (eventually) be extracted into their own packages
* There will probably be a complete rewrite before this is considered production ready

### The hypothetical future

#### In rough order of how and when they will be done

#### Think of this as a guide to what I'm currently thinking about, not a realistic future
* FunkyStack (In progress, you are here)
* FunkyServer (In progress, the server side of the FunkyStack)
* FunkyWeb (In progress - CDN distributable web app side of the FunkyStack)
* FunkyAuth (In early stages - Authentication and Authorization)
* FunkyDB (In early stages - Lightweight Functional DB storage for FunkyStack tools)
* FunkyFlags (Under Consideration) - lightweight feature flag support for FunkyStack Tools
* FunkyTool (under Consideration) - CLI tool somewhat like shadcn/ui's tool
* FunkyPWA (Under consideration) - Native First PWA support for FunkyWeb
* FunkyNative (Under consideration) - Native App support for Funky projects via React Native
* FunkyDocs (Really ought to be done) - Documentation done right, including for FunkyStack itself.
* FunkyMoney (Maybe...) - Monetise the hell out of FunkyStack through hosting or something

## Dev Notes

### FunkyStack

Use neverthrough for interactions between Funky components
Funky tool exported APIs should all take the form of f<ToolName><FunctionName>
Funky tool exported Types should all take the T<ToolName><TypeName>
We use composition not inheritance (both through react and using types)

### FunkyServer

Should only contain code which runs on functions
(Maybe we need a distinct FunkyDeploy to cope with deployment ???)
(Far future - FunkyDeploy could be configured using JSX???)

### FunkyWeb

Currently focusing on the SPA usecase

### FunkyAuth

Uses FunkyDB for storage
Focuses on PassKeys, SSO and social providers.
(At present, little to no consideration is being given to authorization - but we will)

### FunkyDB

Initial focus on working with DynamoDB (and following a few design principles based around it)
In DynamoDB we use a single database, with multiple tables - one table per tool
(But as an abstraction, we call each table a DB and have multiple things we call Tables per DynamoDB table)
The idea is to be simple, and to provide a base which Funky* tools can work with
There should probably be a browser storage based implementation at some point
(We also probably will need a FunkyCache component at some point - though we might be able
to co-opt tRPC and TanStack query to help with that)