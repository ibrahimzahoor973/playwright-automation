import 'dotenv/config';
import '../../config/database.js';
import chrome from 'puppeteer-extra';

import { sleep, parseProxyUrl, sendNotificationOnSlack } from '../helpers/common.js';

import { DownloadRetrievedPhotos, RetrieveArchivedPhotos } from '../download-services/download-pic-time-archived-photos.js';

(async () => {

  const {
    userEmail,
    proxy: proxyUrl,
    platform,
    downloadPhotos,
    clientEmail,
    clientPassword
  } = process.env;

  let proxyObject;

  if (proxyUrl) {
    proxyObject = parseProxyUrl(proxyUrl);
  }

  let browser;
  try {
    const rootDirectory = process.cwd();
    const folderPath = `${rootDirectory}/public/sessions/${platform}/${clientEmail}/report`;
  
      const browserOpts = {
        headless: true,
        ignoreHTTPSErrors: true,
        defaultViewport: null,
        userDataDir: folderPath,
        args: [
          '--headless=new',
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-web-security',
          '--disable-gpu',
          '--disable-features=IsolateOrigins,site-per-process',
          '--start-maximized',
          `${proxyObject ? `--proxy-server=${proxyObject.host}:${proxyObject.port}` : ''}`
        ]
      };
    
      const browser = await chrome.launch(browserOpts);
    
      const page = await browser.newPage();
    
      if (proxyObject) {
      await page.authenticate({ username: proxyObject.username, password: proxyObject.password }); 
      console.log('Proxy Authenticated!');
      }

      await page.goto('https://us.pic-time.com/account', { timeout: 60000 });

      if (page.url().includes('/login') || page.url().includes('!loginuser')) {

        const emailSelector = await page.$('input[type=email]');

        console.log({ emailSelector });
        
        await emailSelector.click();
        await emailSelector.click({ clickCount: 3 });
        await emailSelector.press('Backspace');

        await emailSelector.type(clientEmail, { delay: 300 });
        await sleep(10);

        const continueButton1 = await page.$('::-p-xpath(//button[@type="submit"])');
        console.log({ continueButton1 });
  
        const continueButton = await page.$('button[type=submit]')

        console.log({ continueButton })

        await continueButton.click();
        await sleep(10);
        const passwordSelector = await page.$('input[type=password]');

        await passwordSelector.type(clientPassword, { delay: 300 });

        await sleep(10);

        const loginButton = await page.$('::-p-xpath(//button[text()="Login"])')
        await loginButton.click();

        await sleep(30);

        console.log('button clicked')
        await sleep(10);
      }

      // method to request High-res photos for downloading
      await RetrieveArchivedPhotos({
        page,
        userEmail
      });

      // Download Retrieved Photos if Available
      await DownloadRetrievedPhotos({
        page
      });
   
  } catch (error) {
    console.log({ error });
    await sendNotificationOnSlack({
      task: 'Pic Time Archived Galleries Automation',
      errorMessage: error?.message || 'Unknown Reason'
    });
  } finally {
    console.log('Finally Block Called:');
    if (browser) await browser.close();
    process.exit();
  }
})();
