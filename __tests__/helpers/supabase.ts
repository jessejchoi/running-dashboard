import { vi } from 'vitest'

type QueryResult<T = unknown> = Promise<T> | T

type TerminalMethod =
  | 'maybeSingle'
  | 'single'
  | 'then'

type ChainMethod =
  | 'gt'
  | 'lt'
  | 'neq'
  | 'or'
  | 'range'
  | 'select'
  | 'eq'
  | 'in'
  | 'gte'
  | 'lte'
  | 'order'
  | 'delete'
  | 'update'
  | 'insert'
  | 'upsert'
  | 'limit'

const CHAIN_METHODS: ChainMethod[] = [
  'gt', 'lt', 'neq', 'or', 'range',
  'select',
  'eq',
  'in',
  'gte',
  'lte',
  'order',
  'delete',
  'update',
  'insert',
  'upsert',
  'limit',
]

export function createQueryChain<T = unknown>(result: QueryResult<T>) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {}

  for (const method of CHAIN_METHODS) {
    chain[method] = vi.fn().mockReturnValue(chain)
  }

  chain.maybeSingle = vi.fn().mockResolvedValue(result)
  chain.single = vi.fn().mockResolvedValue(result)
  chain.then = vi.fn(((resolve?: (value: T) => unknown, reject?: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject)) as any)

  return chain as Record<ChainMethod | TerminalMethod, ReturnType<typeof vi.fn>>
}

export function queueSupabaseTables(
  fromMock: ReturnType<typeof vi.fn>,
  ...chains: Array<ReturnType<typeof createQueryChain>>
) {
  fromMock.mockReset()
  for (const chain of chains) {
    fromMock.mockReturnValueOnce(chain)
  }
}
