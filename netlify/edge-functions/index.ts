import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { corsOptions } from '../utils/shared.ts'

const app = new Hono()

// Add CORS middleware
app.use('*', cors(corsOptions))

app.get('/', (c) => {
  return c.json({
    message: "Welcome to the API, secured by digital signature",
  }, { status: 200 })
})

export default app.fetch