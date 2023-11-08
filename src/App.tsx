import { useEffect, useState } from 'react'
import { format } from 'date-fns';
import './App.css'
import { PageEntity } from '@logseq/libs/dist/LSPlugin.user';
// import { BlockEntity, IDatom } from '@logseq/libs/dist/LSPlugin.user';

const getLastUpdatedTime = async (page: PageEntity, preferredDateFormat: string, handle: FileSystemDirectoryHandle) => {
  // Encode characters that are not allowed in windows file name.
  const fileName = page.originalName
    .replace(/</g, '%3C')
    .replace(/>/g, '%3E')
    .replace(/:/g, '%3A')
    .replace(/"/g, '%22')
    .replace(/\//g, '___')
    .replace(/\\/g, '%5C')
    .replace(/\|/g, '%7C')
    .replace(/\?/g, '%3F')
    .replace(/\*/g, '%2A');

  // Cannot get from subdirectory.
  // const path = `pages/${fileName}.md`;
  const path = `${fileName}.md`;
  // console.log(path);
  const fileHandle = await handle.getFileHandle(path).catch(() => {
    // Empty page is not saved as a file.
    console.log(`Failed to get file handle: ${path}`);
    // console.log(page);
    return null;
  });
  if (!fileHandle) return '';
  const file = await fileHandle.getFile();

  // console.log(file.lastModified);
  const date = new Date(file.lastModified);

  const dateUserFormat = format(date, preferredDateFormat);
  // console.log(dateUserFormat);
  return {
    formattedDate: dateUserFormat,
    time: `${date.getHours()}:${date.getMinutes()}:${date.getSeconds()}`,
    unixTime: date.getTime(),
  };

  /*
    let res;
    let attempts = 0;
    const maxRetries = 7;
  
    while (attempts < maxRetries) {
  
      res = await logseq.Git.execCommand(['log', '-1', '--format="%ad"', '--', `pages/${fileName}.md`]).catch(e => {
        console.log(`Attempt ${attempts + 1} for ${fileName} failed:`, e);
        attempts++;
        if (attempts >= maxRetries) {
          console.log(`Failed after ${maxRetries} attempts: ${fileName}`);
        }
      });
      if (res) break;
    }
    if (!res) return '';
  
    // Wed Nov 8 02:37:35 2023 +0900
    const regex = /(\w{3}) (\w{3}) (\d{1,2}) (\d{2}):(\d{2}):(\d{2}) (\d{4}) (\+\d{4})/;
    const match = res!.stdout.match(regex);
    if (match) {
      // remove timezone
      const date = new Date(`${match[1]} ${match[2]} ${match[1]} ${match[3]} ${match[4]}:${match[5]}:${match[6]} ${match[7]}`);
      const dateUserFormat = format(date, preferredDateFormat);
      return {
        formattedDate: dateUserFormat,
        time: `${match[4]}:${match[5]}:${match[6]}`,
        unixTime: date.getTime(),
      };
    }
    return '';
    */
};

type Box = {
  originalName: string;
  updatedTime: {
    formattedDate: string;
    time: string;
    unixTime: number;
  };
  uuid: string;
};

function App() {
  const [dirHandle, setDirHandle] = useState<FileSystemDirectoryHandle>();

  const [boxes, setBoxes] = useState<Box[]>([]);
  // const [currentGraph, setCurrentGraph] = useState<string>('');

  useEffect(() => {
    const fetchData = async () => {
      const { preferredDateFormat } = await logseq.App.getUserConfigs();
      // const arr = currentGraph.split('/');
      // setCurrentGraph(arr[arr.length - 1]);

      const pages = await logseq.Editor.getAllPages();
      if (!pages) return [];
      for (const page of pages) {
        if (page['journal?']) continue;

        const updatedTime = await getLastUpdatedTime(page, preferredDateFormat, dirHandle!);
        if (updatedTime === '') continue;

        const box = {
          originalName: page.originalName,
          updatedTime,
          uuid: page.uuid,
        };
        // console.log(box);
        setBoxes(boxes => [...boxes, box].sort((a, b) => b.updatedTime.unixTime - a.updatedTime.unixTime))
      }
    };

    if (dirHandle) {
      fetchData();
    }
  }, [dirHandle]);

  const openDirectoryPicker = async () => {
    const handle = await window.showDirectoryPicker();
    setDirHandle(handle);
  };

  const boxOnClick = async (box: Box, e: React.MouseEvent<HTMLDivElement>) => {
    if (e.shiftKey) {
      logseq.Editor.openInRightSidebar(box.uuid);
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
    // deeplink is very slow. Use pushState() instead.
    // <a href={`logseq://graph/${currentGraph}?page=${encodeURIComponent(box.originalName)}`}>
    <div className='box' onClick={e => boxOnClick(box, e)}>
      <div className='box-title'>
        {box.originalName}
      </div>
      <div className='box-date'>
        {box.updatedTime.formattedDate}<br />
        {box.updatedTime.time}
      </div>
    </div>
  ));

  return (
    <>
      <div className='control'>
        <span className='cardbox-title'>CardBox</span>
        <button className='open-btn' onClick={() => openDirectoryPicker()}>
          pagesを選択
        </button>
        { dirHandle === undefined && <div className='open-btn-label'>Logseqのグラフの保存先にあるpagesディレクトリを選択してください。</div> }
        <button className='close-btn' onClick={() => logseq.hideMainUI()}>
          close
        </button>
      </div>
      <div className='tile'>
        {boxElements}
      </div>
    </>
  )
}

export default App
