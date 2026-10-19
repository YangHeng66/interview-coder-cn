export type VolcengineUtterance = { text: string; definite: boolean }

export function parseVolcengineUtterances(value: unknown): VolcengineUtterance[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const { text, definite } = item as Record<string, unknown>
    return typeof text === 'string' ? [{ text, definite: definite === true }] : []
  })
}

/**
 * Volcengine resends every utterance of the session in each result. Counting
 * the finished ones makes each utterance finish exactly once, and keeps the
 * partial down to what is still being spoken instead of the whole session.
 */
export class VolcengineUtteranceTracker {
  private finishedCount = 0

  update(
    utterances: VolcengineUtterance[],
    isFinal: boolean
  ): { finished: string[]; partial: string } {
    const finished: string[] = []
    while (
      this.finishedCount < utterances.length &&
      (isFinal || utterances[this.finishedCount].definite)
    ) {
      finished.push(utterances[this.finishedCount].text)
      this.finishedCount++
    }
    return {
      finished,
      partial: utterances
        .slice(this.finishedCount)
        .map((utterance) => utterance.text)
        .join('')
    }
  }
}
