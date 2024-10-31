import { ReactElement, Suspense, useEffect, useState } from 'react'
//import reactLogo from './assets/react.svg'
//import viteLogo from '/vite.svg'
import './App.css'
import { Router} from 'api/trpc'
import { createTRPCReact, httpBatchLink } from '@trpc/react-query'
import { QueryClient, QueryClientProvider} from '@tanstack/react-query'
import { create } from 'zustand'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card'
import { Input } from './components/ui/input'
import { Button } from './components/ui/button'
import {produce} from 'immer'
import { GoogleButton } from './components/google'
import { CognitoIdentityProviderClient, InitiateAuthCommand } from '@aws-sdk/client-cognito-identity-provider'
import {Link, Route, Switch, useLocation, useSearch} from "wouter"
import {z} from "zod"
import { persist, createJSONStorage } from 'zustand/middleware'
import * as jose from 'jose'
import { JWKSTimeout, JWTExpired } from 'jose/errors'
import { StatementSync } from 'node:sqlite'
import { Utensils } from 'lucide-react'

import { browserSupportsWebAuthn, browserSupportsWebAuthnAutofill, startRegistration} from '@simplewebauthn/browser'
import { Popover, PopoverContent, PopoverTrigger } from './components/ui/popover'
const zTokens = z.object({
  access_token: z.string(),
  id_token: z.string(),
  refresh_token: z.string().optional(),
  token_type: z.string(),
  expires_in: z.number().int()
})

type Tokens = z.infer<typeof zTokens>

type AppStateStore = {
  currentUser: string,
  setCurrentUser: (name:string)=>void,
  loggedIn: boolean,
  loggingIn: boolean,
  logInWithGoogle: ()=>void
  authorize: (code:string, redirect:string)=>void,
  setAuth: (auth: Tokens)=>void,
  auth?: Tokens
  updateTokens: ()=>void,
  keys?: ReturnType<typeof jose.createRemoteJWKSet>,
  refresh: ()=>void,
  logOut: ()=>void,
}



const useAppStateStore = create<AppStateStore>()(

  persist((set, get)=>{
    console.log('Create zustand')
    const cognitoClient = new CognitoIdentityProviderClient({region: "eu-west-2"})

    return {
      logOut: ()=>{
        console.log('log out')
        return set(produce((state:AppStateStore)=>{
          state.loggedIn=false
          state.loggingIn=false
          state.auth=undefined
          state.keys=undefined
        }))
      },
      refresh: ()=>{
        console.log('refresh')
        return set(produce((state:AppStateStore)=>{
          if (state.loggedIn) return
          if (state.loggingIn) return
          console.log('Do Fetch')
          fetch(`${import.meta.env.VITE_COGNITO_ENDPOINT}/oauth2/token`,{
            method: 'POST',
            headers: {'Content-Type': 'application/x-www-form-urlencoded'},
            body: new URLSearchParams({
              grant_type: 'refresh_token',
              client_id: import.meta.env.VITE_COGNITO_CLIENT,
              refresh_token: state.auth!.refresh_token!
            })
          }).then((resp)=>{
            if (!resp.ok) {
              //state.loggedOut()
            }
            resp.json().then((json)=>{
              const state = useAppStateStore.getState()
              console.log(json)
              const body=zTokens.parse(json)
              state.setAuth(body)
            })
          })
          // state.loggingIn()
          state.loggingIn = true
          state.loggedIn = false

        }))

      },
      currentUser: 'FunkyStack User',
      setCurrentUser: (name:string)=>set(produce((state)=>{state.currentUser =name})),
      loggedIn: false,
      loggingIn: false,
      logInWithGoogle: ()=>{
      },
      setAuth: (tokens: Tokens)=>{
        return set(produce((state:AppStateStore)=>{
          const access = jose.decodeJwt(tokens.access_token)
          if (!access.exp) return;
          const now = (new Date()).getDate()
          const next = (access.exp*1000-now)*.9
          setTimeout(state.refresh, next)
          state.auth = {...state.auth, ...tokens}
          //state.loggedIn
          state.loggedIn = true
          state.loggingIn = false
        }))
      },
      updateTokens:()=>{
        return set(produce((state:AppStateStore)=>{
          if (!state.auth) return
          if (!state.keys) state.keys=jose.createRemoteJWKSet(new URL(`https://cognito-idp.eu-west-2.amazonaws.com/${import.meta.env.VITE_USER_POOL}/.well-known/jwks.json`))
          jose.jwtVerify(state.auth.access_token, state.keys).catch((rej)=>{
            console.log('Access token rejected', rej)
            if (rej instanceof JWTExpired) {
              useAppStateStore.getState().refresh()
              return
            }
            useAppStateStore.getState().logOut()
          })
        }))

      },
      authorize: (code:string, redirect:string)=>{
        return set(produce((state:AppStateStore)=>{
          if (state.loggedIn) return
          if (state.loggingIn) return
          console.log('Do Fetch')
          fetch(`${import.meta.env.VITE_COGNITO_ENDPOINT}/oauth2/token`,{
            method: 'POST',
            headers: {'Content-Type': 'application/x-www-form-urlencoded'},
            body: new URLSearchParams({
              grant_type: 'authorization_code',
              client_id: import.meta.env.VITE_COGNITO_CLIENT,
              redirect_uri: redirect,
              code: code
            })
          }).then((resp)=>{
            if (!resp.ok) {
              //state.loggedOut()
            }
            resp.json().then((json)=>{
              const state = useAppStateStore.getState()
              console.log(json)
              const body=zTokens.parse(json)
              state.setAuth(body)
            })
          })
          // state.loggingIn()
          state.loggingIn = true
          state.loggedIn = false

        }))
  }
  }},{name:'funkyStore',
    onRehydrateStorage: (state)=>{
      return (state?:AppStateStore, error?:unknown)=>{
        if (error) {
          console.log('Hydration Error', error)
          return
        }
        if (state?.loggedIn) {
          state.updateTokens()
        }
      }
    }
  })
)

