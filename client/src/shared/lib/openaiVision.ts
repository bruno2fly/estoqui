/**
 * Shared helpers for calling OpenAI GPT-4o (vision + text).
 */

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

async function callOpenAIRaw(
  apiKey: string,
  messages: unknown[],
  maxTokens = 4096
): Promise<{ content: string } | { error: string }> {
  const body = {
    model: 'gpt-4o',
    messages,
    max_tokens: maxTokens,
    temperature: 0,
  }

  let response: Response
  try {
    response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey.trim()}`,
      },
      body: JSON.stringify(body),
    })
  } catch (e) {
    return { error: `Network error: ${e instanceof Error ? e.message : 'Failed to reach OpenAI'}` }
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    if (response.status === 401) {
      return { error: 'Invalid OpenAI API key. Check your key in Settings.' }
    }
    return { error: `OpenAI API error (${response.status}): ${text.slice(0, 200)}` }
  }

  const json = await response.json()
  const content: string = json?.choices?.[0]?.message?.content ?? ''
  return { content }
}

/**
 * Call OpenAI GPT-4o with an image file (vision).
 */
export async function callOpenAIVision(
  file: File,
  apiKey: string,
  systemPrompt: string,
  userPrompt: string
): Promise<{ content: string } | { error: string }> {
  if (!apiKey.trim()) {
    return { error: 'OpenAI API key is required. Add it in Settings.' }
  }

  const base64 = await fileToBase64(file)

  const messages = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: [
        { type: 'text', text: userPrompt },
        { type: 'image_url', image_url: { url: base64, detail: 'high' } },
      ],
    },
  ]

  return callOpenAIRaw(apiKey, messages)
}

/**
 * Call OpenAI GPT-4o with a text document (CSV, TSV, TXT, etc.) or image.
 * Automatically detects file type and sends text content or base64 image.
 */
export async function callOpenAIDocument(
  file: File,
  apiKey: string,
  systemPrompt: string,
  userPrompt: string
): Promise<{ content: string } | { error: string }> {
  if (!apiKey.trim()) {
    return { error: 'OpenAI API key is required. Add it in Settings.' }
  }

  if (isImageFile(file)) {
    return callOpenAIVision(file, apiKey, systemPrompt, userPrompt)
  }

  // Text-based file: read as text and send inline
  const text = await fileToText(file)
  if (!text.trim()) {
    return { error: 'File is empty or could not be read.' }
  }

  // Truncate very large files to ~50k chars to stay within token limits
  const truncated = text.length > 50000 ? text.slice(0, 50000) + '\n\n[... truncated ...]' : text

  const messages = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: `${userPrompt}\n\nHere is the file content (filename: ${file.name}):\n\n${truncated}`,
    },
  ]

  return callOpenAIRaw(apiKey, messages)
}

/**
 * Parse a JSON array from an OpenAI response string (strips markdown fences).
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
