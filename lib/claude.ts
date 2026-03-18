import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const RETRY_DELAYS = [2000, 4000]

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Retry on 429/529 with exponential backoff (2s, 4s), then throw.
 * 30s timeout via AbortController.
 * Structured logging.
 */
export async function claudeMessage(params: {
  model: string
  system: string
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
  max_tokens: number
}): Promise<string> {
  const startMs = Date.now()

  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30_000)

    try {
      const message = await anthropic.messages.create(
        {
          model: params.model,
          system: params.system,
          messages: params.messages,
          max_tokens: params.max_tokens,
        },
        { signal: controller.signal }
      )

      const latencyMs = Date.now() - startMs
      console.log('[claude]', {
        model: params.model,
        inputTokens: message.usage?.input_tokens,
        latencyMs,
      })

      return message.content[0].type === 'text' ? message.content[0].text : ''
    } catch (err) {
      const isApiError = err instanceof Anthropic.APIError
      const status = isApiError ? err.status : undefined
      const isRetryable = status === 429 || status === 529

      console.error('[claude/error]', {
        model: params.model,
        attempt,
        error: err instanceof Error ? err.message : String(err),
      })

      if (isRetryable && attempt < RETRY_DELAYS.length) {
        await sleep(RETRY_DELAYS[attempt])
        continue
      }

      throw err
    } finally {
      clearTimeout(timeout)
    }
  }

  throw new Error('claudeMessage: exhausted retries')
}

/**
 * Streaming variant — returns the Anthropic MessageStreamManager after retry.
 * Same retry/timeout logic on connection.
 */
export async function claudeStream(params: {
  model: string
  system: string
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
  max_tokens: number
}): Promise<Anthropic.MessageStreamManager> {
  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    try {
      const stream = anthropic.messages.stream({
        model: params.model,
        system: params.system,
        messages: params.messages,
        max_tokens: params.max_tokens,
      })

      return stream
    } catch (err) {
      const isApiError = err instanceof Anthropic.APIError
      const status = isApiError ? err.status : undefined
      const isRetryable = status === 429 || status === 529

      console.error('[claude/stream/error]', {
        model: params.model,
        attempt,
        error: err instanceof Error ? err.message : String(err),
      })

      if (isRetryable && attempt < RETRY_DELAYS.length) {
        await sleep(RETRY_DELAYS[attempt])
        continue
      }

      throw err
    }
  }

  throw new Error('claudeStream: exhausted retries')
}
