import { CSSProperties, useCallback, useEffect, useState } from 'react'
import { format } from 'date-fns';
import { BlockEntity, BlockUUIDTuple, IDatom } from '@logseq/libs/dist/LSPlugin.user';
import { useTranslation } from "react-i18next";
import i18n from "i18next";
import { db, Box } from './db';
import './App.css'
import { useLiveQuery } from 'dexie-react-hooks';
import { Dialog } from './Dialog';

type Operation = 'create' | 'modified' | 'delete' | '';

type MarkdownOrOrg = 'markdown' | 'org';

type ParentBlocks =
  {
    blocks: (BlockEntity | BlockUUIDTuple)[];
    index: number;
  };

type FileChanges = {
  blocks: BlockEntity[];
  txData: IDatom[];
  txMeta?: {
    outlinerOp: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any;
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const encodeLogseqFileName = (name: string) => {
  // Encode characters that are not allowed in file name.
  if (!name) return '';
  return name
    .replace(/\/$/, '') // Remove trailing slash
    .replace(/^(CON|PRN|AUX|NUL|COM1|COM2|COM3|COM4|COM5|COM6|COM7|COM8|COM9|LPT1|LPT2|LPT3|LPT4|LPT5|LPT6|LPT7|LPT8|LPT9)$/, '$1___')
    .replace(/\.$/, '.___')
    .replace(/_\/_/g, '%5F___%5F')
    .replace(/</g, '%3C')
    .replace(/>/g, '%3E')
    .replace(/:/g, '%3A')
    .replace(/"/g, '%22')
    .replace(/\//g, '___')
    .replace(/\\/g, '%5C')
    .replace(/\|/g, '%7C')
    .replace(/\?/g, '%3F')
    .replace(/\*/g, '%2A')
    .replace(/#/g, '%23');
};

const decodeLogseqFileName = (name: string) => {
  if (!name) return '';

  // Cannot restore trailing slash because it is not saved in local file.
  return name
    .replace(/^(CON|PRN|AUX|NUL|COM1|COM2|COM3|COM4|COM5|COM6|COM7|COM8|COM9|LPT1|LPT2|LPT3|LPT4|LPT5|LPT6|LPT7|LPT8|LPT9)___$/, '$1')
    .replace(/\.___$/, '.')
    .replace(/%5F___%5F/g, '_/_')
    .replace(/%3C/g, '<')
    .replace(/%3E/g, '>')
    .replace(/%3A/g, ':')
    .replace(/%22/g, '"')
    .replace(/___/g, '/')
    .replace(/%5C/g, '\\')
    .replace(/%7C/g, '|')
    .replace(/%3F/g, '?')
    .replace(/%2A/g, '*')
    .replace(/%23/g, '#');
};

const getLastUpdatedTime = async (fileName: string, handle: FileSystemDirectoryHandle, preferredFormat: MarkdownOrOrg): Promise<number> => {
  // Cannot get from subdirectory.
  // const path = `pages/${fileName}.md`;
  let path = fileName + (preferredFormat === 'markdown' ? '.md' : '.org');

  let fileHandle = await handle.getFileHandle(path).catch(() => {
    // Logseq does not save an empty page as a local file.
    console.log(`Failed to get file handle: ${path}`);
    return null;
  });
  if (!fileHandle) {
    path = fileName + (preferredFormat === 'markdown' ? '.org' : '.md');
    console.log(`Retry: ${path}`);
    fileHandle = await handle.getFileHandle(path).catch(() => {
      // Logseq does not save an empty page as a local file.
      console.log(`Failed to get file handle: ${path}`);
      return null;
    });
  }

  if (!fileHandle) return 0;

  const file = await fileHandle.getFile();
  const date = new Date(file.lastModified);

  return date.getTime();
};

const getSummary = (blocks: BlockEntity[]): [string[], string] => {
  const max = 100;
  let total = 0;
  const summary = [];
  let image = '';
  const parentStack: ParentBlocks[] = [];

  if (blocks && blocks.length > 0) {
    parentStack.push({
      blocks,
      index: 0,
    });

    while (total < max) {
      let currentParent: ParentBlocks = parentStack[parentStack.length - 1];
      while (currentParent.index >= currentParent.blocks.length) {
        parentStack.pop();
        if (parentStack.length === 0) break;
        currentParent = parentStack[parentStack.length - 1];
      }
      if (parentStack.length === 0) break;

      const block = currentParent.blocks[currentParent.index++];

      if (Object.prototype.hasOwnProperty.call(block, 'id')) {
        let content = (block as BlockEntity).content.substring(0, max);
        if (parentStack.length > 1) {
          content = '  '.repeat(parentStack.length - 1) + '* ' + content;
        }
        total += content.length;
        summary.push(content);

        if ((block as BlockEntity).children && (block as BlockEntity).children!.length > 0) {
          parentStack.push({
            blocks: (block as BlockEntity).children!,
            index: 0,
          });
        }
      }
    }

    // Search embedded image
    parentStack.splice(0, parentStack.length);
    parentStack.push({
      blocks,
      index: 0,
    });

    while (parentStack.length > 0) {
      let currentParent: ParentBlocks = parentStack[parentStack.length - 1];
      while (currentParent.index >= currentParent.blocks.length) {
        parentStack.pop();
        if (parentStack.length === 0) break;
        currentParent = parentStack[parentStack.length - 1];
      }
      if (parentStack.length === 0) break;

      const block = currentParent.blocks[currentParent.index++];

      if (Object.prototype.hasOwnProperty.call(block, 'id')) {
        // Markdown ![xxx](../assets/xxx.png)
        // Org mode [[../assets/xxx.png]]
        const ma = (block as BlockEntity).content.match(/[[(]..\/assets\/(.+\.(png|jpg|jpeg))[\])]/i);
        if (ma) {
          image = ma[1];
          // console.log("asset: " + ma[1]);
          break;
        }
        //            summary.push(content);

        if ((block as BlockEntity).children && (block as BlockEntity).children!.length > 0) {
          parentStack.push({
            blocks: (block as BlockEntity).children!,
            index: 0,
          });
        }
      }
    }
  }
  return [summary, image];
};

const parseOperation = (changes: FileChanges): [Operation, string] => {
  let operation: Operation = '';
  let originalName = '';
  // console.log(changes);
  for (const block of changes.blocks) {
    if (Object.prototype.hasOwnProperty.call(block, 'path')) {
      if (changes.txData.length === 0) continue;
      if (changes.txData[0][1] === 'file/last-modified-at') {
        const path = block.path;
        const ma = path.match(/pages\/(.*)\.(md|org)/);
        if (ma) {
          const fileName = ma[1];

          originalName = decodeLogseqFileName(fileName);

          operation = 'modified';

          // console.log("File modified: " + originalName);

          return [operation, originalName];
        }
      }
    }
  }

  for (const data of changes.txData) {
    if (data.length === 5 && data[1] === 'block/original-name') {
      originalName = data[2];
      let createOrDelete: Operation = 'create';
      if (data[4] === false) {
        createOrDelete = 'delete';
      }
      else {
        console.log(`created, ${originalName}`);
      }
      operation = createOrDelete;

      return [operation, originalName];
    }
  }

  return [operation, originalName];
};

const dirHandles: { [graphName: string]: FileSystemDirectoryHandle } = {};


function App() {
  const [currentDirHandle, setCurrentDirHandle] = useState<FileSystemDirectoryHandle>();
  const [currentGraph, setCurrentGraph] = useState<string>('');
  const [preferredDateFormat, setPreferredDateFormat] = useState<string>('');
  const [preferredFormat, setPreferredFormat] = useState<MarkdownOrOrg>('markdown');
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedBox, setSelectedBox] = useState<number>(0);
  const [open, setOpen] = useState<boolean>(false);

  const { t } = useTranslation();

  const cardboxes = useLiveQuery(
    () => db.box
      .orderBy('time')
      .reverse()
      .filter(box => box.graph === currentGraph)
      .toArray()
    , [currentGraph]);

  useEffect(() => {
    const getUserConfigs = async () => {
      const { currentGraph, preferredDateFormat, preferredLanguage, preferredFormat } = await logseq.App.getUserConfigs();
      setCurrentGraph(currentGraph);
      setPreferredDateFormat(preferredDateFormat);
      setPreferredFormat(preferredFormat);
      i18n.changeLanguage(preferredLanguage);
    };
    getUserConfigs();

    return logseq.App.onCurrentGraphChanged(async () => {
      const { currentGraph } = await logseq.App.getUserConfigs();

      setCurrentDirHandle(dirHandles[currentGraph]); // undefined or FileSystemDirectoryHandle

      setCurrentGraph(currentGraph);
    });
  }, []);

  const fetchData = useCallback(() => {
    db.box.where('graph').equals(currentGraph).count().then(async count => {
      if (count > 0) {
        setLoading(false);
      }
      else {
        setLoading(true);

        // This currentGraph is not the same as the one in state.
        const { currentGraph } = await logseq.App.getUserConfigs();

        const pages = await logseq.Editor.getAllPages();
        if (!pages) return [];

        const promises = [];
        while (pages.length > 0) {
          const page = pages.shift();
          if (page) {
            if (page['journal?']) continue;

            promises.push((async () => {
              let updatedTime: number | undefined = 0;
              if (currentDirHandle) {
                updatedTime = await getLastUpdatedTime(encodeLogseqFileName(page.originalName), currentDirHandle!, preferredFormat);
              }
              else {
                // Skip Contents because page.updatedAt of Contents is always wrong.
                if (page.originalName === 'Contents') return;
                updatedTime = page.updatedAt;
              }
              if (!updatedTime) return;

              // Load summary asynchronously
              const blocks = await logseq.Editor.getPageBlocksTree(page.uuid).catch(err => {
                console.error(`Failed to get blocks: ${page.originalName}`);
                console.error(err);
                return null;
              });

              // Quick check for empty page
              if (!blocks || blocks.length === 0) {
                return;
              }
              const [summary, image] = getSummary(blocks);

              // Logseq has many meta pages that has no content. Skip them.
              // Detailed check for empty page
              if (summary.length > 0 && !(summary.length === 1 && summary[0] === '')) {
                await db.box.put({
                  graph: currentGraph,
                  name: page.originalName,
                  uuid: page.uuid,
                  time: updatedTime,
                  summary,
                  image,
                });
              }
            })());
          }
          if (!page || promises.length >= 100) {
            try {
              await Promise.all(promises);
            } catch (err) {
              console.error(err);
            }
            promises.splice(0, promises.length);
            // LiveQuery needs some time to update.
            await sleep(500);
          }

        }

        setLoading(false);
      }
    });
  }, [currentDirHandle, currentGraph, preferredFormat]);

  useEffect(() => fetchData(), [fetchData]);

  useEffect(() => {
    const onFileChanged = async (changes: FileChanges) => {
      const [operation, originalName] = parseOperation(changes);

      // Ignore create event because the file is not created yet.
      if (operation == 'modified' || operation == 'delete') {
        const updatedTime = new Date().getTime();
        console.log(`${operation}, ${originalName}, ${updatedTime}`);

        // A trailing slash in the title cannot be recovered from the file name. 
        // This is because they are removed during encoding.
        if (operation === 'modified') {
          const blocks = await logseq.Editor.getPageBlocksTree(originalName).catch(err => {
            console.error(`Failed to get blocks: ${originalName}`);
            console.error(err);
            return null;
          });
          if (!blocks) return;

          const [summary, image] = getSummary(blocks);

          if (summary.length > 0 && !(summary.length === 1 && summary[0] === '')) {
            const box = await db.box.get([currentGraph, originalName]);
            if (box) {
              db.box.update([currentGraph, originalName], {
                time: updatedTime,
                summary,
                image,
              });
            }
            else {
              // create
              const page = await logseq.Editor.getPage(originalName);
              if (page) {
                db.box.put({
                  graph: currentGraph,
                  name: originalName,
                  uuid: page.uuid,
                  time: updatedTime,
                  summary,
                  image,
                })
              }
            }
          }
          else {
            // Remove empty page
            console.log(`Empty page: ${originalName}`);
            db.box.delete([currentGraph, originalName]);
          }
        }
        else if (operation === 'delete') {
          db.box.delete([currentGraph, originalName]);
        }
        else {
          console.log('Unknown operation: ' + operation);
        }

      }
    };

    // onChanged returns a function to unsubscribe.
    // Use 'return unsubscribe_function' to call unsubscribe_function
    // when component is unmounted, otherwise a lot of listeners will be left.
    const removeOnChanged = logseq.DB.onChanged(onFileChanged);
    return () => {
      removeOnChanged();
    }
  }, [currentGraph]);

  useEffect(() => {
    const handleKeyDown = (e: { key: string; shiftKey: boolean; }) => {
      if (loading) return;
      const tile = document.getElementById('tile');
      if (!tile?.hasChildNodes()) {
        return;
      }
      const tileWidth = tile!.clientWidth - 24 * 2; // padding is 24px. clientWidth does not include scrollbar width.
      const tileHeight = tile!.offsetHeight;
      const tileTop = tile!.offsetTop;
      // margin-right is auto
      // margin-left must not be auto to avoid the layout becoming too dense
      const boxMarginRight = parseInt(window.getComputedStyle((tile!.children[0] as HTMLElement)).getPropertyValue('margin-right'));
      const boxWidth = (tile!.children[0] as HTMLElement).offsetWidth + 10 + boxMarginRight; // margin-left is 10px
      const boxHeight = (tile!.children[0] as HTMLElement).offsetHeight + 10 * 2; // margin is 10px

      const cols = Math.floor(tileWidth / boxWidth);
      const rows = Math.floor(tileHeight / boxHeight);
      if (e.key === 'ArrowUp') {
        setSelectedBox(selectedBox => {
          const newIndex = selectedBox - cols;
          if (newIndex < 0) {
            return selectedBox;
          }

          const boxTop = (tile!.children[selectedBox] as HTMLElement).offsetTop - tileTop - 10 - tile.scrollTop; // margin is 10px;
          if (Math.floor(boxTop / boxHeight) <= 1) {
            tile.scrollBy(0, -boxHeight);
          }
          return newIndex;
        });
      }
      else if (e.key === 'ArrowDown') {
        setSelectedBox(selectedBox => {
          const newIndex = selectedBox + cols;
          if (newIndex >= tile!.childElementCount) {
            return selectedBox;
          }
          const boxTop = (tile!.children[selectedBox] as HTMLElement).offsetTop - tileTop - 10 - tile.scrollTop; // margin is 10px;
          if (Math.floor(boxTop / boxHeight) >= rows - 1) {
            tile.scrollBy(0, boxHeight);
          }

          return newIndex;
        });
      }
      else if (e.key === 'ArrowRight') {
        setSelectedBox(selectedBox => {
          const newIndex = selectedBox + 1;
          if (newIndex >= tile!.childElementCount) {
            return selectedBox;
          }
          if (Math.floor(selectedBox / cols) !== Math.floor(newIndex / cols)) {
            const boxTop = (tile!.children[selectedBox] as HTMLElement).offsetTop - tileTop - 10 - tile.scrollTop; // margin is 10px;
            if (Math.floor(boxTop / boxHeight) >= rows - 1) {
              tile.scrollBy(0, boxHeight);
            }
          }
          return newIndex;
        });
      }
      else if (e.key === 'ArrowLeft') {
        setSelectedBox(selectedBox => {
          const newIndex = selectedBox - 1;
          if (newIndex < 0) {
            return selectedBox;
          }
          if (Math.floor(selectedBox / cols) !== Math.floor(newIndex / cols)) {
            const boxTop = (tile!.children[selectedBox] as HTMLElement).offsetTop - tileTop - 10 - tile.scrollTop; // margin is 10px;
            if (Math.floor(boxTop / boxHeight) <= 1) {
              tile.scrollBy(0, -boxHeight);
            }
          }
          return newIndex;
        });
      }
      else if (e.key === 'Enter') {
        const box = (document.getElementsByClassName('selectedBox')[0] as HTMLElement);
        if (e.shiftKey) {
          logseq.Editor.openInRightSidebar(box.id);
        }
        else {
          logseq.App.pushState('page', {
            name: box.getElementsByClassName('box-title')[0].innerHTML,
          });
        }
        logseq.hideMainUI();
      }

    };
    window.addEventListener('keydown', handleKeyDown);

    const handleResize = () => {
      const tile = document.getElementById('tile');
      if (!tile?.hasChildNodes()) {
        return;
      }
      for (let i = 0; i < tile!.children.length; i++) {
        const elm = tile!.children[i] as HTMLDivElement;
        const style = getBoxStyle(i);
        elm.style.marginRight = style.marginRight as string;
        elm.style.float = style.float as string;
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleResize);
    };
  }, [loading]);

  const openDirectoryPicker = useCallback(async () => {
    const handle = await window.showDirectoryPicker();
    // Cannot get full path of the selected directory because of security reason.
    // Check only the directory name
    if (handle.name === 'pages') {
      dirHandles[currentGraph] = handle;
      await db.box.where('graph').equals(currentGraph).delete();
      setCurrentDirHandle(handle);
      setOpen(false);
      // fetchData() is called when currentDirHandle is changed.
    }
    else {
      alert(t('please-select-pages'));
    }
  }, [currentGraph, t]);

  const getBoxStyle = (index: number): CSSProperties => {
    const tile = document.getElementById('tile');
    if (!tile?.hasChildNodes()) {
      return {
        marginRight: '10px',
        float: 'left',
      };
    }
    const tileWidth = tile!.clientWidth - 24 * 2; // padding is 24px. clientWidth does not include scrollbar width.
    const boxMarginRight = parseInt(window.getComputedStyle((tile!.children[0] as HTMLElement)).getPropertyValue('margin-right'));
    const boxWidth = (tile!.children[0] as HTMLElement).offsetWidth + 10 + boxMarginRight; // margin-left is 10px

    const cols = Math.floor(tileWidth / boxWidth);

    if (tile.style.display !== 'none') {
      tile.style.display = 'flex';
    }

    const idealCols = Math.floor(tileWidth / ((tile!.children[0] as HTMLElement).offsetWidth + 10 * 2));

    if (tile!.childElementCount <= idealCols) {
      // Because margin-right is auto, boxes in the first line are heavily spaced
      // when the total number of boxes is less than the number of columns.
      // Unset 'flex' to avoid this.
      if (tile.style.display !== 'none') {
        tile.style.display = 'block';
      }
      return {
        marginRight: '10px',
        float: 'left',
      };
    }
    else if (index >= tile!.childElementCount - tile!.childElementCount % cols)
      // This box is in last row
      // Because margin-right is auto, boxes in the last line are heavily spaced.
      // So, change to the same spacing as the other rows.
      return {
        marginRight: boxMarginRight + 'px',
        float: 'none',
      };

    return {
      marginRight: 'auto',
      float: 'none',
    };
  }

  const boxOnClick = async (box: Box, e: React.MouseEvent<HTMLDivElement>) => {
    if (e.nativeEvent.shiftKey) {
      logseq.Editor.openInRightSidebar(box.uuid);
    }
    else {
      logseq.App.pushState('page', {
        name: box.name,
      });
    }
    logseq.hideMainUI();
  };

  const getTimeString = (unixTime: number) => {
    const date = new Date(unixTime);
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
  };

  const boxElements = cardboxes?.map((box: Box, index) => (
    // Do not use uuid because pagebar is not shown properly.
    // <a href={`logseq://graph/${currentGraph}?page=${box.uuid}`}>
    // Calling deep link is very slow. Use pushState() instead.
    // <a href={`logseq://graph/${currentGraph}?page=${encodeURIComponent(box.originalName)}`}>

    <div className={'box' + (selectedBox === index ? ' selectedBox' : '')} onClick={e => boxOnClick(box, e)} style={getBoxStyle(index)} id={box.uuid}>
      <div className='box-title'>
        {box.name}
      </div>
      <div className='box-summary' style={{ display: box.image === '' ? 'block' : 'none' }}>
        {box.summary.map(item => (<>{item}<br /></>))}
      </div>
      <div className='box-image' style={{ display: box.image !== '' ? 'block' : 'none' }}>
        <img src={currentGraph.replace('logseq_local_', '') + '/assets/' + box.image} style={{ width: '140px' }} alt='(image)' />
      </div>
      <div className='box-date' style={{ display: 'none' }}>
        {format(box.time, preferredDateFormat)} {getTimeString(box.time)}
      </div>

    </div>
  ));


  return (
    <>
      <div className='control'>
        <div className='control-left'>
          <div className='loading' style={{ display: loading ? 'block' : 'none' }}>
            {t("loading")}
          </div>
          <div className='card-number'>
            {cardboxes?.length ?? 0} cards
          </div>
        </div>
        <div className='control-center'>
          <div className='cardbox-title'>CardBox</div>
        </div>
        <div className='control-right'>
          <div className='close-btn' onClick={() => logseq.hideMainUI()}>
            <span className='material-symbols-outlined'>
              close
            </span>
          </div>
          <button className='rebuild-btn' style={{ display: loading ? 'none' : 'block' }} onClick={async () => {
            if (currentDirHandle) {
              await db.box.where('graph').equals(currentGraph).delete();
              fetchData();
            }
            else {
              setOpen(true)
            }
          }}>
            {t("rebuild-btn")}
          </button>
          <Dialog isOpen={open} onClose={() => setOpen(false)}>
            <div className='open-pages-btn-label'>{t("open-pages-btn-label")}<br />
              ({currentGraph.replace('logseq_local_', '')}/pages)
            </div>
            <button className='open-pages-btn' onClick={() => openDirectoryPicker()}>
              {t("open-pages-btn")}
            </button>
          </Dialog>
        </div>
      </div >
      <div id='tile'>
        {boxElements}
      </div>
      <div className='footer'>
        {t("footer")}
      </div>
    </>
  )
}

export default App
