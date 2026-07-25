import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import ePub, {
  type Contents,
  type Location as EpubLocation,
  type NavItem,
  type Rendition
} from 'epubjs'
import {
  GlobalWorkerOptions,
  getDocument,
  TextLayer,
  type PDFDocumentProxy,
  type PDFPageProxy,
  type RenderTask
} from 'pdfjs-dist'
import pdfWorkerSrc from 'pdfjs-dist/build/pdf.worker.mjs?url'
import 'pdfjs-dist/web/pdf_viewer.css'
import type {
  AnnotationEntry,
  Bookmark,
  BookWithProgress,
  PdfHighlightLocation
} from '@shared/types'
import { useReadingSession } from '@renderer/hooks/useReadingSession'
import { useTts } from '@renderer/hooks/useTts'

GlobalWorkerOptions.workerSrc = pdfWorkerSrc

interface CropBox {
  top: number
  bottom: number
  left: number
  right: number
}

const DETECTION_SCALE = 0.4
const INK_THRESHOLD = 246
const CROP_PADDING_RATIO = 0.015
const NO_CROP: CropBox = { top: 0, bottom: 1, left: 0, right: 1 }
const HIGHLIGHT_COLORS = ['#facc15', '#4ade80', '#60a5fa', '#f472b6']
const SEARCH_MIN_LENGTH = 2
const SEARCH_RESULT_LIMIT = 200
const SEARCH_EXCERPT_RADIUS = 60

interface SearchHit {
  id: string
  excerpt: string
  /** CFI para EPUB, numero de pagina (string) para PDF */
  target: string
}

interface EpubSearchMatch {
  cfi: string
  excerpt: string
}

/** Section de epubjs: los tipos oficiales no incluyen `search`/`spineItems`, epubjs 0.3.93 si los tiene en runtime. */
interface EpubSearchableSection {
  href?: string
  load(request: (url: string) => Promise<unknown>): Promise<unknown>
  unload(): void
  search?(query: string): EpubSearchMatch[]
  find(query: string): EpubSearchMatch[]
}

async function searchEpub(
  rendition: Rendition,
  query: string,
  token: number,
  tokenRef: { current: number },
  onUpdate: (hits: SearchHit[]) => void
): Promise<void> {
  const book = rendition.book as unknown as {
    load: (url: string) => Promise<unknown>
    spine: { spineItems: EpubSearchableSection[] }
  }
  const results: SearchHit[] = []
  for (const section of book.spine.spineItems) {
    if (tokenRef.current !== token) return
    try {
      await section.load(book.load.bind(book))
      const matches = section.search ? section.search(query) : section.find(query)
      section.unload()
      for (const match of matches) {
        results.push({
          id: match.cfi,
          excerpt: match.excerpt.replace(/\s+/g, ' ').trim(),
          target: match.cfi
        })
        if (results.length >= SEARCH_RESULT_LIMIT) break
      }
    } catch {
      // seccion no cargable (recurso externo, etc.), continuar con la siguiente
    }
    onUpdate([...results])
    if (results.length >= SEARCH_RESULT_LIMIT) return
  }
}

async function searchPdf(
  doc: PDFDocumentProxy,
  query: string,
  token: number,
  tokenRef: { current: number },
  onUpdate: (hits: SearchHit[]) => void
): Promise<void> {
  const needle = query.toLowerCase()
  const results: SearchHit[] = []
  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    if (tokenRef.current !== token) return
    const page = await doc.getPage(pageNum)
    const content = await page.getTextContent()
    const text = content.items.map((item) => ('str' in item ? item.str : '')).join(' ')
    const lower = text.toLowerCase()

    let idx = lower.indexOf(needle)
    while (idx !== -1 && results.length < SEARCH_RESULT_LIMIT) {
      const start = Math.max(0, idx - SEARCH_EXCERPT_RADIUS)
      const end = Math.min(text.length, idx + needle.length + SEARCH_EXCERPT_RADIUS)
      const excerpt = `${start > 0 ? '…' : ''}${text.slice(start, end).trim()}${
        end < text.length ? '…' : ''
      }`
      results.push({ id: `${pageNum}-${idx}`, excerpt, target: String(pageNum) })
      idx = lower.indexOf(needle, idx + needle.length)
    }
    onUpdate([...results])
    if (results.length >= SEARCH_RESULT_LIMIT) return
  }
}

function TocList({
  items,
  onNavigate
}: {
  items: NavItem[]
  onNavigate: (href: string) => void
}): React.JSX.Element {
  return (
    <ul className="flex flex-col gap-0.5 pl-2 first:pl-0">
      {items.map((item) => (
        <li key={item.id}>
          <button
            onClick={() => onNavigate(item.href)}
            title={item.label.trim()}
            className="w-full truncate rounded-md px-2 py-1 text-left text-sm hover:bg-[var(--color-bg-mute)]"
          >
            {item.label.trim()}
          </button>
          {item.subitems && item.subitems.length > 0 && (
            <TocList items={item.subitems} onNavigate={onNavigate} />
          )}
        </li>
      ))}
    </ul>
  )
}

