# Logseq CardBox Plugin <img align="left" src="./images/cardbox_small.png" height="40" style="margin-right: 10px"> [<img align="right" src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" height="30"/>](https://www.buymeacoffee.com/hidekaz)

Plugin to add thumbnail cards to [Logseq](https://github.com/logseq/logseq) that are displayed in order of update.

![main](./images/screen-main.png)

## How to launch
Any of the following:
- "CardBox" button on the left sidebar
- Click the CardBox icon in the top right corner of the page
- Shortcut:
  - (Windows) Ctrl + Shift + Enter
  - (macOS) Cmd + Shift + Enter
 
![launch](./images/screen-launch.png)

## Folder selection
1. When you start Logseq and open CardBox, the folder selection screen shown below will appear.
2. As instructed, select the pages folder under the folder where the current graph is saved. 
3. After selection, only for the first time, the database rebuild process will start.

![main](./images/screen-select-folder.png)

## Selecting a card
- The thumbnail cards of the pages are ordered by the date of the last update, starting from the top left.
  - Only pages are displayed. The journal and whiteboard are not displayed.
- Click on a page or use the cursor keys to move the selection and press Enter to open it.
  - If you hold down Shift while performing the open operation, the page will open in the sidebar.

## Closing the CardBox
- Close CardBox by pressing the X button in the top right-hand corner or pressing the Esc key.

## Languages supported 
- English
- Japanese

You need to restart Logseq for the language change to take effect.

## Limitations
- Pages without body text are not displayed.
  - Logseq does not create .md files for title-only pages without body text. This plugin reads the modification time of the .md file directly, so pages with no file cannot be displayed.
- Logseq is currently in beta and cannot correctly manage page modification times. For this reason, this plugin needs a "Folder selection" operation to obtain the modification time.
  - By the time the official version of Logseq is released, the 'folder selection' operation will no longer be necessary.
- The 'folder selection' operation is only required once for each graph when Logseq is launched.
- Changes made directly to the .md file while Logseq is not running will not be reflected in the CardBox.
  - To reflect them, you need to press the 'Rebuild' button.
