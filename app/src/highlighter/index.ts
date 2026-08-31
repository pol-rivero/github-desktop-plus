import { IHighlightRequest } from '../lib/highlighter/types'
import { highlightRequest } from './highlight'

onmessage = async (event: MessageEvent<IHighlightRequest>) => {
  postMessage(await highlightRequest(event.data))
}
