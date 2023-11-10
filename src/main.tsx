import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import '@logseq/libs'
import './i18n/configs';
import { setDB } from './db';

function main() {
  // Ctrl+Shift+Enter or Command+Shift+Enter
  logseq.App.registerCommandShortcut(
    { binding: 'mod+shift+enter' },
    () => logseq.showMainUI(),
  );

  logseq.provideStyle(`
    @import url("https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0");
  `)

  logseq.setMainUIInlineStyle({
    position: 'fixed',
    zIndex: 20,
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

  const cardboxDiv = document.createElement('div');
  cardboxDiv.innerHTML = `
      <a class="item group flex items-center text-sm font-medium rounded-md">
          <span class="ui__icon ti ls-icon-calendar">
            <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-calendar" height="24" viewBox="0 -960 960 960" width="24"><path d="M120-520v-320h320v320H120Zm0 400v-320h320v320H120Zm400-400v-320h320v320H520Zm0 400v-320h320v320H520ZM200-600h160v-160H200v160Zm400 0h160v-160H600v160Zm0 400h160v-160H600v160Zm-400 0h160v-160H200v160Zm400-400Zm0 240Zm-240 0Zm0-240Z"/></svg>
          </span>
          <span class="flex-1">CardBox</span>
      </a>
  `;
  cardboxDiv.className = `cardbox-nav`;
  cardboxDiv.addEventListener('click', () => { logseq.showMainUI(); });

  const navHeader = window.parent.document.querySelector('.nav-header');
  const cardboxNav = navHeader!.querySelector(`.cardbox-nav`);
  if (cardboxNav) {
    navHeader!.removeChild(cardboxNav);
  }
  navHeader!.insertBefore(cardboxDiv, navHeader!.lastChild);

  logseq.App.getUserConfigs().then((configs) => {
    const dbName = configs.currentGraph;
    setDB(dbName);

    document.body.addEventListener('click', () => {
      logseq.hideMainUI();
    });

    document.getElementById('app')!.addEventListener('click', e => {
      e.stopPropagation();
    });

    ReactDOM.createRoot(document.getElementById('app')!).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    );
  });
}

// bootstrap

logseq.ready({
  openCardBox: () => {
    logseq.showMainUI();
  }
}, main).catch(console.error)

window.addEventListener("keydown", (event) => {
  switch (event.key) {
    case "Escape":
      logseq.hideMainUI();
      break;
    default:
      return;
  }
});