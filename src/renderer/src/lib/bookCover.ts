const COVER_COLORS = [
  'oklch(0.55 0.11 45)',
  'oklch(0.42 0.07 155)',
  'oklch(0.28 0.02 55)',
  'oklch(0.38 0.06 250)',
  'oklch(0.58 0.12 25)',
  'oklch(0.52 0.07 95)'
]

/** Color determinista para la portada tipografica de libros sin caratula real. */
export function coverColorFor(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0
  return COVER_COLORS[Math.abs(hash) % COVER_COLORS.length]
}
