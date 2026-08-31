import * as React from 'react'

import { DiffRowType, SimplifiedDiffRow } from './diff-helpers'

interface IDiffMinimapProps {
  readonly rows: ReadonlyArray<SimplifiedDiffRow>
  readonly showSideBySideDiff: boolean
  readonly getScrollableNode: () => HTMLElement | null
  readonly onScrollToPosition: (scrollTop: number) => void
  /**
   * Returns the actual rendered height of a diff row at the given index.
   * Needed to map minimap row indices to scrollTop correctly when diff
   * rows have variable heights.
   */
  readonly getRowHeight: (index: number) => number
}

interface IGeometry {
  readonly top: number
  readonly height: number
}

interface IMergedChangeRun {
  readonly row: SimplifiedDiffRow
  readonly startIndex: number
  readonly endIndex: number
  readonly geometry: IGeometry
}

interface IViewportRenderState {
  readonly visible: boolean
  readonly top: number
  readonly height: number
}

interface ILineMetrics {
  readonly leadingWidth: number
  readonly trimmedLength: number
}

interface ILineBarLayout {
  readonly startX: number
  readonly primaryWidth: number
  readonly trailingX: number | null
  readonly trailingWidth: number
}

interface IMinimapPalette {
  readonly background: string
  readonly border: string
  readonly context: string
  readonly added: string
  readonly deleted: string
  readonly hunk: string
  readonly addedBackground: string
  readonly deletedBackground: string
  readonly hunkBackground: string
}

interface IMinimapLane {
  readonly x: number
  readonly width: number
}

interface IMinimapLanes {
  readonly before: IMinimapLane
  readonly after: IMinimapLane
  readonly gapWidth: number
}

interface IVisibleRowBounds {
  readonly start: number
  readonly end: number
}

/**
 * The minimap layout, derived from the diff line height and viewport
 * width so a minimap pixel represents the same fraction of the source
 * horizontally and vertically. The minimap can be shorter than the
 * container (small files) or taller (large files), in which case its
 * content scrolls along with the diff.
 */
interface IMinimapGeometry {
  /** Pixels per logical row in the minimap (≥ 1). */
  readonly minimapRowHeight: number
  /** Total minimap content height (rows × rowHeight). May exceed canvas. */
  readonly minimapTotalHeight: number
  /** Visible canvas height (≤ container height). */
  readonly canvasHeight: number
  /** Pixels of minimap content scrolled above the canvas. */
  readonly scrollOffset: number
}

const MinimapPadding = 6
const MinimapColumnGap = 4
const MinimapLanePadding = 1
const KeyboardScrollStep = 48
const MinimapContentSelector = '.ReactVirtualized__Grid__innerScrollContainer'
const MinViewportHeight = 14
const MinMergedChangeRunRows = 2
const DefaultLineHeight = 20

export class DiffMinimap extends React.PureComponent<IDiffMinimapProps> {
  private readonly containerRef = React.createRef<HTMLButtonElement>()
  private readonly canvasRef = React.createRef<HTMLCanvasElement>()
  private readonly viewportRef = React.createRef<HTMLDivElement>()

  private wheelListenerTarget: HTMLButtonElement | null = null
  private scrollContainer: HTMLElement | null = null
  private contentContainer: HTMLElement | null = null
  private themeObserver: MutationObserver | null = null
  private lastThemeClassName = ''
  private resizeObserver: ResizeObserver | null = null
  private frameHandle: number | null = null
  private dragScrollFrameHandle: number | null = null
  private wheelScrollFrameHandle: number | null = null
  private needsRedraw = false
  private needsViewportUpdate = false
  private dragOffset = 0
  private dragContainerTop = 0
  private dragViewport: IGeometry | null = null
  private pendingDragTrackTop: number | null = null
  private pendingWheelDelta = 0
  private viewportRenderState: IViewportRenderState | null = null
  // True when the minimap content is taller than the canvas. In that mode
  // a diff scroll shifts the rendered pixels, not just the thumb, so the
  // canvas needs a full redraw on scroll.
  private minimapContentScrolls = false
  private readonly lineMetricsCache = new Map<string, ILineMetrics>()

  public componentDidMount() {
    this.syncWheelListener()
    this.syncScrollContainer()
    this.resetThemeObserver()
    this.resetResizeObserver()
    this.scheduleRedraw()
  }

  public componentDidUpdate(prevProps: IDiffMinimapProps) {
    this.syncWheelListener()
    this.syncScrollContainer()

    if (
      prevProps.rows !== this.props.rows ||
      prevProps.showSideBySideDiff !== this.props.showSideBySideDiff
    ) {
      if (prevProps.rows !== this.props.rows) {
        this.lineMetricsCache.clear()
      }
      this.resetResizeObserver()
      this.scheduleRedraw()
    } else {
      this.scheduleViewportUpdate()
    }
  }

  public componentWillUnmount() {
    this.cancelFrame(this.frameHandle)
    this.cancelFrame(this.dragScrollFrameHandle)
    this.cancelFrame(this.wheelScrollFrameHandle)
    this.frameHandle = null
    this.dragScrollFrameHandle = null
    this.wheelScrollFrameHandle = null

    this.detachWheelListener()
    this.detachScrollContainer()
    this.disconnectThemeObserver()
    this.disconnectResizeObserver()
    this.resetDragState()
    this.removeDragListeners()
  }

  public render() {
    return (
      <button
        ref={this.containerRef}
        type="button"
        className="diff-minimap"
        aria-label="Diff minimap"
        onMouseDown={this.onMouseDown}
        onKeyDown={this.onKeyDown}
      >
        <canvas ref={this.canvasRef} />
        <div
          ref={this.viewportRef}
          className="diff-minimap-viewport"
          aria-hidden={true}
        />
      </button>
    )
  }

  private cancelFrame(handle: number | null) {
    if (handle !== null) {
      window.cancelAnimationFrame(handle)
    }
  }

