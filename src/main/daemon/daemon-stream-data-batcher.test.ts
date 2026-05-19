import { describe, expect, it, vi } from 'vitest'
import type { Socket } from 'net'
import { DaemonStreamDataBatcher } from './daemon-stream-data-batcher'

function parseWrite(call: unknown[]): unknown {
  return JSON.parse(String(call[0]).trim())
}

function createFakeSocket(writeResults: boolean[] = [true]): {
  socket: Socket
  write: ReturnType<typeof vi.fn>
  removeListener: ReturnType<typeof vi.fn>
  drain: () => void
  close: () => void
  error: () => void
  staleDrain: () => void
  staleClose: () => void
  staleError: () => void
} {
  let drainHandler: (() => void) | null = null
  let closeHandler: (() => void) | null = null
  let errorHandler: (() => void) | null = null
  let removedDrainHandler: (() => void) | null = null
  let removedCloseHandler: (() => void) | null = null
  let removedErrorHandler: (() => void) | null = null
  const write = vi.fn(() => writeResults.shift() ?? true)
  const removeListener = vi.fn((event: string, handler: () => void) => {
    if (event === 'drain' && drainHandler === handler) {
      removedDrainHandler = handler
      drainHandler = null
    } else if (event === 'close' && closeHandler === handler) {
      removedCloseHandler = handler
      closeHandler = null
    } else if (event === 'error' && errorHandler === handler) {
      removedErrorHandler = handler
      errorHandler = null
    }
    return socket
  })
  const socket = {
    destroyed: false,
    write,
    removeListener,
    once: vi.fn((event: string, handler: () => void) => {
      if (event === 'drain') {
        drainHandler = handler
      } else if (event === 'close') {
        closeHandler = handler
      } else if (event === 'error') {
        errorHandler = handler
      }
      return socket
    })
  } as unknown as Socket

  return {
    socket,
    write,
    removeListener,
    drain: () => drainHandler?.(),
    close: () => closeHandler?.(),
    error: () => errorHandler?.(),
    staleDrain: () => removedDrainHandler?.(),
    staleClose: () => removedCloseHandler?.(),
    staleError: () => removedErrorHandler?.()
  }
}

function createHarness(writeResults: boolean[] = [true]) {
  let now = 0
  const fake = createFakeSocket(writeResults)
  const batcher = new DaemonStreamDataBatcher(() => ({ streamSocket: fake.socket }), {
    now: () => now
  })

  return {
    batcher,
    fake,
    setNow(value: number) {
      now = value
    }
  }
}