function parsePdfLocation(location: string): PdfHighlightLocation | null {
  try {
    const parsed = JSON.parse(location) as PdfHighlightLocation
    if (typeof parsed.page === 'number' && Array.isArray(parsed.rects)) return parsed
    return null
  } catch {
    return null
  }
}

/** Escanea la pagina a baja resolucion para recortar los margenes en blanco del PDF. */
async function detectCropBox(pdfPage: PDFPageProxy): Promise<CropBox> {
  const viewport = pdfPage.getViewport({ scale: DETECTION_SCALE })
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.ceil(viewport.width))
  canvas.height = Math.max(1, Math.ceil(viewport.height))
  const ctx = canvas.getContext('2d')
  if (!ctx) return NO_CROP

  await pdfPage.render({ canvas, canvasContext: ctx, viewport }).promise
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height)

  const rowHasInk = (y: number): boolean => {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      if (data[i] < INK_THRESHOLD || data[i + 1] < INK_THRESHOLD || data[i + 2] < INK_THRESHOLD) {
        return true
      }
    }
    return false
  }
  const colHasInk = (x: number, yStart: number, yEnd: number): boolean => {
    for (let y = yStart; y <= yEnd; y++) {
      const i = (y * width + x) * 4
      if (data[i] < INK_THRESHOLD || data[i + 1] < INK_THRESHOLD || data[i + 2] < INK_THRESHOLD) {
        return true
      }
    }
    return false
  }

  let top = 0
  while (top < height && !rowHasInk(top)) top++
  if (top >= height) return NO_CROP

  let bottom = height - 1
  while (bottom > top && !rowHasInk(bottom)) bottom--

  let left = 0
  while (left < width && !colHasInk(left, top, bottom)) left++

  let right = width - 1
  while (right > left && !colHasInk(right, top, bottom)) right--

  const padX = width * CROP_PADDING_RATIO
  const padY = height * CROP_PADDING_RATIO

  return {
    left: Math.max(0, left - padX) / width,
    right: Math.min(width, right + padX) / width,
    top: Math.max(0, top - padY) / height,
    bottom: Math.min(height, bottom + padY) / height
  }
}

