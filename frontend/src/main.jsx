import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './lib/authFetch.js' // must load before any component fetches data
import './index.css' // <-- THIS BRINGS TAILWIND TO LIFE

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)