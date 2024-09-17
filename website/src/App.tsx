import { Suspense, useState } from 'react'
//import reactLogo from './assets/react.svg'
//import viteLogo from '/vite.svg'
import './App.css'
import { Router} from 'api/trpc'
import { createTRPCReact, httpBatchLink } from '@trpc/react-query'
import { QueryClient, QueryClientProvider} from '@tanstack/react-query'

const trpc = createTRPCReact<Router>();


const Inside = ()=>{
  const [count, setCount] = useState(0)
  const [greet,] = trpc.greet.useSuspenseQuery({name: 'Ministack User'})
  return <>  
    <h1>{greet}</h1>
    <div className="card">
      <button onClick={() => setCount((count) => count + 1)}>
        count is {count}
      </button>
    </div>
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
