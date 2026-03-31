// server/api/generate-alt.post.ts
import Anthropic from '@anthropic-ai/sdk'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { fileId, filename, directusToken, directusBaseUrl } = body

  if (!fileId || !directusToken || !directusBaseUrl) {
    throw createError({ statusCode: 400, statusMessage: 'Missing required fields' })
  }

  const config = useRuntimeConfig()
  const client = new Anthropic({ apiKey: config.anthropicApiKey })

  // Clean asset URL – Authorization header only, no token in query string
  const assetUrl = `${directusBaseUrl}/assets/${fileId}`
  console.log('[generate-alt] Fetching:', assetUrl)

  const imageRes = await fetch(assetUrl, {
    headers: { Authorization: `Bearer ${directusToken}` },
  })

  if (!imageRes.ok) {
    const errText = await imageRes.text().catch(() => '')
    console.error('[generate-alt] Failed:', imageRes.status, errText.slice(0, 300))
    throw createError({
      statusCode: 502,
      statusMessage: `Directus returned ${imageRes.status}: ${errText.slice(0, 150)}`,
    })
  }

  const contentType = imageRes.headers.get('content-type') || 'image/jpeg'
  const arrayBuffer = await imageRes.arrayBuffer()
  const base64 = Buffer.from(arrayBuffer).toString('base64')
  console.log('[generate-alt] Image ok, bytes:', arrayBuffer.byteLength, 'type:', contentType)

  const baseType = contentType.split(';')[0].trim()
  const supported = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
  const mediaType = (supported.includes(baseType) ? baseType : 'image/jpeg') as
    'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'

  const message = await client.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 200,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType,
              data: base64,
            },
          },
          {
            type: 'text',
            text: `Du bist ein Barrierefreiheits-Experte. Generiere einen präzisen, barrierefreien Alt-Text für dieses Bild auf Deutsch.

Regeln:
- Beschreibe das Wesentliche des Bildinhalts klar und knapp
- Maximal 125 Zeichen
- Kein "Bild von" oder "Foto von" am Anfang
- Funktional und beschreibend (was sieht man, was passiert, welche Information transportiert das Bild?)
- Kein Satzzeichen am Ende
- Dateiname zur Kontext-Hilfe: "${filename}"

Antworte NUR mit dem Alt-Text, ohne Anführungszeichen, ohne Erklärungen.`,
          },
        ],
      },
    ],
  })

  const altText = (message.content[0] as { type: string; text: string }).text.trim()

  return { altText }
})