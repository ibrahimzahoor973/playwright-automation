import 'dotenv/config';
import { connect } from 'puppeteer-real-browser';

import GetClients from '../helpers/pixieset-helpers.js';
import { sleep, getCookies, parseProxyUrl } from '../helpers/common.js';

import DownloadPhotos from '../download-services/download-pixieset-photos.js'


const {
  userEmail,
  userPassword,
  PROXY_SETTINGS: proxySettings,
  downloadPhotos,
  proxy: proxyUrl
} = process.env;

console.log({
  userEmail,
  userPassword
});

(async () => {
  let browser;
  console.log({ sessionDir: `${process.cwd()}/public/sessions/${userEmail}` })

  const proxyObject = parseProxyUrl(proxyUrl);

  console.log(proxyObject)

  connect({
    userDataDir: `${process.cwd()}/public/sessions/${userEmail}`,
    headless: false,
    args: [
      // '--headless=new',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-web-security',
      '--disable-gpu',
      '--disable-features=IsolateOrigins,site-per-process'
    ],

    customConfig: {},

    skipTarget: [],

    fingerprint: true,

    turnstile: true,

    connectOption: {},

    proxy: proxyObject

  })
    .then(async (response) => {
      const { browser: webBrowser, page } = response;

      browser = webBrowser;

      await page.setViewport({ width: 1920, height: 1080 });

      await page.goto('https://galleries.pixieset.com/collections', { timeout: 60000 });
      await sleep(30);

      await page.reload();

      if (page.url().includes('/login')) {
        const emailSelector = await page.$('#UserLogin_username', { visible: true });

        const passwordSelector = await page.$('#UserLogin_password', { visible: true });
  
        console.log({
          emailSelector,
          passwordSelector
        });
  
        await emailSelector.type(userEmail, { delay: 300 });
        await sleep(10);
        await passwordSelector.type(userPassword, { delay: 400 });
        await sleep(10);
  
        const loginButton = await page.$('#login-button');
        console.log({ loginButton });
  
        loginButton.click();
  
        await sleep(10);
        await page.goto('https://galleries.pixieset.com/collections', { timeout: 60000 });
      }


      await sleep(10);

      const cookies = await page.cookies();

    //filter cookies
    const filteredCookies = getCookies({ cookies });

    // call helper method to scrape the data
    if (!downloadPhotos) {
      await GetClients({ page, filteredCookies, userEmail });
    }
    console.log('calling Download photos');
    await DownloadPhotos({
      filteredCookies,
      userEmail
    });

    await browser.close();
    })
    .catch(async (error) => {
      console.log(error.message);
      await browser.close();
    });
})();
