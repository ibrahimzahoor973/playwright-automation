import 'dotenv/config';
import '../../config/database.js';
import chrome from 'puppeteer-extra';
import os from 'os';

import { UpdateScript } from '../../db-services/script.js';

import { sleep, parseProxyUrl, sendNotificationOnSlack, loginMethod, navigateWithRetry } from '../helpers/common.js';

import { DownloadRetrievedPhotos, RetrieveArchivedPhotos } from '../download-services/download-pic-time-archived-photos.js';

const PicTimeArchivedGalleries = async () => {
  console.log('IN PIC-TIME ARCHIVED METHOD');

  const {
    userEmail,
    proxy: proxyUrl,
    platform,
    downloadPhotos,
    clientEmail,
    clientPassword,
    scriptPath
  } = process.env;

  let proxyObject;

  if (proxyUrl) {
    proxyObject = parseProxyUrl(proxyUrl);
  }

  let browser;
  try {
    const rootDirectory = process.cwd();
    console.log('homedir:' , os.homedir())
    const folderPath = `${rootDirectory}/public/sessions/${platform}/${clientEmail}`;
    // const folderPath = `${os.homedir()}/Desktop/playwright-automation/public/${clientEmail}`;

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

      await navigateWithRetry(page, 'https://us.pic-time.com/account');

      if (page.url().includes('/login') || page.url().includes('!loginuser')) {

        await loginMethod({
          page,
          email: clientEmail,
          password: clientPassword
        });
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

      await UpdateScript({
        filterParams: {
          userEmail,
          platform
        },
        updateParams: {
          running: false,
          completed: true
        }
      });

      await browser.close();

      process.exit();
   
  } catch (error) {
    console.log({ error });
    await UpdateScript({
      filterParams: {
        userEmail,
        platform
      },
      updateParams: {
        running: false,
        errorMessage: error?.message || 'Unknown Error'
      }
    });
    await sendNotificationOnSlack({
      task: 'Pic Time Archived Galleries Automation',
      errorMessage: error?.message || 'Unknown Reason'
    });
  } finally {
    console.log('Finally Block Called:');
    if (browser) await browser.close();
  }
};

export default PicTimeArchivedGalleries;
