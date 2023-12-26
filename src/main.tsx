import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import "@fontsource/roboto"
import "@fontsource/roboto/700.css"
import '@fontsource/noto-sans-jp'
import '@fontsource/noto-sans-jp/700.css'
import './main.css'
import '@logseq/libs'
import './i18n/configs';
import { SimpleCommandKeybinding } from '@logseq/libs/dist/LSPlugin'

function main() {
  // Ctrl+Shift+Enter or Command+Shift+Enter
  /*
  logseq.App.registerCommandShortcut(
    { binding: 'mod+shift+enter' },
    () => logseq.showMainUI(),
    );
  */
  // It might be more in line with the Logseq way to register it in the command palette. 
  // In this case, it's also possible to assign a name to the shortcut."
  const command: {
    key: string;
    keybinding: SimpleCommandKeybinding
    label: string;
  } =  {
    key: 'cardbox:open',
    keybinding: {
      binding: 'mod+shift+enter',
      mode: 'global',
    },
    label: 'Open CardBox',
  };
  logseq.App.registerCommandPalette(command, () => logseq.showMainUI());

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
}

// bootstrap

logseq.ready({
  openCardBox: () => {
    logseq.showMainUI();
  }
}, main).catch(console.error)
