import { useEffect, useState } from 'react'
import { format } from 'date-fns';

import './App.css'



const getLastUpdatedTime = async (fileName: string, preferredDateFormat: string) => {
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
  if (!res) return "";

  // console.log(res);
  // Wed Nov 8 02:37:35 2023 +0900
  const regex = /(\w{3}) (\w{3}) (\d{1,2}) (\d{2}):(\d{2}):(\d{2}) (\d{4}) (\+\d{4})/;
  const match = res!.stdout.match(regex);
  if (match) {
    // remove timezone
    const date = new Date(`${match[1]} ${match[2]} ${match[1]} ${match[3]} ${match[4]}:${match[5]}:${match[6]} ${match[7]}`);
    const dateUserFormat = format(date, preferredDateFormat);
    return {
      formatted: dateUserFormat,
      unixTime: date.getTime(),
    };
  }
  return "";
};

type Box = {
  originalName: string;
  updatedTime: {
    formatted: string;
    unixTime: number;
  };
  uuid: string;
};

function App() {
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [currentGraph, setCurrentGraph] = useState<string>("");

  useEffect(() => {
    const fetchData = async () => {
      const { preferredDateFormat, currentGraph } = await logseq.App.getUserConfigs();
      const arr = currentGraph.split("/");
      setCurrentGraph(arr[arr.length - 1]);
      console.log("fetching...");

      const pages = await logseq.Editor.getAllPages();
      if (!pages) return [];
      for (const page of pages) {
        if (page["journal?"]) continue;

        const updatedTime = await getLastUpdatedTime(page.originalName.replace(/\//g, '___'), preferredDateFormat);

        if (updatedTime === "") continue;

        const box = {
          originalName: page.originalName,
          updatedTime,
          uuid: page.uuid,
        };
        console.log(box);
        setBoxes(boxes => [...boxes, box].sort((a, b) => b.updatedTime.unixTime - a.updatedTime.unixTime))
      }
    }
    fetchData();
  }, []);

  const boxOnClick = () => {
    setTimeout(() => { logseq.hideMainUI() }, 500);
  };

  const boxElements = boxes.map((box: Box) => (
    <a href={`logseq://graph/${currentGraph}?page=${box.uuid}`}>
      <div onClick={() => boxOnClick()}>
        {box.originalName}
        <span>
          {box.updatedTime.formatted}
        </span>
      </div>
    </a>
  ));

  return (
    <>
      <button onClick={() => logseq.hideMainUI()}>
        close
      </button>
      {boxElements}
    </>
  )
}

export default App
