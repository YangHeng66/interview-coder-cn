type JobProfile = { company: string; role: string; jobDescription: string }

/** Job profile plus excerpts of the candidate's key documents, kept within `limit` characters */
export function formatInterviewBrief(
  profile: JobProfile,
  documents: { name: string; text: string }[],
  limit: number
): string {
  const header = [
    profile.company && `公司：${profile.company}`,
    profile.role && `岗位：${profile.role}`,
    profile.jobDescription && `岗位描述：\n${profile.jobDescription}`
  ]
    .filter(Boolean)
    .join('\n')
    .slice(0, limit)
  if (!documents.length) return header

  const sectionsTitle = '\n\n## 候选人资料节选\n'
  const headings = documents.map((document) => `\n### ${document.name}\n`)
  const overhead = header.length + sectionsTitle.length + headings.join('').length
  const perDocument = Math.max(0, Math.floor((limit - overhead) / documents.length))
  if (perDocument === 0) return header
  return (
    header +
    sectionsTitle +
    documents
      .map((document, index) => headings[index] + document.text.slice(0, perDocument))
      .join('')
  )
}
