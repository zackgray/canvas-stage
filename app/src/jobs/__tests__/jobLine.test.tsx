// @vitest-environment jsdom
// F4 (QA run 5): a paid job that finished with nothing to download says so in plain words with what it cost, and "Check for
// the pictures again" calls the free recover route by id (never a new submit); other lines show as they are. The app root's
// error boundary shows a reason and Reload instead of a blank page; a failed new scene carries the server's reason.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { JobLine, readJobFailure } from '../JobLine'
import { AppErrorBoundary } from '../../AppErrorBoundary'
import { problemLine } from '../../studio/home/Home'

afterEach(cleanup)

const EMPTY = 'job 00000000-0000-4000-8000-000000000011 succeeded but its download failed (node s0: no output, node s1: no output); recover by id, do not resubmit (billed 5 cr)'

describe('a paid job line', () => {
  it('reads the raw line: the job, nothing returned, the billed credits', () => {
    expect(readJobFailure(EMPTY)).toEqual({ jobId: '00000000-0000-4000-8000-000000000011', empty: true, credits: 5 })
    expect(readJobFailure('Day budget reached')).toBeNull()
  })
  it('the runner empty-output sentence shows as it is: plain, no job id, no Check button (a retry is the same press)', () => {
    const line = 'The drawing came back empty. Nothing was saved. Try again.'
    expect(readJobFailure(line)).toBeNull()
    render(<JobLine line={line} testId="err" />)
    expect(screen.getByTestId('err').textContent).toBe(line)
    expect(screen.queryByTestId('err-recover')).toBeNull()
  })
  it('says it plainly and checks again through the free recover route', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ error: 'job x succeeded but the download failed (node s0: no output); try Recover again' }), { status: 502 }))
    render(<JobLine line={EMPTY} testId="err" fetcher={f} />)
    const line = screen.getByTestId('err')
    expect(line.textContent).toContain('The cloud finished but returned no pictures. Nothing was saved; you were billed 5 cr.')
    expect(line.textContent).not.toMatch(/00000000-0000-4000-8000-000000000011|recover by id|node s0/)
    fireEvent.click(screen.getByTestId('err-recover'))
    await waitFor(() => expect(screen.getByTestId('err-recovered').textContent).toBe('Still no pictures on the cloud for this job. Nothing more was billed.'))
    expect(f).toHaveBeenCalledWith('/__lab/jobs/recover', expect.objectContaining({ method: 'POST', body: JSON.stringify({ jobId: '00000000-0000-4000-8000-000000000011' }) }))
  })
  it('a recovered job says so and lets the screen re-read', async () => {
    const onRecovered = vi.fn()
    render(<JobLine line={EMPTY} testId="err" fetcher={async () => new Response('{}', { status: 200 })} onRecovered={onRecovered} />)
    fireEvent.click(screen.getByTestId('err-recover'))
    await waitFor(() => expect(onRecovered).toHaveBeenCalled())
    expect(screen.getByTestId('err-recovered').textContent).toMatch(/^Found them/)
  })
  it('any other line shows as it is', () => {
    render(<JobLine line="Day budget reached." testId="err" />)
    expect(screen.getByTestId('err').textContent).toBe('Day budget reached.')
    expect(screen.queryByTestId('err-recover')).toBeNull()
  })
})

describe('the app root and the new-scene line', () => {
  it('a render error shows its first line and Reload, not a blank page', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const Boom = () => { throw new Error('kit piece "oven" is unknown\n  at build') }
    render(<AppErrorBoundary><Boom /></AppErrorBoundary>)
    expect(screen.getByTestId('app-crash').textContent).toContain('Something went wrong. Reload the page.')
    expect(screen.getByTestId('app-crash-reason').textContent).toBe('kit piece "oven" is unknown')
    expect(screen.getByTestId('app-crash-reload')).toBeTruthy()
  })
  it('a scene that could not be made says why', () => {
    expect(problemLine('A new scene could not be made.', 'The library folder is read-only')).toBe('A new scene could not be made: The library folder is read-only')
    expect(problemLine('A new scene could not be made.', null)).toBe('A new scene could not be made.')
    expect(problemLine(null, 'x')).toBe('x')
  })
})
