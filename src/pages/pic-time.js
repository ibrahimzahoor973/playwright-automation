import 'dotenv/config';
import chrome from 'puppeteer-extra';
import axios from 'axios';
import os from 'os';

import { UpdateScript } from '../../db-services/script.js';

import { sleep, getCookies, parseProxyUrl, sendNotificationOnSlack, loginMethod, navigateWithRetry } from '../helpers/common.js';

import { GetSetsAndPhotos, HandleOldGalleries } from '../helpers/pic-time-helpers.js';

import DownloadPhotos from '../download-services/download-pic-time-photos.js';

import PicTimeArchivedGalleries from './pic-time-archived-galleries.js';

(async () => {

  console.log('IN PIC-TIME MODULE');

  const {
    userEmail,
    userPassword,
    proxy: proxyUrl,
    platform,
    downloadPhotos,
    scriptPath
  } = process.env;

  let proxyObject;

  if (proxyUrl) {
    proxyObject = parseProxyUrl(proxyUrl);
  }

  console.log({proxyObject})

  let browser;
  try {
    const rootDirectory = process.cwd();
    const folderPath = `${rootDirectory}/public/sessions/${platform}/${userEmail}`;
    // const folderPath = `${os.homedir()}/Desktop/playwright-automation/public/${userEmail}`;

    console.log('homedir:' , os.homedir())

    console.log({ folderPath });
      const browserOpts = {
        headless: true,
        ignoreHTTPSErrors: true,
        defaultViewport: null,
        // userDataDir: folderPath,
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

      await navigateWithRetry(page, 'https://us.pic-time.com/professional#dash');

      if (page.url().includes('/login')) {

        await loginMethod({
          page,
          email: userEmail,
          password: userPassword
        });
      }

      const url = page.url();
      const baseUrl =  new URL(url).origin;

      console.log({ baseUrl });

      await navigateWithRetry(page, `${baseUrl}/professional#dash`);

      console.log('Current Url', page.url());

      const cookies = await page.cookies();

      const filteredCookies = getCookies({ cookies });

      if (!downloadPhotos) {
        await GetSetsAndPhotos({ baseUrl, filteredCookies });
      }

      await DownloadPhotos({
        baseUrl,
        filteredCookies,
        userEmail
      });

      // Allow High-res photos & share with client 
      await HandleOldGalleries({
        baseUrl,
        filteredCookies
      });

      await browser.close();

      await sleep(10);

      console.log('Going to login to Pass Migrations...');

      await PicTimeArchivedGalleries();

      process.exit();
  } catch (error) {
    console.log({ error });
    await UpdateScript({
      filterParams: {
        userEmail,
        platform,
        scriptPath
      },
      updateParams: {
        running: false,
        errorMessage: error?.message || 'Unknown Error'
      }
    });
    await sendNotificationOnSlack({
      task: 'Pic Time Automation',
      errorMessage: error?.message || 'Unknown Reason'
    });
  } finally {
    console.log('Finally Block Called:');
    if (browser) await browser.close();
  }
})();
