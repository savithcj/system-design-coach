import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import './ui/style.css'
import { startApp } from './ui/app'
import { getLog, getState } from './ui/store'

startApp()

// Read-only handle for Playwright; it exposes nothing the learner cannot already copy from Details.
if (import.meta.env.DEV) (window as unknown as { __sdc: unknown }).__sdc = { log: getLog, state: getState }