const trpc = createTRPCReact<Router>();

const LogOut = ()=>{
  const logout =  useAppStateStore((state)=>state.logOut)
  return <Button variant="outline" onClick={()=>{logout()}}>Sign Out</Button>
}

const LoggedIn = (props: {children: ReactElement})=>{
  const loggedIn = useAppStateStore((state)=>state.loggedIn)
  return <>{loggedIn?props.children:<></>}</>

}

const Inside = ()=>{
  const [iname, setIname] = useState('')
  const [ival, setIval] = useState('')
  const list = trpc.getList.useQuery()
  const utils = trpc.useUtils()
  const [name, setName] = useState('')
  const setCurrentUser = useAppStateStore((state)=>state.setCurrentUser)
  const currentUser=useAppStateStore((state)=>state.currentUser)
  const [greet,] = trpc.greet.useSuspenseQuery({name: currentUser})
  const loggedIn = useAppStateStore((state)=>state.loggedIn)
  console.log(import.meta.env, loggedIn, useAppStateStore.getState())
  const listMutate = trpc.putListItem.useMutation({
    onSettled: async()=>{
      utils.getList.invalidate()
    }
  })
  return <>  
    <Card>
      {loggedIn?<>Logged In <LogOut/></>:<GoogleButton link={`${import.meta.env.VITE_COGNITO_ENDPOINT}/oauth2/authorize?identity_provider=Google&response_type=code&client_id=${import.meta.env.VITE_COGNITO_CLIENT}&redirect_uri=${window.location.href}auth`}>
      </GoogleButton>}
    </Card>
    <LoggedIn>
      <Card>
        <CardHeader>
          <CardTitle>FunkyStack Demo</CardTitle>
          <CardDescription>A simple demo of FunkyStack components working in harmony</CardDescription>
        </CardHeader>
        <CardContent>
          <h1>{greet}</h1>

          <Input className='mt-2' type="text" placeholder='User Name' value={name} onChange={(e)=>{setName(e.target.value)}}></Input>
          <Button className='mt-2' variant="outline" onClick={()=>{
              setCurrentUser(name)
            }}>Click to change user</Button>
        </CardContent>

      </Card>

    </LoggedIn>
    <Card>
        <CardContent>
          <div className='flex flex-row'>
            <Input type='text' placeholder='Name' value={iname} onChange={(e)=>{setIname(e.target.value)}} />
            <Input type='text' placeholder='Value' value={ival} onChange={(e)=>{setIval(e.target.value)}} />
          </div>
          <Button variant="outline" onClick={ ()=>{
            listMutate.mutateAsync({name: iname, value: ival})
          }}>Submit</Button>
          { list.isSuccess ? <>
            {list.data.map(a=><div key={a.FDBId}>{a.FDBId} {a.name} {a.value}</div>)}
          </>:<>Nothing to see here</> }
        </CardContent>
      </Card>
  </>
}

const ProcessAuth = ()=>{
  const search = useSearch()
  const searchParams = new URLSearchParams(search)
  const loggedIn = useAppStateStore((state)=>state.loggedIn)
  const authorize = useAppStateStore((state)=>state.authorize)
  const code = searchParams.has('code')?searchParams.get('code'):undefined
  const [location, setLocation] = useLocation()
  useEffect(()=>{

    if (code && !loggedIn) {
      authorize(code, `${window.location.protocol}//${window.location.host}/auth`)
    }
  },[])
  useEffect(()=>{
    if (loggedIn) {
      console.log('loggedIn!')
      setLocation('/')
    }
  },[loggedIn])

  return <>Auth = {code}</>
}

function App() {
  const [queryClient] = useState(()=>new QueryClient())
  const [trpcClient]= useState(()=>trpc.createClient({
    links:[httpBatchLink({
      url: import.meta.env.VITE_API_URL, fetch: (url, options)=>(fetch(url, {...options})),
      headers:()=>{
        const state = useAppStateStore.getState()
        if (state.auth && state.loggedIn)
          return { Authorization: `${state.auth.token_type} ${state.auth.access_token}`}
        return {}
      }
    })]
  }))
  return (
    <>
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
         <QueryClientProvider client={queryClient}>
          <Suspense fallback="Fetching...">
            <Switch>
            <Route path='/auth'><ProcessAuth/></Route>
            <Route><Inside /></Route>
            </Switch>
          </Suspense>
        </QueryClientProvider>
      </trpc.Provider>
    </>
  )
}

export default App