export default function ReaderView(): React.JSX.Element {
  const { bookId } = useParams<{ bookId: string }>()
  const [readerTheme, setReaderThemeState] = useState<'light' | 'dark'>('light')
  const isReaderDark = readerTheme === 'dark'
  const rootRef = useRef<HTMLDivElement | null>(null)
  const epubContainerRef = useRef<HTMLDivElement | null>(null)
  const renditionRef = useRef<Rendition | null>(null)

  const pdfContainerRef = useRef<HTMLDivElement | null>(null)
  const pageBoxRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const textLayerRef = useRef<HTMLDivElement | null>(null)
  const textLayerInstanceRef = useRef<TextLayer | null>(null)
  const pdfDocRef = useRef<PDFDocumentProxy | null>(null)
  const renderTaskRef = useRef<RenderTask | null>(null)
  const cropBoxCacheRef = useRef<Map<number, CropBox>>(new Map())

  const [book, setBook] = useState<BookWithProgress | null>(null)
  const [percent, setPercent] = useState(0)
  const [pageNum, setPageNum] = useState(1)
  const [numPages, setNumPages] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [zoomOverride, setZoomOverride] = useState(1)
  const [highlights, setHighlights] = useState<AnnotationEntry[]>([])
  const [pendingSelection, setPendingSelection] = useState<{
    text: string
    location: string
    clientX: number
    clientY: number
  } | null>(null)
  const [pendingColor, setPendingColor] = useState(HIGHLIGHT_COLORS[0])
  const [pendingNote, setPendingNote] = useState('')
  const [selectedHighlight, setSelectedHighlight] = useState<AnnotationEntry | null>(null)
  const [popoverPos, setPopoverPos] = useState<{ x: number; y: number } | null>(null)
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const [sidebarTab, setSidebarTab] = useState<'toc' | 'search' | 'bookmarks' | null>(null)
  const [toc, setToc] = useState<NavItem[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchHit[]>([])
  const [searching, setSearching] = useState(false)
  const searchTokenRef = useRef(0)
  const currentLocationRef = useRef<string | null>(null)
  const { recordLocation } = useReadingSession(bookId)
  const tts = useTts()

  useEffect(() => {
    window.api.getSettings().then((settings) => {
      if (settings.readerTheme === 'dark' || settings.readerTheme === 'light') {
        setReaderThemeState(settings.readerTheme)
      }
    })
  }, [])

  const isPdf = book?.format === 'pdf'
  const displayPercent = isPdf ? (numPages ? Math.round((pageNum / numPages) * 100) : 0) : percent

  const currentPageHighlights = highlights
    .map((entry) => ({ entry, loc: parsePdfLocation(entry.highlight.location) }))
    .filter(
      (x): x is { entry: AnnotationEntry; loc: PdfHighlightLocation } =>
        x.loc !== null && x.loc.page === pageNum
    )

  const renderPdfPage = useCallback(
    async (page: number): Promise<void> => {
      const doc = pdfDocRef.current
      const canvas = canvasRef.current
      const container = pdfContainerRef.current
      if (!doc || !canvas || !container) return

      const pdfPage = await doc.getPage(page)

      let cropBox = cropBoxCacheRef.current.get(page)
      if (!cropBox) {
        cropBox = await detectCropBox(pdfPage)
        cropBoxCacheRef.current.set(page, cropBox)
      }

      const baseViewport = pdfPage.getViewport({ scale: 1 })
      const cropWidthPdfUnits = (cropBox.right - cropBox.left) * baseViewport.width
      const scale = ((container.clientWidth - 32) / cropWidthPdfUnits) * zoomOverride
      const viewport = pdfPage.getViewport({ scale })

      const fullCanvas = document.createElement('canvas')
      fullCanvas.width = Math.ceil(viewport.width)
      fullCanvas.height = Math.ceil(viewport.height)
      const fullContext = fullCanvas.getContext('2d')
      if (!fullContext) return

      renderTaskRef.current?.cancel()
      const task = pdfPage.render({ canvas: fullCanvas, canvasContext: fullContext, viewport })
      renderTaskRef.current = task
      try {
        await task.promise
      } catch (err) {
        const isCancel = err instanceof Error && err.name === 'RenderingCancelledException'
        if (!isCancel) throw err
      }

      const sx = Math.round(cropBox.left * fullCanvas.width)
      const sy = Math.round(cropBox.top * fullCanvas.height)
      const sw = Math.round((cropBox.right - cropBox.left) * fullCanvas.width)
      const sh = Math.round((cropBox.bottom - cropBox.top) * fullCanvas.height)

      canvas.width = sw
      canvas.height = sh
      const context = canvas.getContext('2d')
      if (!context) return
      context.drawImage(fullCanvas, sx, sy, sw, sh, 0, 0, sw, sh)

      textLayerInstanceRef.current?.cancel()
      const textLayerContainer = textLayerRef.current
      if (textLayerContainer) {
        textLayerContainer.replaceChildren()
        textLayerContainer.style.setProperty('--total-scale-factor', String(viewport.scale))
        const textContent = await pdfPage.getTextContent()
        const textLayer = new TextLayer({
          textContentSource: textContent,
          container: textLayerContainer,
          viewport
        })
        textLayerInstanceRef.current = textLayer
        try {
          await textLayer.render()
        } catch {
          // cancelado por un render mas nuevo, ignorar
        }
        textLayerContainer.style.left = `-${sx}px`
        textLayerContainer.style.top = `-${sy}px`
      }
    },
    [zoomOverride]
  )

  useEffect(() => {
    if (!bookId) return
    let cancelled = false

    async function load(): Promise<void> {
      try {
        const meta = await window.api.getBook(bookId!)
        if (cancelled || !meta) return
        setBook(meta)
        setHighlights([])
        setBookmarks([])
        setSidebarTab(null)
        setToc([])
        setSearchQuery('')
        setSearchResults([])
        setSearching(false)
        searchTokenRef.current++
        setPendingSelection(null)
        setSelectedHighlight(null)
        currentLocationRef.current = null

        const fileBytes = await window.api.getBookFile(bookId!)
        if (cancelled) return

        const savedBookmarks = await window.api.listBookmarksForBook(bookId!)
        if (cancelled) return
        setBookmarks(savedBookmarks)

        if (meta.format === 'epub') {
          if (!epubContainerRef.current) return
          const epub = ePub(fileBytes.buffer as ArrayBuffer)
          const rendition = epub.renderTo(epubContainerRef.current, {
            width: '100%',
            height: '100%',
            flow: 'paginated'
          })
          renditionRef.current = rendition

          rendition.themes.register('dark', {
            body: { color: '#f1f1f3 !important', background: '#16161a !important' },
            a: { color: '#60a5fa !important' }
          })
          rendition.themes.select(isReaderDark ? 'dark' : 'default')

          epub.loaded.navigation.then((nav) => {
            if (!cancelled) setToc(nav.toc)
          })

          const progress = await window.api.getProgress(bookId!)
          setPercent(progress?.percentComplete ?? 0)
          currentLocationRef.current = progress?.currentLocation ?? null
          await rendition.display(progress?.currentLocation || undefined)

          rendition.on('relocated', (location: EpubLocation) => {
            const pct = Math.round((location.start.percentage ?? 0) * 100)
            setPercent(pct)
            currentLocationRef.current = location.start.cfi
            recordLocation(location.start.cfi)
            window.api.saveProgress(bookId!, location.start.cfi, pct)
          })

          rendition.on('selected', (cfiRange: string, contents: Contents) => {
            const selection = contents.window.getSelection()
            const text = selection?.toString().trim() ?? ''
            if (!text) return

            const frameEl = contents.window.frameElement as HTMLElement | null
            const frameRect = frameEl?.getBoundingClientRect()
            const selRange = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null
            const selRect = selRange?.getBoundingClientRect()
            const clientX =
              (frameRect?.left ?? 0) + (selRect ? selRect.left + selRect.width / 2 : 0)
            const clientY = (frameRect?.top ?? 0) + (selRect?.bottom ?? 0)

            setSelectedHighlight(null)
            setPendingColor(HIGHLIGHT_COLORS[0])
            setPendingNote('')
            setPendingSelection({ text, location: cfiRange, clientX, clientY })
          })

          const epubAnnotations = await window.api.listAnnotationsForBook(bookId!)
          if (cancelled) return
          setHighlights(epubAnnotations)
          epubAnnotations.forEach((entry) => applyEpubHighlight(entry))
        } else if (meta.format === 'pdf') {
          const doc = await getDocument({ data: fileBytes }).promise
          if (cancelled) return
          pdfDocRef.current = doc
          cropBoxCacheRef.current.clear()
          setZoomOverride(1)
          setNumPages(doc.numPages)

          const progress = await window.api.getProgress(bookId!)
          const startPage = progress?.currentLocation
            ? Math.min(Math.max(parseInt(progress.currentLocation, 10) || 1, 1), doc.numPages)
            : 1
          setPageNum(startPage)
          currentLocationRef.current = String(startPage)

          const annotations = await window.api.listAnnotationsForBook(bookId!)
          if (!cancelled) setHighlights(annotations)
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      }
    }

    load()

    return () => {
      cancelled = true
      renditionRef.current?.destroy()
      renditionRef.current = null
      renderTaskRef.current?.cancel()
      renderTaskRef.current = null
      textLayerInstanceRef.current?.cancel()
      textLayerInstanceRef.current = null
      pdfDocRef.current?.loadingTask.destroy()
      pdfDocRef.current = null
    }
    // `isReaderDark` solo se usa aca para el estado inicial del tema del rendition recien creado; los
    // cambios en vivo los maneja el efecto de abajo. Incluirlo aca recargaria el libro entero.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId])

  useEffect(() => {
    if (!isPdf || !numPages || !bookId) return
    renderPdfPage(pageNum).catch((err) => {
      setError(err instanceof Error ? err.message : String(err))
    })
    const pct = Math.round((pageNum / numPages) * 100)
    currentLocationRef.current = String(pageNum)
    recordLocation(String(pageNum))
    window.api.saveProgress(bookId, String(pageNum), pct)
  }, [isPdf, numPages, pageNum, bookId, renderPdfPage, recordLocation])

  useEffect(() => {
    if (!isPdf) return
    const container = pdfContainerRef.current
    if (!container) return
    const observer = new ResizeObserver(() => {
      renderPdfPage(pageNum).catch(() => {})
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [isPdf, numPages, pageNum, renderPdfPage])

  function handlePageMouseUp(e: React.MouseEvent<HTMLDivElement>): void {
    const box = pageBoxRef.current
    if (!box) return
    const boxRect = box.getBoundingClientRect()
    const selection = window.getSelection()
    const text = selection?.toString().trim() ?? ''

    if (text && selection && selection.rangeCount > 0 && box.contains(selection.anchorNode)) {
      const range = selection.getRangeAt(0)
      const rects = Array.from(range.getClientRects())
        .filter((r) => r.width > 0 && r.height > 0)
        .map((r) => ({
          x: (r.left - boxRect.left) / boxRect.width,
          y: (r.top - boxRect.top) / boxRect.height,
          w: r.width / boxRect.width,
          h: r.height / boxRect.height
        }))
      if (rects.length > 0) {
        const location: PdfHighlightLocation = { page: pageNum, rects }
        setSelectedHighlight(null)
        setPendingColor(HIGHLIGHT_COLORS[0])
        setPendingNote('')
        setPendingSelection({
          text,
          location: JSON.stringify(location),
          clientX: e.clientX,
          clientY: e.clientY
        })
        return
      }
    }

    const clickX = (e.clientX - boxRect.left) / boxRect.width
    const clickY = (e.clientY - boxRect.top) / boxRect.height
    const hit = currentPageHighlights.find(({ loc }) =>
      loc.rects.some(
        (r) => clickX >= r.x && clickX <= r.x + r.w && clickY >= r.y && clickY <= r.y + r.h
      )
    )
    setPendingSelection(null)
    if (hit) {
      setSelectedHighlight(hit.entry)
      setPopoverPos({ x: e.clientX, y: e.clientY })
    } else {
      setSelectedHighlight(null)
    }
  }

  function applyEpubHighlight(entry: AnnotationEntry): void {
    renditionRef.current?.annotations.add(
      'highlight',
      entry.highlight.location,
      {},
      (e: MouseEvent) => {
        setPendingSelection(null)
        setSelectedHighlight(entry)
        setPopoverPos({ x: e.clientX, y: e.clientY })
      },
      'epub-highlight',
      { fill: entry.highlight.color, 'fill-opacity': '0.35' }
    )
  }

  async function saveHighlight(): Promise<void> {
    if (!pendingSelection || !bookId) return
    const result = await window.api.addAnnotation({
      bookId,
      location: pendingSelection.location,
      selectedText: pendingSelection.text,
      color: pendingColor,
      noteText: pendingNote.trim() || null
    })
    const entry: AnnotationEntry = { highlight: result.highlight, note: result.note }
    setHighlights((prev) => [...prev, entry])
    if (isPdf) {
      window.getSelection()?.removeAllRanges()
    } else {
      applyEpubHighlight(entry)
    }
    setPendingSelection(null)
  }

  async function deleteSelectedHighlight(): Promise<void> {
    if (!selectedHighlight) return
    await window.api.deleteAnnotation(selectedHighlight.highlight.id)
    if (!isPdf) {
      renditionRef.current?.annotations.remove(selectedHighlight.highlight.location, 'highlight')
    }
    setHighlights((prev) => prev.filter((h) => h.highlight.id !== selectedHighlight.highlight.id))
    setSelectedHighlight(null)
  }

  async function addCurrentBookmark(): Promise<void> {
    if (!bookId) return
    const location = isPdf ? String(pageNum) : currentLocationRef.current
    if (!location) return

    const label = isPdf ? `Página ${pageNum}` : `${displayPercent}%`
    const bookmark = await window.api.addBookmark({ bookId, location, label })
    setBookmarks((prev) => [...prev, bookmark])
    setSidebarTab('bookmarks')
  }

  function toggleSidebar(tab: 'toc' | 'search' | 'bookmarks'): void {
    setSidebarTab((current) => (current === tab ? null : tab))
  }

  async function runSearch(): Promise<void> {
    const query = searchQuery.trim()
    setSearchResults([])
    if (query.length < SEARCH_MIN_LENGTH) return

    const token = ++searchTokenRef.current
    setSearching(true)
    try {
      if (isPdf && pdfDocRef.current) {
        await searchPdf(pdfDocRef.current, query, token, searchTokenRef, setSearchResults)
      } else if (!isPdf && renditionRef.current) {
        await searchEpub(renditionRef.current, query, token, searchTokenRef, setSearchResults)
      }
    } finally {
      if (searchTokenRef.current === token) setSearching(false)
    }
  }

  function goToSearchHit(hit: SearchHit): void {
    setPendingSelection(null)
    setSelectedHighlight(null)
    if (isPdf) {
      const page = parseInt(hit.target, 10)
      if (Number.isFinite(page)) setPageNum(Math.min(Math.max(page, 1), numPages || page))
    } else {
      currentLocationRef.current = hit.target
      renditionRef.current?.display(hit.target)
    }
  }

  async function removeBookmark(bookmarkId: string): Promise<void> {
    await window.api.deleteBookmark(bookmarkId)
    setBookmarks((prev) => prev.filter((b) => b.id !== bookmarkId))
  }

  function goToBookmark(bookmark: Bookmark): void {
    setPendingSelection(null)
    setSelectedHighlight(null)
    if (isPdf) {
      const page = Math.min(Math.max(parseInt(bookmark.location, 10) || 1, 1), numPages || 1)
      setPageNum(page)
    } else {
      currentLocationRef.current = bookmark.location
      renditionRef.current?.display(bookmark.location)
    }
  }

  function bookmarkLabel(bookmark: Bookmark): string {
    if (bookmark.label) return bookmark.label
    if (isPdf) {
      const page = parseInt(bookmark.location, 10)
      return Number.isFinite(page) ? `Página ${page}` : 'Marcador'
    }
    return 'Marcador'
  }

  function zoomIn(): void {
    setZoomOverride((z) => Math.min(3, Math.round(z * 1.1 * 100) / 100))
  }

  function zoomOut(): void {
    setZoomOverride((z) => Math.max(0.5, Math.round((z / 1.1) * 100) / 100))
  }

  function resetZoom(): void {
    setZoomOverride(1)
  }

  useEffect(() => {
    function onFullscreenChange(): void {
      setIsFullscreen(document.fullscreenElement === rootRef.current)
    }
    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange)
  }, [])

  useEffect(() => {
    if (isPdf) return
    renditionRef.current?.themes.select(isReaderDark ? 'dark' : 'default')
  }, [isReaderDark, isPdf])

  function toggleReaderTheme(): void {
    const next = isReaderDark ? 'light' : 'dark'
    setReaderThemeState(next)
    window.api.setReaderTheme(next)
  }

  function toggleFullscreen(): void {
    if (document.fullscreenElement) {
      document.exitFullscreen()
    } else {
      rootRef.current?.requestFullscreen()
    }
  }

  function goPrev(): void {
    setPendingSelection(null)
    setSelectedHighlight(null)
    if (isPdf) setPageNum((p) => Math.max(1, p - 1))
    else renditionRef.current?.prev()
  }

  function goNext(): void {
    setPendingSelection(null)
    setSelectedHighlight(null)
    if (isPdf) setPageNum((p) => Math.min(numPages, p + 1))
    else renditionRef.current?.next()
  }

  async function getReadableText(): Promise<string> {
    const selectionText =
      pendingSelection?.text?.trim() || window.getSelection()?.toString().trim() || ''
    if (selectionText) return selectionText

    if (isPdf && pdfDocRef.current) {
      const page = await pdfDocRef.current.getPage(pageNum)
      const content = await page.getTextContent()
      return content.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
    }

    const rendition = renditionRef.current
    if (!rendition) return ''
    const contents = rendition.getContents()
    const list = Array.isArray(contents) ? contents : contents ? [contents] : []
    return list
      .map((c) => c.document?.body?.innerText ?? '')
      .join('\n')
      .replace(/\s+/g, ' ')
      .trim()
  }

  async function handleTtsPlay(): Promise<void> {
    if (tts.status === 'paused') {
      tts.resume()
      return
    }
    const text = await getReadableText()
    if (!text) return
    tts.speak(text)
  }

  return (
    <div ref={rootRef} className="flex h-full flex-col bg-[var(--color-bg)]">
      <div className="mb-3 flex items-center justify-between gap-4 p-2">
        <h2 className="truncate text-lg font-semibold">{book?.title ?? 'Cargando...'}</h2>
        {book && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--color-text-soft)]">
              {isPdf
                ? `Pagina ${pageNum} / ${numPages} (${displayPercent}%)`
                : `${displayPercent}%`}
            </span>
            <button
              onClick={goPrev}
              disabled={isPdf && pageNum <= 1}
              className="rounded-md border border-[var(--color-border)] px-3 py-1 text-sm hover:bg-[var(--color-bg-mute)] disabled:opacity-40"
            >
              Anterior
            </button>
            <button
              onClick={goNext}
              disabled={isPdf && pageNum >= numPages}
              className="rounded-md border border-[var(--color-border)] px-3 py-1 text-sm hover:bg-[var(--color-bg-mute)] disabled:opacity-40"
            >
              Siguiente
            </button>
            {isPdf && (
              <div className="flex items-center gap-1">
                <button
                  onClick={zoomOut}
                  disabled={zoomOverride <= 0.5}
                  title="Alejar"
                  className="rounded-md border border-[var(--color-border)] px-2 py-1 text-sm hover:bg-[var(--color-bg-mute)] disabled:opacity-40"
                >
                  −
                </button>
                <button
                  onClick={resetZoom}
                  title="Restablecer a zoom automatico"
                  className="min-w-[7rem] rounded-md border border-[var(--color-border)] px-2 py-1 text-xs hover:bg-[var(--color-bg-mute)]"
                >
                  {Math.abs(zoomOverride - 1) < 0.02
                    ? 'Zoom automatico'
                    : `${Math.round(zoomOverride * 100)}%`}
                </button>
                <button
                  onClick={zoomIn}
                  disabled={zoomOverride >= 3}
                  title="Acercar"
                  className="rounded-md border border-[var(--color-border)] px-2 py-1 text-sm hover:bg-[var(--color-bg-mute)] disabled:opacity-40"
                >
                  +
                </button>
              </div>
            )}
            <button
              onClick={handleTtsPlay}
              disabled={!tts.supported}
              title={
                tts.status === 'paused'
                  ? 'Reanudar lectura en voz alta'
                  : 'Leer en voz alta (página o selección)'
              }
              className={`rounded-md border border-[var(--color-border)] p-1.5 hover:bg-[var(--color-bg-mute)] disabled:opacity-40 ${
                tts.status === 'speaking' ? 'bg-[var(--color-bg-mute)]' : ''
              }`}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                {tts.status === 'paused' ? (
                  <polygon points="5 3 19 12 5 21 5 3" fill="currentColor" stroke="none" />
                ) : (
                  <>
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
                  </>
                )}
              </svg>
            </button>
            {tts.status !== 'idle' && (
              <>
                {tts.status === 'speaking' && (
                  <button
                    onClick={tts.pause}
                    title="Pausar"
                    className="rounded-md border border-[var(--color-border)] px-2 py-1 text-xs hover:bg-[var(--color-bg-mute)]"
                  >
                    Pausar
                  </button>
                )}
                <button
                  onClick={tts.stop}
                  title="Detener"
                  className="rounded-md border border-[var(--color-border)] px-2 py-1 text-xs hover:bg-[var(--color-bg-mute)]"
                >
                  Detener
                </button>
              </>
            )}
            <button
              onClick={tts.cycleRate}
              title="Velocidad de lectura"
              className="rounded-md border border-[var(--color-border)] px-2 py-1 text-xs hover:bg-[var(--color-bg-mute)]"
            >
              {tts.rate}x
            </button>
            <button
              onClick={() => toggleSidebar('toc')}
              title="Índice / páginas"
              className={`rounded-md border border-[var(--color-border)] px-2 py-1 text-xs hover:bg-[var(--color-bg-mute)] ${
                sidebarTab === 'toc' ? 'bg-[var(--color-bg-mute)]' : ''
              }`}
            >
              Índice
            </button>
            <button
              onClick={() => toggleSidebar('search')}
              title="Buscar en el libro"
              className={`rounded-md border border-[var(--color-border)] px-2 py-1 text-xs hover:bg-[var(--color-bg-mute)] ${
                sidebarTab === 'search' ? 'bg-[var(--color-bg-mute)]' : ''
              }`}
            >
              Buscar
            </button>
            <button
              onClick={addCurrentBookmark}
              title="Añadir marcador aquí"
              className="rounded-md border border-[var(--color-border)] p-1.5 hover:bg-[var(--color-bg-mute)]"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
              </svg>
            </button>
            <button
              onClick={() => toggleSidebar('bookmarks')}
              title="Ver marcadores"
              className={`rounded-md border border-[var(--color-border)] px-2 py-1 text-xs hover:bg-[var(--color-bg-mute)] ${
                sidebarTab === 'bookmarks' ? 'bg-[var(--color-bg-mute)]' : ''
              }`}
            >
              Marcadores{bookmarks.length > 0 ? ` (${bookmarks.length})` : ''}
            </button>
            <button
              onClick={toggleReaderTheme}
              title={isReaderDark ? 'Páginas en modo claro' : 'Páginas en modo oscuro'}
              className="rounded-md border border-[var(--color-border)] p-1.5 hover:bg-[var(--color-bg-mute)]"
            >
              {isReaderDark ? (
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
                </svg>
              ) : (
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              )}
            </button>
            <button
              onClick={toggleFullscreen}
              title={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
              className="rounded-md border border-[var(--color-border)] p-1.5 hover:bg-[var(--color-bg-mute)]"
            >
              {isFullscreen ? (
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3" />
                </svg>
              ) : (
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M3 16v3a2 2 0 0 0 2 2h3" />
                </svg>
              )}
            </button>
          </div>
        )}
      </div>

      {error && <p className="text-red-500">Error al abrir el libro: {error}</p>}

      <div className="relative flex min-h-0 flex-1">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div
            ref={epubContainerRef}
            className={`min-h-0 flex-1 rounded border border-[var(--color-border)] ${
              isReaderDark ? 'bg-[#16161a]' : 'bg-white'
            } ${error || isPdf ? 'hidden' : ''}`}
          />

          <div
            ref={pdfContainerRef}
            className={`min-h-0 flex-1 overflow-auto rounded border border-[var(--color-border)] p-4 ${
              isReaderDark ? 'bg-black' : 'bg-[var(--color-bg-mute)]'
            } ${error || !isPdf ? 'hidden' : 'flex justify-center'}`}
          >
            <div
              ref={pageBoxRef}
              className="relative inline-block h-fit"
              onMouseUp={handlePageMouseUp}
            >
              <canvas
                ref={canvasRef}
                className="block"
                style={isReaderDark ? { filter: 'invert(1) hue-rotate(180deg)' } : undefined}
              />
              <div className="absolute inset-0 overflow-hidden">
                <div className="textLayer" ref={textLayerRef} />
              </div>
              <div className="pointer-events-none absolute inset-0">
                {currentPageHighlights.map(({ entry, loc }) =>
                  loc.rects.map((r, i) => (
                    <div
                      key={`${entry.highlight.id}-${i}`}
                      className="absolute"
                      style={{
                        left: `${r.x * 100}%`,
                        top: `${r.y * 100}%`,
                        width: `${r.w * 100}%`,
                        height: `${r.h * 100}%`,
                        background: entry.highlight.color,
                        opacity: 0.35,
                        mixBlendMode: 'multiply'
                      }}
                    />
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        {sidebarTab && (
          <aside className="ml-3 flex w-72 shrink-0 flex-col rounded border border-[var(--color-border)] bg-[var(--color-bg-soft)]">
            <div className="flex items-center justify-between border-b border-[var(--color-border)] px-3 py-2">
              <h3 className="text-sm font-medium">
                {sidebarTab === 'toc'
                  ? 'Índice'
                  : sidebarTab === 'search'
                    ? 'Buscar'
                    : 'Marcadores'}
              </h3>
              <button
                onClick={() => setSidebarTab(null)}
                className="rounded px-1.5 py-0.5 text-xs text-[var(--color-text-soft)] hover:bg-[var(--color-bg-mute)]"
              >
                Cerrar
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-auto p-2">
              {sidebarTab === 'toc' &&
                (isPdf ? (
                  numPages > 0 ? (
                    <div className="grid grid-cols-5 gap-1">
                      {Array.from({ length: numPages }, (_, i) => i + 1).map((p) => (
                        <button
                          key={p}
                          onClick={() => setPageNum(p)}
                          className={`rounded-md border px-2 py-1 text-xs ${
                            p === pageNum
                              ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
                              : 'border-[var(--color-border)] hover:bg-[var(--color-bg-mute)]'
                          }`}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="px-1 py-2 text-xs text-[var(--color-text-soft)]">
                      Cargando páginas…
                    </p>
                  )
                ) : toc.length === 0 ? (
                  <p className="px-1 py-2 text-xs text-[var(--color-text-soft)]">
                    Este libro no tiene índice.
                  </p>
                ) : (
                  <TocList
                    items={toc}
                    onNavigate={(href) => {
                      currentLocationRef.current = href
                      renditionRef.current?.display(href)
                    }}
                  />
                ))}

              {sidebarTab === 'search' && (
                <div className="flex h-full flex-col gap-2">
                  <div className="flex gap-1">
                    <input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') runSearch()
                      }}
                      placeholder="Buscar palabra..."
                      className="min-w-0 flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-sm"
                    />
                    <button
                      onClick={runSearch}
                      className="rounded-md border border-[var(--color-border)] px-2 py-1 text-sm hover:bg-[var(--color-bg-mute)]"
                    >
                      Ir
                    </button>
                  </div>

                  {searching && (
                    <p className="px-1 text-xs text-[var(--color-text-soft)]">Buscando…</p>
                  )}
                  {!searching &&
                    searchQuery.trim().length >= SEARCH_MIN_LENGTH &&
                    searchResults.length === 0 && (
                      <p className="px-1 text-xs text-[var(--color-text-soft)]">Sin resultados.</p>
                    )}

                  <ul className="flex min-h-0 flex-1 flex-col gap-1 overflow-auto">
                    {searchResults.map((hit) => (
                      <li key={hit.id}>
                        <button
                          onClick={() => goToSearchHit(hit)}
                          className="w-full rounded-md px-2 py-1.5 text-left text-xs hover:bg-[var(--color-bg-mute)]"
                        >
                          {isPdf && <span className="font-medium">Pág. {hit.target}: </span>}
                          {hit.excerpt}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {sidebarTab === 'bookmarks' &&
                (bookmarks.length === 0 ? (
                  <p className="px-1 py-2 text-xs text-[var(--color-text-soft)]">
                    Aún no hay marcadores. Usa el icono de marcador para guardar la posición actual.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {bookmarks.map((bookmark) => (
                      <li
                        key={bookmark.id}
                        className="flex items-center gap-1 rounded-md hover:bg-[var(--color-bg-mute)]"
                      >
                        <button
                          onClick={() => goToBookmark(bookmark)}
                          className="min-w-0 flex-1 truncate px-2 py-1.5 text-left text-sm"
                          title={bookmarkLabel(bookmark)}
                        >
                          {bookmarkLabel(bookmark)}
                        </button>
                        <button
                          onClick={() => removeBookmark(bookmark.id)}
                          title="Eliminar marcador"
                          className="shrink-0 rounded px-2 py-1 text-xs text-red-500 hover:bg-red-500/10"
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                ))}
            </div>
          </aside>
        )}
      </div>

      {pendingSelection && (
        <div
          className="fixed z-50 flex w-60 flex-col gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-soft)] p-3 shadow-lg"
          style={{ left: pendingSelection.clientX, top: pendingSelection.clientY + 12 }}
        >
          <div className="flex items-center gap-2">
            {HIGHLIGHT_COLORS.map((color) => (
              <button
                key={color}
                onClick={() => setPendingColor(color)}
                title={color}
                className={`h-6 w-6 rounded-full border-2 ${
                  pendingColor === color ? 'border-[var(--color-text)]' : 'border-transparent'
                }`}
                style={{ background: color }}
              />
            ))}
          </div>
          <textarea
            value={pendingNote}
            onChange={(e) => setPendingNote(e.target.value)}
            placeholder="Nota (opcional)"
            rows={2}
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] p-1.5 text-xs"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setPendingSelection(null)}
              className="rounded-md px-2 py-1 text-xs hover:bg-[var(--color-bg-mute)]"
            >
              Cancelar
            </button>
            <button
              onClick={saveHighlight}
              className="rounded-md bg-[var(--color-accent)] px-2 py-1 text-xs text-white"
            >
              Guardar
            </button>
          </div>
        </div>
      )}

      {selectedHighlight && popoverPos && (
        <div
          className="fixed z-50 flex w-60 flex-col gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-soft)] p-3 shadow-lg"
          style={{ left: popoverPos.x, top: popoverPos.y + 12 }}
        >
          <p className="text-xs italic text-[var(--color-text-soft)]">
            &ldquo;{selectedHighlight.highlight.selectedText}&rdquo;
          </p>
          {selectedHighlight.note && <p className="text-xs">{selectedHighlight.note.text}</p>}
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setSelectedHighlight(null)}
              className="rounded-md px-2 py-1 text-xs hover:bg-[var(--color-bg-mute)]"
            >
              Cerrar
            </button>
            <button
              onClick={deleteSelectedHighlight}
              className="rounded-md border border-red-500 px-2 py-1 text-xs text-red-500 hover:bg-red-500/10"
            >
              Eliminar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
