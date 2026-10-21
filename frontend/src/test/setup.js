// Adds DOM matchers such as toBeInTheDocument() to Vitest's expect.
import '@testing-library/jest-dom/vitest'

// jsdom doesn't implement scrolling; React Router's <ScrollRestoration> calls it.
window.scrollTo = () => {}
