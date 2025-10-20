import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { corsOptions } from '../utils/shared.ts'

const app = new Hono()

// Add CORS middleware
app.use('*', cors(corsOptions))

const GRAPH_API_URL = 'https://api.studio.thegraph.com/query/1685715/decentralizedx-analytics/version/latest'

app.get('/landingPage', async (c) => {
  try {
    const query = `
      query MyQuery {
        globalStats(id: "0x00000000") {
          totalUsers
          totalAssets
          totalAssetWorth
          totalVolume
        }
      }
    `

    const response = await fetch(GRAPH_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    })

    if (!response.ok) {
      return c.json({
        statusCode: response.status,
        error: 'Failed to fetch data from GraphQL API',
        message: `API responded with status: ${response.status}`,
      }, { status: 502 })
    }

    const result = await response.json()

    if (result.errors) {
      return c.json({
        statusCode: 500,
        error: 'GraphQL query failed',
        details: result.errors,
      }, { status: 500 })
    }

    // Extract and format the global stats data
    const globalStats = result.data?.globalStats

    if (!globalStats) {
      return c.json({
        statusCode: 404,
        error: 'Global stats not found',
      }, { status: 404 })
    }

    return c.json({
      statusCode: 200,
      data: {
        totalUsers: globalStats.totalUsers,
        totalAssets: globalStats.totalAssets,
        totalAssetWorth: globalStats.totalAssetWorth,
        totalVolume: globalStats.totalVolume,
      },
    }, { status: 200 })

  } catch (error) {
    return c.json({
      statusCode: 500,
      error: 'Failed to fetch landing page data',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 })
  }
})

export default app.fetch

export const config = {
    path: ["/landingPage"]
}