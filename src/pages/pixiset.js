import 'dotenv/config';
import { chromium } from 'playwright';
import GetClients from '../helpers.js';

const {
  EMAIL: userEmail,
  PASSWORD: userPassword
} = process.env;

// sleep method to make the script wait for specified seconds
const sleep = (secs = 1) => new Promise((resolve) => {
  setTimeout(resolve, secs * 1000);
});

(async () => {
  try {
    //launch the browser in non-headless mode
    const browser = await chromium.launch({ headless: false });

    const context = await browser.newContext();

    //create a new page
    const page = await context.newPage();

    // go to the pixieset login page
    await page.goto('https://accounts.pixieset.com/login/');

    //select email & password selectors from the page
    const email = await page.waitForSelector('#UserLogin_username');
    const password = await page.waitForSelector('#UserLogin_password');

    // enter email & password
    await email.type(userEmail);
    await password.type(userPassword);

    // click on login button
    const loginButton = await page.waitForSelector('#login-button');
    await loginButton.click();

    await sleep(20);

    console.log('Logged In!');

    // go to collections page
    await page.goto('https://galleries.pixieset.com/collections');

    // call helper method to scrape the data
    await GetClients({ page, context });

    await browser.close();

  } catch (err) {
    console.log('An Unexpected Error occurred', err);
  }
})();
