export interface SimilarityReference {
  id: string
  text: string
  complete: boolean
}

export interface SimilarityAssessment {
  highlySimilar: boolean
  score: number
  reason: 'exact' | 'body-overlap' | 'opening-and-body' | 'none'
  matchedHistoryId?: string
}

const normalize = (text: string) => text.toLocaleLowerCase().replace(/[\s\p{P}\p{S}]/gu, '')

const ngrams = (text: string, size: number) => {
  const characters = Array.from(text)
  const result = new Set<string>()
  for (let index = 0; index <= characters.length - size; index += 1)
    result.add(characters.slice(index, index + size).join(''))
  return result
}

const diceSimilarity = (left: string, right: string) => {
  const size = Math.min(3, Math.max(1, Math.min(Array.from(left).length, Array.from(right).length)))
  const leftNgrams = ngrams(left, size)
  const rightNgrams = ngrams(right, size)
  if (!leftNgrams.size || !rightNgrams.size) return 0
  let overlap = 0
  for (const gram of leftNgrams) if (rightNgrams.has(gram)) overlap += 1
  return (2 * overlap) / (leftNgrams.size + rightNgrams.size)
}

const getOpening = (text: string) => {
  const first = text.split(/[。！？.!?\n]/u, 1)[0]?.trim() ?? ''
  return normalize(first).slice(0, 60)
}

export function assessSimilarity(
  candidate: string,
  references: SimilarityReference[],
): SimilarityAssessment {
  const normalizedCandidate = normalize(candidate)
  if (!normalizedCandidate || !references.length)
    return { highlySimilar: false, score: 0, reason: 'none' }

  let bestScore = 0
  let bestMatchHistoryId: string | undefined
  let similarScore = -1
  let similarMatch: Pick<SimilarityAssessment, 'reason' | 'matchedHistoryId'> | undefined
  for (const reference of references) {
    if (!reference.complete) continue
    const normalizedReference = normalize(reference.text)
    if (!normalizedReference) continue
    if (normalizedCandidate === normalizedReference) {
      return {
        highlySimilar: true,
        score: 1,
        reason: 'exact',
        matchedHistoryId: reference.id,
      }
    }

    // Short scripts and parameter-heavy copy are deliberately judged conservatively.
    if (normalizedCandidate.length < 80 || normalizedReference.length < 80) continue
    const bodyScore = diceSimilarity(normalizedCandidate, normalizedReference)
    const openingScore = diceSimilarity(getOpening(candidate), getOpening(reference.text))
    const highlySimilar = bodyScore >= 0.78 || (openingScore >= 0.82 && bodyScore >= 0.58)
    if (bodyScore > bestScore) {
      bestScore = bodyScore
      bestMatchHistoryId = reference.id
    }
    if (highlySimilar && bodyScore > similarScore) {
      similarScore = bodyScore
      similarMatch = {
        reason: openingScore >= 0.82 ? 'opening-and-body' : 'body-overlap',
        matchedHistoryId: reference.id,
      }
    }
  }
  return {
    highlySimilar: !!similarMatch,
    score: bestScore,
    reason: similarMatch?.reason ?? 'none',
    matchedHistoryId: similarMatch?.matchedHistoryId ?? bestMatchHistoryId,
  }
}
