// Runs the on-device language model (WebLLM) off the main thread.
import { WebWorkerMLCEngineHandler } from '@mlc-ai/web-llm';
const handler = new WebWorkerMLCEngineHandler();
self.onmessage = (m: MessageEvent) => handler.onmessage(m);
