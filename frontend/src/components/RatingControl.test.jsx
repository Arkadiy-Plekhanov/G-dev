import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RatingControl from '../components/RatingControl'

describe('RatingControl', () => {
  it('has nothing selected when value is null (no implicit default)', () => {
    render(<RatingControl value={null} onChange={() => {}} />)
    const buttons = screen.getAllByRole('radio')
    expect(buttons.every((b) => b.getAttribute('aria-checked') === 'false')).toBe(true)
  })

  it('renders 0 as a visually distinct control from 1-4, not the first of five equal dots', () => {
    render(<RatingControl value={null} onChange={() => {}} />)
    const zero = screen.getByLabelText(/Went the other way/)
    expect(zero.className).toContain('rating-zero')
    const one = screen.getByLabelText(/^Spark/)
    expect(one.className).toContain('rating-dot')
    expect(one.className).not.toContain('rating-zero')
  })

  it('calls onChange with 0 when the zero control is clicked', async () => {
    const onChange = vi.fn()
    render(<RatingControl value={null} onChange={onChange} />)
    await userEvent.click(screen.getByLabelText(/Went the other way/))
    expect(onChange).toHaveBeenCalledWith(0)
  })

  it('calls onChange with the right level for 1-4', async () => {
    const onChange = vi.fn()
    render(<RatingControl value={null} onChange={onChange} />)
    await userEvent.click(screen.getByLabelText(/^Flame/))
    expect(onChange).toHaveBeenCalledWith(3)
  })

  it('marks the selected value and only that one', () => {
    render(<RatingControl value={2} onChange={() => {}} />)
    expect(screen.getByLabelText(/^Kindling/).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByLabelText(/^Spark/).getAttribute('aria-checked')).toBe('false')
    expect(screen.getByLabelText(/^Flame/).getAttribute('aria-checked')).toBe('false')
    expect(screen.getByLabelText(/Went the other way/).getAttribute('aria-checked')).toBe('false')
  })
})
