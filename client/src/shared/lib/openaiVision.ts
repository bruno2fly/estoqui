/**
 * AI extraction — now via ESTOQUI'S OWN server (app.estoqui.com/api/ai/extract).
 *
 * Customers no longer bring an OpenAI key: the server runs OUR key with a
 * provider-swappable engine (Gemini flash-class by default, OpenAI fallback),
 * gated by the Enterprise entitlement and a monthly page quota.
 *
 * The exported function signatures are unchanged (the old `apiKey` argument is
 * accepted and IGNORED) so every existing caller keeps compiling; the key
 * requirement is simply gone.
 */

import { supabase } from '@/lib/supabase'

const AI_BASE =
  (import.meta.env.VITE_API_BASE as string | undefined) ?? 'https://app.estoqui.com'

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function fileToText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsText(file, 'UTF-8')
  })
}

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']

function isImageFile(file: File): boolean {
  return IMAGE_TYPES.includes(file.type) || /\.(png|jpe?g|webp|gif)$/i.test(file.name)
}

function isPdfFile(file: File): boolean {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
}

export interface AiExtractPayload {
  system?: string
  user?: string
  images?: string[] // data URLs
  pdf?: { filename?: string; dataUrl: string } | null
  text?: string
  maxTokens?: number
}

/** Core transport: POST to our server with the user's session token. */
export async function aiExtract(
  payload: AiExtractPayload,
): Promise<{ content: string } | { error: string }> {
  let token = ''
  try {
    const { data } = await supabase.auth.getSession()
    token = data.session?.access_token ?? ''
  } catch {
    /* fall through — server will 401 */
  }
  if (!token) return { error: 'Not signed in. Sign in again and retry.' }

  let response: Response
  try {
    response = await fetch(`${AI_BASE}/api/ai/extract`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    })
  } catch (e) {
    return { error: `Network error: ${e instanceof Error ? e.message : 'request failed'}` }
  }

  const json = await response.json().catch(() => ({}))
  if (!response.ok) {
    return { error: (json as { error?: string }).error ?? `Server error (${response.status})` }
  }
  const content = (json as { content?: string }).content ?? ''
  if (!content) return { error: 'Empty AI response' }
  return { content }
}

/**
 * Vision extraction from an image file. (`_apiKey` is ignored — kept only so
 * existing call sites compile unchanged.)
 */
export async function callOpenAIVision(
  file: File,
  _apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens?: number
): Promise<{ content: string } | { error: string }> {
  const base64 = await fileToBase64(file)
  return aiExtract({ system: systemPrompt, user: userPrompt, images: [base64], maxTokens })
}

/**
 * Document extraction: image, PDF or text file. (`_apiKey` ignored.)
 */
export async function callOpenAIDocument(
  file: File,
  _apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens?: number
): Promise<{ content: string } | { error: string }> {
  if (isImageFile(file)) {
    return callOpenAIVision(file, _apiKey, systemPrompt, userPrompt, maxTokens)
  }

  if (isPdfFile(file)) {
    const base64 = await fileToBase64(file)
    return aiExtract({
      system: systemPrompt,
      user: userPrompt,
      pdf: { filename: file.name, dataUrl: base64 },
      maxTokens,
    })
  }

  // TEXT-FIRST (cost design): plain text never touches vision pricing.
  const text = await fileToText(file)
  if (!text.trim()) {
    return { error: 'File is empty or could not be read.' }
  }
  const truncated = text.length > 50000 ? text.slice(0, 50000) + '\n\n[... truncated ...]' : text
  return aiExtract({
    system: systemPrompt,
    user: `${userPrompt}\n\nHere is the file content (filename: ${file.name}):\n\n${truncated}`,
    maxTokens,
  })
}

/**
 * Parse a JSON array from an AI response string (strips markdown fences).
 */
export function parseJsonArray(raw: string): unknown[] | { error: string } {
  const cleaned = raw.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '').trim()
  try {
    const parsed = JSON.parse(cleaned)
    if (!Array.isArray(parsed)) return { error: 'Response is not a JSON array.' }
    return parsed
  } catch {
    return { error: `Could not parse AI response as JSON. Response: "${raw.slice(0, 200)}"` }
  }
}