  private syncScrollContainer() {
    const nextContainer = this.props.getScrollableNode()
    if (nextContainer === this.scrollContainer) {
      return
    }

    this.detachScrollContainer()
    this.scrollContainer = nextContainer
    this.contentContainer = null
    this.viewportRenderState = null

    this.scrollContainer?.addEventListener('scroll', this.onScroll, {
      passive: true,
    })

    this.resetResizeObserver()
    this.scheduleRedraw()
  }

  private syncWheelListener() {
    const container = this.containerRef.current
    if (container === this.wheelListenerTarget) {
      return
    }

    this.detachWheelListener()

    if (container !== null) {
      // React's wheel listeners are passive in Chromium, but the minimap
      // intentionally cancels the browser default and drives the diff scroll.
      container.addEventListener('wheel', this.onWheel, { passive: false })
      this.wheelListenerTarget = container
    }
  }

  private detachWheelListener() {
    this.wheelListenerTarget?.removeEventListener('wheel', this.onWheel)
    this.wheelListenerTarget = null
  }

  private detachScrollContainer() {
    this.scrollContainer?.removeEventListener('scroll', this.onScroll)
    this.scrollContainer = null
    this.contentContainer = null
  }

  private resetResizeObserver() {
    this.disconnectResizeObserver()

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', this.onResize)
      return
    }

