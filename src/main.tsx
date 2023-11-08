import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import '@logseq/libs'

function main() {
  logseq.provideStyle(`
    @import url("https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0");
  `)

  logseq.setMainUIInlineStyle({
    position: 'fixed',
    zIndex: 13,
  })

  logseq.App.registerUIItem('pagebar', {
    key: 'cardbox',
    template: `
    <a data-on-click="openCardBox" title="open cardbox">
      <span class="material-symbols-outlined">
      grid_view
      </span>
    </a> 
    `,
  });

  ReactDOM.createRoot(document.getElementById('app')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )

}

// bootstrap

logseq.ready({
  openCardBox: () => logseq.showMainUI()
}, main).catch(console.error)

//logseq.ready(main).catch(console.error)

