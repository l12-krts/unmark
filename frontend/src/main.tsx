import { Toast } from '@heroui/react'
import { MotionConfig } from 'motion/react'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import App from './App.tsx'
import './index.css'

// Keep following the system theme after launch (public/theme-init.js sets the first one).
const scheme = window.matchMedia('(prefers-color-scheme: dark)')
scheme.addEventListener('change', (e) => {
  const root = document.documentElement
  root.classList.toggle('dark', e.matches)
  root.classList.toggle('light', !e.matches)
  root.setAttribute('data-theme', e.matches ? 'dark' : 'light')
})

const root = document.getElementById('root')
if (!root) throw new Error('#root element missing')

createRoot(root).render(
  <StrictMode>
    {/* "user": honour prefers-reduced-motion in every Motion animation (fades stay, movement goes) */}
    <MotionConfig reducedMotion="user">
      <App />
      <Toast.Provider placement="bottom" />
    </MotionConfig>
  </StrictMode>,
)
