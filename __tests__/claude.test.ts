import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// vi.mock is hoisted — can't reference module-level variables in the factory.
vi.mock('@anthropic-ai/sdk', () => {
  class APIError extends Error {
    status: number
    constructor(status: number, message: string) {
      super(message)
      this.status = status
      this.name = 'APIError'
    }
  }

  const mockCreate = vi.fn()
  const mockStream = vi.fn()

  const AnthropicClass = vi.fn().mockImplementation(() => ({
    messages: {
      create: mockCreate,
      stream: mockStream,
    },
  }))
  ;(AnthropicClass as any).APIError = APIError
  ;(AnthropicClass as any).__mockCreate = mockCreate
  ;(AnthropicClass as any).__mockStream = mockStream

  return {
    default: AnthropicClass,
  }
})

import { claudeMessage, claudeStream } from '@/lib/claude'
import Anthropic from '@anthropic-ai/sdk'

function getMocks() {
  return {
    mockCreate: (Anthropic as any).__mockCreate as ReturnType<typeof vi.fn>,
    mockStream: (Anthropic as any).__mockStream as ReturnType<typeof vi.fn>,
  }
}

const DEFAULT_PARAMS = {
  model: 'claude-haiku-4-5-20251001',
  system: 'You are a test assistant.',
  messages: [{ role: 'user' as const, content: 'Hello' }],
  max_tokens: 100,
}

describe('claudeMessage', () => {
  beforeEach(() => {
    getMocks().mockCreate.mockReset()
  })

  it('1. returns text content on success', async () => {
    const { mockCreate } = getMocks()
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Hello back!' }],
      usage: { input_tokens: 10 },
    })

    const result = await claudeMessage(DEFAULT_PARAMS)
    expect(result).toBe('Hello back!')
  })

  it('2. retries on 429, succeeds on second attempt', async () => {
    vi.useFakeTimers()
    const { mockCreate } = getMocks()
    const err429 = new (Anthropic as any).APIError(429, 'rate limited')

    mockCreate
      .mockRejectedValueOnce(err429)
      .mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Success after retry' }],
        usage: { input_tokens: 5 },
      })

    const promise = claudeMessage(DEFAULT_PARAMS)
    await vi.runAllTimersAsync()
    const result = await promise

    expect(result).toBe('Success after retry')
    expect(mockCreate).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })

  it('3. retries on 529, exhausts retries, throws', async () => {
    vi.useFakeTimers()
    const { mockCreate } = getMocks()
    const err529 = new (Anthropic as any).APIError(529, 'overloaded')

    mockCreate
      .mockRejectedValueOnce(err529)
      .mockRejectedValueOnce(err529)
      .mockRejectedValueOnce(err529)

    // Track the result to avoid unhandled rejection
    let thrown: unknown = null
    const promise = claudeMessage(DEFAULT_PARAMS).catch(e => { thrown = e })
    // Advance timers so retries fire through both delays
    await vi.advanceTimersByTimeAsync(10000)
    await promise

    expect(thrown).toBeTruthy()
    expect(mockCreate).toHaveBeenCalledTimes(3)
    vi.useRealTimers()
  })

  it('4. throws immediately on 400 (no retry)', async () => {
    const { mockCreate } = getMocks()
    const err400 = new (Anthropic as any).APIError(400, 'bad request')

    mockCreate.mockRejectedValueOnce(err400)

    await expect(claudeMessage(DEFAULT_PARAMS)).rejects.toThrow('bad request')
    expect(mockCreate).toHaveBeenCalledTimes(1)
  })

  it('5. handles timeout (AbortController signal fires)', async () => {
    const { mockCreate } = getMocks()
    const abortError = new Error('The operation was aborted')
    abortError.name = 'AbortError'

    mockCreate.mockRejectedValueOnce(abortError)

    // AbortError is not a 429/529 APIError, so it throws immediately without retry
    await expect(claudeMessage(DEFAULT_PARAMS)).rejects.toThrow()
    expect(mockCreate).toHaveBeenCalledTimes(1)
  })
})

describe('claudeStream', () => {
  beforeEach(() => {
    getMocks().mockStream.mockReset()
  })

  it('returns stream manager on success', async () => {
    const { mockStream } = getMocks()
    const fakeStream = { on: vi.fn(), [Symbol.asyncIterator]: vi.fn() }
    mockStream.mockReturnValueOnce(fakeStream)

    const stream = await claudeStream(DEFAULT_PARAMS)
    expect(stream).toBe(fakeStream)
  })
})
