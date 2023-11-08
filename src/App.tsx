import { useEffect } from 'react'
import './App.css'

const getLastUpdatedTime = async (fileName: string) => {
  const res = await logseq.Git.execCommand(['log', '-1', '--format="%ad"', '--', `pages/${fileName}.md`]);
  // console.log(res);
  // Wed Nov 8 02:37:35 2023 +0900
  const regex = /(\w{3}) (\w{3}) (\d{1,2}) (\d{2}):(\d{2}):(\d{2}) (\d{4}) (\+\d{4})/;
  const match = res.stdout.match(regex);
  if (match) {
    return `${match[1]} ${match[2]} ${match[1]} ${match[3]} ${match[4]}:${match[5]}:${match[6]} ${match[7]}`;
  }
  return "";
};

function App() {
  // const [count, setCount] = useState(0)

  useEffect(() => {
    const fetchData = async () => {
      const pages = await logseq.Editor.getAllPages();
      if (!pages) return [];
      for(const page of pages) {
        if (page["journal?"]) continue;

        const name = page.originalName.replace(/\//g, '___');
        const updatedTime = await getLastUpdatedTime(name);

        if (updatedTime === "") continue;

        const box = {
          name: page.originalName,
          updatedTime, 
          uuid: page.uuid,
        };
        console.log(box);
      }
//      const results = await Promise.all(pages.map(page =>));

//      console.log(results);
      /*
        return {
          updatedAt: new Date(page.updatedAt).toUTCString(),
          name,
        };
      });
      const results = pages.sort((a, b) => {
        return a.updatedAt > b.updatedAt ? -1 : 1
      })
    */
    }
    fetchData();


  }, []);

return (
  <>
    <button onClick={() => logseq.hideMainUI()}>
      close
    </button>

  </>
)
}

export default App
