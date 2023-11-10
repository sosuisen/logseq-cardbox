import { useEffect, useState } from 'react'
import { format } from 'date-fns';
import { BlockEntity, IDatom } from '@logseq/libs/dist/LSPlugin.user';
import './App.css'

type UpdatedTime = {
  time: string;
  unixTime: number;
};

type Box = {
  originalName: string;
  updatedTime: UpdatedTime;
};

type Operation = 'create' | 'modified' | 'delete' | '';

const DEFAULT_UPDATED_TIME: UpdatedTime = {
  time: '',
  unixTime: 0,
};

const encodeLogseqFileName = (name: string) => {
  // Encode characters that are not allowed in windows file name.
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

const getLastUpdatedTime = async (fileName: string, handle: FileSystemDirectoryHandle): Promise<UpdatedTime> => {
  // Cannot get from subdirectory.
  // const path = `pages/${fileName}.md`;
  const path = `${fileName}.md`;

  const fileHandle = await handle.getFileHandle(path).catch(() => {
    // Logseq does not save an empty page as a local file.
    console.log(`Failed to get file handle: ${path}`);
    return null;
  });

  if (!fileHandle) return DEFAULT_UPDATED_TIME;

  const file = await fileHandle.getFile();
  const date = new Date(file.lastModified);

  return {
    time: `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`,
    unixTime: date.getTime(),
  };
};

function App() {
  const [dirHandle, setDirHandle] = useState<FileSystemDirectoryHandle>();
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [currentGraph, setCurrentGraph] = useState<string>(''); 
  const [preferredDateFormat, setPreferredDateFormat] = useState<string>('');
  const [preferredLanguage, setPreferredLanguage] = useState<string>('');
  
  console.log(preferredLanguage);


  useEffect(() => {
    const getUserConfigs = async () => {
      const { currentGraph, preferredDateFormat, preferredLanguage } = await logseq.App.getUserConfigs();
      setCurrentGraph(currentGraph);
      setPreferredDateFormat(preferredDateFormat);
      setPreferredLanguage(preferredLanguage);
    };
    getUserConfigs();
  }, []);

  useEffect(() => {
    const onFileChanged = async (changes: {
      blocks: BlockEntity[];
      txData: IDatom[];
      txMeta?: {
        outlinerOp: string;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        [key: string]: any;
      };
    }) => {
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

      // Ignore create event because the file is not created yet.
      if ((operation == 'modified' || operation == 'delete')
        && dirHandle !== undefined) {
        const ma = path.match(/pages\/(.*)\.md/);
        if (ma) {
          const fileName = ma[1];
          const originalName = decodeLogseqFileName(fileName);
          let updatedTime: UpdatedTime = DEFAULT_UPDATED_TIME;
          console.log(`${operation}, ${fileName}`);

          if (operation === 'modified') {
            updatedTime = await getLastUpdatedTime(fileName, dirHandle!);
            if (updatedTime === DEFAULT_UPDATED_TIME) {
              console.log('Failed to get updated time.');
              return;
            }

            const box: Box = {
              originalName,
              updatedTime,
            };

            setBoxes(boxes => {
              const target = boxes.find(box => box.originalName === originalName ? true : false);
              if (target) {
                target.updatedTime = updatedTime;
                return [...boxes].sort((a, b) => b.updatedTime.unixTime - a.updatedTime.unixTime);
              }
              else {
                console.log('Not found in boxes. Create: ' + originalName);
                return [box, ...boxes];
              }
            });
          }
          else if (operation === 'delete') {
            setBoxes(boxes => [...boxes.filter(box => box.originalName !== originalName)])
          }
          else {
            console.log('Unknown operation: ' + operation);
          }
        }
      }
    };

    const fetchData = async () => {
      const pages = await logseq.Editor.getAllPages();
      if (!pages) return [];
      for (const page of pages) {
        if (page['journal?']) continue;

        const updatedTime = await getLastUpdatedTime(encodeLogseqFileName(page.originalName), dirHandle!);
        if (updatedTime === DEFAULT_UPDATED_TIME) continue;

        const box = {
          originalName: page.originalName,
          updatedTime,
        };
        console.log(box);
        setBoxes(boxes => [...boxes, box].sort((a, b) => b.updatedTime.unixTime - a.updatedTime.unixTime))
      }
    };

    if (dirHandle) {
      setBoxes([]);
      fetchData();

      // onChanged returns a function to unsubscribe.
      // Use 'return unsubscribe_function' to call unsubscribe_function
      // when component is unmounted, otherwise a lot of listeners will be left.
      return logseq.DB.onChanged(onFileChanged);
    }
  }, [dirHandle]);

  const openDirectoryPicker = async () => {
    const handle = await window.showDirectoryPicker();
    setDirHandle(handle);
  };

  const boxOnClick = async (box: Box, e: React.MouseEvent<HTMLDivElement>) => {
    if (e.shiftKey) {
      logseq.Editor.openInRightSidebar(box.originalName);
    }
    else {
      logseq.App.pushState('page', {
        name: box.originalName,
      });
    }
    logseq.hideMainUI();
  };

  const boxElements = boxes.map((box: Box) => (
    // Do not use uuid because pagebar is not shown properly.
    // <a href={`logseq://graph/${currentGraph}?page=${box.uuid}`}>
    // Calling deep link is very slow. Use pushState() instead.
    // <a href={`logseq://graph/${currentGraph}?page=${encodeURIComponent(box.originalName)}`}>

    <div className='box' onClick={e => boxOnClick(box, e)}>
      <div className='box-title'>
        {box.originalName}
      </div>
      <div className='box-date'>
        {format(box.updatedTime.unixTime, preferredDateFormat)}<br />
        {box.updatedTime.time}
      </div>
    </div>
  ));

  return (
    <>
      <div className='control'>
        <div className='control-left'></div>
        <div className='control-center'>
          <div className='cardbox-title'>CardBox</div>
        </div>
        <div className='control-right'>
          <div className='close-btn' onClick={() => logseq.hideMainUI()}>
            <span className='material-symbols-outlined'>
              close
            </span>
          </div>
          <button className='open-btn-control' style={{ display: dirHandle === undefined ? 'none' : 'block' }} onClick={() => openDirectoryPicker()}>
            pagesを再選択
          </button>
        </div>
      </div>
      <div className='dir-not-selected' style={{ display: dirHandle === undefined ? 'block' : 'none' }}>
        <div className='open-btn-label'>Logseqのグラフ保存先フォルダにあるpagesフォルダを選択してください。<br />
          ({currentGraph.replace('logseq_local_', '')}/pages)
        </div>
        <button className='open-btn' onClick={() => openDirectoryPicker()}>
          pagesを選択
        </button>
      </div>
      <div className='tile' style={{ display: dirHandle === undefined ? 'none' : 'flex' }}>
        {boxElements}
      </div>
      <div className='footer'>
        ※日誌やホワイトボードは含まれません。本文のないページは表示されません。
      </div>
    </>
  )
}

export default App
