import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { corsOptions, getSubgraphSlug } from '../utils/shared.ts'

const app = new Hono()

// Add CORS middleware
app.use('*', cors(corsOptions))

const GRAPH_API_URL = `https://api.goldsky.com/api/public/project_cmhoc42eyqwf101z818rh6knp/subgraphs/${getSubgraphSlug()}/gn`

app.get('/globalMetrics', async (c) => {
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

app.get('/userMetrics', async (c) => {
  const userAddress = c.req.query('userAddress')
  if (!userAddress) {
    return c.json({
      statusCode: 400,
      error: 'userAddress parameter is required',
    }, { status: 400 })
  }

  try {
    const creatorQuery = `
      query MyQuery {
        creator(id: "${userAddress}") {
          totalAssets
          totalEarnings
          totalSubscribers
          totalAssetWorth
        }
      }
    `

    const holderQuery = `
      query MyQuery {
        holder(id: "${userAddress}") {
          totalPurchases
          totalSpent
        }
      }
    `

    const creatorResponse = await fetch(GRAPH_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: creatorQuery }),
    })

    if (!creatorResponse.ok) {
      return c.json({
        statusCode: creatorResponse.status,
        error: 'Failed to fetch data from GraphQL API',
        message: `API responded with status: ${creatorResponse.status}`,
      }, { status: 502 })
    }

    const holderResponse = await fetch(GRAPH_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: holderQuery }),
    })

    if (!holderResponse.ok) {
      return c.json({
        statusCode: holderResponse.status,
        error: 'Failed to fetch data from GraphQL API',
        message: `API responded with status: ${holderResponse.status}`,
      }, { status: 502 })
    }

    const creatorResult = await creatorResponse.json()
    const holderResult = await holderResponse.json()

    if (creatorResult.errors || holderResult.errors) {
      return c.json({
        statusCode: 500,
        error: 'GraphQL query failed',
        details: creatorResult.errors || holderResult.errors,
      }, { status: 500 })
    }

    // Extract and format the user stats data
    const creatorData = creatorResult.data?.creator
    const holderData = holderResult.data?.holder

    return c.json({
      statusCode: 200,
      data: {
        creator: {
          totalAssets: creatorData?.totalAssets || 0,
          totalEarnings: creatorData?.totalEarnings || 0,
          totalSubscribers: creatorData?.totalSubscribers || 0,
          totalAssetWorth: creatorData?.totalAssetWorth || 0,
        },
        holder: {
          totalPurchases: holderData?.totalPurchases || 0,
          totalSpent: holderData?.totalSpent || 0,
        },
      },
    }, { status: 200 })
  } catch (error) {
    return c.json({
      statusCode: 500,
      error: 'Failed to fetch user metrics',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 })
  }
})

app.get('/heatmap', async (c) => {
  const userAddress = c.req.query('userAddress')
  if (!userAddress) {
    return c.json({
      statusCode: 400,
      error: 'userAddress parameter is required',
    }, { status: 400 })
  }
  
  try {

    const creatorQuery = `
      query MyQuery {
        creator(id: "${userAddress}") {
          assets {
            createdAt
          }
        }
      }
    `

    const holderQuery = `
      query MyQuery {
        holder(id: "${userAddress}") {
          subscription {
            subscribedAt
          }
        }
      }
    `

    const creatorResponse = await fetch(GRAPH_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: creatorQuery }),
    })

    if (!creatorResponse.ok) {
      return c.json({
        statusCode: creatorResponse.status,
        error: 'Failed to fetch data from GraphQL API',
        message: `API responded with status: ${creatorResponse.status}`,
      }, { status: 502 })
    }

    const holderResponse = await fetch(GRAPH_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: holderQuery }),
    })

    if (!holderResponse.ok) {
      return c.json({
        statusCode: holderResponse.status,
        error: 'Failed to fetch data from GraphQL API',
        message: `API responded with status: ${holderResponse.status}`,
      }, { status: 502 })
    }

    const creatorResult = await creatorResponse.json()
    const holderResult = await holderResponse.json()

    if (creatorResult.errors || holderResult.errors) {
      return c.json({
        statusCode: 500,
        error: 'GraphQL query failed',
        details: creatorResult.errors || holderResult.errors,
      }, { status: 500 })
    }

    const creatorData = creatorResult.data?.creator
    const holderData = holderResult.data?.holder

    // Convert timestamps to date/month/year format
    const formatTimestamp = (timestamp: string) => {
      const date = new Date(parseInt(timestamp) * 1000)
      const day = date.getDate()
      const month = date.getMonth() + 1
      const year = date.getFullYear()
      return `${day}/${month}/${year}`
    }

    return c.json({
      statusCode: 200,
      data: {
        creator: creatorData?.assets?.map((asset: any) => formatTimestamp(asset.createdAt)) || [],
        holder: holderData?.subscription?.map((sub: any) => formatTimestamp(sub.subscribedAt)) || [],
      },
    }, { status: 200 })

  } catch (error) {
    return c.json({
      statusCode: 500,
      error: 'Failed to fetch heat map',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 })
  }
})

export default app.fetch

export const config = {
    path: ["/globalMetrics", "/userMetrics", "/heatmap"]
}