    const observer = new ResizeObserver(this.onResize)
    this.observeNode(observer, this.containerRef.current)
    this.observeNode(observer, this.scrollContainer)
    this.observeNode(observer, this.getContentContainerNode())
    this.resizeObserver = observer
  }

  private resetThemeObserver() {
    this.disconnectThemeObserver()

    if (typeof MutationObserver === 'undefined') {
      return
    }

    this.lastThemeClassName = this.getThemeClassName()
    this.themeObserver = new MutationObserver(this.onThemeClassChanged)
    this.themeObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['class'],
    })

    const appChrome = document.getElementById('desktop-app-chrome')
    if (appChrome !== null) {
      this.themeObserver.observe(appChrome, {
        attributes: true,
        attributeFilter: ['class'],
      })
    }
  }

  private disconnectResizeObserver() {
    window.removeEventListener('resize', this.onResize)
    this.resizeObserver?.disconnect()
    this.resizeObserver = null
  }

  private disconnectThemeObserver() {
    this.themeObserver?.disconnect()
    this.themeObserver = null
  }

  private observeNode(observer: ResizeObserver, node: Element | null) {
    if (node !== null) {
      observer.observe(node)
    }
  }

  private onResize = () => {
    this.viewportRenderState = null
    this.scheduleRedraw()
  }

  private onScroll = () => {
    if (this.minimapContentScrolls) {
      this.scheduleRedraw()
    } else {
      this.scheduleViewportUpdate()
    }
  }

  private onThemeClassChanged = () => {
    const nextThemeClassName = this.getThemeClassName()
    if (nextThemeClassName === this.lastThemeClassName) {
      return
    }

    this.lastThemeClassName = nextThemeClassName
    this.viewportRenderState = null
    this.scheduleRedraw()
  }

  private getThemeClassName() {
    const appChrome = document.getElementById('desktop-app-chrome')
    const applicationTheme = [...document.body.classList].find(c =>
      c.startsWith('theme-')
    )
    const diffTheme = [...(appChrome?.classList ?? [])].find(c =>
      c.startsWith('diff-theme-')
    )

    return `${applicationTheme ?? ''} ${diffTheme ?? ''}`
  }

  private scheduleRedraw() {
    this.needsRedraw = true
    this.needsViewportUpdate = true
    this.scheduleFrame()
  }

  private scheduleViewportUpdate() {
    this.needsViewportUpdate = true
    this.scheduleFrame()
  }

  private scheduleFrame() {
    if (this.frameHandle !== null) {
      return
    }

    this.frameHandle = window.requestAnimationFrame(() => {
      this.frameHandle = null

      if (this.needsRedraw) {
        this.needsRedraw = false
        this.redrawCanvas()
      }

      if (this.needsViewportUpdate) {
        this.needsViewportUpdate = false
        this.updateViewport()
      }
    })
  }

  private redrawCanvas() {
    const canvas = this.canvasRef.current
    const container = this.containerRef.current
    if (canvas === null || container === null) {
      return
    }

    const width = Math.max(1, Math.floor(container.clientWidth))
    const containerHeight = Math.max(1, Math.floor(container.clientHeight))
    const dpr = window.devicePixelRatio || 1

    const geometry = this.getMinimapGeometry()
    const canvasHeight = geometry?.canvasHeight ?? containerHeight
    this.minimapContentScrolls =
      geometry !== null && geometry.minimapTotalHeight > geometry.canvasHeight

    canvas.width = Math.max(1, Math.floor(width * dpr))
    canvas.height = Math.max(1, Math.floor(canvasHeight * dpr))
    canvas.style.width = `${width}px`
    canvas.style.height = `${canvasHeight}px`

    const context = canvas.getContext('2d')
    if (context === null) {
      return
    }

    context.setTransform(dpr, 0, 0, dpr, 0, 0)

    const palette = this.getPalette(container)
    const rows = this.props.rows

    context.fillStyle = palette.background
    context.fillRect(0, 0, width, canvasHeight)

    if (rows.length === 0 || geometry === null) {
      context.fillStyle = palette.border
      context.fillRect(0, 0, 1, canvasHeight)
      return
    }

    const lanes = this.getLanes(width)
    this.drawVisibleRows(context, rows, palette, geometry, width, lanes)

    if (this.props.showSideBySideDiff && lanes.gapWidth > 0) {
      const separatorX =
        lanes.before.x + lanes.before.width + Math.floor(lanes.gapWidth / 2)
      context.globalAlpha = 0.45
      context.fillStyle = palette.border
      context.fillRect(separatorX, 0, 1, canvasHeight)
      context.globalAlpha = 1
    }

    context.fillStyle = palette.border
    context.fillRect(0, 0, 1, canvasHeight)
  }

  private drawVisibleRows(
    context: CanvasRenderingContext2D,
    rows: ReadonlyArray<SimplifiedDiffRow>,
    palette: IMinimapPalette,
    geometry: IMinimapGeometry,
    width: number,
    lanes: IMinimapLanes
  ) {
    const { minimapRowHeight, scrollOffset, canvasHeight } = geometry

    // Iterate only the rows that intersect the canvas. Walk back into a
    // merged change run if we'd start in the middle of one, since the run
    // renders as a single block and the visible portion has to look
    // continuous.
    let startIndex = Math.max(0, Math.floor(scrollOffset / minimapRowHeight))
    while (
      startIndex > 0 &&
      isMergeableChange(rows[startIndex]) &&
      rows[startIndex - 1].type === rows[startIndex].type
    ) {
      startIndex--
    }
    const endIndex = Math.min(
      rows.length - 1,
      Math.ceil((scrollOffset + canvasHeight) / minimapRowHeight)
    )

    for (let index = startIndex; index <= endIndex; index++) {
      const mergedRun = this.getMergedChangeRun(rows, index, geometry)
      if (mergedRun !== null) {
        this.drawMergedChangeRun(
          context,
          rows,
          palette,
          mergedRun,
          width,
          lanes,
          geometry
        )
        index = mergedRun.endIndex
      } else {
        const rowGeometry = this.getRowGeometry(index, geometry)
        this.drawRow(context, rows[index], palette, rowGeometry, width, lanes)
      }
    }
  }

  /** Tile rows so adjacent rows abut without gaps at fractional row heights. */
  private getRowGeometry(index: number, geometry: IMinimapGeometry): IGeometry {
    const { minimapRowHeight, scrollOffset } = geometry
    const absTop = Math.floor(index * minimapRowHeight)
    const absBottom = Math.max(
      absTop + 1,
      Math.ceil((index + 1) * minimapRowHeight)
    )
    return {
      top: absTop - scrollOffset,
      height: Math.max(1, absBottom - absTop),
    }
  }

  private getContentContainerNode() {
    if (
      this.contentContainer !== null &&
      this.contentContainer.isConnected &&
      this.contentContainer.parentElement !== null
    ) {
      return this.contentContainer
    }

    this.contentContainer = this.scrollContainer?.querySelector(
      MinimapContentSelector
    ) as HTMLElement | null

    return this.contentContainer
  }

  /**
   * Returns fractional row indices for the rows currently visible in the
   * scroll container, derived from the rendered DOM rather than scroll
   * metrics. react-virtualized estimates heights for unmeasured rows so
   * scrollHeight drifts as rows scroll into view; reading the actual
   * rendered row positions stays accurate during that refinement.
   */
  private getVisibleRowBounds(): IVisibleRowBounds | null {
    const contentContainer = this.getContentContainerNode()
    const scrollContainer = this.scrollContainer

    if (contentContainer === null || scrollContainer === null) {
      return null
    }

    const { scrollTop, clientHeight } = scrollContainer
    const scrollBottom = scrollTop + clientHeight
    const children = contentContainer.children

    const start = this.getVisibleRowBound(
      children,
      scrollTop,
      scrollBottom,
      true
    )
    if (start === null) {
      return null
    }

    const end = this.getVisibleRowBound(
      children,
      scrollTop,
      scrollBottom,
      false
    )

    return end !== null && end > start ? { start, end } : null
  }

  private getVisibleRowBound(
    children: HTMLCollection,
    scrollTop: number,
    scrollBottom: number,
    fromStart: boolean
  ): number | null {
    const childCount = children.length
    const step = fromStart ? 1 : -1
    let i = fromStart ? 0 : childCount - 1

    while (i >= 0 && i < childCount) {
      const el = children[i] as HTMLElement
      const rowHeight = el.offsetHeight
      if (rowHeight > 0) {
        const top = el.offsetTop
        const bottom = top + rowHeight

        if (fromStart ? top >= scrollBottom : bottom <= scrollTop) {
          break
        }

        if (fromStart ? bottom > scrollTop : top < scrollBottom) {
          // Rows are virtualized so DOM order doesn't match logical index;
          // aria-rowindex carries the diff row index.
          const index = Number(el.getAttribute('aria-rowindex'))
          if (!Number.isNaN(index)) {
            const visibleOffset = fromStart
              ? Math.max(0, scrollTop - top)
              : Math.min(rowHeight, scrollBottom - top)
            return index + visibleOffset / rowHeight
          }
        }
      }

      i += step
    }

    return null
  }

  private getMinimapGeometry(): IMinimapGeometry | null {
    const container = this.containerRef.current
    const scrollContainer = this.scrollContainer
    if (container === null || scrollContainer === null) {
      return null
    }

    const containerHeight = container.clientHeight
    const minimapWidth = container.clientWidth
    const viewportWidth = scrollContainer.clientWidth
    const numRows = this.props.rows.length

    if (
      containerHeight <= 0 ||
      minimapWidth <= 0 ||
      viewportWidth <= 0 ||
      numRows === 0
    ) {
      return null
    }

    // Floor at 1 px so individual rows stay visible on extra-wide
    // viewports where lineHeight × scale could otherwise drop below 1.
    const scale = minimapWidth / viewportWidth
    const minimapRowHeight = Math.max(1, this.getDiffLineHeight() * scale)
    const minimapTotalHeight = numRows * minimapRowHeight
    const canvasHeight = Math.min(
      containerHeight,
      Math.max(1, Math.ceil(minimapTotalHeight))
    )

    const overflow = Math.max(0, minimapTotalHeight - canvasHeight)

    // Derive scrollOffset from the row index of the first visible row rather
    // than from scrollTop/scrollHeight. scrollHeight drifts while
    // react-virtualized refines estimated heights for unrendered rows, causing
    // a ratio mismatch when row heights are non-uniform. Reading the DOM row
    // positions (via getVisibleRowBounds) gives a stable row index that lives
    // in the same uniform-row coordinate system the minimap uses for drawing.
    const visibleBounds = this.getVisibleRowBounds()
    let scrollOffset: number
    if (visibleBounds !== null) {
      const thumbAbsTop = visibleBounds.start * minimapRowHeight
      const thumbAbsHeight =
        (visibleBounds.end - visibleBounds.start) * minimapRowHeight
      const maxThumbTop = Math.max(0, minimapTotalHeight - thumbAbsHeight)
      scrollOffset =
        maxThumbTop > 0
          ? Math.min(
              overflow,
              Math.round((overflow * thumbAbsTop) / maxThumbTop)
            )
          : 0
    } else {
      // Fallback before react-virtualized has rendered any rows.
      const maxScrollTop = this.getMaxScrollTop()
      scrollOffset =
        maxScrollTop > 0
          ? Math.round((overflow * scrollContainer.scrollTop) / maxScrollTop)
          : 0
    }

    return { minimapRowHeight, minimapTotalHeight, canvasHeight, scrollOffset }
  }

  private getMaxScrollTop(): number {
    const sc = this.scrollContainer
    return sc === null ? 0 : Math.max(0, sc.scrollHeight - sc.clientHeight)
  }

  private getDiffLineHeight(): number {
    const container = this.containerRef.current ?? this.scrollContainer
    if (container === null) {
      return DefaultLineHeight
    }
    const styles = window.getComputedStyle(container)
    const cssLineHeight = Number.parseFloat(
      styles.getPropertyValue('--diff-line-height')
    )
    if (Number.isFinite(cssLineHeight) && cssLineHeight > 0) {
      return cssLineHeight
    }
    const lineHeight = Number.parseFloat(styles.lineHeight)
    return Number.isFinite(lineHeight) && lineHeight > 0
      ? lineHeight
      : DefaultLineHeight
  }

  private getLanes(width: number): IMinimapLanes {
    const innerX = MinimapPadding
    const innerWidth = Math.max(8, width - MinimapPadding * 2)

    if (!this.props.showSideBySideDiff) {
      return {
        before: { x: innerX, width: innerWidth },
        after: { x: innerX, width: innerWidth },
        gapWidth: 0,
      }
    }

    const gapWidth = Math.min(MinimapColumnGap, Math.max(2, innerWidth - 4))
    const beforeWidth = Math.max(2, Math.floor((innerWidth - gapWidth) / 2))
    const afterWidth = Math.max(2, innerWidth - gapWidth - beforeWidth)

    return {
      before: { x: innerX, width: beforeWidth },
      after: { x: innerX + beforeWidth + gapWidth, width: afterWidth },
      gapWidth,
    }
  }

  private drawRow(
    context: CanvasRenderingContext2D,
    row: SimplifiedDiffRow,
    palette: IMinimapPalette,
    geometry: IGeometry,
    width: number,
    lanes: IMinimapLanes
  ) {
    if (this.props.showSideBySideDiff) {
      this.drawSplitRow(context, row, palette, geometry, lanes)
    } else {
      this.drawUnifiedRow(context, row, palette, geometry, width, lanes)
    }
    context.globalAlpha = 1
  }

  private drawUnifiedRow(
    context: CanvasRenderingContext2D,
    row: SimplifiedDiffRow,
    palette: IMinimapPalette,
    geometry: IGeometry,
    width: number,
    lanes: IMinimapLanes
  ) {
    const { top, height: rowHeight } = geometry

    switch (row.type) {
      case DiffRowType.Hunk:
        context.globalAlpha = 0.75
        context.fillStyle = palette.hunkBackground
        context.fillRect(0, top, width, rowHeight)
        context.globalAlpha = 0.55
        context.fillStyle = palette.hunk
        context.fillRect(
          lanes.before.x,
          top,
          Math.max(2, lanes.before.width),
          Math.max(1, rowHeight)
        )
        return

      case DiffRowType.Context:
        this.drawLineBars(
          context,
          row.content,
          palette.context,
          top,
          rowHeight,
          lanes.before,
          0.28,
          false
        )
        return

      case DiffRowType.Added:
        context.globalAlpha = 0.26
        context.fillStyle = palette.addedBackground
        context.fillRect(0, top, width, rowHeight)
        this.drawLineBars(
          context,
          row.data.content,
          palette.added,
          top,
          rowHeight,
          lanes.before,
          0.75,
          true
        )
        return

      case DiffRowType.Deleted:
        context.globalAlpha = 0.26
        context.fillStyle = palette.deletedBackground
        context.fillRect(0, top, width, rowHeight)
        this.drawLineBars(
          context,
          row.data.content,
          palette.deleted,
          top,
          rowHeight,
          lanes.before,
          0.75,
          true
        )
        return

      case DiffRowType.Modified: {
        const topHeight = Math.max(1, Math.ceil(rowHeight / 2))
        const bottomHeight = Math.max(1, Math.floor(rowHeight / 2))
        const bottomTop = top + rowHeight - bottomHeight

        context.globalAlpha = 0.16
        context.fillStyle = palette.deletedBackground
        context.fillRect(0, top, width, topHeight)
        context.fillStyle = palette.addedBackground
        context.fillRect(0, bottomTop, width, bottomHeight)

        this.drawLineBars(
          context,
          row.beforeData.content,
          palette.deleted,
          top,
          topHeight,
          lanes.before,
          0.72,
          true
        )
        this.drawLineBars(
          context,
          row.afterData.content,
          palette.added,
          bottomTop,
          bottomHeight,
          lanes.before,
          0.72,
          true
        )
        return
      }
    }
  }

  private drawSplitRow(
    context: CanvasRenderingContext2D,
    row: SimplifiedDiffRow,
    palette: IMinimapPalette,
    geometry: IGeometry,
    lanes: IMinimapLanes
  ) {
    const { top, height: rowHeight } = geometry

    switch (row.type) {
      case DiffRowType.Hunk: {
        const width = lanes.after.x + lanes.after.width - lanes.before.x
        context.globalAlpha = 0.75
        context.fillStyle = palette.hunkBackground
        context.fillRect(lanes.before.x, top, width, rowHeight)
        context.globalAlpha = 0.55
        context.fillStyle = palette.hunk
        context.fillRect(lanes.before.x, top, width, Math.max(1, rowHeight))
        return
      }

      case DiffRowType.Context:
        this.drawLineBars(
          context,
          row.content,
          palette.context,
          top,
          rowHeight,
          lanes.before,
          0.22,
          false
        )
        this.drawLineBars(
          context,
          row.content,
          palette.context,
          top,
          rowHeight,
          lanes.after,
          0.22,
          false
        )
        return

      case DiffRowType.Added:
        context.globalAlpha = 0.26
        context.fillStyle = palette.addedBackground
        context.fillRect(
          lanes.after.x,
          top,
          lanes.after.width,
          Math.max(1, rowHeight)
        )
        this.drawLineBars(
          context,
          row.data.content,
          palette.added,
          top,
          rowHeight,
          lanes.after,
          0.75,
          true
        )
        return

      case DiffRowType.Deleted:
        context.globalAlpha = 0.26
        context.fillStyle = palette.deletedBackground
        context.fillRect(
          lanes.before.x,
          top,
          lanes.before.width,
          Math.max(1, rowHeight)
        )
        this.drawLineBars(
          context,
          row.data.content,
          palette.deleted,
          top,
          rowHeight,
          lanes.before,
          0.75,
          true
        )
        return

      case DiffRowType.Modified:
        context.globalAlpha = 0.18
        context.fillStyle = palette.deletedBackground
        context.fillRect(
          lanes.before.x,
          top,
          lanes.before.width,
          Math.max(1, rowHeight)
        )
        context.fillStyle = palette.addedBackground
        context.fillRect(
          lanes.after.x,
          top,
          lanes.after.width,
          Math.max(1, rowHeight)
        )

        this.drawLineBars(
          context,
          row.beforeData.content,
          palette.deleted,
          top,
          rowHeight,
          lanes.before,
          0.72,
          true
        )
        this.drawLineBars(
          context,
          row.afterData.content,
          palette.added,
          top,
          rowHeight,
          lanes.after,
          0.72,
          true
        )
        return
    }
  }

  private drawLineBars(
    context: CanvasRenderingContext2D,
    content: string,
    color: string,
    top: number,
    rowHeight: number,
    lane: IMinimapLane,
    alpha: number,
    emphasize: boolean
  ) {
    const layout = this.getLineBarLayout(content, lane)
    const barHeight = this.getLineBarHeight(rowHeight, emphasize)
    const y = top + Math.max(0, Math.floor((rowHeight - barHeight) / 2))

    context.globalAlpha = alpha
    context.fillStyle = color
    context.fillRect(layout.startX, y, layout.primaryWidth, barHeight)

    if (layout.trailingX !== null && layout.trailingWidth > 0) {
      context.globalAlpha = alpha * 0.6
      context.fillRect(layout.trailingX, y, layout.trailingWidth, barHeight)
    }
  }

  private getMergedChangeRun(
    rows: ReadonlyArray<SimplifiedDiffRow>,
    startIndex: number,
    geometry: IMinimapGeometry
  ): IMergedChangeRun | null {
    const row = rows[startIndex]
    if (!isMergeableChange(row)) {
      return null
    }

    let endIndex = startIndex
    while (endIndex + 1 < rows.length && rows[endIndex + 1].type === row.type) {
      endIndex++
    }

    if (endIndex - startIndex + 1 < MinMergedChangeRunRows) {
      return null
    }

    const startGeometry = this.getRowGeometry(startIndex, geometry)
    const endGeometry = this.getRowGeometry(endIndex, geometry)

    return {
      row,
      startIndex,
      endIndex,
      geometry: {
        top: startGeometry.top,
        height: Math.max(
          1,
          endGeometry.top + endGeometry.height - startGeometry.top
        ),
      },
    }
  }

  private drawMergedChangeRun(
    context: CanvasRenderingContext2D,
    rows: ReadonlyArray<SimplifiedDiffRow>,
    palette: IMinimapPalette,
    mergedRun: IMergedChangeRun,
    width: number,
    lanes: IMinimapLanes,
    geometry: IMinimapGeometry
  ) {
    if (this.props.showSideBySideDiff) {
      this.drawMergedSplitChangeRun(
        context,
        rows,
        palette,
        mergedRun,
        lanes,
        geometry
      )
    } else {
      this.drawMergedUnifiedChangeRun(
        context,
        rows,
        palette,
        mergedRun,
        width,
        lanes,
        geometry
      )
    }
    context.globalAlpha = 1
  }

  private drawMergedUnifiedChangeRun(
    context: CanvasRenderingContext2D,
    rows: ReadonlyArray<SimplifiedDiffRow>,
    palette: IMinimapPalette,
    mergedRun: IMergedChangeRun,
    width: number,
    lanes: IMinimapLanes,
    geometry: IMinimapGeometry
  ) {
    const { row, startIndex, endIndex, geometry: runGeometry } = mergedRun

    if (row.type !== DiffRowType.Added && row.type !== DiffRowType.Deleted) {
      this.drawRow(context, row, palette, runGeometry, width, lanes)
      return
    }

    context.globalAlpha = 0.34
    context.fillStyle =
      row.type === DiffRowType.Added
        ? palette.addedBackground
        : palette.deletedBackground
    context.fillRect(0, runGeometry.top, width, Math.max(1, runGeometry.height))

    this.drawMergedLineSlices(
      context,
      rows,
      startIndex,
      endIndex,
      lanes.before,
      row.type === DiffRowType.Added ? palette.added : palette.deleted,
      geometry
    )
  }

  private drawMergedSplitChangeRun(
    context: CanvasRenderingContext2D,
    rows: ReadonlyArray<SimplifiedDiffRow>,
    palette: IMinimapPalette,
    mergedRun: IMergedChangeRun,
    lanes: IMinimapLanes,
    geometry: IMinimapGeometry
  ) {
    const { row, startIndex, endIndex, geometry: runGeometry } = mergedRun

    const isAdded = row.type === DiffRowType.Added
    const isDeleted = row.type === DiffRowType.Deleted
    if (!isAdded && !isDeleted) {
      return
    }

    const lane = isAdded ? lanes.after : lanes.before
    const background = isAdded
      ? palette.addedBackground
      : palette.deletedBackground
    const color = isAdded ? palette.added : palette.deleted

    this.drawMergedLaneBackground(context, lane, runGeometry, background)
    this.drawMergedLineSlices(
      context,
      rows,
      startIndex,
      endIndex,
      lane,
      color,
      geometry
    )
  }

  private drawMergedLaneBackground(
    context: CanvasRenderingContext2D,
    lane: IMinimapLane,
    geometry: IGeometry,
    backgroundColor: string
  ) {
    context.globalAlpha = 0.34
    context.fillStyle = backgroundColor
    context.fillRect(
      lane.x,
      geometry.top,
      Math.max(2, lane.width),
      Math.max(1, geometry.height)
    )
  }

  private drawMergedLineSlices(
    context: CanvasRenderingContext2D,
    rows: ReadonlyArray<SimplifiedDiffRow>,
    startIndex: number,
    endIndex: number,
    lane: IMinimapLane,
    color: string,
    geometry: IMinimapGeometry
  ) {
    context.fillStyle = color

    for (let index = startIndex; index <= endIndex; index++) {
      const row = rows[index]
      if (row.type !== DiffRowType.Added && row.type !== DiffRowType.Deleted) {
        continue
      }

      const rowGeometry = this.getRowGeometry(index, geometry)
      const layout = this.getLineBarLayout(row.data.content, lane, true)
      const sliceHeight = Math.max(1, rowGeometry.height)

      context.globalAlpha = 0.82
      context.fillRect(
        layout.startX,
        rowGeometry.top,
        layout.primaryWidth,
        sliceHeight
      )

      if (layout.trailingX !== null && layout.trailingWidth > 0) {
        context.globalAlpha = 0.5
        context.fillRect(
          layout.trailingX,
          rowGeometry.top,
          layout.trailingWidth,
          sliceHeight
        )
      }
    }
  }

  private getLineBarLayout(
    content: string,
    lane: IMinimapLane,
    compactEmpty = false
  ): ILineBarLayout {
    const { leadingWidth, trimmedLength } = this.getLineMetrics(content)
    const innerWidth = Math.max(2, lane.width - MinimapLanePadding * 2)
    const indentRatio = Math.min(0.55, leadingWidth / 48)
    const startX = Math.round(
      lane.x + MinimapLanePadding + innerWidth * indentRatio
    )
    const availableWidth = Math.max(
      2,
      lane.x + lane.width - startX - MinimapLanePadding
    )
    const visibleLength = compactEmpty
      ? trimmedLength
      : Math.max(trimmedLength, 4)
    const primaryWidth = Math.max(
      2,
      Math.round(availableWidth * Math.min(1, visibleLength / 88))
    )

    if (trimmedLength <= 24 || availableWidth <= 8) {
      return { startX, primaryWidth, trailingX: null, trailingWidth: 0 }
    }

    const trailingWidth = Math.max(
      2,
      Math.round(availableWidth * Math.min(0.38, trimmedLength / 180))
    )
    const trailingX = Math.min(
      lane.x + lane.width - MinimapLanePadding - trailingWidth,
      startX + Math.max(3, Math.round(primaryWidth * 0.6))
    )

    return { startX, primaryWidth, trailingX, trailingWidth }
  }

  private getLineBarHeight(rowHeight: number, emphasize: boolean) {
    // No upper cap: rowHeight already comes from aspect-ratio-preserving
    // geometry, so the bar scales naturally with the minimap.
    return emphasize
      ? Math.max(2, Math.round(rowHeight * 0.55))
      : Math.max(1, Math.round(rowHeight * 0.7))
  }

  private getLineMetrics(content: string): ILineMetrics {
    const cached = this.lineMetricsCache.get(content)
    if (cached !== undefined) {
      return cached
    }

    let leadingWidth = 0
    let totalWidth = 0
    let inLeadingWhitespace = true

    for (let i = 0; i < content.length; i++) {
      const charCode = content.charCodeAt(i)
      const charWidth = charCode === 9 ? 2 : 1

      totalWidth += charWidth

      if (!inLeadingWhitespace) {
        continue
      }

      if (charCode === 32 || charCode === 9) {
        leadingWidth += charWidth
      } else {
        inLeadingWhitespace = false
      }
    }

    const metrics: ILineMetrics = {
      leadingWidth,
      trimmedLength: totalWidth - leadingWidth,
    }
    this.lineMetricsCache.set(content, metrics)
    return metrics
  }

  private updateViewport() {
    const viewport = this.viewportRef.current
    if (viewport === null) {
      return
    }

    const geometry = this.getViewportGeometry()
    const nextState: IViewportRenderState =
      geometry === null
        ? { visible: false, top: 0, height: 0 }
        : { visible: true, top: geometry.top, height: geometry.height }

    const prevState = this.viewportRenderState
    if (
      prevState !== null &&
      prevState.visible === nextState.visible &&
      prevState.top === nextState.top &&
      prevState.height === nextState.height
    ) {
      return
    }

    if (prevState === null || prevState.visible !== nextState.visible) {
      viewport.style.display = nextState.visible ? 'block' : 'none'
    }

    if (nextState.visible) {
      if (prevState === null || prevState.height !== nextState.height) {
        viewport.style.height = `${nextState.height}px`
      }

      if (prevState === null || prevState.top !== nextState.top) {
        viewport.style.transform = `translateY(${nextState.top}px)`
      }
    }

    this.viewportRenderState = nextState
  }

  private getViewportGeometry(): IGeometry | null {
    const geometry = this.getMinimapGeometry()
    const scrollContainer = this.scrollContainer
    if (geometry === null || scrollContainer === null) {
      return null
    }

    const maxScrollTop = this.getMaxScrollTop()
    if (maxScrollTop === 0) {
      return null
    }

    const { minimapRowHeight, canvasHeight, scrollOffset, minimapTotalHeight } =
      geometry

    let thumbAbsTop: number
    let thumbAbsHeight: number

    const visibleBounds = this.getVisibleRowBounds()
    if (visibleBounds !== null) {
      thumbAbsTop = visibleBounds.start * minimapRowHeight
      thumbAbsHeight =
        (visibleBounds.end - visibleBounds.start) * minimapRowHeight
    } else {
      // Fallback used until react-virtualized renders the first rows.
      const ratio = clamp(scrollContainer.scrollTop / maxScrollTop, 0, 1)
      const numRows = this.props.rows.length
      const visibleRows =
        scrollContainer.scrollHeight > 0
          ? (scrollContainer.clientHeight / scrollContainer.scrollHeight) *
            numRows
          : numRows
      thumbAbsHeight = visibleRows * minimapRowHeight
      thumbAbsTop = ratio * Math.max(0, minimapTotalHeight - thumbAbsHeight)
    }

    const thumbHeight = clamp(thumbAbsHeight, MinViewportHeight, canvasHeight)
    const maxTop = Math.max(0, canvasHeight - thumbHeight)

    // While dragging, peg the thumb under the pointer but keep its height
    // tracking the natural geometry so releasing doesn't snap a height change.
    const top =
      this.dragViewport !== null
        ? clamp(this.dragViewport.top, 0, maxTop)
        : clamp(thumbAbsTop - scrollOffset, 0, maxTop)

    return { top, height: thumbHeight }
  }

  private onMouseDown = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (event.button !== 0) {
      return
    }

    const container = this.containerRef.current
    const viewport = this.getViewportGeometry()
    if (container === null || viewport === null) {
      return
    }

    event.preventDefault()
    container.focus()

    const bounds = container.getBoundingClientRect()
    const offsetY = event.clientY - bounds.top
    const onThumb =
      offsetY >= viewport.top && offsetY <= viewport.top + viewport.height

    if (onThumb) {
      // Click on the thumb: start a drag. The drag mapping below keeps the
      // cursor at the same relative point on the thumb.
      this.dragContainerTop = bounds.top
      this.dragOffset = offsetY - viewport.top
      this.dragViewport = { top: viewport.top, height: viewport.height }
      this.scheduleViewportUpdate()

      window.addEventListener('mousemove', this.onMouseMove)
      window.addEventListener('mouseup', this.onMouseUp)
    } else {
      // Click off the thumb: jump to the clicked row and don't attach drag
      // listeners, so accidental movement after a click can't drag.
      const targetScrollTop = this.computeClickJump(offsetY)
      if (targetScrollTop !== null) {
        this.props.onScrollToPosition(targetScrollTop)
      }
    }
  }

  /**
   * Returns the scrollTop that centers the row at `clickCanvasY` in the
   * diff viewport, or null when the diff doesn't need to scroll.
   */
  private computeClickJump(clickCanvasY: number): number | null {
    const geometry = this.getMinimapGeometry()
    if (geometry === null || geometry.minimapRowHeight <= 0) {
      return null
    }
    if (this.getMaxScrollTop() === 0) {
      return null
    }

    const absMinimapY = clickCanvasY + geometry.scrollOffset
    const rowIndex = absMinimapY / geometry.minimapRowHeight
    return this.getScrollTopForRow(rowIndex, 'center')
  }

  /**
   * Returns the scrollTop that aligns the given row to the top (or
   * center) of the diff viewport, summing the actual rendered heights of
   * the preceding rows. Pixel-ratio mapping (`canvasY/canvasHeight ×
   * scrollHeight`) misfires when rows have variable heights — e.g.
   * wrapped long lines or modified rows — so we walk the cache instead.
   */
  private getScrollTopForRow(
    rowIndex: number,
    alignment: 'start' | 'center'
  ): number {
    const scrollContainer = this.scrollContainer
    const numRows = this.props.rows.length
    if (scrollContainer === null || numRows === 0) {
      return 0
    }

    const targetIndex = clamp(Math.floor(rowIndex), 0, numRows - 1)
    let offset = 0
    for (let i = 0; i < targetIndex; i++) {
      offset += this.props.getRowHeight(i)
    }

    const scrollTop =
      alignment === 'center'
        ? offset +
          this.props.getRowHeight(targetIndex) / 2 -
          scrollContainer.clientHeight / 2
        : offset

    return clamp(scrollTop, 0, this.getMaxScrollTop())
  }

  private onMouseMove = (event: MouseEvent) => {
    if (this.dragViewport === null || this.containerRef.current === null) {
      return
    }
    const offsetY = event.clientY - this.dragContainerTop
    this.queueDragScroll(offsetY - this.dragOffset)
  }

  private onMouseUp = () => {
    this.flushQueuedDragScroll()
    this.resetDragState()
    this.removeDragListeners()
    this.scheduleViewportUpdate()
  }

  private resetDragState() {
    this.dragOffset = 0
    this.dragContainerTop = 0
    this.dragViewport = null
    this.pendingDragTrackTop = null
  }

  private removeDragListeners() {
    window.removeEventListener('mousemove', this.onMouseMove)
    window.removeEventListener('mouseup', this.onMouseUp)
  }

  private queueDragScroll(trackTop: number) {
    this.pendingDragTrackTop = trackTop

    if (this.dragScrollFrameHandle !== null) {
      return
    }

    this.dragScrollFrameHandle = window.requestAnimationFrame(() => {
      this.dragScrollFrameHandle = null
      this.flushQueuedDragScroll()
    })
  }

  private flushQueuedDragScroll() {
    if (this.dragScrollFrameHandle !== null) {
      window.cancelAnimationFrame(this.dragScrollFrameHandle)
      this.dragScrollFrameHandle = null
    }

    const trackTop = this.pendingDragTrackTop
    this.pendingDragTrackTop = null

    if (trackTop === null || this.dragViewport === null) {
      return
    }

    this.scrollFromTrackPosition(trackTop)
  }

  private scrollFromTrackPosition(trackTop: number) {
    const geometry = this.getMinimapGeometry()
    const viewport = this.getViewportGeometry()

    if (geometry === null || viewport === null) {
      return
    }

    const maxScrollTop = this.getMaxScrollTop()
    if (maxScrollTop === 0 || geometry.minimapRowHeight <= 0) {
      return
    }

    const maxTrackTop = Math.max(0, geometry.canvasHeight - viewport.height)
    const clampedTop = clamp(trackTop, 0, maxTrackTop)

    if (this.dragViewport !== null) {
      this.dragViewport = { top: clampedTop, height: viewport.height }
      this.scheduleViewportUpdate()
    }

    // Track position → row index → scrollTop via real row heights, same
    // reasoning as in computeClickJump. The edge clamps make sure dragging
    // to the canvas extremes always reaches scrollTop 0 / max even when
    // the row-iteration would only converge asymptotically.
    let scrollTop: number
    if (clampedTop <= 0) {
      scrollTop = 0
    } else if (clampedTop >= maxTrackTop) {
      scrollTop = maxScrollTop
    } else {
      // Invert the parallax formula: top = thumbAbsTop * maxTop / maxThumbTop,
      // so thumbAbsTop = clampedTop * maxThumbTop / maxTop. Using scrollOffset
      // here would create a feedback loop because scrollOffset itself depends
      // on the scroll position we're trying to set.
      const maxThumbTop = Math.max(
        0,
        geometry.minimapTotalHeight - viewport.height
      )
      const thumbAbsTop = (clampedTop / maxTrackTop) * maxThumbTop
      const rowIndex = thumbAbsTop / geometry.minimapRowHeight
      scrollTop = this.getScrollTopForRow(rowIndex, 'start')
    }

    this.props.onScrollToPosition(scrollTop)
  }

  private onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const scrollContainer = this.scrollContainer
    if (scrollContainer === null) {
      return
    }

    const maxScrollTop = this.getMaxScrollTop()
    const pageSize = Math.max(
      KeyboardScrollStep,
      Math.floor(scrollContainer.clientHeight * 0.9)
    )

    let nextScrollTop: number | null = null

    switch (event.key) {
      case 'ArrowUp':
        nextScrollTop = scrollContainer.scrollTop - KeyboardScrollStep
        break
      case 'ArrowDown':
        nextScrollTop = scrollContainer.scrollTop + KeyboardScrollStep
        break
      case 'PageUp':
        nextScrollTop = scrollContainer.scrollTop - pageSize
        break
      case 'PageDown':
        nextScrollTop = scrollContainer.scrollTop + pageSize
        break
      case 'Home':
        nextScrollTop = 0
        break
      case 'End':
        nextScrollTop = maxScrollTop
        break
      default:
        return
    }

    event.preventDefault()
    this.props.onScrollToPosition(clamp(nextScrollTop, 0, maxScrollTop))
  }

  private onWheel = (event: WheelEvent) => {
    const scrollContainer = this.scrollContainer
    if (scrollContainer === null || this.getMaxScrollTop() === 0) {
      return
    }

    event.preventDefault()
    this.queueWheelScroll(this.getWheelScrollDelta(event, scrollContainer))
  }

  private queueWheelScroll(delta: number) {
    this.pendingWheelDelta += delta

    if (this.wheelScrollFrameHandle !== null) {
      return
    }

    this.wheelScrollFrameHandle = window.requestAnimationFrame(() => {
      this.wheelScrollFrameHandle = null
      this.flushQueuedWheelScroll()
    })
  }

  private flushQueuedWheelScroll() {
    if (this.wheelScrollFrameHandle !== null) {
      window.cancelAnimationFrame(this.wheelScrollFrameHandle)
      this.wheelScrollFrameHandle = null
    }

    const delta = this.pendingWheelDelta
    this.pendingWheelDelta = 0

    const scrollContainer = this.scrollContainer
    const maxScrollTop = this.getMaxScrollTop()
    if (delta === 0 || scrollContainer === null || maxScrollTop === 0) {
      return
    }

    scrollContainer.scrollTop = clamp(
      scrollContainer.scrollTop + delta,
      0,
      maxScrollTop
    )
  }

  private getWheelScrollDelta(event: WheelEvent, scrollContainer: HTMLElement) {
    switch (event.deltaMode) {
      case 1:
        return event.deltaY * this.getDiffLineHeight()
      case 2:
        return (
          event.deltaY *
          Math.max(1, Math.floor(scrollContainer.clientHeight * 0.9))
        )
      default:
        return event.deltaY
    }
  }

  private getPalette(container: HTMLElement): IMinimapPalette {
    const styles = window.getComputedStyle(container)
    const read = (name: string, fallback: string) =>
      styles.getPropertyValue(name).trim() || fallback
    return {
      background: read('--diff-minimap-background-color', '#f6f8fa'),
      border: read('--diff-border-color', '#d0d7de'),
      context: read('--diff-text-color', '#24292f'),
      added: read('--diff-add-inner-background-color', '#2da44e'),
      deleted: read('--diff-delete-inner-background-color', '#cf222e'),
      hunk: read('--diff-hunk-text-color', '#57606a'),
      addedBackground: read('--diff-add-border-color', '#dafbe1'),
      deletedBackground: read('--diff-delete-border-color', '#ffebe9'),
      hunkBackground: read('--diff-hunk-background-color', '#ddf4ff'),
    }
  }
}

function isMergeableChange(row: SimplifiedDiffRow) {
  return row.type === DiffRowType.Added || row.type === DiffRowType.Deleted
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}
