# FunkyStack 
## An opinionated serverless stack boilerplate

FunkyStack is under development

### It is based on

* AWS
  * Cloudfront
  * S3
  * Lambda
  * API Gateway

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

(with many more things to come)


Current development is by Ben Chalmers, and it is not considered ready for production use.

### Principles
* Server components are not ready for use yet
* Testing should be e2e where possible
* The website should be distributed via a CDN
* The backend should be serverless
* AWS is the cloud of choice
* Keep it as cheap as possible if no-one is using it
* Where possible new functional components should (eventually) be extracted into their own repos
* There will probably be a complete rewrite before this is considered production ready

### Coming soon 
#### (if I get around to it.  not in any particular order)
(Less likely to happen now I'm working on a different stack)
* Secrets
* Authentication
  * Starting with federated login
  * Then passkeys
  * Not currently especially interested in passwords or magic links
* A database
  * Probably dynamodb (but this is open to me picking a different opinion later)
* A real world webservice built on top of the framework for real world testing
* Deployment (Staging and Release) and Testing via github actions