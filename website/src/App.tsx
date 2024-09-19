import { Suspense, useState } from 'react'
//import reactLogo from './assets/react.svg'
//import viteLogo from '/vite.svg'
import './App.css'
import { Router} from 'api/trpc'
import { createTRPCReact, httpBatchLink } from '@trpc/react-query'
import { QueryClient, QueryClientProvider} from '@tanstack/react-query'
import { create } from 'zustand'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './components/ui/card'
import { Input } from './components/ui/input'
import { Button } from './components/ui/button'
import {produce} from 'immer'

type AppStateStore = {
  currentUser: string,
  setCurrentUser: (name:string)=>void
}

const useAppStateStore = create<AppStateStore>()(
  (set)=>({
    currentUser: 'FunkyStack User',
    setCurrentUser: (name:string)=>set(produce((state)=>{state.currentUser =name}))
  })
)

const trpc = createTRPCReact<Router>();


const Inside = ()=>{
  const [name, setName] = useState('')
  const setCurrentUser = useAppStateStore((state)=>state.setCurrentUser)
  const currentUser=useAppStateStore((state)=>state.currentUser)
  const [greet,] = trpc.greet.useSuspenseQuery({name: currentUser})
  return <>  
    
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
  </>
}

function App() {
  const [queryClient] = useState(()=>new QueryClient())
  const [trpcClient]= useState(()=>trpc.createClient({
    links:[httpBatchLink({
      url: import.meta.env.VITE_API_URL, fetch: (url, options)=>(fetch(url, {...options})),
    })]
  }))
  return (
    <>
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
         <QueryClientProvider client={queryClient}>
          <Suspense fallback="Fetching...">
            <Inside />
          </Suspense>
        </QueryClientProvider>
      </trpc.Provider>
    </>
  )
}

export default App