describe('DaemonStreamDataBatcher', () => {
  it('coalesces non-interactive output before writing to the stream socket', () => {
    vi.useFakeTimers()
    try {
      const { batcher, fake } = createHarness()

      batcher.enqueue('client-1', 'session-1', 'a')
      batcher.enqueue('client-1', 'session-1', 'b')

      expect(fake.write).not.toHaveBeenCalled()
      vi.advanceTimersByTime(7)
      expect(fake.write).not.toHaveBeenCalled()
      vi.advanceTimersByTime(1)

      expect(fake.write).toHaveBeenCalledTimes(1)
      expect(parseWrite(fake.write.mock.calls[0])).toMatchObject({
        type: 'event',
        event: 'data',
        sessionId: 'session-1',
        payload: { data: 'ab' }
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it('sends small redraws immediately after terminal input', () => {
    vi.useFakeTimers()
    try {
      const { batcher, fake, setNow } = createHarness()

      setNow(10)
      batcher.markInput('client-1', 'session-1')
      setNow(15)
      batcher.enqueue('client-1', 'session-1', '\x1b[20;2Hredraw')

      expect(fake.write).toHaveBeenCalledTimes(1)
      expect(parseWrite(fake.write.mock.calls[0])).toMatchObject({
        type: 'event',
        event: 'data',
        sessionId: 'session-1',
        payload: { data: '\x1b[20;2Hredraw' }
      })
      vi.advanceTimersByTime(8)
      expect(fake.write).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('flushes only the interactive session when another session has pending output', () => {
    vi.useFakeTimers()
    try {
      const { batcher, fake, setNow } = createHarness()

      batcher.enqueue('client-1', 'background-session', 'background')
      setNow(20)
      batcher.markInput('client-1', 'interactive-session')
      setNow(21)
      batcher.enqueue('client-1', 'interactive-session', 'redraw')

      expect(fake.write).toHaveBeenCalledTimes(1)
      expect(parseWrite(fake.write.mock.calls[0])).toMatchObject({
        sessionId: 'interactive-session',
        payload: { data: 'redraw' }
      })

      vi.advanceTimersByTime(8)
      expect(fake.write).toHaveBeenCalledTimes(2)
      expect(parseWrite(fake.write.mock.calls[1])).toMatchObject({
        sessionId: 'background-session',
        payload: { data: 'background' }
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it('waits for drain after an immediate interactive write backpressures', () => {
    vi.useFakeTimers()
    try {
      const { batcher, fake, setNow } = createHarness([false, true])

      setNow(10)
      batcher.markInput('client-1', 'session-1')
      setNow(11)
      batcher.enqueue('client-1', 'session-1', 'redraw')
      batcher.enqueue('client-1', 'session-2', 'queued')
      batcher.flush('client-1')

      expect(fake.write).toHaveBeenCalledTimes(1)
      fake.drain()

      expect(fake.write).toHaveBeenCalledTimes(2)
      expect(parseWrite(fake.write.mock.calls[1])).toMatchObject({
        sessionId: 'session-2',
        payload: { data: 'queued' }
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it('batches large output even after recent terminal input', () => {
    vi.useFakeTimers()
    try {
      const { batcher, fake, setNow } = createHarness()
      const largeOutput = 'x'.repeat(1025)

      setNow(10)
      batcher.markInput('client-1', 'session-1')
      setNow(11)
      batcher.enqueue('client-1', 'session-1', largeOutput)

      expect(fake.write).not.toHaveBeenCalled()
      vi.advanceTimersByTime(8)
      expect(fake.write).toHaveBeenCalledTimes(1)
      expect(parseWrite(fake.write.mock.calls[0])).toMatchObject({
        sessionId: 'session-1',
        payload: { data: largeOutput }
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it('batches stale output after the interactive window expires', () => {
    vi.useFakeTimers()
    try {
      const { batcher, fake, setNow } = createHarness()

      setNow(10)
      batcher.markInput('client-1', 'session-1')
      setNow(111)
      batcher.enqueue('client-1', 'session-1', 'stale redraw')

      expect(fake.write).not.toHaveBeenCalled()
      vi.advanceTimersByTime(8)
      expect(fake.write).toHaveBeenCalledTimes(1)
      expect(parseWrite(fake.write.mock.calls[0])).toMatchObject({
        sessionId: 'session-1',
        payload: { data: 'stale redraw' }
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it('forgets recent input when a session is cleared', () => {
    vi.useFakeTimers()
    try {
      const { batcher, fake, setNow } = createHarness()

      setNow(10)
      batcher.markInput('client-1', 'session-1')
      batcher.clearSessionInput('client-1', 'session-1')
      setNow(11)
      batcher.enqueue('client-1', 'session-1', 'redraw')

      expect(fake.write).not.toHaveBeenCalled()
      vi.advanceTimersByTime(8)
      expect(fake.write).toHaveBeenCalledTimes(1)
      expect(parseWrite(fake.write.mock.calls[0])).toMatchObject({
        sessionId: 'session-1',
        payload: { data: 'redraw' }
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it('drops queued output when the backpressured stream errors before drain', () => {
    const fake = createFakeSocket([false, true])
    const batcher = new DaemonStreamDataBatcher(() => ({ streamSocket: fake.socket }))

    batcher.enqueue('client-1', 'session-a', 'first')
    batcher.enqueue('client-1', 'session-b', 'second')

    batcher.flush('client-1')
    fake.error()
    fake.drain()

    expect(fake.write).toHaveBeenCalledTimes(1)
  })

  it('cleans up unused backpressure listeners after drain', () => {
    const fake = createFakeSocket([false, true])
    const batcher = new DaemonStreamDataBatcher(() => ({ streamSocket: fake.socket }))

    batcher.enqueue('client-1', 'session-a', 'first')
    batcher.enqueue('client-1', 'session-b', 'second')

    batcher.flush('client-1')
    fake.drain()

    expect(fake.removeListener).toHaveBeenCalledWith('close', expect.any(Function))
    expect(fake.removeListener).toHaveBeenCalledWith('error', expect.any(Function))
    fake.close()

    expect(fake.write).toHaveBeenCalledTimes(2)
  })

  it('drops queued output when the backpressured stream closes before drain', () => {
    const fake = createFakeSocket([false, true])
    const batcher = new DaemonStreamDataBatcher(() => ({ streamSocket: fake.socket }))

    batcher.enqueue('client-1', 'session-a', 'first')
    batcher.enqueue('client-1', 'session-b', 'second')

    batcher.flush('client-1')
    fake.close()
    fake.drain()

    expect(fake.write).toHaveBeenCalledTimes(1)
  })

  it('does not keep queued output forever when drain never arrives', () => {
    vi.useFakeTimers()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const fake = createFakeSocket([false, true])
      const onStreamFailure = vi.fn()
      const batcher = new DaemonStreamDataBatcher(() => ({ streamSocket: fake.socket }), {
        onStreamFailure
      })

      batcher.enqueue('client-1', 'session-a', 'first')
      batcher.enqueue('client-1', 'session-b', 'second')
      batcher.flush('client-1')

      vi.advanceTimersByTime(30_000)
      fake.drain()

      expect(fake.write).toHaveBeenCalledTimes(1)
      expect(warn).toHaveBeenCalledWith(
        '[daemon] PTY stream socket drain timed out',
        expect.objectContaining({ clientId: 'client-1' })
      )
      expect(onStreamFailure).toHaveBeenCalledWith('client-1')
    } finally {
      warn.mockRestore()
      vi.useRealTimers()
    }
  })

  it('orders exit behind queued data while waiting for drain', () => {
    const fake = createFakeSocket([false, true, true])
    const batcher = new DaemonStreamDataBatcher(() => ({ streamSocket: fake.socket }))

    batcher.enqueue('client-1', 'session-a', 'first')
    batcher.flush('client-1')
    batcher.enqueue('client-1', 'session-b', 'second')
    batcher.enqueueExit('client-1', 'session-a', 0)

    expect(fake.write).toHaveBeenCalledTimes(1)
    fake.drain()

    expect(fake.write).toHaveBeenCalledTimes(3)
    expect(fake.write.mock.calls[1]?.[0]).toContain('"data"')
    expect(fake.write.mock.calls[1]?.[0]).toContain('second')
    expect(fake.write.mock.calls[2]?.[0]).toContain('"exit"')
  })

  it('waits for socket drain before continuing after stream backpressure', () => {
    const fake = createFakeSocket([false, true])
    const batcher = new DaemonStreamDataBatcher(() => ({ streamSocket: fake.socket }))

    batcher.enqueue('client-1', 'session-a', 'first')
    batcher.enqueue('client-1', 'session-b', 'second')

    batcher.flush('client-1')
    expect(fake.write).toHaveBeenCalledTimes(1)
    expect(fake.write.mock.calls[0]?.[0]).toContain('first')

    fake.drain()

    expect(fake.write).toHaveBeenCalledTimes(2)
    expect(fake.write.mock.calls[1]?.[0]).toContain('second')
  })

  it('queues additional output while waiting for drain', () => {
    const fake = createFakeSocket([false, true])
    const batcher = new DaemonStreamDataBatcher(() => ({ streamSocket: fake.socket }))

    batcher.enqueue('client-1', 'session-a', 'first')
    batcher.flush('client-1')

    batcher.enqueue('client-1', 'session-b', 'second')
    batcher.flush('client-1')
    expect(fake.write).toHaveBeenCalledTimes(1)

    fake.drain()

    expect(fake.write).toHaveBeenCalledTimes(2)
    expect(fake.write.mock.calls[1]?.[0]).toContain('second')
  })

  it('ignores stale drain callbacks after clearing an old client stream', () => {
    const oldStream = createFakeSocket([false, true])
    const newStream = createFakeSocket([true])
    let streamSocket = oldStream.socket
    const batcher = new DaemonStreamDataBatcher(() => ({ streamSocket }))

    batcher.enqueue('client-1', 'session-a', 'first')
    batcher.enqueue('client-1', 'session-b', 'second')
    batcher.flush('client-1')

    batcher.clear('client-1')
    streamSocket = newStream.socket
    batcher.enqueue('client-1', 'session-c', 'third')
    batcher.flush('client-1')
    oldStream.staleDrain()

    expect(oldStream.write).toHaveBeenCalledTimes(1)
    expect(newStream.write).toHaveBeenCalledTimes(1)
    expect(newStream.write.mock.calls[0]?.[0]).toContain('third')
  })

  it('ignores stale close and error callbacks after clearing an old client stream', () => {
    const oldStream = createFakeSocket([false, true])
    const newStream = createFakeSocket([true])
    let streamSocket = oldStream.socket
    const batcher = new DaemonStreamDataBatcher(() => ({ streamSocket }))

    batcher.enqueue('client-1', 'session-a', 'first')
    batcher.enqueue('client-1', 'session-b', 'second')
    batcher.flush('client-1')

    batcher.clear('client-1')
    streamSocket = newStream.socket
    batcher.enqueue('client-1', 'session-c', 'third')
    batcher.flush('client-1')
    oldStream.staleClose()
    oldStream.staleError()

    expect(oldStream.write).toHaveBeenCalledTimes(1)
    expect(newStream.write).toHaveBeenCalledTimes(1)
    expect(newStream.write.mock.calls[0]?.[0]).toContain('third')
  })

  it('fails the stream when queued output exceeds the hard cap', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const fake = createFakeSocket([true])
      const onStreamFailure = vi.fn()
      const batcher = new DaemonStreamDataBatcher(() => ({ streamSocket: fake.socket }), {
        onStreamFailure
      })

      batcher.enqueue('client-1', 'session-a', 'x'.repeat(8 * 1024 * 1024 + 1))

      expect(fake.write).not.toHaveBeenCalled()
      expect(onStreamFailure).toHaveBeenCalledWith('client-1')
      expect(warn).toHaveBeenCalledWith(
        '[daemon] PTY stream socket queue exceeded limit',
        expect.objectContaining({ clientId: 'client-1' })
      )
    } finally {
      warn.mockRestore()
    }
  })

  it('fails the stream when queued output cumulatively exceeds the hard cap while backpressured', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const fake = createFakeSocket([false])
      const onStreamFailure = vi.fn()
      const batcher = new DaemonStreamDataBatcher(() => ({ streamSocket: fake.socket }), {
        onStreamFailure
      })

      batcher.enqueue('client-1', 'session-a', 'first')
      batcher.flush('client-1')
      batcher.enqueue('client-1', 'session-a', 'x'.repeat(8 * 1024 * 1024 + 1))

      expect(fake.write).toHaveBeenCalledTimes(1)
      expect(onStreamFailure).toHaveBeenCalledWith('client-1')
      expect(warn).toHaveBeenCalledWith(
        '[daemon] PTY stream socket queue exceeded limit',
        expect.objectContaining({ clientId: 'client-1' })
      )
    } finally {
      warn.mockRestore()
    }
  })

  it('splits very large output into bounded stream frames', () => {
    const fake = createFakeSocket([true, true])
    const batcher = new DaemonStreamDataBatcher(() => ({ streamSocket: fake.socket }))

    batcher.enqueue('client-1', 'session-a', 'x'.repeat(65 * 1024))
    batcher.flush('client-1')

    expect(fake.write).toHaveBeenCalledTimes(2)
  })

  it('yields between large queued flushes', () => {
    vi.useFakeTimers()
    try {
      const fake = createFakeSocket(Array.from({ length: 1025 }, () => true))
      const batcher = new DaemonStreamDataBatcher(() => ({ streamSocket: fake.socket }))

      for (let i = 0; i < 1025; i++) {
        batcher.enqueue('client-1', `session-${i}`, `${i}`)
      }
      batcher.flush('client-1')

      expect(fake.write).toHaveBeenCalledTimes(1024)
      vi.advanceTimersByTime(0)
      expect(fake.write).toHaveBeenCalledTimes(1025)
    } finally {
      vi.useRealTimers()
    }
  })
})
