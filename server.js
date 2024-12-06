const express = require("express");
const axios = require("axios");
const puppeteer = require('puppeteer');
const cors = require("cors");
const fs = require("fs");
const cheerio = require('cheerio');
const app = express();
const port = 3000;

app.use(cors())


app.get("/search", async (req, res) => {
  const st = req.query.q;
  const modifiedSearchString = st.replace(/ /g, '-');
  console.log(modifiedSearchString);

  const h = await axios.get(`https://123-movies.vc/search/${modifiedSearchString}`);
  const html = h.data;
  
  const $ = cheerio.load(html);
  const movies = [];
  
  $('.film-poster').each((i, element) => {
      const movie = {};
      const $element = $(element);

      movie.link = $element.find('.film-poster-ahref').attr('href');
      movie.title = $element.find('.film-poster-img').attr('title');
      movie.image = $element.find('.film-poster-img').attr('data-src');
      movie.quality = $element.find('.pick.film-poster-quality').text().trim();

      // Extract additional details
      const details = [];
      $element.find('.film-infor span').each((j, detail) => {
          details.push($(detail).text());
      });

      movie.year = details[0];
      movie.durationOrRating = details[1];
      movie.type = details[2];

      movies.push(movie);
  });

  res.json(movies);
});


async function getvidcloud(prevlink) {
  const r = await axios.get("https://123-movies.vc/ajax/episode/list/" + prevlink.split("-").pop())
  const r1 = r.data
  const linkid = r1.split(`data-linkid="`)[1].split(`"`)[0]
  const lol2 = await axios.get(`https://123-movies.vc/ajax/episode/sources/${linkid}`)
  return lol2.data.link
}



app.get("/startdownload", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const sendEvent = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const moviename = req.query.movname;
  const movielink = req.query.link;

  const webreq = await axios.get("https://123-movies.vc/" + movielink);
  const websitehtml = webreq.data;
  
  
  const moviedesc = websitehtml
    .split(`<div class="description">`)[1]
    .split(`</div>`)[0];
  const moviethumbnail = websitehtml
    .split(`<meta property="og:image" content="`)[1]
    .split(`"/>`)[0];

  sendEvent({ movieinfo: [moviename, moviedesc, moviethumbnail] });
  
  const filev = await getvidcloud("https://123-movies.vc/" + movielink)
  console.log(filev)

  if (filev.includes("404?")) {
    sendEvent({ error: "We can't find the file you are looking for. It maybe got deleted by the owner or was removed due a copyright violation." });
    res.end();
  }
  console.log("browser loading")
  const browser = await puppeteer.launch({
    args: [
      //"--window-size=1200x800",
      "--no-sandbox",
      "--disable-setuid-sandbox",
    ],
  });
  console.log("browser launched")
  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
  );

  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
  });

  await page.setRequestInterception(true);

  page.on("request", (request) => {
    console.log(request.url())
    if (request.url().includes("/js/player/e4-player-v2.min.js")) {
      const fakeScript = fs.readFileSync("mods.js", "utf-8");
      console.log("fake script given");
      request.respond({
        status: 200,
        contentType: "application/javascript",
        body: fakeScript,
      });
    } else {
      request.continue();
    }
  });

  page.on("console", async (message) => {
    console.log(message.text())
    if (message.text().includes("file")) {
      let norm = JSON.parse(message.text());
      const PLAYLIST = norm[0].file;
      browser.close();
      const playlist = await axios.get(
        PLAYLIST
      );
      const playsfile = playlist.data;
      console.log(playsfile);

      let formatted = []

      const lines = playsfile.split("\n");
      lines.forEach((line, index) => {
        if (line.startsWith("#EXT-X-STREAM-INF")) {
          const resMatch = line.match(/RESOLUTION=(\d+x\d+)/);

          if (resMatch && resMatch[1]) {
            formatted.push([resMatch[1], lines[index+1]])
          }
        }
      });
      
      console.log(formatted);

      sendEvent({ res: formatted });
      res.end()
    }
  });

  await page.setExtraHTTPHeaders({
    'referer': 'https://123-movies.vc/'
  });

  await page.goto(filev);
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
