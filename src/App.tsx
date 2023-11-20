import { CSSProperties, useCallback, useEffect, useState } from 'react'
import { format } from 'date-fns';
import { BlockEntity, BlockUUIDTuple, IDatom } from '@logseq/libs/dist/LSPlugin.user';
import { useTranslation } from "react-i18next";
import i18n from "i18next";
import { db, Box } from './db';
import './App.css'
import { useLiveQuery } from 'dexie-react-hooks';

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

const encodeLogseqFileName = (name: string) => {
  // Encode characters that are not allowed in windows file name.
  if (!name) return '';
  return name
    .replace(/</g, '%3C')
    .replace(/>/g, '%3E')
    .replace(/:/g, '%3A')
    .replace(/"/g, '%22')
    .replace(/\//g, '___')
    .replace(/\\/g, '%5C')
    .replace(/\|/g, '%7C')
    .replace(/\?/g, '%3F')
    .replace(/\*/g, '%2A');
};

const decodeLogseqFileName = (name: string) => {
  if (!name) return '';
  return name
    .replace(/%3C/g, '<')
    .replace(/%3E/g, '>')
    .replace(/%3A/g, ':')
    .replace(/%22/g, '"')
    .replace(/___/g, '/')
    .replace(/%5C/g, '\\')
    .replace(/%7C/g, '|')
    .replace(/%3F/g, '?')
    .replace(/%2A/g, '*');
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
        const ma = (block as BlockEntity).content.match(/\(..\/assets\/(.+\.(png|jpg|jpeg))/);
        if (ma) {
          image = ma[1];
          console.log("asset: " + ma[1]);
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
  let path = '';
  for (const block of changes.blocks) {
    if (Object.prototype.hasOwnProperty.call(block, 'path')) {
      if (changes.txData.length === 0) continue;
      if (changes.txData[0][1] === 'lastModifiedAt') {
        operation = 'modified';
        path = block.path;
        console.log("File modified: " + block.path);
        break;
      }
    }
  }
  if (operation === '') {
    for (const data of changes.txData) {
      if (data.length === 5 && data[1] === 'path') {
        path = data[2];
        let createOrDelete: Operation = 'create';
        if (data[4] === false) {
          createOrDelete = 'delete';
        }
        operation = createOrDelete;
        console.log(`File ${createOrDelete}: ${path}`);
        break;
      }
    }
  }
  return [operation, path];
};

const dirHandles: { [graphName: string]: FileSystemDirectoryHandle } = {};


function App() {
  const [currentDirHandle, setCurrentDirHandle] = useState<FileSystemDirectoryHandle>();
  const [currentGraph, setCurrentGraph] = useState<string>('');
  const [preferredDateFormat, setPreferredDateFormat] = useState<string>('');
  const [preferredFormat, setPreferredFormat] = useState<MarkdownOrOrg>('markdown');
  const [loading, setLoading] = useState<boolean>(true);
  const [loadedCardCount, setLoadedCardCount] = useState<number>(0);
  const [selectedBox, setSelectedBox] = useState<number>(0);

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

      setLoadedCardCount(0);

      setCurrentDirHandle(dirHandles[currentGraph]); // undefined or FileSystemDirectoryHandle

      setCurrentGraph(currentGraph);
    });
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);

    const pages = await logseq.Editor.getAllPages();
    if (!pages) return [];

    setLoadedCardCount(0);

    const promises = [];
    for (const page of pages) {
      if (page['journal?']) continue;

      promises.push((async () => {
        const updatedTime = await getLastUpdatedTime(encodeLogseqFileName(page.originalName), currentDirHandle!, preferredFormat);
        if (updatedTime === 0) return;

        await db.box.put({
          graph: currentGraph,
          name: page.originalName,
          uuid: page.uuid,
          time: updatedTime,
          summary: [],
          image: '',
        });

        setLoadedCardCount(loadedCardCount => loadedCardCount + 1);

        // Load summary asynchronously
        const blocks = await logseq.Editor.getPageBlocksTree(page.uuid);

        const [summary, image] = getSummary(blocks);

        // Use compound key
        await db.box.update([currentGraph, page.originalName], {
          summary,
          image,
        });
      })());
    }

    await Promise.all(promises);

    setLoading(false);
  }, [currentDirHandle, currentGraph, preferredFormat]);

  useEffect(() => {
    if (currentDirHandle) {
      db.box.where('graph').equals(currentGraph).count().then(count => {
        if (count > 0) {
          setLoading(false);
          setLoadedCardCount(count);
        }
        else {
          fetchData();
        }
      });
    }
  }, [currentDirHandle, currentGraph, fetchData]);

  useEffect(() => {
    const onFileChanged = async (changes: FileChanges) => {
      const [operation, path] = parseOperation(changes);
  
      // Ignore create event because the file is not created yet.
      if ((operation == 'modified' || operation == 'delete')
        && currentDirHandle !== undefined) {
        const ma = path.match(/pages\/(.*)\.(md|org)/);
        if (ma) {
          const fileName = ma[1];
          const format: MarkdownOrOrg = ma[1] === 'md' ? 'markdown' : 'org';
  
          let updatedTime = 0;
  
          console.log(`${operation}, ${fileName}`);
  
          const originalName = decodeLogseqFileName(fileName);
          if (operation === 'modified') {
            updatedTime = await getLastUpdatedTime(fileName, currentDirHandle!, format);
            if (updatedTime === 0) {
              console.log('Failed to get updated time.');
              return;
            }
  
            const blocks = await logseq.Editor.getPageBlocksTree(originalName);
            const [summary, image] = getSummary(blocks);
  
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
          else if (operation === 'delete') {
            db.box.delete([currentGraph, originalName]);
          }
          else {
            console.log('Unknown operation: ' + operation);
          }
        }
      }
    };
    if (currentDirHandle) {
      // onChanged returns a function to unsubscribe.
      // Use 'return unsubscribe_function' to call unsubscribe_function
      // when component is unmounted, otherwise a lot of listeners will be left.
      const removeOnChanged = logseq.DB.onChanged(onFileChanged);
      return () => {
        removeOnChanged();
      }
    }
  }, [currentDirHandle, currentGraph]);

  useEffect(() => {
    const handleKeyDown = (e: { key: string; shiftKey: boolean; }) => {
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
  });

  const openDirectoryPicker = async () => {
    const handle = await window.showDirectoryPicker();
    // Cannot get full path of the selected directory because of security reason.
    // Check only the directory name
    if (handle.name === 'pages') {
      dirHandles[currentGraph] = handle;
      setCurrentDirHandle(handle);
    }
    else {
      alert(t('please-select-pages'));
    }
  };

  const rebuildData = useCallback(async () => {
    await db.box.where('graph').equals(currentGraph).delete();
    fetchData();
  }, [currentGraph, fetchData]);


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
    if (e.shiftKey) {
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
          <div className='loading' style={{ display: loading && currentDirHandle != undefined ? 'block' : 'none' }}>
            {t("loading")}
          </div>
          <div className='card-number'>
            {loading ? loadedCardCount : cardboxes?.length ?? 0} cards
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
          <button className='rebuild-btn' style={{ display: currentDirHandle === undefined ? 'none' : 'block' }} onClick={() => rebuildData()}>
            {t("rebuild-btn")}
          </button>
        </div>
      </div>
      <div className='dir-not-selected' style={{ display: currentDirHandle === undefined ? 'block' : 'none' }}>
        <div className='open-pages-btn-label'>{t("open-pages-btn-label")}<br />
          ({currentGraph.replace('logseq_local_', '')}/pages)
        </div>
        <button className='open-pages-btn' onClick={() => openDirectoryPicker()}>
          {t("open-pages-btn")}
        </button>
      </div> <div id='tile' style={{ display: currentDirHandle === undefined ? 'none' : 'flex' }}>
        {boxElements}
      </div>
      <div className='footer'>
        {t("footer")}
      </div>
    </>
  )
}

export default App
